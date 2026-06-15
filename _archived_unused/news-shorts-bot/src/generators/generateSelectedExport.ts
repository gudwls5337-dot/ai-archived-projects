import fs from "fs";
import path from "path";
import { FinalRow } from "./generateFinalExport";
import { logger } from "../utils/logger";

// =============================================
// 오늘 날짜 문자열 (YYYY-MM-DD)
// =============================================
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// =============================================
// TRUE/FALSE 문자열 → boolean 변환
// 엑셀에서 저장한 다양한 형태를 모두 허용
// =============================================
function parseBool(value: string): boolean {
  const v = value.trim().toUpperCase();
  return v === "TRUE" || v === "1" || v === "YES";
}

// =============================================
// CSV 전체 내용을 문자 단위로 파싱 → 행×셀 배열 반환
//
// 핵심 규칙:
//   - 큰따옴표 안의 줄바꿈은 같은 셀로 유지 (멀티라인 셀 지원)
//   - "" 는 이스케이프된 큰따옴표 (→ " 한 글자)
//   - 큰따옴표 밖의 \r\n 또는 \n 은 행 구분자
//   - 빈 행은 결과에서 제외
// =============================================
function parseRawCsv(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, ""); // BOM 제거
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        currentCell += '"';
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        currentCell += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        currentRow.push(currentCell);
        currentCell = "";
        i++;
      } else if (ch === '\r' && text[i + 1] === '\n') {
        currentRow.push(currentCell);
        currentCell = "";
        if (currentRow.some((c) => c.trim() !== "") || currentRow.length > 1) {
          rows.push(currentRow);
        }
        currentRow = [];
        i += 2;
      } else if (ch === '\n') {
        currentRow.push(currentCell);
        currentCell = "";
        if (currentRow.some((c) => c.trim() !== "") || currentRow.length > 1) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
      } else {
        currentCell += ch;
        i++;
      }
    }
  }

  // 마지막 행 처리
  if (currentRow.length > 0 || currentCell !== "") {
    currentRow.push(currentCell);
    if (currentRow.some((c) => c.trim() !== "")) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// =============================================
// CSV 문자열 → 객체 배열 (헤더 기반)
// =============================================
function parseCsv(content: string): Record<string, string>[] {
  const rows = parseRawCsv(content);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    return row;
  });
}

// =============================================
// 한국어 CSV 헤더 → FinalRow 필드명 매핑
// =============================================
const HEADER_MAP: Record<string, keyof FinalRow> = {
  "순위":                  "rank",
  "대표 기사 제목":          "canonicalTitle",
  "출처 수(점수)":           "finalScore",
  "30초 요약":              "summary",
  "추천 제목":               "bestTitle",
  "추천 훅 문구":             "bestHook",
  "추천 썸네일 문구":          "bestThumbnailText",
  "해시태그":                "hashtags",
  "민감 이슈 주의":           "riskNotes",
  "근중복 여부":              "isNearDuplicate",
  "유사 이슈 그룹":           "duplicateGroup",
  "업로드 후보(TRUE/FALSE)": "uploadCandidate",
  "검토 메모":               "reviewMemo",
};

// =============================================
// CSV 행을 FinalRow 필드명 기준으로 재매핑
// =============================================
function remapCsvRow(raw: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = HEADER_MAP[header];
    if (field) mapped[field] = value;
  }
  return mapped;
}

// =============================================
// CSV 편집 내용을 final.json 행에 병합
//
// 우선순위:
//   1. CSV에서 사람이 직접 수정한 값 (비어 있지 않고 기존과 다른 값)
//   2. CSV가 비어 있으면 final.json 원본 값 그대로 유지
//   3. reviewMemo 는 CSV 값 항상 적용 (비어 있어도 덮어씀)
// =============================================
function mergeRow(
  baseRow: FinalRow,
  csvMapped: Record<string, string>
): FinalRow {
  const resolve = (field: keyof FinalRow, csvVal: string): string => {
    const trimmed = csvVal.trim();
    // 비어 있으면 원본 유지
    if (!trimmed) return String(baseRow[field] ?? "");
    return trimmed;
  };

  return {
    ...baseRow,
    bestTitle:        resolve("bestTitle",        csvMapped["bestTitle"] ?? ""),
    bestHook:         resolve("bestHook",         csvMapped["bestHook"] ?? ""),
    bestThumbnailText: resolve("bestThumbnailText", csvMapped["bestThumbnailText"] ?? ""),
    reviewMemo:       (csvMapped["reviewMemo"] ?? "").trim(),
    uploadCandidate:  parseBool(csvMapped["uploadCandidate"] ?? ""),
  };
}

