import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { PoliticalIssue, PoliticalResearchResult } from "../types/political";
import { archiveXlsx, ArchiveTs } from "../utils/archiveWriter";

// =============================================
// 정치 이슈 시장조사 엑셀 — 5개 시트
//   Sheet 1: MasterIssues      — 전체 이슈
//   Sheet 2: ConservativePositive
//   Sheet 3: ProgressivePositive
//   Sheet 4: SourceSignals     — 신호 데이터
//   Sheet 5: ReviewQueue       — 검토 대기
// =============================================

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// =============================================
// 헤더 스타일 공통 적용
// =============================================
function applyHeaderStyle(sheet: ExcelJS.Worksheet): void {
  const row = sheet.getRow(1);
  row.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  row.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E4057" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height    = 32;
}

// =============================================
// 이슈 시트 공통 컬럼 정의
// =============================================
const ISSUE_COLUMNS = [
  { header: "순위",         key: "rank",         width: 6  },
  { header: "키워드",       key: "keyword",      width: 15 },
  { header: "대표 기사 제목", key: "title",       width: 42 },
  { header: "채널 적합도",   key: "fit",          width: 24 },
  { header: "분류 근거",     key: "fitReason",    width: 32 },
  { header: "근거 키워드",   key: "evidenceKw",   width: 24 },
  { header: "민감도",        key: "sensitivity",  width: 10 },
  { header: "출처 수",       key: "sourceCount",  width: 8  },
  { header: "출처 목록",     key: "sources",      width: 32 },
  { header: "기사 수",       key: "articleCount", width: 8  },
  { header: "최종 점수",     key: "finalScore",   width: 10 },
  { header: "출처다양성",    key: "srcDiv",       width: 10 },
  { header: "최신성",        key: "fresh",        width: 8  },
  { header: "반응강도",      key: "reaction",     width: 8  },
  { header: "정치관련도",    key: "polRel",       width: 10 },
  { header: "채널적합",      key: "chFit",        width: 8  },
  { header: "숏폼잠재",      key: "shortsScore",  width: 8  },
  { header: "중복페널티",    key: "dupPen",       width: 10 },
  { header: "숏폼잠재력(%)", key: "shortsPct",    width: 12 },
  { header: "반응점수(%)",   key: "reactionPct",  width: 12 },
  { header: "검토 메모",     key: "reviewMemo",      width: 40 },
  { header: "검토 상태",     key: "reviewStatus",    width: 14 },
  { header: "한줄 요약",     key: "oneLineSummary",  width: 48 },
  { header: "채널 적합 이유", key: "whyFits",         width: 36 },
  { header: "썸네일 키워드", key: "thumbnailKw",     width: 28 },
  { header: "영상 리스크",   key: "videoRisk",       width: 36 },
  { header: "대표 URL",      key: "url",             width: 52 },
  { header: "최신 발행일",   key: "pubDate",         width: 22 },
  { header: "제목 아이디어", key: "titleIdea",       width: 40 },
  { header: "훅 문장",       key: "hookIdea",        width: 52 },
  { header: "앵글 메모",     key: "angleNote",       width: 40 },
];

// =============================================
// 이슈 → 행 데이터 변환
// =============================================
function issueToRow(issue: PoliticalIssue): (string | number)[] {
  return [
    issue.rank,
    issue.keyword,
    issue.title,
    issue.politicalSideFit,
    issue.fitReason,
    issue.evidenceKeywords.join(", "),
    issue.sensitivityLevel,
    issue.sourceCount,
    issue.sources.join(", "),
    issue.articleCount,
    issue.scores.finalScore,
    issue.scores.sourceDiversity,
    issue.scores.freshness,
    issue.scores.reactionIntensity,
    issue.scores.politicalRelevance,
    issue.scores.channelFit,
    issue.scores.shortsPotential,
    issue.scores.duplicatePenalty,
    issue.shortsPotential,
    issue.reactionScore,
    issue.reviewMemo || "-",
    issue.reviewStatus,
    issue.oneLineSummary,
    issue.channelWhyItFits,
    issue.thumbnailKeywords.join(" · "),
    issue.videoRiskNote,
    issue.representativeUrl,
    issue.latestPubDate,
    issue.titleIdea,
    issue.hookIdea,
    issue.angleNote,
  ];
}

// =============================================
// 이슈 시트 채우기 (공통 로직)
// =============================================
function fillIssueSheet(sheet: ExcelJS.Worksheet, issues: PoliticalIssue[]): void {
  sheet.columns = ISSUE_COLUMNS as ExcelJS.Column[];
  applyHeaderStyle(sheet);

  for (const issue of issues) {
    const row = sheet.addRow(issueToRow(issue));
    row.alignment = { wrapText: true, vertical: "top" };

    // 채널 적합도에 따라 행 배경색
    if (issue.politicalSideFit === "conservative_positive") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } }; // 연파란
    } else if (issue.politicalSideFit === "progressive_positive") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEBEE" } }; // 연분홍
    } else if (issue.politicalSideFit === "mixed") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E5F5" } }; // 연보라
    }

    // 고민감도 → 민감도 셀 빨간 굵게
    if (issue.sensitivityLevel === "high") {
      row.getCell(7).font = { bold: true, color: { argb: "FFCC0000" } };
    }

    // 검토 메모 있으면 → 주황 (col 21: 검토메모)
    if (issue.reviewMemo && issue.reviewMemo !== "-") {
      row.getCell(21).font = { color: { argb: "FFD84315" } };
    }

    // reviewStatus 셀 색상 (col 22)
    const statusCell = row.getCell(22);
    if (issue.reviewStatus === "approved") {
      statusCell.font = { bold: true, color: { argb: "FF1B5E20" } };
    } else if (issue.reviewStatus === "review_needed") {
      statusCell.font = { bold: true, color: { argb: "FFE65100" } };
    } else if (issue.reviewStatus === "rejected") {
      statusCell.font = { bold: true, color: { argb: "FFCC0000" } };
    }
  }

  // 자동 필터
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: ISSUE_COLUMNS.length },
  };

  // 첫 행 고정
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

