import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ImapArchiver } from "@/lib/imap-archive";

// ── GET: 오늘 미아카이브 발송 건수 + IMAP 연결 상태 ──────────────────────────
export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date"); // YYYY-MM-DD, 없으면 오늘
  const { start, end, label } = resolveDateRange(dateParam);

  const [count, imap] = await Promise.all([
    prisma.mailLog.count({
      where: {
        status: "SUCCESS",
        sentAt: { gte: start, lte: end },
        archivedAt: null,
      },
    }),
    ImapArchiver.checkConnection(),
  ]);

  return NextResponse.json({ date: label, unarchived: count, imap });
}

// ── POST: 백필 실행 ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const dateParam: string | undefined = body.date; // "YYYY-MM-DD", 없으면 오늘

  const { start, end, label } = resolveDateRange(dateParam);

  const logs = await prisma.mailLog.findMany({
    where: {
      status: "SUCCESS",
      sentAt: { gte: start, lte: end },
      archivedAt: null,
    },
    orderBy: { sentAt: "asc" },
  });

  if (logs.length === 0) {
    return NextResponse.json({
      message: `백필 대상 없음 — ${label} 발송분이 없거나 이미 모두 아카이브됐습니다.`,
      archived: 0,
      failed: 0,
      total: 0,
    });
  }

  console.log(`[archive/backfill] ${label} 미아카이브 ${logs.length}건 백필 시작`);

  // 날짜 기준으로 archiver 생성 (폴더 ABM콜드메일/YYYY-MM-DD)
  const archiver = new ImapArchiver(start);
  const initOk = await archiver.init();
  if (!initOk) {
    return NextResponse.json(
      { error: "IMAP 연결 실패 — .env 의 NAVER_WORKS_IMAP_* 설정을 확인하세요." },
      { status: 500 },
    );
  }

  let archived = 0;
  let failed = 0;

  for (const log of logs) {
    const trackingUrl = `${process.env.APP_URL}/api/track/open/${log.id}`;
    const html = `<html>
<head><meta charset="UTF-8"/></head>
<body>
<div style="font-family:sans-serif;font-size:14px;line-height:1.8;">
${log.text.replace(/\n/g, "<br/>")}
</div>
<img src="${trackingUrl}" width="1" height="1" style="display:block;border:0;" alt="" />
</body>
</html>`;

    const saved = await archiver.save({
      to: log.to,
      subject: log.subject,
      text: log.text,
      html,
      sentAt: log.sentAt ?? undefined,
    });

    if (saved) {
      await prisma.mailLog.update({
        where: { id: log.id },
        data: { archivedAt: new Date() },
      }).catch(() => {});
      archived++;
    } else {
      failed++;
    }
  }

  await archiver.close();

  console.log(`[archive/backfill] ${label} 완료 — archived=${archived}, failed=${failed}, total=${logs.length}`);
  return NextResponse.json({ date: label, archived, failed, total: logs.length });
}

// ── 날짜 범위 계산 헬퍼 ────────────────────────────────────────────────────────
function resolveDateRange(dateParam?: string | null): {
  start: Date;
  end: Date;
  label: string;
} {
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const [y, m, d] = dateParam.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const end   = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    return { start, end, label: dateParam };
  }

  // 기본값: 오늘 (UTC)
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const label = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  return { start, end, label };
}
