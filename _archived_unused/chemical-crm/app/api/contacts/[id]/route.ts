import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...(body.hasReplied !== undefined ? { hasReplied: body.hasReplied } : {}),
      },
    });

    return NextResponse.json({ id: contact.id, hasReplied: contact.hasReplied });
  } catch (err) {
    console.error("[PATCH /api/contacts/[id]]", err);
    return NextResponse.json({ error: "업데이트에 실패했습니다." }, { status: 500 });
  }
}
