import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Segment, PipelineStage } from "@prisma/client";

const toPrismaSegment: Record<string, Segment> = {
  "전시회 부스": "exhibition_booth", exhibition_booth: "exhibition_booth",
  "텐데이터 볼륨": "tendata_volume", tendata_volume: "tendata_volume",
  "국가별 디스트리뷰터": "distributor_by_country", distributor_by_country: "distributor_by_country",
  "직접 만남": "met_in_person", met_in_person: "met_in_person",
  인바운드: "inbound", inbound: "inbound",
};

const toPrismaStage: Record<string, PipelineStage> = {
  신규: "NEW", NEW: "NEW",
  접촉중: "CONTACTED", CONTACTED: "CONTACTED",
  제안완료: "PROPOSED", PROPOSED: "PROPOSED",
  계약완료: "CONTRACTED", CONTRACTED: "CONTRACTED",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidatedRow = {
  rowIndex: number;
  status: "normal" | "warning" | "duplicate" | "excluded";
  issues: string[];
  normalized: {
    companyName: string;
    contactName: string;
    email: string;
    country: string;
    segment: Segment;
    pipelineStage: PipelineStage;
    emailSubject: string;
    emailBody: string;
  };
};

export async function POST(req: NextRequest) {
  const { rows } = await req.json() as { rows: Record<string, string>[] };

  // DB에서 기존 회사 + 담당자 이메일 목록 로드
  const existingCompanies = await prisma.company.findMany({
    include: { contacts: { select: { email: true } } },
  });
  const dbMap = new Map(
    existingCompanies.map((c) => [
      c.name.toLowerCase(),
      new Set(c.contacts.map((ct) => ct.email.toLowerCase())),
    ])
  );

  // 파일 내 중복 추적
  const seenInFile = new Set<string>();

  const validated: ValidatedRow[] = rows.map((row, rowIndex) => {
    const issues: string[] = [];
    let status: ValidatedRow["status"] = "normal";

    const companyName = row.companyName?.trim() ?? "";
    const contactName = row.contactName?.trim() || "ABM Contact";
    const email = row.email?.trim() ?? "";
    const country = row.country?.trim() ?? "";
    const rawSegment = row.segment?.trim() ?? "";
    const rawStage = row.pipelineStage?.trim() ?? "";
    const emailSubject = row.emailSubject?.trim() ?? "";
    const emailBody = row.emailBody?.trim() ?? "";

    // 필수 필드 검사
    if (!companyName) issues.push("회사명 없음");
    if (!email) {
      issues.push("이메일 없음");
    } else if (!EMAIL_RE.test(email)) {
      issues.push("이메일 형식 오류");
    }

    if (issues.length > 0) {
      status = "excluded";
    }

    // 정규화
    const segment: Segment = toPrismaSegment[rawSegment] ?? "inbound";
    if (rawSegment && !toPrismaSegment[rawSegment]) {
      issues.push(`세그먼트 정규화: "${rawSegment}" → inbound`);
      if (status === "normal") status = "warning";
    }

    const pipelineStage: PipelineStage = toPrismaStage[rawStage] ?? "NEW";
    if (rawStage && !toPrismaStage[rawStage]) {
      issues.push(`파이프라인 정규화: "${rawStage}" → 신규`);
      if (status === "normal") status = "warning";
    }

    if (status !== "excluded") {
      const fileKey = `${companyName.toLowerCase()}|${email.toLowerCase()}`;

      // 파일 내 중복
      if (seenInFile.has(fileKey)) {
        issues.push("파일 내 중복");
        status = "duplicate";
      } else {
        seenInFile.add(fileKey);

        // DB 중복 확인
        const dbEmails = dbMap.get(companyName.toLowerCase());
        if (dbEmails) {
          if (dbEmails.has(email.toLowerCase())) {
            issues.push("DB 중복 (동일 회사 + 이메일)");
            status = "duplicate";
          } else {
            issues.push("기존 회사에 담당자 추가");
            if (status === "normal") status = "warning";
          }
        }
      }
    }

    return {
      rowIndex,
      status,
      issues,
      normalized: { companyName, contactName, email, country, segment, pipelineStage, emailSubject, emailBody },
    };
  });

  const summary = {
    normal: validated.filter((r) => r.status === "normal").length,
    warning: validated.filter((r) => r.status === "warning").length,
    duplicate: validated.filter((r) => r.status === "duplicate").length,
    excluded: validated.filter((r) => r.status === "excluded").length,
  };

  console.log("[validate] 결과 요약:", summary);

  return NextResponse.json({ validated, summary });
}
