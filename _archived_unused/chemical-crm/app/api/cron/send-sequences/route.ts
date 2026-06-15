import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidEmail, filterInvalidMxEmails, normalizeEmail } from "@/lib/email-utils";
import { processQueueBatch, getDailyLimit, getTodayAttempted } from "@/lib/queue-processor";

// [DIRECT_SEND_BLOCKED] 이 파일에서 SMTP sendMail 직접 호출은 금지됩니다.
// 모든 발송은 lib/queue-processor.ts → processQueueBatch() 에서만 수행됩니다.

export async function GET() {
  const now = new Date();

  // ── 1. 오버듀 ACTIVE enrollment 조회 ─────────────────────────────────────────
  const enrollments = await prisma.contactSequenceEnrollment.findMany({
    where: {
      status: "ACTIVE",
      lastSentAt: { not: null },
    },
    include: {
      contact: true,
      sequence: {
        include: {
          steps: { orderBy: { stepOrder: "asc" } },
        },
      },
    },
  });

  let skipped = 0;
  let completed = 0;
  let unsubscribed = 0;
  let invalidEmailCount = 0;
  let invalidMxCount = 0;
  let enqueuedQueues = 0;

  // ── 2. 수신 거부 목록 ─────────────────────────────────────────────────────────
  const unsubscribeSet = new Set(
    (await prisma.unsubscribe.findMany({ select: { email: true } }))
      .map(u => u.email.toLowerCase()),
  );

  // ── 3. delayDays 경과 여부 + 기본 필터링 ──────────────────────────────────────
  const toSend: typeof enrollments = [];
  for (const enrollment of enrollments) {
    const { sequence, currentStep, lastSentAt } = enrollment;
    const step = sequence.steps.find(s => s.stepOrder === currentStep);

    if (!step) {
      // 더 이상 진행할 step이 없으면 완료 처리
      await prisma.contactSequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "COMPLETED" },
      });
      completed++;
      continue;
    }

    // delayDays 경과 체크
    const dueDate = new Date(lastSentAt!);
    dueDate.setDate(dueDate.getDate() + step.delayDays);
    if (now < dueDate) {
      skipped++;
      continue;
    }

    // 수신 거부 제외
    if (unsubscribeSet.has(enrollment.contact.email.toLowerCase())) {
      unsubscribed++;
      continue;
    }

    // 이메일 형식 검증
    if (!isValidEmail(enrollment.contact.email)) {
      console.warn(`[cron/send-sequences] invalid_email 제외: ${enrollment.contact.email}`);
      invalidEmailCount++;
      continue;
    }

    toSend.push(enrollment);
  }

  // ── 4. (sequenceId, stepId, stepOrder) 단위로 그룹핑 → MailQueue 등록 ─────────
  // [DIRECT_SEND_BLOCKED] sendMail 없음 — MailQueue에만 등록
  const groups = new Map<
    string,
    { seqId: string; stepId: string; stepOrder: number; subject: string; body: string; enrollments: typeof enrollments }
  >();

  for (const enrollment of toSend) {
    const step = enrollment.sequence.steps.find(s => s.stepOrder === enrollment.currentStep)!;
    const key = `${enrollment.sequenceId}:${step.id}:${enrollment.currentStep}`;
    if (!groups.has(key)) {
      groups.set(key, {
        seqId: enrollment.sequenceId,
        stepId: step.id,
        stepOrder: enrollment.currentStep,
        subject: step.subject,
        body: step.body,
        enrollments: [],
      });
    }
    groups.get(key)!.enrollments.push(enrollment);
  }

  const SEND_INTERVAL_MIN = process.env.SEND_INTERVAL_MIN
    ? Math.max(1, parseInt(process.env.SEND_INTERVAL_MIN))
    : 1;

  for (const [, group] of groups) {
    const label = `_seq:${group.seqId}:${group.stepId}:${group.stepOrder}`;

    // 동일 label의 활성 큐가 이미 있으면 스킵 (중복 등록 방지)
    const existingQueue = await prisma.mailQueue.findFirst({
      where: {
        label,
        status: { in: ["pending", "processing", "deferred_to_next_day"] },
      },
    });
    if (existingQueue) {
      console.log(`[cron/send-sequences] 이미 활성 큐 존재, 스킵 — label=${label} queueId=${existingQueue.id}`);
      continue;
    }

    // MX 레코드 사전 검증
    const emails = group.enrollments.map(e => e.contact.email);
    const invalidMxEmails = await filterInvalidMxEmails(emails);

    if (invalidMxEmails.size > 0) {
      invalidMxCount += invalidMxEmails.size;
      // MX 실패 → FAILED 로그 기록 (발송 없음)
      await Promise.all(
        group.enrollments
          .filter(e => invalidMxEmails.has(normalizeEmail(e.contact.email)))
          .map(e =>
            prisma.mailLog.create({
              data: {
                to: e.contact.email,
                subject: group.subject,
                text: group.body,
                status: "FAILED",
                failReason: "invalid_domain_or_mx",
                sentAt: now,
                contactId: e.contact.id,
                companyId: e.contact.companyId,
                sequenceId: group.seqId,
                sequenceStepId: group.stepId,
              },
            }),
          ),
      );
      console.warn(`[cron/send-sequences] MX 검증 실패 제외 ${invalidMxEmails.size}건 — label=${label}`);
    }

    const validEnrollments = group.enrollments.filter(
      e => !invalidMxEmails.has(normalizeEmail(e.contact.email)),
    );
    if (validEnrollments.length === 0) continue;

    const contactIds = validEnrollments.map(e => e.contactId);

    // ── [QUEUE_ENQUEUED] MailQueue 등록만 — 즉시 발송 없음 ───────────────────────
    await prisma.mailQueue.create({
      data: {
        status: "pending",
        label,
        subject: group.subject,
        body: group.body,
        contactIds: JSON.stringify(contactIds),
        totalCount: contactIds.length,
        batchSize: 1,
        batchDelayMin: SEND_INTERVAL_MIN,
        nextBatchAt: now,
      },
    });

    console.log(
      `[QUEUE_ENQUEUED] cron/send-sequences → label=${label}, contacts=${contactIds.length}`,
    );
    enqueuedQueues++;
  }

  // ── 5. 일일 한도 확인 ─────────────────────────────────────────────────────────
  const DAILY_LIMIT = getDailyLimit();
  const todayAttempted = await getTodayAttempted();

  if (todayAttempted >= DAILY_LIMIT) {
    console.warn(
      `[QUEUE_DEFERRED_TO_NEXT_DAY] cron/send-sequences — 일일 한도(${DAILY_LIMIT}) 도달, 큐 처리 중단`,
    );
    return NextResponse.json({
      sent: 0, failed: 0, skipped, completed, unsubscribed,
      invalidEmailCount, invalidMxCount, enqueuedQueues,
      limitReached: true,
      processedAt: now,
    });
  }

  // ── 6. pending / deferred_to_next_day 큐 1건씩 처리 ──────────────────────────
  // nextBatchAt 기준으로 발송 시각이 된 큐만 대상
  const pendingQueues = await prisma.mailQueue.findMany({
    where: {
      status: { in: ["pending", "deferred_to_next_day"] },
      nextBatchAt: { lte: now },
    },
    orderBy: { createdAt: "asc" },
  });

  let queueSent = 0;
  let queueFailed = 0;
  for (const q of pendingQueues) {
    const result = await processQueueBatch(q.id);
    queueSent += result.sent;
    queueFailed += result.failed;
    if (result.limitReached) {
      console.warn(
        `[QUEUE_DEFERRED_TO_NEXT_DAY] cron/send-sequences — queueId=${q.id} 한도 도달, 이후 큐 중단`,
      );
      break;
    }
  }

  if (pendingQueues.length > 0) {
    console.log(
      `[cron/send-sequences] 큐 처리 완료 — queues=${pendingQueues.length}, queueSent=${queueSent}, queueFailed=${queueFailed}`,
    );
  }

  return NextResponse.json({
    sent: queueSent,
    failed: queueFailed,
    skipped,
    completed,
    unsubscribed,
    invalidEmailCount,
    invalidMxCount,
    enqueuedQueues,
    queueSent,
    queueFailed,
    processedAt: now,
  });
}
