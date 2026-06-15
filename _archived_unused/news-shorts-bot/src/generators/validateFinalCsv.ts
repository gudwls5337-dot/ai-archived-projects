import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";

// =============================================
// 오늘 날짜 문자열 (YYYY-MM-DD)
// =============================================
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// =============================================
// 가장 최근 final.csv 경로 반환
// 오늘 날짜 파일 우선, 없으면 가장 최근 파일
// =============================================
function resolveFinalCsvPath(): string {
  const dir = "outputs/final";
  const today = getToday();
  const todayPath = path.join(dir, `${today}-final.csv`);

  if (fs.existsSync(todayPath)) return todayPath;

  if (!fs.existsSync(dir)) {
    logger.error(`[Validate] outputs/final 디렉토리가 없습니다. 먼저 npm run dev 를 실행하세요.`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("-final.csv"))
    .sort()
    .reverse();

  if (files.length === 0) {
    logger.error(`[Validate] outputs/final 에 final.csv 파일이 없습니다. 먼저 npm run dev 를 실행하세요.`);
    process.exit(1);
  }

  const latest = path.join(dir, files[0]);
  logger.info(`[Validate] 오늘 파일 없음 → 최근 파일 사용: ${latest}`);
  return latest;
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
        // 이스케이프된 큰따옴표
        currentCell += '"';
        i += 2;
      } else if (ch === '"') {
        // 닫는 큰따옴표 — 인용 종료
        inQuotes = false;
        i++;
      } else {
        // 큰따옴표 안의 일반 문자 (줄바꿈 포함)
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
        // CRLF 행 구분자
        currentRow.push(currentCell);
        currentCell = "";
        if (currentRow.some((c) => c.trim() !== "") || currentRow.length > 1) {
          rows.push(currentRow);
        }
        currentRow = [];
        i += 2;
      } else if (ch === '\n') {
        // LF 행 구분자
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
// 검증 규칙 정의
// =============================================

// 반드시 있어야 하는 열 이름
const REQUIRED_HEADERS = [
  "업로드 후보(TRUE/FALSE)",
  "추천 제목",
  "추천 훅 문구",
  "추천 썸네일 문구",
  "검토 메모",
];

// uploadCandidate 허용 값
const BOOL_ALLOWED = new Set(["TRUE", "FALSE", "true", "false", ""]);

// 길이 제한 (열 이름 → 최대 글자 수)
const LENGTH_LIMITS: Record<string, number> = {
  "추천 제목":      40,
  "추천 훅 문구":   60,
  "추천 썸네일 문구": 20,
};

// =============================================
// 검증 결과 타입
// =============================================
type Severity = "ERROR" | "WARN" | "INFO";

interface ValidationIssue {
  severity: Severity;
  rowNum: number | null;  // null = 헤더/파일 단위 문제
  column: string;
  message: string;
}

// =============================================
// 메인 검증 로직
// =============================================
function validateCsv(csvPath: string): {
  issues: ValidationIssue[];
  totalRows: number;
  candidateRows: number;
} {
  const content = fs.readFileSync(csvPath, "utf-8");
  const issues: ValidationIssue[] = [];

  // 전체 내용을 문자 단위로 파싱 (멀티라인 셀 포함)
  const allRows = parseRawCsv(content);

  // 빈 파일 체크
  if (allRows.length === 0) {
    issues.push({ severity: "ERROR", rowNum: null, column: "(파일)", message: "CSV 파일이 비어 있습니다." });
    return { issues, totalRows: 0, candidateRows: 0 };
  }

  // ── 헤더 파싱
  const headerRow = allRows[0].map((h) => h.trim());

  // 필수 열 존재 여부 검증
  for (const required of REQUIRED_HEADERS) {
    if (!headerRow.includes(required)) {
      issues.push({
        severity: "ERROR",
        rowNum: null,
        column: required,
        message: `필수 열 "${required}" 이(가) 없습니다. 헤더 이름을 확인하세요.`,
      });
    }
  }

  // 헤더 오타 감지 (비슷하지만 정확하지 않은 열 이름 경고)
  const TYPO_CANDIDATES: Record<string, string[]> = {
    "업로드 후보(TRUE/FALSE)": ["업로드후보", "업로드 후보", "uploadcandidate", "upload"],
    "추천 제목":               ["제목", "추천제목", "besttitle"],
    "추천 훅 문구":             ["훅", "훅문구", "추천훅", "besthook"],
    "추천 썸네일 문구":          ["썸네일", "썸네일문구", "추천썸네일"],
    "검토 메모":               ["메모", "검토메모", "reviewmemo"],
  };

  for (const actual of headerRow) {
    const lower = actual.toLowerCase().replace(/\s/g, "");
    for (const [correct, variants] of Object.entries(TYPO_CANDIDATES)) {
      if (
        actual !== correct &&
        (variants.includes(lower) || variants.includes(actual.toLowerCase()))
      ) {
        issues.push({
          severity: "WARN",
          rowNum: null,
          column: actual,
          message: `열 이름 "${actual}" 이(가) 올바른 이름 "${correct}" 과(와) 비슷하지만 다릅니다. 오타 여부를 확인하세요.`,
        });
      }
    }
  }

  // 필수 열이 하나도 없으면 데이터 행 검증 불가
  const hasRequiredHeaders = REQUIRED_HEADERS.some((h) => headerRow.includes(h));
  if (!hasRequiredHeaders) {
    return { issues, totalRows: 0, candidateRows: 0 };
  }

  // 열 인덱스 맵
  const colIdx = new Map<string, number>();
  headerRow.forEach((h, i) => colIdx.set(h, i));

  // ── 데이터 행 검증 (allRows[0] = 헤더, allRows[1~] = 데이터)
  const dataRows = allRows.slice(1);
  let totalRows = 0;
  let candidateRows = 0;

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const cells = dataRows[rowIdx];
    const rowNum = rowIdx + 2; // 사람 기준 행 번호 (헤더=1행)
    totalRows++;

    // 열 수 불일치 체크
    if (cells.length < headerRow.length) {
      issues.push({
        severity: "WARN",
        rowNum,
        column: "(행 전체)",
        message: `열 수가 헤더(${headerRow.length}개) 보다 적습니다(${cells.length}개). 저장 중 일부 내용이 잘렸을 수 있습니다.`,
      });
    }

    const get = (colName: string): string => {
      const idx = colIdx.get(colName);
      return idx !== undefined ? (cells[idx] ?? "").trim() : "";
    };

    // uploadCandidate 값 검증
    const candidateVal = get("업로드 후보(TRUE/FALSE)");
    if (!BOOL_ALLOWED.has(candidateVal)) {
      issues.push({
        severity: "WARN",
        rowNum,
        column: "업로드 후보(TRUE/FALSE)",
        message: `값 "${candidateVal}" 은(는) 허용되지 않습니다. TRUE 또는 FALSE 만 입력하세요.`,
      });
    }

    const isCandidate =
      candidateVal.toUpperCase() === "TRUE";
    if (isCandidate) candidateRows++;

    // 길이 검증 (uploadCandidate=TRUE 인 행만)
    if (isCandidate) {
      for (const [colName, maxLen] of Object.entries(LENGTH_LIMITS)) {
        const val = get(colName);
        if (val && val.length > maxLen) {
          issues.push({
            severity: "WARN",
            rowNum,
            column: colName,
            message: `값이 ${val.length}자로 권장 최대(${maxLen}자)를 초과합니다: "${val.slice(0, 20)}…"`,
          });
        }
      }

      // 추천 제목이 비어있으면 INFO (자동 채움 예정임을 안내)
      if (!get("추천 제목")) {
        issues.push({
          severity: "INFO",
          rowNum,
          column: "추천 제목",
          message: `비어 있습니다. gen-select 실행 시 원본 값으로 자동 채워집니다.`,
        });
      }
    }
  }

  return { issues, totalRows, candidateRows };
}

// =============================================
// Markdown 리포트 생성
// =============================================
function buildValidationMarkdown(
  csvPath: string,
  result: ReturnType<typeof validateCsv>,
  dateTag: string
): string {
  const { issues, totalRows, candidateRows } = result;

  const errors = issues.filter((i) => i.severity === "ERROR");
  const warns  = issues.filter((i) => i.severity === "WARN");
  const infos  = issues.filter((i) => i.severity === "INFO");

  const status = errors.length > 0
    ? "❌ 오류 있음 — gen-select 실행 전 수정 필요"
    : warns.length > 0
    ? "⚠️ 경고 있음 — 확인 권장 후 진행 가능"
    : "✅ 검증 통과";

  const lines: string[] = [];

  lines.push(`# CSV 검증 리포트 — ${dateTag}`);
  lines.push(``);
  lines.push(`> **소스 파일**: \`${csvPath}\``);
  lines.push(`> **검증 결과**: ${status}`);
  lines.push(``);
  lines.push(`| 항목 | 값 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 전체 데이터 행 | ${totalRows}행 |`);
  lines.push(`| 업로드 후보(TRUE) | ${candidateRows}행 |`);
  lines.push(`| ❌ 오류 | ${errors.length}건 |`);
  lines.push(`| ⚠️ 경고 | ${warns.length}건 |`);
  lines.push(`| ℹ️ 정보 | ${infos.length}건 |`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // 오류
  if (errors.length > 0) {
    lines.push(`## ❌ 오류 (반드시 수정 필요)`);
    lines.push(``);
    for (const issue of errors) {
      const row = issue.rowNum !== null ? `${issue.rowNum}행` : "헤더";
      lines.push(`- **[${row}] \`${issue.column}\`** — ${issue.message}`);
    }
    lines.push(``);
  }

  // 경고
  if (warns.length > 0) {
    lines.push(`## ⚠️ 경고 (확인 권장)`);
    lines.push(``);
    for (const issue of warns) {
      const row = issue.rowNum !== null ? `${issue.rowNum}행` : "헤더";
      lines.push(`- **[${row}] \`${issue.column}\`** — ${issue.message}`);
    }
    lines.push(``);
  }

  // 정보
  if (infos.length > 0) {
    lines.push(`## ℹ️ 정보 (자동 처리 예정)`);
    lines.push(``);
    for (const issue of infos) {
      const row = issue.rowNum !== null ? `${issue.rowNum}행` : "헤더";
      lines.push(`- **[${row}] \`${issue.column}\`** — ${issue.message}`);
    }
    lines.push(``);
  }

  if (issues.length === 0) {
    lines.push(`## ✅ 모든 검증을 통과했습니다.`);
    lines.push(``);
    lines.push(`업로드 후보 ${candidateRows}건이 정상입니다. \`npm run gen-select\` 를 실행하세요.`);
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(``);
  lines.push(`> 이 리포트는 \`npm run validate-final\` 로 생성됩니다.`);
  lines.push(``);

  return lines.join("\n");
}

// =============================================
// 메인
// =============================================
export async function validateFinalCsv(): Promise<void> {
  const csvPath = resolveFinalCsvPath();
  const dateTag = path.basename(csvPath).slice(0, 10);

  logger.info(`[Validate] CSV 검증 시작: ${csvPath}`);

  const result = validateCsv(csvPath);
  const { issues, totalRows, candidateRows } = result;

  const errors = issues.filter((i) => i.severity === "ERROR");
  const warns  = issues.filter((i) => i.severity === "WARN");

  // 콘솔 요약 출력
  logger.info(`[Validate] 전체 ${totalRows}행 | 업로드 후보 ${candidateRows}행`);

  if (errors.length > 0) {
    logger.error(`[Validate] ❌ 오류 ${errors.length}건`);
    errors.forEach((e) => {
      const row = e.rowNum !== null ? `${e.rowNum}행` : "헤더";
      logger.error(`           [${row}] ${e.column} — ${e.message}`);
    });
  }

  if (warns.length > 0) {
    logger.warn(`[Validate] ⚠️  경고 ${warns.length}건`);
    warns.forEach((w) => {
      const row = w.rowNum !== null ? `${w.rowNum}행` : "헤더";
      logger.warn(`           [${row}] ${w.column} — ${w.message}`);
    });
  }

  if (errors.length === 0 && warns.length === 0) {
    logger.success(`[Validate] ✅ 검증 통과 — gen-select 를 실행해도 됩니다.`);
  } else if (errors.length === 0) {
    logger.info(`[Validate] 경고만 있습니다. 확인 후 gen-select 를 실행하세요.`);
  } else {
    logger.error(`[Validate] 오류를 먼저 수정한 뒤 gen-select 를 실행하세요.`);
  }

  // validation.md 저장
  const markdown = buildValidationMarkdown(csvPath, result, dateTag);
  const outDir = "outputs/final";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const mdPath = path.join(outDir, `${dateTag}-validation.md`);
  fs.writeFileSync(mdPath, markdown, "utf-8");
  logger.success(`[Validate] 검증 리포트 저장 → ${mdPath}`);
}

// 독립 실행 진입점
validateFinalCsv().catch((e) => {
  console.error(e);
  process.exit(1);
});
