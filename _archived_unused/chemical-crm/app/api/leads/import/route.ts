import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Segment, PipelineStage } from "@prisma/client";

type NormalizedRow = {
  companyName: string;
  contactName: string;
  email: string;
  country: string;
  segment: Segment;
  pipelineStage: PipelineStage;
  emailSubject: string;
  emailBody: string;
};

type SaveRow = {
  status: "normal" | "warning";
  normalized: NormalizedRow;
};

export async function POST(req: NextRequest) {
  const { rows, sequenceName, source } = await req.json() as { rows: SaveRow[]; sequenceName?: string; source?: string };

  // normal + warning 행만 저장 (excluded, duplicate 제외)
  const toSave = rows.filter((r) => r.status === "normal" || r.status === "warning");
  console.log("[import] 수신 rows 길이:", rows.length, "/ toSave 길이:", toSave.length);
  if (toSave.length > 0) console.log("[import] 첫 번째 row:", JSON.stringify(toSave[0], null, 2));

  let saved = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of toSave) {
    const { companyName, contactName, email, country, segment, pipelineStage } = row.normalized;
    try {
      // 회사 찾기 또는 생성
      let company = await prisma.company.findFirst({
        where: { name: companyName },
      });

      if (!company) {
        company = await prisma.company.create({
          data: { name: companyName, country, segment, pipelineStage, source: source ?? "exhibition_import" },
        });
      }

      // 담당자 중복 확인 후 생성
      const existingContact = await prisma.contact.findFirst({
        where: { companyId: company.id, email },
      });

      if (!existingContact) {
        await prisma.contact.create({
          data: { companyId: company.id, name: contactName, email },
        });
        saved++;
      } else {
        skipped++;
      }
    } catch {
      errors++;
    }
  }

  // 시퀀스 템플릿 생성 (옵션)
  let sequenceCreated = false;
  if (sequenceName && toSave.length > 0) {
    const firstRow = toSave.find((r) => r.normalized.emailSubject || r.normalized.emailBody);
    if (firstRow) {
      await prisma.sequence.create({
        data: {
          name: sequenceName,
          steps: {
            create: [{
              stepOrder: 1,
              subject: firstRow.normalized.emailSubject || "(제목 없음)",
              body: firstRow.normalized.emailBody || "",
              delayDays: 0,
            }],
          },
        },
      });
      sequenceCreated = true;
    }
  }

  return NextResponse.json({
    saved,
    skipped,
    excluded: rows.length - toSave.length,
    errors,
    sequenceCreated,
  });
}
