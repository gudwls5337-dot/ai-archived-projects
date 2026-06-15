import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const queue = await prisma.mailQueue.findUnique({ where: { id: params.id } });
  if (!queue) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ queue });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.mailQueue.update({
    where: { id: params.id },
    data: { status: "cancelled", completedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
