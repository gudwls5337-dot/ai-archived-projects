/**
 * schedulerPolitical.ts
 *
 * npm run political-schedule 으로 실행하면 이 파일이 시작되고,
 * PC가 켜져 있는 동안 매일 오전 8시에 정치 이슈 시장조사를 자동 실행합니다.
 *
 * 스케줄:
 *   - 매일 오전 8시 (Asia/Seoul)
 *     → 정치 이슈 수집 → 분류 → 리포트 3종 + 엑셀 5시트 생성
 *
 * 종료하려면 Ctrl+C 를 누르세요.
 */

import cron from "node-cron";
import fs from "fs";
import path from "path";
import { runPoliticalResearchPipeline } from "./pipelines/politicalResearchRun";
import { logger } from "./utils/logger";

// =============================================
// 헬퍼
// =============================================
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function appendRunLog(logPath: string, line: string): void {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath, line + "\n", "utf-8");
}

// =============================================
// 스케줄 설정
// cron 형식: 분 시 일 월 요일
// =============================================
const POLITICAL_SCHEDULE = "0 8 * * *";  // 매일 오전 8시

logger.divider("정치 이슈 시장조사 스케줄러 시작");
logger.info(`  매일 오전 8시 (${POLITICAL_SCHEDULE}): 정치 이슈 시장조사 파이프라인 실행`);
logger.info(`  시간대: Asia/Seoul (한국 시간)`);
logger.info(`  결과물: outputs/political/ 폴더`);
logger.info(`  종료하려면 Ctrl+C 를 누르세요.`);
logger.divider();

cron.schedule(
  POLITICAL_SCHEDULE,
  async () => {
    const today      = getToday();
    const runLogPath = `outputs/political/logs/${today}-run.log`;
    const finalJson  = `outputs/political/data/${today}-political-final.json`;

    // ── 오늘 이미 실행됐으면 스킵 ────────────────
    if (fs.existsSync(finalJson)) {
      const skipMsg = `[${new Date().toISOString()}] SKIP — 오늘(${today}) 이미 실행 완료 (${finalJson})`;
      logger.info(`[PoliticalScheduler] ${skipMsg}`);
      appendRunLog(runLogPath, skipMsg);
      return;
    }

    const startTime = Date.now();
    const startMsg  = `[${new Date().toISOString()}] START`;
    appendRunLog(runLogPath, startMsg);
    logger.info(`[PoliticalScheduler] 오전 8시 정치 리서치 실행 시작`);

    try {
      await runPoliticalResearchPipeline();

      const elapsed  = Math.round((Date.now() - startTime) / 1000);
      const doneMsg  = `[${new Date().toISOString()}] SUCCESS — 소요 ${elapsed}초`;
      appendRunLog(runLogPath, doneMsg);
      logger.success(`[PoliticalScheduler] 실행 완료 (${elapsed}초) → 로그: ${runLogPath}`);

    } catch (err) {
      const elapsed  = Math.round((Date.now() - startTime) / 1000);
      const errMsg   = (err as Error).message ?? String(err);
      const errStack = (err as Error).stack ?? "";
      const stackExcerpt = errStack.split("\n").slice(0, 4).join(" | ");
      const failMsg  = `[${new Date().toISOString()}] FAIL — 소요 ${elapsed}초 | ${errMsg}`;
      const stackMsg = `  스택: ${stackExcerpt}`;
      appendRunLog(runLogPath, failMsg);
      appendRunLog(runLogPath, stackMsg);
      logger.error(`[PoliticalScheduler] 실행 실패 (${elapsed}초): ${errMsg}`);
      logger.error(`  스택: ${stackExcerpt}`);
    }
  },
  { timezone: "Asia/Seoul" }
);