// =============================================
// 메인 함수: 엑셀 5시트 생성 + 저장
// =============================================
export async function generatePoliticalExcelExport(
  result: PoliticalResearchResult,
  ats: ArchiveTs
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = "news-shorts-bot";
  workbook.created  = new Date();

  const { issues } = result;

  // ── Sheet 1: MasterIssues ────────────────────
  fillIssueSheet(workbook.addWorksheet("MasterIssues"), issues);

  // ── Sheet 2: ConservativePositive ────────────
  fillIssueSheet(
    workbook.addWorksheet("ConservativePositive"),
    issues.filter((i) => i.politicalSideFit === "conservative_positive")
  );

  // ── Sheet 3: ProgressivePositive ─────────────
  fillIssueSheet(
    workbook.addWorksheet("ProgressivePositive"),
    issues.filter((i) => i.politicalSideFit === "progressive_positive")
  );

  // ── Sheet 4: SourceSignals ───────────────────
  const signalSheet = workbook.addWorksheet("SourceSignals");
  signalSheet.columns = [
    { header: "키워드",           key: "keyword",     width: 15 },
    { header: "출처 목록",        key: "sources",     width: 32 },
    { header: "기사 수",          key: "articleCount",width: 8  },
    { header: "YouTube 신호강도", key: "ytStrength",  width: 14 },
    { header: "YouTube 영상 수",  key: "ytCount",     width: 14 },
    { header: "YouTube 대표 제목",key: "ytTitle",     width: 42 },
    { header: "Reddit 신호강도",  key: "rdStrength",  width: 12 },
    { header: "Reddit 게시물 수", key: "rdCount",     width: 14 },
    { header: "반응 강도 점수",   key: "reactionScore",width: 14},
    { header: "출처 다양성 점수", key: "srcDivScore", width: 14 },
  ] as ExcelJS.Column[];
  applyHeaderStyle(signalSheet);
  signalSheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const issue of issues) {
    signalSheet.addRow([
      issue.keyword,
      issue.sources.join(", "),
      issue.articleCount,
      issue.youtubeSignal?.signalStrength ?? "수집안됨",
      issue.youtubeSignal?.estimatedVideoCount ?? 0,
      issue.youtubeSignal?.topVideoTitles?.[0] ?? "-",
      issue.redditSignal?.signalStrength ?? "수집안됨",
      issue.redditSignal?.postCount ?? 0,
      issue.reactionScore,
      issue.scores.sourceDiversity,
    ]);
  }

  // ── Sheet 5: ReviewQueue ─────────────────────
  const reviewSheet = workbook.addWorksheet("ReviewQueue");
  reviewSheet.columns = [
    { header: "순위",         key: "rank",       width: 6  },
    { header: "키워드",       key: "keyword",    width: 15 },
    { header: "대표 기사 제목",key: "title",     width: 42 },
    { header: "채널 적합도",  key: "fit",        width: 24 },
    { header: "검토 이유",    key: "memo",         width: 50 },
    { header: "검토 상태",    key: "reviewStatus", width: 14 },
    { header: "최종 점수",    key: "finalScore",   width: 10 },
    { header: "출처 수",      key: "sourceCount",  width: 8  },
    { header: "기사 수",      key: "articleCount", width: 8  },
    { header: "대표 URL",     key: "url",          width: 52 },
  ] as ExcelJS.Column[];
  applyHeaderStyle(reviewSheet);
  reviewSheet.views = [{ state: "frozen", ySplit: 1 }];

  const reviewQueue = issues.filter((i) => i.reviewMemo !== "");
  for (const issue of reviewQueue) {
    const row = reviewSheet.addRow([
      issue.rank,
      issue.keyword,
      issue.title,
      issue.politicalSideFit,
      issue.reviewMemo,
      issue.reviewStatus,
      issue.scores.finalScore,
      issue.sourceCount,
      issue.articleCount,
      issue.representativeUrl,
    ]);
    row.getCell(5).font = { color: { argb: "FFCC0000" } };
    // reviewStatus 색상 (col 6)
    const rsCell = row.getCell(6);
    if (issue.reviewStatus === "approved") {
      rsCell.font = { bold: true, color: { argb: "FF1B5E20" } };
    } else if (issue.reviewStatus === "review_needed") {
      rsCell.font = { bold: true, color: { argb: "FFE65100" } };
    } else if (issue.reviewStatus === "rejected") {
      rsCell.font = { bold: true, color: { argb: "FFCC0000" } };
    }
  }

  // ── 파일 저장 ────────────────────────────────
  const today   = getToday();
  const dir     = "outputs/political/excel";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${today}-political-research.xlsx`);

  await workbook.xlsx.writeFile(filePath);
  await archiveXlsx("political-excel", "political", workbook, ats);

  return filePath;
}
