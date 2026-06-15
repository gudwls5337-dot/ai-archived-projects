import { prisma } from "@/lib/prisma";
import { ImapArchiver } from "@/lib/imap-archive";
import { classifySmtpError } from "@/lib/email-utils";
import { getSmtpTransport, QUEUE_PROCESSOR_TOKEN } from "@/lib/smtp-transport";

// 유일한 SMTP 발송 허가 지점 — 토큰을 넘겨야만 transporter를 받을 수 있습니다.
const transporter = getSmtpTransport(QUEUE_PROCESSOR_TOKEN);

// 일일 발송 한도 (기본값 100)
export function getDailyLimit(): number {
  return process.env.DAILY_SEND_LIMIT ? Math.max(1, parseInt(process.env.DAILY_SEND_LIMIT)) : 100;
}

// 발송 간격 (분 단위, 기본값 1분)
function getSendIntervalMin(): number {
  return process.env.SEND_INTERVAL_MIN ? Math.max(1, parseInt(process.env.SEND_INTERVAL_MIN)) : 1;
}

export async function getTodayAttempted(): Promise<number> {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return prisma.mailLog.count({
    where: { sentAt: { gte: dayStart }, status: { in: ["SUCCESS", "FAILED"] } },
  });
}

export type ProcessResult = {
  done: boolean;
  sent: number;
  failed: number;
  skippedDueToLimit: number;
  totalSent: number;
  totalFailed: number;
  totalCount: number;
  deferredCount: number;
  limitReached?: boolean;
  message?: string;
  error?: string;
};

