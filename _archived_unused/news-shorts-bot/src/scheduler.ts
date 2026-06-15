/**
 * scheduler.ts
 *
 * npm run auto-run 으로 실행하면 이 파일이 시작되고,
 * PC가 켜져 있는 동안 계속 대기하면서 정해진 시간에 자동으로 파이프라인을 실행합니다.
 *
 * 스케줄:
 *   - 매 3시간 정각 (0시, 3시, 6시, 9시, 12시, 15시, 18시, 21시)
 *     → 시간별 엑셀 저장 포함 전체 파이프라인 실행
 *   - 매일 오전 7시
 *     → 일자별 엑셀 저장 포함 전체 파이프라인 실행
 *
 * 종료하려면 Ctrl+C 를 누르세요.
 */

import cron from "node-cron";
import { runMorningPipeline } from "./pipelines/morningRun";
import { logger } from "./utils/logger";

// =============================================
// 스케줄 설정값
// cron 형식: 분 시 일 월 요일
// =============================================
const HOURLY_SCHEDULE = "0 */3 * * *"; // 매 3시간 정각
const DAILY_SCHEDULE  = "0 7 * * *";   // 매일 오전 7시

logger.divider("자동 반복 실행 스케줄러 시작");
logger.info(`  매 3시간 정각 (${HOURLY_SCHEDULE}): 시간별 엑셀 포함 파이프라인 실행`);
logger.info(`  매일 오전 7시 (${DAILY_SCHEDULE}):  일자별 엑셀 포함 파이프라인 실행`);
logger.info(`  시간대: Asia/Seoul (한국 시간)`);
logger.info(`  종료하려면 Ctrl+C 를 누르세요.`);
logger.divider();

// =============================================
// 스케줄 1: 매 3시간 정각 → hourly 모드
// =============================================
cron.schedule(
  HOURLY_SCHEDULE,
  async () => {
    logger.info("[Scheduler] 3시간 주기 실행 시작 — hourly 모드");
    try {
      await runMorningPipeline("hourly");
    } catch (err) {
      logger.error(`[Scheduler] 3시간 주기 실행 실패: ${(err as Error).message}`);
    }
  },
  { timezone: "Asia/Seoul" }
);

// =============================================
// 스케줄 2: 매일 오전 7시 → daily 모드
// =============================================
cron.schedule(
  DAILY_SCHEDULE,
  async () => {
    logger.info("[Scheduler] 오전 7시 일자별 실행 시작 — daily 모드");
    try {
      await runMorningPipeline("daily");
    } catch (err) {
      logger.error(`[Scheduler] 오전 7시 실행 실패: ${(err as Error).message}`);
    }
  },
  { timezone: "Asia/Seoul" }
);
