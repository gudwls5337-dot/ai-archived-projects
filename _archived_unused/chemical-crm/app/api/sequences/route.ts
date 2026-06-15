import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const sequences = await prisma.sequence.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { steps: true } } },
    });
    return NextResponse.json(sequences);
  } catch (err) {
    console.error("[GET /api/sequences]", err);
    return NextResponse.json({ error: "DB 연결 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: "name 은 필수입니다." }, { status: 400 });
    }

    const sequence = await prisma.sequence.create({
      data: { name, description: description || null },
    });
    return NextResponse.json(sequence, { status: 201 });
  } catch (err) {
    console.error("[POST /api/sequences]", err);
    return NextResponse.json({ error: "시퀀스 생성에 실패했습니다." }, { status: 500 });
  }
}
