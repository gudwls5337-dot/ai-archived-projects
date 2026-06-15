import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { stepId } = await params;
  const body = await req.json();
  const { subject, body: stepBody, delayDays } = body;

  const step = await prisma.sequenceStep.update({
    where: { id: stepId },
    data: {
      ...(subject !== undefined && { subject }),
      ...(stepBody !== undefined && { body: stepBody }),
      ...(delayDays !== undefined && { delayDays }),
    },
  });
  return NextResponse.json(step);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { stepId } = await params;
  await prisma.sequenceStep.delete({ where: { id: stepId } });
  return NextResponse.json({ success: true });
}
