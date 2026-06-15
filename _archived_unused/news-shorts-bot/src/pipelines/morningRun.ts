import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { collectFromRSS } from "../collectors/rssCollector";
import { collectFromNaver } from "../collectors/naverNews";
import { normalizeAll } from "../parsers/normalizeArticle";
import { dedupeArticles } from "../parsers/dedupeArticles";
import { clusterIssues } from "../parsers/clusterIssues";
import { scoreAndRank } from "../scorers/scoreIssues";
import { generateAllPackages } from "../generators/generateShortsPackage";
import { generateReport } from "../generators/generateReport";
import { collectCommentMeta, collectCommentMetaPlaywright } from "../collectors/commentCollector";
import { generateFinalExport } from "../generators/generateFinalExport";
import { generateExcelExport } from "../generators/generateExcelExport";
import { logger } from "../utils/logger";
import { getArchiveTs, archiveJson } from "../utils/archiveWriter";
import { CollectResult, ProcessResult, RankResult, ShortsResult } from "../types/news";

dotenv.config();

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function saveJson(dir: string, data: unknown): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${getToday()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  return filePath;
}

/**
 * 전체 파이프라인 실행
 *
 * [Step 1] 수집       → outputs/raw
 * [Step 2] 전처리     → outputs/processed
 * [Step 3] 점수화     → outputs/ranked
 * [Step 4] 숏츠 생성  → outputs/shorts
 * [Step 5] 리포트     → outputs/reports
 * [Step 6] 최종 export → outputs/final
 * [Step 7] 엑셀 저장  → outputs/excel
 * 아카이브            → outputs/archive/{category}/YYYY-MM-DD/HH/
 * 로그                → outputs/logs
 */
