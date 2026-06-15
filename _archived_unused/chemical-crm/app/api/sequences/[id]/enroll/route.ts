import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sequenceId } = await params;

  const body = await req.json();
  const { contactId } = body;

  if (!contactId) {
    return NextResponse.json({ error: "contactId가 필요합니다." }, { status: 400 });
  }

  // 시퀀스 존재 여부 확인
  const sequence = await prisma.sequence.findUnique({ where: { id: sequenceId } });
  if (!sequence) {
    return NextResponse.json({ error: "시퀀스를 찾을 수 없습니다." }, { status: 404 });
  }

  // 컨택트 존재 여부 확인
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) {
    return NextResponse.json({ error: "컨택트를 찾을 수 없습니다." }, { status: 404 });
  }

  // 중복 등록 확인 — 이미 있으면 기존 데이터 반환
  const existing = await prisma.contactSequenceEnrollment.findFirst({
    where: { contactId, sequenceId },
  });
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  const enrollment = await prisma.contactSequenceEnrollment.create({
    data: {
      contactId,
      sequenceId,
      currentStep: 1,
      status: "ACTIVE",
      enrolledAt: new Date(),
    },
  });

  return NextResponse.json(enrollment, { status: 201 });
}