export async function processQueueBatch(queueId: string): Promise<ProcessResult> {
  const queue = await prisma.mailQueue.findUnique({ where: { id: queueId } });
  if (!queue) {
    return { done: false, sent: 0, failed: 0, skippedDueToLimit: 0, totalSent: 0, totalFailed: 0, totalCount: 0, deferredCount: 0, error: "not found" };
  }
  if (!["pending", "processing", "deferred_to_next_day"].includes(queue.status)) {
    return {
      done: false, sent: 0, failed: 0, skippedDueToLimit: 0,
      totalSent: queue.sentCount, totalFailed: queue.failedCount, totalCount: queue.totalCount,
      deferredCount: Math.max(0, queue.totalCount - queue.sentCount - queue.failedCount),
      error: `큐가 활성 상태가 아닙니다 (status: ${queue.status})`,
    };
  }

  const allContactIds: string[] = JSON.parse(queue.contactIds);
  const startIdx = queue.sentCount + queue.failedCount;

  if (startIdx >= allContactIds.length) {
    await prisma.mailQueue.update({
      where: { id: queue.id },
      data: { status: "completed", completedAt: new Date() },
    });
    return { done: true, sent: 0, failed: 0, skippedDueToLimit: 0, totalSent: queue.sentCount, totalFailed: queue.failedCount, totalCount: allContactIds.length, deferredCount: 0 };
  }

  // 시퀀스 step 큐 여부 파싱 (_seq:{seqId}:{stepId}:{stepOrder})
  const seqMeta = queue.label?.startsWith("_seq:")
    ? (() => {
        const [, seqId, stepId, stepOrderStr] = queue.label.split(":");
        return { seqId, stepId, stepOrder: parseInt(stepOrderStr) };
      })()
    : null;

  // ── 일일 발송 제한 체크 (1건씩 처리이므로 1건이라도 남아있으면 즉시 중단) ──────
  const DAILY_LIMIT = getDailyLimit();
  const SEND_INTERVAL_MIN = getSendIntervalMin();
  const todayAttempted = await getTodayAttempted();
  if (todayAttempted >= DAILY_LIMIT) {
    const deferred = allContactIds.length - startIdx;
    await prisma.mailQueue.update({
      where: { id: queue.id },
      data: { status: "deferred_to_next_day" },
    });
    console.warn(`[QUEUE_DEFERRED_TO_NEXT_DAY] queueId=${queueId} todayAttempted=${todayAttempted} limit=${DAILY_LIMIT} deferred=${deferred}`);
    return {
      done: false, sent: 0, failed: 0, skippedDueToLimit: 0,
      totalSent: queue.sentCount, totalFailed: queue.failedCount, totalCount: allContactIds.length,
      deferredCount: deferred, limitReached: true,
      message: `일일 발송 한도(${DAILY_LIMIT}건) 도달 — 내일 자동 재개됩니다`,
    };
  }

  // 1건씩 발송
  const batchIds = [allContactIds[startIdx]];
  const skippedDueToLimit = 0;

  // processing 으로 마킹
  await prisma.mailQueue.update({ where: { id: queue.id }, data: { status: "processing" } });

  const contacts = await prisma.contact.findMany({
    where: { id: { in: batchIds } },
    include: { company: { select: { id: true, name: true } } },
  });

  const now = new Date();
  let sent = 0;
  let failed = 0;
  const sentCompanyIds = new Set<string>();

  // ImapArchiver는 call당 새로 생성 (stateful TCP connection)
  const archiver = new ImapArchiver(now);
  const initOk = await archiver.init();
  if (!initOk) {
    console.warn("[queue-processor] IMAP 초기화 실패 — 아카이브 스킵, 발송 계속");
  }

  for (const contact of contacts) {
    const mailLog = await prisma.mailLog.create({
      data: {
        to:        contact.email,
        subject:   queue.subject,
        text:      queue.body,
        status:    "SUCCESS",
        sentAt:    now,
        contactId: contact.id,
        companyId: contact.company?.id ?? null,
      },
    });

    const trackingUrl = `${process.env.APP_URL}/api/track/open/${mailLog.id}`;
    const html = `<html>
<head><meta charset="UTF-8"/></head>
<body>
<div style="font-family:sans-serif;font-size:14px;line-height:1.8;">
${queue.body.replace(/\n/g, "<br/>")}
</div>
<img src="${trackingUrl}" width="1" height="1" style="display:block;border:0;" alt="" />
</body>
</html>`;

    try {
      await transporter.sendMail({
        from: `"SILVERSTARCHEMICAL" <${process.env.NAVER_WORKS_EMAIL}>`,
        to:      contact.email,
        subject: queue.subject,
        text:    queue.body,
        html,
        textEncoding: "base64",
        headers: { "X-Mailer": "CRM-Nodemailer", "Content-Language": "ko" },
      });

      sent++;
      if (contact.company?.id) sentCompanyIds.add(contact.company.id);

      // ── 시퀀스 step 큐인 경우: mailLog에 시퀀스 정보 추가 + enrollment 진행 ───────
      if (seqMeta) {
        await prisma.mailLog.update({
          where: { id: mailLog.id },
          data: { sequenceId: seqMeta.seqId, sequenceStepId: seqMeta.stepId },
        }).catch(() => {});

        const nextStep = await prisma.sequenceStep.findFirst({
          where: { sequenceId: seqMeta.seqId, stepOrder: seqMeta.stepOrder + 1 },
          select: { id: true },
        });
        await prisma.contactSequenceEnrollment.updateMany({
          where: { contactId: contact.id, sequenceId: seqMeta.seqId, currentStep: seqMeta.stepOrder },
          data: {
            lastSentAt: now,
            currentStep: seqMeta.stepOrder + 1,
            status: nextStep ? "ACTIVE" : "COMPLETED",
          },
        }).catch(() => {});
      }

      const archiveSaved = await archiver.save({ to: contact.email, subject: queue.subject, text: queue.body, html });
      if (archiveSaved) {
        await prisma.mailLog.update({ where: { id: mailLog.id }, data: { archivedAt: now } }).catch(() => {});
      }
    } catch (err) {
      const reason = classifySmtpError(err);
      console.error(`[queue-processor] 발송 실패 ${contact.email} | ${reason} |`, err);
      await prisma.mailLog.update({
        where: { id: mailLog.id },
        data: { status: "FAILED", failReason: reason },
      }).catch(() => {});
      failed++;
    }
  }

  await archiver.close();

  // 발송 성공 회사 영업상태 자동 업데이트
  if (sentCompanyIds.size > 0) {
    await prisma.company.updateMany({
      where: {
        id: { in: [...sentCompanyIds] },
        OR: [{ salesStatus: null }, { salesStatus: "신규" }],
      },
      data: { salesStatus: "1차발송" },
    });
  }

  const newSent   = queue.sentCount   + sent;
  const newFailed = queue.failedCount + failed;
  const finalDone = newSent + newFailed >= allContactIds.length;
  // 다음 발송 시각: 1분 후
  const nextBatchAt = new Date(now.getTime() + SEND_INTERVAL_MIN * 60 * 1000);

  // 이 건 발송 후 일일 한도 재확인
  let newStatus = finalDone ? "completed" : "processing";
  if (!finalDone) {
    const todayAfter = await getTodayAttempted();
    if (todayAfter >= DAILY_LIMIT) {
      newStatus = "deferred_to_next_day";
    }
  }

  const deferredCount = newStatus === "deferred_to_next_day"
    ? allContactIds.length - newSent - newFailed
    : 0;

  await prisma.mailQueue.update({
    where: { id: queue.id },
    data: {
      sentCount:    newSent,
      failedCount:  newFailed,
      status:       newStatus,
      completedAt:  finalDone ? now : null,
      nextBatchAt:  finalDone ? now : nextBatchAt,
    },
  });

  console.log(`[queue-processor] id=${queue.id} sent=${sent} failed=${failed} total=${newSent}/${allContactIds.length} done=${finalDone} status=${newStatus} nextBatchAt=${nextBatchAt.toISOString()}`);

  return {
    done:              finalDone,
    sent,
    failed,
    skippedDueToLimit,
    totalSent:    newSent,
    totalFailed:  newFailed,
    totalCount:   allContactIds.length,
    deferredCount,
  };
}
