import fs from "fs";
import path from "path";
import { FinalRow } from "./generateFinalExport";
import { logger } from "../utils/logger";
import { getArchiveTs, archiveText, archiveJson } from "../utils/archiveWriter";

// =============================================
// publish 한 행의 타입 (FinalRow 기반)
// =============================================
export interface PublishRow {
  rank: number;
  canonicalTitle: string;
  representativeUrl: string;
  finalScore: number;
  summary: string;
  bestTitle: string;
  bestHook: string;
  bestThumbnailText: string;
  hashtags: string;
  totalCommentCount: number | null;
  totalLikeCount: number | null;
  topComments: string;
  warning: string;      // riskNotes 가 있으면 복사, 없으면 빈 문자열
  reviewMemo: string;
}

// =============================================
// CSV 한 셀 이스케이프
// =============================================
function escapeCell(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (!/[",\n\r]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

// =============================================
// PublishRow 배열 → CSV 문자열
// =============================================
function buildCsv(rows: PublishRow[]): string {
  const headers: (keyof PublishRow)[] = [
    "rank",
    "canonicalTitle",
    "representativeUrl",
    "finalScore",
    "summary",
    "bestTitle",
    "bestHook",
    "bestThumbnailText",
    "hashtags",
    "totalCommentCount",
    "totalLikeCount",
    "topComments",
    "warning",
    "reviewMemo",
  ];

  const headerLabels: Record<keyof PublishRow, string> = {
    rank:              "순위",
    canonicalTitle:    "대표 기사 제목",
    representativeUrl: "대표 기사 URL",
    finalScore:        "출처 수(점수)",
    summary:           "30초 요약",
    bestTitle:         "추천 제목",
    bestHook:          "추천 훅 문구",
    bestThumbnailText: "추천 썸네일 문구",
    hashtags:          "해시태그",
    totalCommentCount: "전체 댓글 수",
    totalLikeCount:    "공감 수",
    topComments:       "상위 댓글",
    warning:           "⚠️ 민감 이슈 경고",
    reviewMemo:        "검토 메모",
  };

  const headerRow = headers.map((h) => escapeCell(headerLabels[h])).join(",");
  const dataRows  = rows.map((row) =>
    headers.map((h) => escapeCell(row[h])).join(",")
  );

  return "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
}

// =============================================
// 오늘 날짜 문자열 (YYYY-MM-DD)
// =============================================
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function prepareDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// =============================================
// 소스 JSON 파일 경로 해석
//
// 우선순위:
//   1. YYYY-MM-DD-selected.json (gen-select 실행 시 생성 — 사람 편집 반영본)
//   2. YYYY-MM-DD-final.json    (gen-select 미실행 시 원본 그대로)
//
// 오늘 날짜 파일 우선, 없으면 가장 최근 파일
// =============================================
function resolveSourceJsonPath(): { jsonPath: string; isSelected: boolean } {
  const dir   = "outputs/final";
  const today = getToday();

  // selected.json 우선 확인
  const selectedToday = path.join(dir, `${today}-selected.json`);
  if (fs.existsSync(selectedToday)) {
    return { jsonPath: selectedToday, isSelected: true };
  }

  // 가장 최근 selected.json 확인
  if (fs.existsSync(dir)) {
    const selectedFiles = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith("-selected.json"))
      .sort()
      .reverse();
    if (selectedFiles.length > 0) {
      const latest = path.join(dir, selectedFiles[0]);
      logger.info(`[Publish] 오늘 selected.json 없음 → 최근 파일 사용: ${latest}`);
      return { jsonPath: latest, isSelected: true };
    }
  }

  // selected.json 없으면 final.json 사용
  const finalToday = path.join(dir, `${today}-final.json`);
  if (fs.existsSync(finalToday)) {
    return { jsonPath: finalToday, isSelected: false };
  }

  if (!fs.existsSync(dir)) {
    logger.error(`[Publish] outputs/final 디렉토리가 없습니다. 먼저 npm run dev 를 실행하세요.`);
    process.exit(1);
  }

  const finalFiles = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("-final.json"))
    .sort()
    .reverse();

  if (finalFiles.length === 0) {
    logger.error(`[Publish] outputs/final 에 final.json 파일이 없습니다. 먼저 npm run dev 를 실행하세요.`);
    process.exit(1);
  }

  const latest = path.join(dir, finalFiles[0]);
  logger.info(`[Publish] 오늘 파일 없음 → 최근 파일 사용: ${latest}`);
  return { jsonPath: latest, isSelected: false };
}

// =============================================
// 메인: selected.json(우선) 또는 final.json → publish 저장
// =============================================
export async function generatePublishExport(): Promise<void> {
  const { jsonPath, isSelected } = resolveSourceJsonPath();

  if (isSelected) {
    logger.info(`[Publish] 소스: ${jsonPath} (사람 편집 반영본)`);
  } else {
    logger.info(`[Publish] 소스: ${jsonPath} (원본 — gen-select 미실행)`);
    logger.info(`[Publish] 팁: npm run gen-select 를 먼저 실행하면 엑셀 편집 내용이 반영됩니다.`);
  }

  const allRows: FinalRow[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  // selected.json 은 이미 uploadCandidate=true 로 필터된 상태
  // final.json 은 필터 필요
  const candidates = isSelected
    ? allRows
    : allRows.filter((r) => r.uploadCandidate === true);

  if (candidates.length === 0) {
    logger.error(`[Publish] uploadCandidate: true 인 항목이 없습니다.`);
    logger.error(`[Publish] outputs/final/YYYY-MM-DD-final.csv 를 열어 업로드할 행의 업로드 후보(TRUE/FALSE) 열을 TRUE 로 변경하세요.`);
    process.exit(1);
  }

  // FinalRow → PublishRow 변환
  const publishRows: PublishRow[] = candidates.map((r) => ({
    rank:              r.rank,
    canonicalTitle:    r.canonicalTitle,
    representativeUrl: r.representativeUrl ?? "",
    finalScore:        r.finalScore,
    summary:           r.summary,
    bestTitle:         r.bestTitle,
    bestHook:          r.bestHook,
    bestThumbnailText: r.bestThumbnailText,
    hashtags:          r.hashtags,
    totalCommentCount: r.totalCommentCount ?? null,
    totalLikeCount:    r.totalLikeCount    ?? null,
    topComments:       r.topComments       ?? "",
    warning:           r.riskNotes         ?? "",
    reviewMemo:        r.reviewMemo        ?? "",
  }));

  // 날짜: 소스 파일명에서 추출 (YYYY-MM-DD)
  const dateTag  = path.basename(jsonPath).slice(0, 10);
  const outDir   = "outputs/publish";
  prepareDir(outDir);

  const csvContent  = buildCsv(publishRows);
  const csvPath     = path.join(outDir, `${dateTag}-publish.csv`);
  const outJsonPath = path.join(outDir, `${dateTag}-publish.json`);

  fs.writeFileSync(csvPath,     csvContent,                        "utf-8");
  fs.writeFileSync(outJsonPath, JSON.stringify(publishRows, null, 2), "utf-8");

  // 아카이브 저장
  const ats = getArchiveTs();
  archiveText("publish", "publish", "csv", csvContent,    ats);
  archiveJson("publish", "publish", publishRows,           ats);

  logger.success(`[Publish] ${candidates.length}건 추출 완료`);
  logger.success(`[Publish] CSV  → ${csvPath}`);
  logger.success(`[Publish] JSON → ${outJsonPath}`);

  // warning 있는 항목 별도 고지
  const warned = publishRows.filter((r) => r.warning !== "");
  if (warned.length > 0) {
    logger.info(`[Publish] ⚠️  민감 이슈 ${warned.length}건 포함 — warning 열 확인 필수`);
    warned.forEach((r) => logger.info(`         - [${r.rank}위] ${r.canonicalTitle}`));
  }
}

// 독립 실행 진입점
generatePublishExport().catch((e) => {
  console.error(e);
  process.exit(1);
});
