import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sequence = await prisma.sequence.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepOrder: "asc" } } },
    });
    if (!sequence) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(sequence);
  } catch (err) {
    console.error("[GET /api/sequences/[id]]", err);
    return NextResponse.json({ error: "DB 연결 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description } = body;

    const sequence = await prisma.sequence.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
      },
    });
    return NextResponse.json(sequence);
  } catch (err) {
    console.error("[PATCH /api/sequences/[id]]", err);
    return NextResponse.json({ error: "시퀀스 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.sequence.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/sequences/[id]]", err);
    return NextResponse.json({ error: "시퀀스 삭제에 실패했습니다." }, { status: 500 });
  }
}
