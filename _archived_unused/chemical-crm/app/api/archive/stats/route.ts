import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");
  const { start, end, label } = resolveDateRange(dateParam);

  const [successLogs, failedLogs, delayedLogs] = await Promise.all([
    // 발송 성공 (아카이브 여부 포함)
    prisma.mailLog.findMany({
      where: { status: "SUCCESS", sentAt: { gte: start, lte: end } },
      select: {
        id: true, to: true, subject: true, sentAt: true, archivedAt: true,
        company: { select: { name: true } },
      },
      orderBy: { sentAt: "desc" },
    }),
    // 발송 실패 (delayed 제외 — 별도 탭)
    prisma.mailLog.findMany({
      where: {
        status: "FAILED",
        sentAt: { gte: start, lte: end },
        NOT: { failReason: "delayed" },
      },
      select: {
        id: true, to: true, subject: true, sentAt: true, failReason: true,
        company: { select: { name: true } },
      },
      orderBy: { sentAt: "desc" },
    }),
    // 지연/미처리: status가 SUCCESS·FAILED가 아니거나 failReason=delayed
    prisma.mailLog.findMany({
      where: {
        sentAt: { gte: start, lte: end },
        OR: [
          {
            AND: [
              { status: { not: "SUCCESS" } },
              { status: { not: "FAILED" } },
            ],
          },
          { failReason: "delayed" },
        ],
      },
      select: {
        id: true, to: true, subject: true, sentAt: true, status: true, failReason: true,
        company: { select: { name: true } },
      },
      orderBy: { sentAt: "desc" },
    }),
  ]);

  const archived           = successLogs.filter((l) => l.archivedAt !== null).length;
  const notArchived        = successLogs.filter((l) => l.archivedAt === null).length;
  const invalidDomainCount = failedLogs.filter((l) => l.failReason === "invalid_domain_or_mx").length;

  // 오늘 남은 발송 슬롯 계산 (선택 날짜와 무관하게 항상 오늘 기준)
  const DAILY_LIMIT = process.env.DAILY_SEND_LIMIT ? parseInt(process.env.DAILY_SEND_LIMIT) : null;
  let dailyRemaining: number | null = null;
  if (DAILY_LIMIT) {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayAttempted = await prisma.mailLog.count({
      where: { sentAt: { gte: todayStart }, status: { in: ["SUCCESS", "FAILED"] } },
    });
    dailyRemaining = Math.max(0, DAILY_LIMIT - todayAttempted);
  }

  return NextResponse.json({
    date: label,
    dailyRemaining,
    dailyLimit: DAILY_LIMIT,
    summary: {
      totalSent:         successLogs.length + failedLogs.length + delayedLogs.length,
      successSent:       successLogs.length,
      archived,
      notArchived,
      failedSend:        failedLogs.length,
      delayedCount:      delayedLogs.length,
      invalidDomainCount,
    },
    failedList: failedLogs.map((l) => ({
      id:         l.id,
      sentAt:     l.sentAt,
      company:    l.company?.name ?? "-",
      email:      l.to,
      subject:    l.subject,
      status:     "FAILED" as const,
      failReason: l.failReason ?? "unknown",
    })),
    unarchivedList: successLogs
      .filter((l) => l.archivedAt === null)
      .map((l) => ({
        id:         l.id,
        sentAt:     l.sentAt,
        company:    l.company?.name ?? "-",
        email:      l.to,
        subject:    l.subject,
        status:     "SUCCESS" as const,
        failReason: "archive_failed",
      })),
    delayedList: delayedLogs.map((l) => ({
      id:         l.id,
      sentAt:     l.sentAt,
      company:    l.company?.name ?? "-",
      email:      l.to,
      subject:    l.subject,
      status:     l.status as "SUCCESS" | "FAILED",
      failReason: l.failReason ?? "delayed",
    })),
  });
}

function resolveDateRange(dateParam?: string | null) {
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const [y, m, d] = dateParam.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const end   = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    return { start, end, label: dateParam };
  }
  const now   = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const label = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  return { start, end, label };
}
