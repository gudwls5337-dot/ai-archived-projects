import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, dedupeContactsByEmail, isValidEmail } from "@/lib/email-utils";

// ── 영업상태 필터 where 조건 생성 ────────────────────────────────────────────────
function salesStatusWhere(salesStatus: string) {
  if (salesStatus === "미발송") {
    return { contact: { company: { OR: [{ salesStatus: null }, { salesStatus: "신규" }] } } };
  }
  if (salesStatus) {
    return { contact: { company: { salesStatus } } };
  }
  return {};
}

// ── GET: 발송 대상자 수 미리 조회 ───────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sequenceId } = await params;
  const stepOrder   = Number(req.nextUrl.searchParams.get("step"));
  const openFilter  = req.nextUrl.searchParams.get("openFilter") ?? "all";
  const salesStatus = req.nextUrl.searchParams.get("salesStatus") ?? "";

  if (!stepOrder) {
    return NextResponse.json({ error: "step 파라미터가 필요합니다." }, { status: 400 });
  }

  const enrollments = await prisma.contactSequenceEnrollment.findMany({
    where: {
      sequenceId,
      currentStep: stepOrder,
      status: "ACTIVE",
      ...salesStatusWhere(salesStatus),
    },
    select: { contactId: true },
  });

  let count = enrollments.length;

  if (openFilter !== "all" && stepOrder > 1) {
    const prevStep = await prisma.sequenceStep.findFirst({
      where: { sequenceId, stepOrder: stepOrder - 1 },
      select: { id: true },
    });
    if (prevStep) {
      const contactIds = enrollments.map(e => e.contactId);
      const openedLogs = await prisma.mailLog.findMany({
        where: {
          sequenceStepId: prevStep.id,
          contactId: { in: contactIds },
          openedAt: openFilter === "opened" ? { not: null } : null,
        },
        select: { contactId: true },
      });
      const matchedIds = new Set(openedLogs.map(l => l.contactId));
      count = enrollments.filter(e => matchedIds.has(e.contactId)).length;
    }
  }

  return NextResponse.json({ count });
}