// =============================================
// 소스 파일 경로 해석
// 오늘 날짜 파일 우선, 없으면 가장 최근 파일
// =============================================
function resolveLatestFile(dir: string, suffix: string, label: string): string {
  const today = getToday();
  const todayPath = path.join(dir, `${today}${suffix}`);
  if (fs.existsSync(todayPath)) return todayPath;

  if (!fs.existsSync(dir)) {
    logger.error(`[Select] ${dir} 디렉토리가 없습니다. 먼저 npm run dev 를 실행하세요.`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .sort()
    .reverse();

  if (files.length === 0) {
    logger.error(`[Select] ${label} 파일이 없습니다. 먼저 npm run dev 를 실행하세요.`);
    process.exit(1);
  }

  const latest = path.join(dir, files[0]);
  logger.info(`[Select] 오늘 파일 없음 → 최근 파일 사용: ${latest}`);
  return latest;
}

// =============================================
// 메인: final.csv + final.json → selected.json
// =============================================
export async function generateSelectedExport(): Promise<void> {
  const csvPath  = resolveLatestFile("outputs/final", "-final.csv",  "final.csv");
  const jsonPath = resolveLatestFile("outputs/final", "-final.json", "final.json");

  logger.info(`[Select] CSV  소스: ${csvPath}`);
  logger.info(`[Select] JSON 소스: ${jsonPath}`);

  // ── 1. 원본 final.json 읽기
  const baseRows: FinalRow[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const baseByRank = new Map<number, FinalRow>(baseRows.map((r) => [r.rank, r]));

  // ── 2. final.csv 파싱
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const csvRawRows = parseCsv(csvContent);

  if (csvRawRows.length === 0) {
    logger.error(`[Select] CSV 파일에 데이터가 없습니다.`);
    process.exit(1);
  }

  // ── 3. uploadCandidate=true 인 행만 병합
  const selectedRows: FinalRow[] = [];
  let autoFilledCount = 0;
  let userEditedCount = 0;

  for (const rawRow of csvRawRows) {
    const mapped = remapCsvRow(rawRow);

    if (!parseBool(mapped["uploadCandidate"] ?? "")) continue;

    const rank = parseInt(mapped["rank"] ?? "0", 10);
    const baseRow = baseByRank.get(rank);

    if (!baseRow) {
      logger.warn(`[Select] 순위 ${rank} 에 해당하는 final.json 행이 없습니다. 건너뜀.`);
      continue;
    }

    const merged = mergeRow(baseRow, mapped);

    // 자동 채움 vs 사람 편집 카운트
    const fields: (keyof FinalRow)[] = ["bestTitle", "bestHook", "bestThumbnailText"];
    let isEdited = false;
    for (const f of fields) {
      const csvVal = (mapped[f] ?? "").trim();
      if (csvVal && csvVal !== String(baseRow[f] ?? "")) {
        isEdited = true;
      }
    }
    if (isEdited) userEditedCount++;
    else autoFilledCount++;

    selectedRows.push(merged);
  }

  if (selectedRows.length === 0) {
    logger.error(`[Select] uploadCandidate=TRUE 인 항목이 없습니다.`);
    logger.error(`[Select] final.csv 에서 업로드할 행의 "업로드 후보(TRUE/FALSE)" 열을 TRUE 로 수정하세요.`);
    process.exit(1);
  }

  // ── 4. selected.json 저장
  const dateTag = path.basename(jsonPath).slice(0, 10);
  const outPath = path.join("outputs/final", `${dateTag}-selected.json`);

  fs.writeFileSync(outPath, JSON.stringify(selectedRows, null, 2), "utf-8");

  logger.success(`[Select] 선택 반영 완료: ${selectedRows.length}건`);
  logger.info(`         ├─ 사람이 직접 수정한 항목: ${userEditedCount}건`);
  logger.info(`         ├─ 자동 채움 (원본 유지):   ${autoFilledCount}건`);
  logger.success(`         └─ 저장 → ${outPath}`);
}

// 독립 실행 진입점
generateSelectedExport().catch((e) => {
  console.error(e);
  process.exit(1);
});
