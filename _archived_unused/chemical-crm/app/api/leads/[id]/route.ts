import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PipelineStage as PrismaStage } from "@prisma/client";

const toPrismaStage: Record<string, PrismaStage> = {
  신규: "NEW",
  접촉중: "CONTACTED",
  제안완료: "PROPOSED",
  계약완료: "CONTRACTED",
};

const toUIStage: Record<PrismaStage, string> = {
  NEW: "신규",
  CONTACTED: "접촉중",
  PROPOSED: "제안완료",
  CONTRACTED: "계약완료",
};

function formatCompany(c: {
  id: string;
  name: string;
  country: string;
  segment: string;
  pipelineStage: PrismaStage;
  source: string | null;
  salesStatus: string | null;
  tags: string[];
  createdAt: Date;
  contacts: {
    id: string;
    name: string;
    email: string;
    title: string | null;
    hasReplied: boolean;
    mailLogs: { id: string; to: string; subject: string; text: string; status: string; createdAt: Date }[];
  }[];
}) {
  const rep = c.contacts[0] ?? null;
  return {
    id: c.id,
    companyName: c.name,
    contactName: rep?.name ?? "",
    email: rep?.email ?? "",
    country: c.country,
    segment: c.segment,
    pipelineStage: toUIStage[c.pipelineStage],
    source: c.source ?? null,
    salesStatus: c.salesStatus ?? null,
    tags: c.tags,
    createdAt: c.createdAt.toISOString().slice(0, 10),
    contacts: c.contacts.map((ct) => ({
      id: ct.id,
      name: ct.name,
      email: ct.email,
      title: ct.title,
      hasReplied: ct.hasReplied,
      mailLogs: ct.mailLogs.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      })),
    })),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const company = await prisma.company.findUnique({
      where: { id },
      include: { contacts: { include: { mailLogs: { orderBy: { createdAt: "desc" } } } } },
    });

    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(formatCompany(company));
  } catch (err) {
    console.error("[GET /api/leads/[id]]", err);
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

    const updateData: Record<string, unknown> = {};
    if (body.companyName !== undefined) updateData.name = body.companyName;
    if (body.country !== undefined) updateData.country = body.country;
    if (body.segment !== undefined) updateData.segment = body.segment;
    if (body.pipelineStage !== undefined)
      updateData.pipelineStage = toPrismaStage[body.pipelineStage] ?? body.pipelineStage;
    if (body.source !== undefined) updateData.source = body.source || null;
    if (body.salesStatus !== undefined) updateData.salesStatus = body.salesStatus || null;
    if (body.tags !== undefined) updateData.tags = body.tags;

    const company = await prisma.company.update({
      where: { id },
      data: updateData,
      include: { contacts: { include: { mailLogs: { orderBy: { createdAt: "desc" } } } } },
    });

    const rep = company.contacts[0] ?? null;
    if (rep && (body.contactName !== undefined || body.email !== undefined)) {
      await prisma.contact.update({
        where: { id: rep.id },
        data: {
          ...(body.contactName !== undefined ? { name: body.contactName } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
        },
      });
    } else if (!rep && (body.contactName || body.email)) {
      await prisma.contact.create({
        data: {
          companyId: id,
          name: body.contactName ?? "",
          email: body.email ?? "",
        },
      });
    }

    const updated = await prisma.company.findUnique({
      where: { id },
      include: { contacts: { include: { mailLogs: { orderBy: { createdAt: "desc" } } } } },
    });

    return NextResponse.json(formatCompany(updated!));
  } catch (err) {
    console.error("[PATCH /api/leads/[id]]", err);
    return NextResponse.json({ error: "리드 수정에 실패했습니다." }, { status: 500 });
  }
}
