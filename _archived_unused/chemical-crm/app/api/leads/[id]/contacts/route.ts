import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { name, email, title } = body;

  if (!name || !email) {
    return NextResponse.json({ error: "이름과 이메일은 필수입니다." }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) {
    return NextResponse.json({ error: "회사를 찾을 수 없습니다." }, { status: 404 });
  }

  const contact = await prisma.contact.create({
    data: {
      companyId: id,
      name,
      email,
      title: title || null,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
