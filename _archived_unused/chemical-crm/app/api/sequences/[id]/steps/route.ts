import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sequenceId } = await params;
  const body = await req.json();
  const { subject, body: stepBody, delayDays } = body;

  if (!subject || !stepBody) {
    return NextResponse.json({ error: "subject, body 는 필수입니다." }, { status: 400 });
  }

  const lastStep = await prisma.sequenceStep.findFirst({
    where: { sequenceId },
    orderBy: { stepOrder: "desc" },
  });
  const nextOrder = (lastStep?.stepOrder ?? 0) + 1;

  const step = await prisma.sequenceStep.create({
    data: {
      sequenceId,
      stepOrder: nextOrder,
      subject,
      body: stepBody,
      delayDays: delayDays ?? 0,
    },
  });
  return NextResponse.json(step, { status: 201 });
}