// ── POST: 큐 등록 (직접 발송 차단) ─────────────────────────────────────────────
// [DIRECT_SEND_BLOCKED] sendMail은 오직 queue-processor 한 곳에서만 호출됩니다.
// send-step은 MailQueue에 등록만 하고 실제 발송은 processQueueBatch가 담당합니다.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sequenceId } = await params;
  const { stepOrder, openFilter = "all", salesStatus = "" } = await req.json();

  if (!stepOrder) {
    return NextResponse.json({ error: "stepOrder가 필요합니다." }, { status: 400 });
  }

  const step = await prisma.sequenceStep.findFirst({
    where: { sequenceId, stepOrder },
  });
  if (!step) {
    return NextResponse.json({ error: "해당 단계를 찾을 수 없습니다." }, { status: 404 });
  }

  // 이미 진행 중인 큐가 있으면 차단
  const activeQueue = await prisma.mailQueue.findFirst({
    where: { status: { in: ["pending", "processing", "deferred_to_next_day"] } },
  });
  if (activeQueue) {
    return NextResponse.json(
      {
        error: `이미 진행 중인 발송 큐가 있습니다 (queueId: ${activeQueue.id}). 완료 또는 취소 후 다시 시도하세요.`,
        activeQueueId: activeQueue.id,
      },
      { status: 409 },
    );
  }

  let enrollments = await prisma.contactSequenceEnrollment.findMany({
    where: {
      sequenceId,
      currentStep: stepOrder,
      status: "ACTIVE",
      ...salesStatusWhere(salesStatus),
    },
    include: { contact: { include: { company: { select: { id: true, name: true, salesStatus: true } } } } },
  });

  if (enrollments.length === 0) {
    return NextResponse.json({ queued: false, enqueuedCount: 0, message: "발송 대상자가 없습니다." });
  }

  // 이전 step 오픈 여부 필터
  let filtered = 0;
  if (openFilter !== "all" && stepOrder > 1) {
    const prevStep = await prisma.sequenceStep.findFirst({
      where: { sequenceId, stepOrder: stepOrder - 1 },
      select: { id: true },
    });
    if (prevStep) {
      const contactIds = enrollments.map(e => e.contactId);
      const prevLogs = await prisma.mailLog.findMany({
        where: { sequenceStepId: prevStep.id, contactId: { in: contactIds } },
        select: { contactId: true, openedAt: true },
      });
      const logMap = new Map(prevLogs.map(l => [l.contactId, l.openedAt]));
      const before = enrollments.length;
      enrollments = enrollments.filter(e => {
        const openedAt = logMap.get(e.contactId);
        return openFilter === "opened" ? !!openedAt : !openedAt;
      });
      filtered = before - enrollments.length;
    }
  }

  if (enrollments.length === 0) {
    return NextResponse.json({ queued: false, enqueuedCount: 0, filtered, message: `오픈 필터(${openFilter}) 적용 후 발송 가능한 대상자가 없습니다.` });
  }

  // 수신 거부 필터
  const unsubscribeSet = new Set(
    (await prisma.unsubscribe.findMany({ select: { email: true } }))
      .map(u => normalizeEmail(u.email)),
  );
  const withoutUnsub = enrollments.filter(e => !unsubscribeSet.has(normalizeEmail(e.contact.email)));
  const unsubscribed = enrollments.length - withoutUnsub.length;

  if (withoutUnsub.length === 0) {
    return NextResponse.json({ queued: false, enqueuedCount: 0, unsubscribed, filtered, message: "발송 가능한 대상자가 없습니다. (전원 수신 거부)" });
  }

  // 중복 제거
  const contacts = withoutUnsub.map(e => e.contact);
  const { kept: deduped } = dedupeContactsByEmail(contacts.map(c => ({ ...c, mailLogs: [], company: c.company ?? { name: "" } })));
  const dupIdSet = new Set(deduped.map(c => c.id));
  const afterDedup = withoutUnsub.filter(e => dupIdSet.has(e.contactId));
  const duplicateExcluded = withoutUnsub.length - afterDedup.length;

  // 이메일 유효성 검증
  const invalidEmails: string[] = [];
  const finalEnrollments = afterDedup.filter(e => {
    if (!isValidEmail(e.contact.email)) { invalidEmails.push(e.contact.email); return false; }
    return true;
  });
  const invalidEmailCount = invalidEmails.length;

  if (finalEnrollments.length === 0) {
    return NextResponse.json({ queued: false, enqueuedCount: 0, unsubscribed, filtered, duplicateExcluded, invalidEmailCount, message: "발송 가능한 대상자가 없습니다." });
  }

  const SEND_INTERVAL_MIN = process.env.SEND_INTERVAL_MIN ? Math.max(1, parseInt(process.env.SEND_INTERVAL_MIN)) : 1;
  const DAILY_LIMIT = process.env.DAILY_SEND_LIMIT ? Math.max(1, parseInt(process.env.DAILY_SEND_LIMIT)) : 100;

  const now = new Date();
  const contactIds = finalEnrollments.map(e => e.contactId);

  // ── [DIRECT_SEND_BLOCKED] SMTP 직접 발송 차단 — MailQueue 등록만 수행 ───────────
  // label 형식: _seq:{sequenceId}:{stepId}:{stepOrder}
  // processQueueBatch가 이 label을 파싱해 enrollment를 진행시킵니다
  const queue = await prisma.mailQueue.create({
    data: {
      status:        "pending",
      label:         `_seq:${sequenceId}:${step.id}:${stepOrder}`,
      subject:       step.subject,
      body:          step.body,
      contactIds:    JSON.stringify(contactIds),
      totalCount:    contactIds.length,
      batchSize:     1,
      batchDelayMin: SEND_INTERVAL_MIN,
      nextBatchAt:   now,
    },
  });

  const todayCount    = Math.min(contactIds.length, DAILY_LIMIT);
  const deferredCount = Math.max(0, contactIds.length - DAILY_LIMIT);
  const estimatedDays = Math.ceil(contactIds.length / DAILY_LIMIT);

  console.log(`[QUEUE_ENQUEUED] send-step → queueId=${queue.id}, seq=${sequenceId}, step=${stepOrder}, total=${contactIds.length}, todayCount=${todayCount}, deferred=${deferredCount}`);

  return NextResponse.json({
    queued:           true,
    queueId:          queue.id,
    enqueuedCount:    contactIds.length,
    todayCount,
    deferredCount,
    estimatedDays,
    sendIntervalMin:  SEND_INTERVAL_MIN,
    unsubscribed,
    filtered,
    duplicateExcluded,
    invalidEmailCount,
  });
}
