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
// 파일 존재 여부에 따라 경로 또는 안내 문구 반환
// =============================================
function fileLine(label: string, filePath: string): string {
  const exists = fs.existsSync(filePath);
  const status = exists ? `\`${filePath}\`` : `(아직 없음 — 해당 단계 미실행)`;
  return `| ${label} | ${status} |`;
}

// =============================================
// TODAY.md 내용 생성
// =============================================
function buildTodayMd(today: string): string {
  const lines: string[] = [];

  lines.push(`# 오늘의 작업 파일 — ${today}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 아침 루틴 (순서대로 실행)`);
  lines.push(``);
  lines.push(`\`\`\`bash`);
  lines.push(`npm run dev            # 1. 수집 + 숏츠 문안 자동 생성`);
  lines.push(`# → outputs/final/${today}-final.csv 를 엑셀로 열어`);
  lines.push(`#    업로드할 행의 "업로드 후보" 열을 TRUE 로 수정 후 저장`);
  lines.push(`npm run gen-publish    # 2. 발행 대상 추출`);
  lines.push(`npm run publish-report # 3. 아침 리포트 생성`);
  lines.push(`\`\`\``);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 오늘 생성된 파일`);
  lines.push(``);
  lines.push(`| 단계 | 파일 경로 |`);
  lines.push(`|------|-----------|`);
  lines.push(fileLine(`수집 원본`,     `outputs/raw/${today}.json`));
  lines.push(fileLine(`전처리 결과`,   `outputs/processed/${today}.json`));
  lines.push(fileLine(`점수 순위`,     `outputs/ranked/${today}.json`));
  lines.push(fileLine(`숏츠 패키지`,   `outputs/shorts/${today}.json`));
  lines.push(fileLine(`검토용 리포트`, `outputs/reports/${today}-report.md`));
  lines.push(fileLine(`최종 CSV`,      `outputs/final/${today}-final.csv`));
  lines.push(fileLine(`최종 JSON`,     `outputs/final/${today}-final.json`));
  lines.push(fileLine(`발행 CSV`,      `outputs/publish/${today}-publish.csv`));
  lines.push(fileLine(`발행 JSON`,     `outputs/publish/${today}-publish.json`));
  lines.push(fileLine(`발행 리포트`,   `outputs/publish/${today}-publish.md`));
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`> 이 파일은 \`npm run today\` 로 언제든 다시 생성할 수 있습니다.`);
  lines.push(``);

  return lines.join("\n");
}

// =============================================
// 메인: TODAY.md 를 프로젝트 루트에 저장
// =============================================
export async function generateTodayFile(): Promise<void> {
  const today = getToday();
  const outPath = path.join("TODAY.md");
  const content = buildTodayMd(today);

  fs.writeFileSync(outPath, content, "utf-8");

  logger.success(`[Today] TODAY.md 생성 완료 → ${outPath}`);
  logger.info(`[Today] 기준 날짜: ${today}`);
}

// 독립 실행 진입점
generateTodayFile().catch((e) => {
  console.error(e);
  process.exit(1);
});
