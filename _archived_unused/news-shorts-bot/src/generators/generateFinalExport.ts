import fs from "fs";
import path from "path";
import { ShortsPackage, ShortsResult, TopComment } from "../types/news";
import { logger } from "../utils/logger";
import { ArchiveTs, archiveJson, archiveText } from "../utils/archiveWriter";

// =============================================
// 최종 산출물 한 행의 타입
// CSV / JSON 모두 이 구조를 기준으로 생성
// =============================================
export interface FinalRow {
  rank: number;                // 순위
  canonicalTitle: string;      // 대표 기사 제목
  representativeUrl: string;   // 대표 기사 URL
  finalScore: number;          // 최종 점수 (출처 수 기반 간접 지표)
  summary: string;             // 30초 요약
  bestTitle: string;           // 제목 후보 1번
  bestHook: string;            // 훅 문구 1번
  bestThumbnailText: string;   // 썸네일 문구 1번
  hashtags: string;            // 해시태그 (공백 구분)
  totalCommentCount: number | null;  // 전체 댓글 수
  totalLikeCount: number | null;     // 기사 공감 수
  totalDislikeCount: number | null;  // 기사 비공감 수
  topComments: string;               // 상위 댓글 텍스트 (줄바꿈 구분)
  riskNotes: string;           // 민감 이슈 주의 (없으면 빈 문자열)
  isNearDuplicate: boolean;    // 근중복 여부 (상위 이슈와 내용 중복 가능성)
  duplicateGroup: string;      // 유사 이슈 그룹 ID ("" 또는 "G1", "G2" ...)
  uploadCandidate: boolean;    // 업로드 후보 여부 — 사람이 직접 체크
  reviewMemo: string;          // 검토 메모 — 사람이 직접 작성
}

// =============================================
// TopComment[] → 텍스트 형식으로 변환
// =============================================
function formatTopComments(comments: TopComment[]): string {
  if (!comments || comments.length === 0) return "";
  return comments.map((c) => {
    const author  = c.author     ? `[${c.author}] `     : "";
    const likes   = c.likeCount  != null ? ` 👍${c.likeCount}`  : "";
    const replies = c.replyCount != null ? ` 💬${c.replyCount}` : "";
    return `${author}${c.content}${likes}${replies}`;
  }).join("\n");
}

// =============================================
// ShortsPackage 한 건 → FinalRow 변환
// =============================================
function toFinalRow(pkg: ShortsPackage): FinalRow {
  const cm = pkg.commentMeta;
  return {
    rank:                pkg.rank,
    canonicalTitle:      pkg.representativeTitle,
    representativeUrl:   pkg.representativeUrl,
    finalScore:          pkg.sourceCount,
    summary:             pkg.summary,
    bestTitle:           pkg.titleCandidates[0] ?? "",
    bestHook:            pkg.hooks[0] ?? "",
    bestThumbnailText:   pkg.thumbnailTexts[0] ?? "",
    hashtags:            pkg.hashtags.join(" "),
    totalCommentCount:   cm?.totalCommentCount  ?? null,
    totalLikeCount:      cm?.totalLikeCount     ?? null,
    totalDislikeCount:   cm?.totalDislikeCount  ?? null,
    topComments:         formatTopComments(cm?.topComments ?? []),
    riskNotes:           pkg.riskNotes ?? "",
    isNearDuplicate:     pkg.isNearDuplicate,
    duplicateGroup:      pkg.duplicateGroupId !== null ? `G${pkg.duplicateGroupId}` : "",
    uploadCandidate:     false,
    reviewMemo:          "",
  };
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
// FinalRow 배열 → CSV 문자열 생성
// =============================================
function buildCsv(rows: FinalRow[]): string {
  const headers: (keyof FinalRow)[] = [
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
    "totalDislikeCount",
    "topComments",
    "riskNotes",
    "isNearDuplicate",
    "duplicateGroup",
    "uploadCandidate",
    "reviewMemo",
  ];

  const headerLabels: Record<keyof FinalRow, string> = {
    rank:                "순위",
    canonicalTitle:      "대표 기사 제목",
    representativeUrl:   "대표 기사 URL",
    finalScore:          "출처 수(점수)",
    summary:             "30초 요약",
    bestTitle:           "추천 제목",
    bestHook:            "추천 훅 문구",
    bestThumbnailText:   "추천 썸네일 문구",
    hashtags:            "해시태그",
    totalCommentCount:   "전체 댓글 수",
    totalLikeCount:      "공감 수",
    totalDislikeCount:   "비공감 수",
    topComments:         "상위 댓글",
    riskNotes:           "민감 이슈 주의",
    isNearDuplicate:     "근중복 여부",
    duplicateGroup:      "유사 이슈 그룹",
    uploadCandidate:     "업로드 후보(TRUE/FALSE)",
    reviewMemo:          "검토 메모",
  };

  const headerRow = headers.map((h) => escapeCell(headerLabels[h])).join(",");
  const dataRows  = rows.map((row) =>
    headers.map((h) => escapeCell(row[h])).join(",")
  );

  return "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
}

// =============================================
// 출력 디렉토리 + 파일 경로 준비
// =============================================
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function prepareDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// =============================================
// 메인 함수: ShortsPackage 배열 → CSV + JSON 저장
// 저장 경로: outputs/final/YYYY-MM-DD-final.csv
//            outputs/final/YYYY-MM-DD-final.json
// =============================================
export function generateFinalExport(
  packages: ShortsPackage[],
  ats?: ArchiveTs
): {
  csvPath: string;
  jsonPath: string;
  rows: FinalRow[];
} {
  const dir = "outputs/final";
  prepareDir(dir);

  const today = getToday();
  const rows  = packages.map(toFinalRow);

  // CSV 저장
  const csvContent = buildCsv(rows);
  const csvPath    = path.join(dir, `${today}-final.csv`);
  fs.writeFileSync(csvPath, csvContent, "utf-8");

  // JSON 저장
  const jsonContent = JSON.stringify(rows, null, 2);
  const jsonPath    = path.join(dir, `${today}-final.json`);
  fs.writeFileSync(jsonPath, jsonContent, "utf-8");

  // 아카이브 저장
  archiveText("final", "final", "csv",  csvContent,  ats);
  archiveJson("final", "final", rows,                 ats);

  return { csvPath, jsonPath, rows };
}

// =============================================
// 독립 실행용: 오늘 shorts JSON → final 재생성
// npm run final 로 호출됨
// =============================================
export async function generateFinalFromFile(): Promise<void> {
  const shortsPath = path.join("outputs/shorts", `${getToday()}.json`);

  if (!fs.existsSync(shortsPath)) {
    logger.error(`[Final] 파일을 찾을 수 없습니다: ${shortsPath}`);
    logger.error(`[Final] 먼저 npm run dev 를 실행해 shorts 파일을 생성하세요.`);
    process.exit(1);
  }

  const data: ShortsResult = JSON.parse(fs.readFileSync(shortsPath, "utf-8"));
  logger.info(`[Final] ${data.items.length}개 패키지 로드 → CSV + JSON 생성 중...`);

  const { csvPath, jsonPath } = generateFinalExport(data.items);
  logger.success(`[Final] CSV  → ${csvPath}`);
  logger.success(`[Final] JSON → ${jsonPath}`);
}
