import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDailyLimit, getTodayAttempted } from "@/lib/queue-processor";

// [DIRECT_SEND_BLOCKED] 이 파일에서 SMTP sendMail 직접 호출은 금지됩니다.
// 재발송은 MailQueue에 등록 후 lib/queue-processor.ts 가 처리합니다.

// 재발송 가능한 사유 (일시적 오류)
export const RESENDABLE_REASONS = [
  "delayed",
  "too_many_messages",
  "too_many_recipients",
  "unknown",
] as const;

// 재발송 제외 사유 (영구 오류)
export const EXCLUDED_REASONS = [
  "invalid_domain_or_mx",
  "invalid_email",
  "smtp_auth_error",
  "spam_or_policy_block",
  "mailbox_unavailable",
] as const;

function resolveDateRange(dateParam?: string | null) {
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const [y, m, d] = dateParam.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const end   = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    return { start, end };
  }
  const now   = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}

// ── GET: 재발송 가능 건수 + 오늘 남은 슬롯 미리보기 ──────────────────────────────
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  const { start, end } = resolveDateRange(date);

  const [resendableCount, todayAttempted] = await Promise.all([
    prisma.mailLog.count({
      where: {
        status: "FAILED",
        failReason: { in: [...RESENDABLE_REASONS] },
        sentAt: { gte: start, lte: end },
      },
    }),
    getTodayAttempted(),
  ]);

  const limit = getDailyLimit();
  const dailyRemaining = Math.max(0, limit - todayAttempted);

  return NextResponse.json({ resendableCount, dailyRemaining, dailyLimit: limit });
}

// ── POST: 재발송 큐 등록 ([DIRECT_SEND_BLOCKED] — sendMail 직접 호출 없음) ──────
export async function POST(req: NextRequest) {
  const { date } = await req.json();
  const { start, end } = resolveDateRange(date);

  // 재발송 대상 조회 (contactId 있는 것만 큐 등록 가능)
  const logs = await prisma.mailLog.findMany({
    where: {
      status: "FAILED",
      failReason: { in: [...RESENDABLE_REASONS] },
      sentAt: { gte: start, lte: end },
    },
    orderBy: { sentAt: "asc" },
  });

  if (logs.length === 0) {
    return NextResponse.json({ queued: false, enqueuedCount: 0, message: "재발송 대상 없음" });
  }

  // 이미 진행 중인 큐 가드
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

  const SEND_INTERVAL_MIN = process.env.SEND_INTERVAL_MIN
    ? Math.max(1, parseInt(process.env.SEND_INTERVAL_MIN))
    : 1;
  const now = new Date();

  // subject+body 기준으로 그룹핑 → 같은 캠페인끼리 하나의 큐로 묶음
  type LogGroup = { subject: string; body: string; contactIds: string[] };
  const groupMap = new Map<string, LogGroup>();
  let skippedNoContactId = 0;

  for (const log of logs) {
    if (!log.contactId) {
      // [DIRECT_SEND_BLOCKED] contactId 없는 로그는 큐 등록 불가 — 스킵
      console.warn(`[DIRECT_SEND_BLOCKED] resend — contactId 없는 로그 스킵: mailLogId=${log.id} to=${log.to}`);
      skippedNoContactId++;
      continue;
    }
    const key = `${log.subject}\x00${log.text}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { subject: log.subject, body: log.text, contactIds: [] });
    }
    groupMap.get(key)!.contactIds.push(log.contactId);
  }

  if (groupMap.size === 0) {
    return NextResponse.json({
      queued: false,
      enqueuedCount: 0,
      skippedNoContactId,
      message: "큐 등록 가능한 대상 없음 (contactId 없음)",
    });
  }

  const DAILY_LIMIT = getDailyLimit();
  const todayAttempted = await getTodayAttempted();
  const remainingToday = Math.max(0, DAILY_LIMIT - todayAttempted);

  let totalQueued = 0;
  let totalDeferred = 0;
  const queueIds: string[] = [];

  for (const [, group] of groupMap) {
    // [QUEUE_ENQUEUED] MailQueue 등록 — 즉시 sendMail 호출 없음
    const queue = await prisma.mailQueue.create({
      data: {
        status:        "pending",
        label:         `_resend:${start.toISOString().slice(0, 10)}`,
        subject:       group.subject,
        body:          group.body,
        contactIds:    JSON.stringify(group.contactIds),
        totalCount:    group.contactIds.length,
        batchSize:     1,
        batchDelayMin: SEND_INTERVAL_MIN,
        nextBatchAt:   now,
      },
    });
    queueIds.push(queue.id);
    totalQueued += group.contactIds.length;
    console.log(`[QUEUE_ENQUEUED] resend → queueId=${queue.id}, contacts=${group.contactIds.length}, subject="${group.subject}"`);
  }

  const todayCount    = Math.min(totalQueued, remainingToday);
  const deferredCount = Math.max(0, totalQueued - remainingToday);
  totalDeferred       = deferredCount;

  return NextResponse.json({
    queued:          true,
    enqueuedCount:   totalQueued,
    todayCount,
    deferredCount:   totalDeferred,
    queueIds,
    skippedNoContactId,
    sendIntervalMin: SEND_INTERVAL_MIN,
    dailyLimit:      DAILY_LIMIT,
  });
}
