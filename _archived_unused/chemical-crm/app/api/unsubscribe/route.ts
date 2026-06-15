import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 수신 거부 목록 조회
export async function GET() {
  const list = await prisma.unsubscribe.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(list);
}

// POST: 수신 거부 등록
export async function POST(req: NextRequest) {
  const { email, reason } = await req.json() as { email: string; reason?: string };

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "유효한 이메일을 입력해주세요." }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();

  const existing = await prisma.unsubscribe.findUnique({
    where: { email: normalized },
  });

  if (existing) {
    return NextResponse.json({ ok: true, alreadyExists: true });
  }

  await prisma.unsubscribe.create({
    data: { email: normalized, reason: reason?.trim() || null },
  });

  console.log(`[unsubscribe] 등록: ${normalized} / 사유: ${reason || "없음"}`);

  return NextResponse.json({ ok: true, alreadyExists: false });
}
