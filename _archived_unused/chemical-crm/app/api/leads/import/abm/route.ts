import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type AbmRow = {
  companyName: string;
  email: string;
  country: string;
  emailSubject: string;
  emailBody: string;
};

export async function POST(req: NextRequest) {
  const { rows } = await req.json() as { rows: AbmRow[] };

  let createdCompanies = 0;
  let createdContacts  = 0;
  let skippedDuplicates = 0;
  let invalidRows      = 0;

  for (const row of rows) {
    const { companyName, email, country } = row;

    // 필수값 누락 → invalid
    if (!companyName || !email) {
      invalidRows++;
      continue;
    }

    try {
      // Company: 이름 기준 찾기 or 생성
      let company = await prisma.company.findFirst({
        where: { name: companyName },
      });

      if (!company) {
        company = await prisma.company.create({
          data: {
            name:          companyName,
            country:       country || "",
            segment:       "exhibition_booth",
            pipelineStage: "NEW",
            source:        "abm_import",
          },
        });
        createdCompanies++;
      }

      // Contact: companyId + email 기준 중복 검사
      const existing = await prisma.contact.findFirst({
        where: { companyId: company.id, email },
      });

      if (existing) {
        skippedDuplicates++;
        continue;
      }

      await prisma.contact.create({
        data: {
          companyId: company.id,
          name:      "ABM Contact",
          email,
        },
      });
      createdContacts++;
    } catch (err) {
      console.error("[abm import] row error:", row, err);
      invalidRows++;
    }
  }

  console.log("[abm import] 결과:", { createdCompanies, createdContacts, skippedDuplicates, invalidRows });

  return NextResponse.json({
    createdCompanies,
    createdContacts,
    skippedDuplicates,
    invalidRows,
  });
}
