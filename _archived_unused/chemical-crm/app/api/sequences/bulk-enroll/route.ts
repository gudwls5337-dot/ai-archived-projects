import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { companyIds, sequenceId } = await req.json();

  if (!companyIds?.length || !sequenceId) {
    return NextResponse.json(
      { error: "companyIds, sequenceId 는 필수입니다." },
      { status: 400 }
    );
  }

  // 선택된 회사의 발송 포함 담당자 조회
  const contacts = await prisma.contact.findMany({
    where: { companyId: { in: companyIds }, excludedFromSending: false },
    select: { id: true },
  });

  if (contacts.length === 0) {
    return NextResponse.json({ enrolled: 0, skipped: 0, message: "등록 가능한 담당자가 없습니다." });
  }

  // 이미 등록된 담당자 확인
  const existing = await prisma.contactSequenceEnrollment.findMany({
    where: {
      sequenceId,
      contactId: { in: contacts.map((c) => c.id) },
    },
    select: { contactId: true },
  });
  const existingSet = new Set(existing.map((e) => e.contactId));

  const toEnroll = contacts.filter((c) => !existingSet.has(c.id));

  if (toEnroll.length === 0) {
    return NextResponse.json({
      enrolled: 0,
      skipped: contacts.length,
      message: "모두 이미 등록된 담당자입니다.",
    });
  }

  await prisma.contactSequenceEnrollment.createMany({
    data: toEnroll.map((c) => ({
      contactId: c.id,
      sequenceId,
      currentStep: 1,
      status: "ACTIVE",
    })),
  });

  return NextResponse.json({
    enrolled: toEnroll.length,
    skipped: existingSet.size,
  });
}
