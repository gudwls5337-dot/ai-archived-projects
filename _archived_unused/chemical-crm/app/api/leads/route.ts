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

export async function GET() {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        contacts: {
          include: {
            mailLogs: { select: { openCount: true, status: true, sentAt: true } },
          },
        },
      },
    });

    return NextResponse.json(
      companies.map((c) => {
        const rep = c.contacts[0] ?? null;
        const allMailLogs = c.contacts.flatMap((ct) => ct.mailLogs);
        const hasOpenedMail = allMailLogs.some((m) => m.openCount > 0);
        const hasReplied = c.contacts.some((ct) => ct.hasReplied);
        const mailSentCount = allMailLogs.filter((m) => m.status === "SUCCESS").length;
        const sentDates = allMailLogs
          .filter((m) => m.status === "SUCCESS" && m.sentAt)
          .map((m) => m.sentAt!.getTime());
        const lastSentAt = sentDates.length > 0
          ? new Date(Math.max(...sentDates)).toISOString().slice(0, 10)
          : null;

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
          hasOpenedMail,
          hasReplied,
          mailSentCount,
          lastSentAt,
          createdAt: c.createdAt.toISOString().slice(0, 10),
        };
      })
    );
  } catch (err) {
    console.error("[GET /api/leads]", err);
    return NextResponse.json({ error: "DB 연결 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const company = await prisma.company.create({
      data: {
        name: body.companyName,
        country: body.country,
        segment: body.segment,
        pipelineStage: toPrismaStage[body.pipelineStage] ?? "NEW",
        source: body.source ?? null,
        salesStatus: body.salesStatus ?? null,
        tags: body.tags ?? [],
        contacts: body.contactName || body.email
          ? {
              create: {
                name: body.contactName ?? "",
                email: body.email ?? "",
              },
            }
          : undefined,
      },
      include: { contacts: true },
    });

    const rep = company.contacts[0] ?? null;
    return NextResponse.json({
      id: company.id,
      companyName: company.name,
      contactName: rep?.name ?? "",
      email: rep?.email ?? "",
      country: company.country,
      segment: company.segment,
      pipelineStage: toUIStage[company.pipelineStage],
      source: company.source ?? null,
      salesStatus: company.salesStatus ?? null,
      tags: company.tags,
      hasOpenedMail: false,
      hasReplied: false,
      mailSentCount: 0,
      createdAt: company.createdAt.toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("[POST /api/leads]", err);
    return NextResponse.json({ error: "리드 생성에 실패했습니다." }, { status: 500 });
  }
}
