import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 1x1 투명 GIF
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

const NO_CACHE = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mailLogId: string }> }
) {
  const { mailLogId } = await params;

  try {
    const log = await prisma.mailLog.findUnique({ where: { id: mailLogId } });

    if (log) {
      const now = new Date();
      if (!log.openedAt) {
        // 최초 오픈
        await prisma.mailLog.update({
          where: { id: mailLogId },
          data: { openedAt: now, lastOpenedAt: now, openCount: 1 },
        });
        console.log(`[track/open] 최초 열람: mailLogId=${mailLogId}`);
      } else {
        // 재오픈: count 증가 + lastOpenedAt 갱신
        await prisma.mailLog.update({
          where: { id: mailLogId },
          data: { lastOpenedAt: now, openCount: { increment: 1 } },
        });
      }
    }
  } catch (err) {
    console.error("[track/open] DB 오류:", err);
  }

  return new NextResponse(TRANSPARENT_GIF, { status: 200, headers: NO_CACHE });
}