export async function runMorningPipeline(mode: "daily" | "hourly" = "daily"): Promise<void> {
  logger.divider("뉴스 숏츠 봇 시작: " + new Date().toLocaleString("ko-KR"));

  // 이 실행의 타임스탬프 — 모든 아카이브 파일에 동일하게 사용
  const ats = getArchiveTs();

  const status = {
    collect: false,
    process: false,
    rank:    false,
    shorts:  false,
    report:  false,
    final:   false,
    excel:   false,
  };

  let urlSavedCount       = 0;
  let commentSuccessCount = 0;

  // Playwright 브라우저 (USE_PLAYWRIGHT=true 시 Stage 2 댓글 수집용)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let playwrightBrowser: any = null;

  try {
    // ── Playwright 초기화 (옵션) ─────────────
    if (process.env.USE_PLAYWRIGHT === "true") {
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - playwright is an optional dependency
        const pw = await import("playwright") as any;
        playwrightBrowser = await pw.chromium.launch({ headless: true });
        logger.info("[Playwright] 브라우저 시작 완료 (Stage 2 댓글 수집 활성화)");
      } catch {
        logger.warn("[Playwright] 설치되지 않았거나 로드 실패 — Stage 1 HTML 수집만 진행");
        playwrightBrowser = null;
      }
    }

    // ── Step 1: 수집 ────────────────────────────
    logger.info("[Step 1] RSS 및 네이버 뉴스 수집 시작");

    const [rssItems, naverItems] = await Promise.all([
      collectFromRSS(),
      collectFromNaver(),
    ]);
    const allItems = [...rssItems, ...naverItems];

    if (allItems.length === 0) {
      logger.warn("[Step 1] 수집된 기사가 0건입니다. 네트워크 상태를 확인하세요.");
    }

    const rawResult: CollectResult = {
      collectedAt: new Date().toISOString(),
      totalCount: allItems.length,
      items: allItems,
    };
    const rawPath = saveJson("outputs/raw", rawResult);
    archiveJson("raw", "raw", rawResult, ats);
    status.collect = true;
    logger.success(`[Step 1] 수집 완료: 총 ${allItems.length}건`);
    logger.info(`         ├─ RSS    : ${rssItems.length}건`);
    logger.info(`         ├─ 네이버 : ${naverItems.length}건${naverItems.length === 0 ? " (API 키 없음)" : ""}`);
    logger.info(`         └─ 저장   : ${rawPath}`);

    // ── Step 2: 전처리 ──────────────────────────
    logger.info("[Step 2] 정규화 및 중복 제거 시작");

    const normalized = normalizeAll(allItems);
    const { unique, removedCount } = dedupeArticles(normalized);

    const processedResult: ProcessResult = {
      processedAt: new Date().toISOString(),
      rawCount: allItems.length,
      processedCount: unique.length,
      removedDuplicates: removedCount,
      items: unique,
    };
    const processedPath = saveJson("outputs/processed", processedResult);
    archiveJson("processed", "processed", processedResult, ats);
    status.process = true;
    logger.success(
      `[Step 2] 전처리 완료: 중복 ${removedCount}건 제거 → ${unique.length}건 → ${processedPath}`
    );

    // ── Step 3: 클러스터링 + 점수화 ─────────────
    logger.info("[Step 3] 이슈 클러스터링 및 점수 계산 시작");

    const clusters = clusterIssues(unique);
    const TOP_N    = 20;
    const ranked   = scoreAndRank(clusters, TOP_N);

    const rankResult: RankResult = {
      rankedAt: new Date().toISOString(),
      totalIssues: clusters.length,
      topN: TOP_N,
      items: ranked,
    };
    const rankedPath = saveJson("outputs/ranked", rankResult);
    archiveJson("ranked", "ranked", rankResult, ats);
    status.rank = true;
    logger.success(
      `[Step 3] 점수화 완료: ${clusters.length}개 이슈 → 상위 ${TOP_N}개 → ${rankedPath}`
    );
    // 상위 5개 이슈 미리보기
    ranked.slice(0, 5).forEach((issue) => {
      const keywords = issue.representativeKeywords.join(", ");
      const penalty  = issue.score.briefPenalty < 0 ? ` ⚠️단신${issue.score.briefPenalty}` : "";
      const dupTag   = issue.isNearDuplicate
        ? ` 🔁근중복(G${issue.duplicateGroupId})`
        : issue.duplicateLevel === "similar"
        ? ` ↔️유사(G${issue.duplicateGroupId})`
        : "";
      logger.info(
        `         [${issue.rank}위] ${issue.clusterKeyword} (${issue.sourceCount}출처/${issue.articleCount}건) [${keywords}]${penalty}${dupTag}`
      );
    });
    // 근중복 요약
    const nearDupCount = ranked.filter((r) => r.isNearDuplicate).length;
    if (nearDupCount > 0) {
      logger.info(`         ⚠️ 근중복 이슈 ${nearDupCount}건 감지 — final.csv 에서 확인하세요`);
    }

    // ── Step 3.5: 댓글 수집 ─────────────────────
    logger.info(`[Step 3.5] 댓글 수집 시도 (${ranked.length}건, Stage 1 동시 / Stage 2 순차)`);

    // Stage 1: HTML 정적 파싱 (동시 실행)
    const stage1Results = await Promise.allSettled(
      ranked.map((issue) => collectCommentMeta(issue.representativeUrl))
    );
    stage1Results.forEach((result, i) => {
      if (result.status === "fulfilled" && result.value !== null) {
        ranked[i].commentMeta = result.value;
        commentSuccessCount++;
      }
    });
    logger.info(`         ├─ Stage 1 성공: ${commentSuccessCount}건`);

    // Stage 2: Playwright 동적 수집 (선택적, 순차 실행)
    if (playwrightBrowser) {
      let stage2Count = 0;
      for (const issue of ranked) {
        // Stage 1에서 topComments 를 못 가져온 이슈만 시도
        const hasComments = issue.commentMeta && issue.commentMeta.topComments.length > 0;
        if (!hasComments) {
          const meta = await collectCommentMetaPlaywright(
            issue.representativeUrl,
            playwrightBrowser
          );
          if (meta) {
            if (!issue.commentMeta) commentSuccessCount++;
            issue.commentMeta = meta;
            stage2Count++;
          }
        }
      }
      logger.info(`         ├─ Stage 2 Playwright 보강: ${stage2Count}건`);
    }

    urlSavedCount = ranked.filter((r) => r.representativeUrl).length;
    logger.info(
      `         └─ URL 저장: ${urlSavedCount}건 / 총 댓글 수집 성공: ${commentSuccessCount}건`
    );

    // ── Step 4: 숏츠 문안 생성 ──────────────────
    logger.info("[Step 4] 숏츠 문안 생성 시작");

    const packages = generateAllPackages(ranked);

    const shortsResult: ShortsResult = {
      generatedAt: new Date().toISOString(),
      totalPackages: packages.length,
      items: packages,
    };
    const shortsPath = saveJson("outputs/shorts", shortsResult);
    archiveJson("shorts", "shorts", shortsResult, ats);
    status.shorts = true;
    logger.success(
      `[Step 4] 숏츠 생성 완료: ${packages.length}개 패키지 → ${shortsPath}`
    );

    // ── Step 5: 검토용 리포트 생성 ──────────────
    logger.info("[Step 5] 검토용 markdown 리포트 생성 시작");

    const reportPath = generateReport(packages, shortsResult.generatedAt, ats);
    status.report = true;
    logger.success(`[Step 5] 리포트 생성 완료 → ${reportPath}`);

    // ── Step 6: 최종 CSV + JSON export ──────────
    logger.info("[Step 6] 최종 산출물(CSV + JSON) 생성 시작");

    const { csvPath, jsonPath, rows } = generateFinalExport(packages, ats);
    status.final = true;
    logger.success(`[Step 6] 최종 export 완료`);
    logger.success(`         CSV  → ${csvPath}`);
    logger.success(`         JSON → ${jsonPath}`);

    // ── Step 7: 엑셀 저장 (실패해도 파이프라인 유지) ─
    logger.info(`[Step 7] 엑셀(xlsx) 파일 생성 시작 (모드: ${mode})`);
    try {
      const excelPath = await generateExcelExport(ranked, rows, mode, ats);
      status.excel = true;
      logger.success(`[Step 7] 엑셀 생성 완료 → ${excelPath}`);
    } catch (excelErr) {
      const msg = (excelErr as Error).message ?? "";
      if (msg.includes("EBUSY") || msg.includes("locked")) {
        logger.warn(`[Step 7] 엑셀 파일이 다른 프로그램에서 열려 있어 저장을 건너뜁니다.`);
        logger.warn(`         → 엑셀을 닫고 다시 실행하면 저장됩니다.`);
      } else {
        logger.warn(`[Step 7] 엑셀 생성 실패 (건너뜀): ${msg}`);
      }
    }

  } catch (err) {
    const failedStep = !status.collect ? "Step 1 (수집)"
      : !status.process ? "Step 2 (전처리)"
      : !status.rank    ? "Step 3 (점수화)"
      : !status.shorts  ? "Step 4 (숏츠 생성)"
      : !status.report  ? "Step 5 (리포트)"
      : "Step 6 (최종 export)";

    logger.error(`파이프라인 실패 — ${failedStep}: ${(err as Error).message}`);
    throw err;

  } finally {
    // Playwright 브라우저 종료
    if (playwrightBrowser) {
      try { await playwrightBrowser.close(); } catch { /* ignore */ }
    }

    logger.divider("실행 결과 요약");
    logger.info(`  Step 1 수집:        ${status.collect ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 2 전처리:      ${status.process ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 3 점수화:      ${status.rank    ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 4 숏츠 생성:   ${status.shorts  ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 5 리포트:      ${status.report  ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 6 최종 export: ${status.final   ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 7 엑셀 생성:   ${status.excel   ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  URL 저장:          ${urlSavedCount ?? 0}건`);
    logger.info(`  댓글 수집 성공:    ${commentSuccessCount ?? 0}건 (0건이면 사이트 파싱 불가 — 정상)`);
    logger.info(`  아카이브:          outputs/archive/.../${ats.date}/${ats.hour}/`);
    logger.info(`  로그 파일: ${logger.getLogFilePath()}`);
    logger.divider();
  }
}

// npm run collect 로 직접 실행할 때만 즉시 실행
// scheduler.ts 에서 import 할 때는 실행되지 않음
if (require.main === module) {
  runMorningPipeline().catch((err) => {
    console.error("치명적 오류:", err);
    process.exit(1);
  });
}
