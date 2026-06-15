import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 활성 큐 + 최근 완료/취소 큐 포함해서 반환 (admin/mail-queue 페이지용)
export async function GET() {
  const queues = await prisma.mailQueue.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ queues });
}
