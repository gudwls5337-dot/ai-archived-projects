import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { ScoredIssue } from "../types/news";
import { FinalRow } from "./generateFinalExport";
import { logger } from "../utils/logger";
import { ArchiveTs, archiveXlsx } from "../utils/archiveWriter";

// =============================================
// 출력 디렉토리 준비
// =============================================
function prepareDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// =============================================
// 날짜 태그 (YYYY-MM-DD)
// =============================================
function getDateTag(): string {
  return new Date().toISOString().slice(0, 10);
}

// =============================================
// 날짜+시간 태그 (YYYY-MM-DD-HH) — 시간별 파일명용
// =============================================
function getHourTag(): string {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10);
  const hour = String(now.getHours()).padStart(2, "0");
  return `${date}-${hour}`;
}

// =============================================
// 메인 함수: ScoredIssue[] + FinalRow[] → xlsx 저장
//
// mode "daily"  → outputs/excel/daily/YYYY-MM-DD-news.xlsx
// mode "hourly" → outputs/excel/hourly/YYYY-MM-DD-HH-news.xlsx
// =============================================
export async function generateExcelExport(
  ranked: ScoredIssue[],
  finalRows: FinalRow[],
  mode: "daily" | "hourly",
  ats?: ArchiveTs
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "news-shorts-bot";
  workbook.created = new Date();

  // ── Ranked 시트 ─────────────────────────────
  const rankedSheet = workbook.addWorksheet("Ranked");

  rankedSheet.columns = [
    { header: "순위",          key: "rank",                   width: 6  },
    { header: "대표 기사 제목", key: "canonicalTitle",          width: 50 },
    { header: "출처 수(점수)", key: "finalScore",              width: 12 },
    { header: "출처 수",       key: "sourceCount",             width: 10 },
    { header: "기사 수",       key: "articleCount",            width: 10 },
    { header: "대표 키워드",   key: "representativeKeywords",  width: 45 },
  ];

  const rankedHeader = rankedSheet.getRow(1);
  rankedHeader.font = { bold: true };
  rankedHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E1F2" },
  };

  for (const issue of ranked) {
    rankedSheet.addRow({
      rank:                   issue.rank,
      canonicalTitle:         issue.representativeTitle,
      finalScore:             issue.sourceCount,
      sourceCount:            issue.sourceCount,
      articleCount:           issue.articleCount,
      representativeKeywords: issue.representativeKeywords.join(", "),
    });
  }

  // ── Final 시트 ──────────────────────────────
  const finalSheet = workbook.addWorksheet("Final");

  finalSheet.columns = [
    { header: "순위",            key: "rank",              width: 6  },
    { header: "대표 기사 제목",   key: "canonicalTitle",     width: 40 },
    { header: "30초 요약",       key: "summary",           width: 50 },
    { header: "추천 제목",       key: "bestTitle",         width: 40 },
    { header: "추천 훅 문구",    key: "bestHook",          width: 40 },
    { header: "추천 썸네일 문구", key: "bestThumbnailText", width: 30 },
    { header: "해시태그",        key: "hashtags",          width: 40 },
    { header: "전체 댓글 수",    key: "totalCommentCount", width: 14 },
    { header: "공감 수",         key: "totalLikeCount",    width: 10 },
    { header: "비공감 수",       key: "totalDislikeCount", width: 10 },
    { header: "상위 댓글",       key: "topComments",       width: 50 },
    { header: "업로드 후보",     key: "uploadCandidate",   width: 14 },
    { header: "검토 메모",       key: "reviewMemo",        width: 30 },
  ];

  const finalHeader = finalSheet.getRow(1);
  finalHeader.font = { bold: true };
  finalHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2EFDA" },
  };

  // 요약·댓글 열은 줄바꿈 허용
  finalSheet.getColumn("summary").alignment    = { wrapText: true };
  finalSheet.getColumn("topComments").alignment = { wrapText: true };

  for (const row of finalRows) {
    finalSheet.addRow({
      rank:               row.rank,
      canonicalTitle:     row.canonicalTitle,
      summary:            row.summary,
      bestTitle:          row.bestTitle,
      bestHook:           row.bestHook,
      bestThumbnailText:  row.bestThumbnailText,
      hashtags:           row.hashtags,
      totalCommentCount:  row.totalCommentCount ?? "",
      totalLikeCount:     row.totalLikeCount    ?? "",
      totalDislikeCount:  row.totalDislikeCount ?? "",
      topComments:        row.topComments,
      uploadCandidate:    row.uploadCandidate ? "TRUE" : "FALSE",
      reviewMemo:         row.reviewMemo,
    });
  }

  // ── 파일 저장 ────────────────────────────────
  const tag    = mode === "daily" ? getDateTag() : getHourTag();
  const subDir = mode === "daily" ? "outputs/excel/daily" : "outputs/excel/hourly";
  prepareDir(subDir);

  const filePath = path.join(subDir, `${tag}-news.xlsx`);
  await workbook.xlsx.writeFile(filePath);

  // 아카이브 저장
  await archiveXlsx("excel", "news", workbook, ats);

  logger.success(`[Excel] ${mode === "daily" ? "일자별" : "시간별"} xlsx 저장 완료 → ${filePath}`);
  return filePath;
}
