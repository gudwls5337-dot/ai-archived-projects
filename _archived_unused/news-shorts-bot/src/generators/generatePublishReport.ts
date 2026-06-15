import fs from "fs";
import path from "path";
import { PublishRow } from "./generatePublishExport";
import { logger } from "../utils/logger";
import { getArchiveTs, archiveText } from "../utils/archiveWriter";

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
// 최신 publish JSON 경로 반환
// 오늘 날짜 파일 우선, 없으면 가장 최근 파일
// =============================================
function resolvePublishJsonPath(): string {
  const dir = "outputs/publish";
  const today = getToday();
  const todayPath = path.join(dir, `${today}-publish.json`);

  if (fs.existsSync(todayPath)) return todayPath;

  if (!fs.existsSync(dir)) {
    logger.error(`[PublishReport] outputs/publish 디렉토리가 없습니다. 먼저 npm run gen-publish 를 실행하세요.`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("-publish.json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    logger.error(`[PublishReport] outputs/publish 에 publish.json 파일이 없습니다. 먼저 npm run gen-publish 를 실행하세요.`);
    process.exit(1);
  }

  const latest = path.join(dir, files[0]);
  logger.info(`[PublishReport] 오늘 파일 없음 → 최근 파일 사용: ${latest}`);
  return latest;
}

// =============================================
// selected.json 존재 여부 확인 (publish.json 소스 판단용)
// =============================================
function checkIsSelectedBased(dateTag: string): boolean {
  return fs.existsSync(path.join("outputs/final", `${dateTag}-selected.json`));
}

// =============================================
// PublishRow 배열 → Markdown 문자열
// =============================================
function buildMarkdown(rows: PublishRow[], dateTag: string): string {
  const lines: string[] = [];
  const isSelected = checkIsSelectedBased(dateTag);

  lines.push(`# 📋 발행 리포트 — ${dateTag}`);
  lines.push(``);
  lines.push(`> 총 **${rows.length}건** 발행 예정`);
  lines.push(``);

  if (isSelected) {
    lines.push(`> 이 리포트는 **선택 반영본(selected.json)** 기반입니다. 엑셀 편집 내용이 반영되었습니다.`);
  } else {
    lines.push(`> 이 리포트는 **원본(final.json)** 기반입니다. 편집 내용을 반영하려면 \`npm run gen-select\` 를 먼저 실행하세요.`);
  }
  lines.push(``);

  const warned = rows.filter((r) => r.warning !== "");
  if (warned.length > 0) {
    lines.push(`> ⚠️ 민감 이슈 **${warned.length}건** 포함 — warning 항목 반드시 확인`);
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(``);

  for (const row of rows) {
    const warningBlock = row.warning
      ? `\n> ⚠️ **민감 이슈 경고:** ${row.warning}\n`
      : "";

    const reviewBlock = row.reviewMemo
      ? `\n**검토 메모:** ${row.reviewMemo}\n`
      : "";

    lines.push(`## ${row.rank}위. ${row.canonicalTitle}`);
    if (row.representativeUrl) {
      lines.push(`🔗 ${row.representativeUrl}`);
    }
    lines.push(``);

    if (warningBlock) lines.push(warningBlock.trim(), ``);

    lines.push(`| 항목 | 내용 |`);
    lines.push(`|------|------|`);
    lines.push(`| 추천 제목 | ${row.bestTitle} |`);
    lines.push(`| 훅 문구 | ${row.bestHook} |`);
    lines.push(`| 썸네일 문구 | ${row.bestThumbnailText} |`);
    lines.push(`| 해시태그 | ${row.hashtags} |`);
    if (row.totalCommentCount != null) {
      const likeInfo = row.totalLikeCount != null ? ` | 공감 👍 ${row.totalLikeCount}` : "";
      lines.push(`| 댓글/반응 | 전체 댓글 ${row.totalCommentCount}개${likeInfo} |`);
    }
    lines.push(``);

    if (reviewBlock) lines.push(reviewBlock.trim(), ``);

    if (row.topComments) {
      lines.push(`**상위 댓글:**`);
      row.topComments.split("\n").forEach((c) => lines.push(`> ${c}`));
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
  }

  return lines.join("\n");
}

// =============================================
// 메인: publish JSON → publish markdown 저장
// =============================================
export async function generatePublishReport(): Promise<void> {
  const jsonPath = resolvePublishJsonPath();
  logger.info(`[PublishReport] 소스 파일: ${jsonPath}`);

  const rows: PublishRow[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  if (rows.length === 0) {
    logger.error(`[PublishReport] publish.json 에 항목이 없습니다.`);
    process.exit(1);
  }

  const dateTag = path.basename(jsonPath).slice(0, 10);
  const outDir = "outputs/publish";
  prepareDir(outDir);

  const mdPath   = path.join(outDir, `${dateTag}-publish.md`);
  const markdown = buildMarkdown(rows, dateTag);

  fs.writeFileSync(mdPath, markdown, "utf-8");

  // 아카이브 저장
  const ats = getArchiveTs();
  archiveText("publish", "publish-report", "md", markdown, ats);

  logger.success(`[PublishReport] ${rows.length}건 리포트 생성 완료`);
  logger.success(`[PublishReport] MD → ${mdPath}`);
}

// 독립 실행 진입점
generatePublishReport().catch((e) => {
  console.error(e);
  process.exit(1);
});
