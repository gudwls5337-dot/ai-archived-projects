import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// ── 수집기 ──────────────────────────────────────
import { collectFromRSS } from "../collectors/rssCollector";
import { collectFromGoogleNews, collectFromPoliticalRss } from "../collectors/googleNewsRss";
import { collectPoliticalFromNaver } from "../collectors/politicalNaverNews";
import { collectYoutubeSignals } from "../collectors/youtubeSignals";
import { collectRedditSignals } from "../collectors/redditSignals";
import { collectCommentMeta } from "../collectors/commentCollector";

// ── 전처리기 ─────────────────────────────────────
import { normalizeAll } from "../parsers/normalizeArticle";
import { dedupeArticles } from "../parsers/dedupeArticles";
import { clusterIssues } from "../parsers/clusterIssues";

// ── 점수화 (기존) ─────────────────────────────────
import { scoreAndRank } from "../scorers/scoreIssues";

// ── 분류기 ──────────────────────────────────────
import { classifyPoliticalIssue } from "../classifiers/classifyPoliticalIssue";
import { classifyChannelFit } from "../classifiers/classifyChannelFit";

// ── 정치 전용 점수화 ──────────────────────────────
import { scorePoliticalIssue, generateReviewMemo } from "../scorers/scorePoliticalIssues";

// ── 출력 생성기 ───────────────────────────────────
import { generatePoliticalResearchReport } from "../generators/generatePoliticalResearchReport";
import { generatePoliticalExcelExport } from "../generators/generatePoliticalExcelExport";
import { generateContentFields } from "../generators/generatePoliticalContentFields";

// ── 유틸리티 ─────────────────────────────────────
import { logger } from "../utils/logger";
import { getArchiveTs, archiveJson } from "../utils/archiveWriter";

// ── 타입 ─────────────────────────────────────────
import { ScoredIssue } from "../types/news";
import {
  PoliticalIssue,
  PoliticalResearchResult,
  PoliticalResearchSummary,
  ReviewStatus,
  YoutubeSignal,
  RedditSignal,
} from "../types/political";

dotenv.config();

// =============================================
// 헬퍼: 오늘 날짜 (YYYY-MM-DD)
// =============================================
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// =============================================
// 헬퍼: JSON 파일 저장
// =============================================
function saveJson(dir: string, filename: string, data: unknown): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  return filePath;
}

// =============================================
// ScoredIssue → PoliticalIssue 변환
// =============================================
function buildPoliticalIssue(
  scoredIssue: ScoredIssue,
  rank: number,
  youtubeMap: Map<string, YoutubeSignal | null>,
  redditMap: Map<string, RedditSignal | null>
): PoliticalIssue {
  const classification = classifyPoliticalIssue(scoredIssue);
  const channelFit     = classifyChannelFit(scoredIssue);
  const scores         = scorePoliticalIssue(scoredIssue, channelFit, classification.matchedKeywords);

  // 0~100 정규화
  const reactionScore   = Math.round((scores.reactionIntensity / 20) * 100);
  const shortsPotential = Math.round((scores.shortsPotential   / 10) * 100);

  // YouTube/Reddit 신호: 이슈 키워드로 조회 (없으면 null)
  const ytSignal = youtubeMap.get(scoredIssue.clusterKeyword) ?? null;
  const rdSignal = redditMap.get(scoredIssue.clusterKeyword)  ?? null;

  const reviewMemo = generateReviewMemo(
    scoredIssue,
    scores,
    channelFit,
    classification.matchedKeywords
  );

  const reviewStatus: ReviewStatus =
    scores.finalScore < 10 ? "rejected" :
    reviewMemo !== ""      ? "review_needed" :
    "approved";

  const contentFields = generateContentFields(scoredIssue, channelFit);

  return {
    rank,
    title: scoredIssue.representativeTitle,
    keyword: scoredIssue.clusterKeyword,
    sources: scoredIssue.sources,
    sourceCount: scoredIssue.sourceCount,
    articleCount: scoredIssue.articleCount,
    representativeUrl: scoredIssue.representativeUrl,
    topComments: scoredIssue.commentMeta?.topComments ?? [],
    reactionScore,
    youtubeSignal: ytSignal,
    redditSignal: rdSignal,
    politicalSideFit: channelFit.fit,
    fitReason: channelFit.reason,
    evidenceKeywords: channelFit.evidenceKeywords,
    shortsPotential,
    sensitivityLevel: channelFit.sensitivityLevel,
    reviewMemo,
    reviewStatus,
    oneLineSummary:    contentFields.oneLineSummary,
    channelWhyItFits:  contentFields.channelWhyItFits,
    thumbnailKeywords: contentFields.thumbnailKeywords,
    videoRiskNote:     contentFields.videoRiskNote,
    titleIdea:         contentFields.titleIdea,
    hookIdea:          contentFields.hookIdea,
    angleNote:         contentFields.angleNote,
    scores,
    articles: scoredIssue.articles,
    latestPubDate: scoredIssue.latestPubDate,
    collectedAt: new Date().toISOString(),
  };
}

// =============================================
// 평가 루프: 품질 기준 체크 → reviewMemo 갱신
//
// 평가 기준:
//   1. 진짜 정치 이슈인가 (키워드 근거)
//   2. 출처와 반응 근거가 충분한가
//   3. 중복이 과도하지 않은가
//   4. 보수/진보 채널 분류 이유가 설명되는가
//   5. 영상 기획 참고용으로 충분한가
// =============================================
function evaluateAndRefine(issues: PoliticalIssue[]): {
  issues: PoliticalIssue[];
  evaluationLog: string[];
} {
  const log: string[] = [];

  const refined = issues.map((issue) => {
    const flags: string[] = [];

    // 기준 1: 진짜 정치 이슈인가
    if (issue.evidenceKeywords.length === 0 && issue.scores.politicalRelevance < 5) {
      flags.push("정치 키워드 근거 부족");
    }

    // 기준 2: 출처와 반응 근거가 충분한가
    if (issue.sourceCount < 2) {
      flags.push("출처 단독(1건)");
    }
    if (issue.articleCount === 1) {
      flags.push("기사 1건 — 이슈화 불확실");
    }

    // 기준 3: 중복이 과도하지 않은가
    if (issue.scores.duplicatePenalty <= -15) {
      flags.push(`근중복 이슈 — 상위 이슈와 통합 검토`);
    }

    // 기준 4: 채널 분류 근거가 설명되는가
    if (issue.politicalSideFit === "unclear") {
      flags.push("채널 분류 불명확 — 수동 검토 필요");
    }

    // 기준 5: 영상 기획 참고용으로 충분한가
    if (issue.scores.finalScore < 20) {
      flags.push(`종합 점수 낮음 (${issue.scores.finalScore}점)`);
    }

    if (flags.length > 0) {
      const memo = flags.join(" | ");
      log.push(`[${issue.keyword}] ${memo}`);
      return { ...issue, reviewMemo: memo };
    }

    return issue;
  });

  return { issues: refined, evaluationLog: log };
}

// =============================================
// 요약 통계 생성
// =============================================
function buildSummary(issues: PoliticalIssue[]): PoliticalResearchSummary {
  const keywordFreq: Record<string, number> = {};
  for (const issue of issues) {
    keywordFreq[issue.keyword] = (keywordFreq[issue.keyword] ?? 0) + 1;
    for (const kw of issue.evidenceKeywords) {
      keywordFreq[kw] = (keywordFreq[kw] ?? 0) + 1;
    }
  }

  const topKeywords = Object.entries(keywordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([kw]) => kw);

  return {
    conservativePositiveCount: issues.filter((i) => i.politicalSideFit === "conservative_positive").length,
    progressivePositiveCount:  issues.filter((i) => i.politicalSideFit === "progressive_positive").length,
    mixedCount:                issues.filter((i) => i.politicalSideFit === "mixed").length,
    unclearCount:              issues.filter((i) => i.politicalSideFit === "unclear").length,
    highSensitivityCount:      issues.filter((i) => i.sensitivityLevel === "high").length,
    reviewQueueCount:          issues.filter((i) => i.reviewMemo !== "").length,
    topKeywords,
  };
}

// =============================================
// 메인 파이프라인
// =============================================
export async function runPoliticalResearchPipeline(): Promise<void> {
  logger.divider("정치 이슈 시장조사 파이프라인 시작: " + new Date().toLocaleString("ko-KR"));

  const ats   = getArchiveTs();
  const today = getToday();

  const status = {
    collect:  false,
    filter:   false,
    signals:  false,
    classify: false,
    evaluate: false,
    report:   false,
    excel:    false,
  };

  try {
    // ── Step 1: 다중 소스 수집 ──────────────────
    logger.info("[Step 1] 다중 소스 정치 뉴스 수집 시작");

    const [rssItems, googleItems, politicalRssItems, naverItems] = await Promise.all([
      collectFromRSS(),
      collectFromGoogleNews(),
      collectFromPoliticalRss(),
      collectPoliticalFromNaver(),
    ]);

    const allItems = [...rssItems, ...googleItems, ...politicalRssItems, ...naverItems];
    status.collect = true;
    logger.success(`[Step 1] 수집 완료: 총 ${allItems.length}건`);
    logger.info(`         ├─ 기존 RSS        : ${rssItems.length}건`);
    logger.info(`         ├─ Google뉴스 RSS  : ${googleItems.length}건`);
    logger.info(`         ├─ 정치 추가 RSS   : ${politicalRssItems.length}건`);
    logger.info(`         └─ 네이버 정치     : ${naverItems.length}건`);

    if (allItems.length === 0) {
      logger.warn("[Step 1] 수집된 기사가 0건입니다. 네트워크 상태를 확인하세요.");
    }

    // ── Step 2: 전처리 + 정치 이슈 필터 ─────────
    logger.info("[Step 2] 전처리 및 정치 이슈 필터링");

    const normalized = normalizeAll(allItems);
    const { unique, removedCount } = dedupeArticles(normalized);
    logger.info(`         중복 ${removedCount}건 제거 → ${unique.length}건 남음`);

    const clusters = clusterIssues(unique);

    // TOP_N=50 으로 넉넉하게 후보 확보 후 정치 필터 적용
    const TOP_N_CANDIDATE = 50;
    const allScored = scoreAndRank(clusters, TOP_N_CANDIDATE);

    // classifyPoliticalIssue 로 정치 이슈 추가 검증
    const politicalScored = allScored.filter((issue) =>
      classifyPoliticalIssue(issue).isPolitical
    );

    status.filter = true;
    logger.success(
      `[Step 2] 정치 이슈 필터: ${clusters.length}개 클러스터 → ${politicalScored.length}건`
    );

    if (politicalScored.length === 0) {
      logger.warn("[Step 2] 정치 이슈가 없습니다. 결과를 빈 상태로 저장합니다.");
    }

    // ── Step 3: 반응 데이터 수집 ─────────────────
    logger.info(`[Step 3] 반응 데이터 수집 (${politicalScored.length}건)`);
    let commentCount = 0;

    const commentResults = await Promise.allSettled(
      politicalScored.map((issue) => collectCommentMeta(issue.representativeUrl))
    );
    commentResults.forEach((res, i) => {
      if (res.status === "fulfilled" && res.value !== null) {
        politicalScored[i].commentMeta = res.value;
        commentCount++;
      }
    });
    logger.info(
      `         댓글 수집 성공: ${commentCount}건 (0건이면 사이트 JS 차단 — 정상)`
    );

    // ── Step 4: 신호 수집 (YouTube/Reddit) ───────
    logger.info("[Step 4] 외부 신호 수집 (YouTube / Reddit)");

    // 상위 10개 이슈 키워드만 신호 수집 (API 절약)
    const signalKeywords = politicalScored.slice(0, 10).map((i) => i.clusterKeyword);

    const [youtubeMap, redditMap] = await Promise.all([
      collectYoutubeSignals(signalKeywords),
      collectRedditSignals(signalKeywords),
    ]);
    status.signals = true;
    logger.info("[Step 4] 신호 수집 완료");

    // ── Step 5: 점수화 + 채널 분류 ──────────────
    logger.info("[Step 5] 정치 이슈 점수화 및 채널 분류");

    const issuesDraft: PoliticalIssue[] = politicalScored.map((scoredIssue, i) =>
      buildPoliticalIssue(scoredIssue, i + 1, youtubeMap, redditMap)
    );

    // 새 점수 기준으로 재정렬
    issuesDraft.sort((a, b) => b.scores.finalScore - a.scores.finalScore);
    issuesDraft.forEach((issue, i) => { issue.rank = i + 1; });

    status.classify = true;
    const consCount = issuesDraft.filter((i) => i.politicalSideFit === "conservative_positive").length;
    const progCount = issuesDraft.filter((i) => i.politicalSideFit === "progressive_positive").length;
    const mixCount  = issuesDraft.filter((i) => i.politicalSideFit === "mixed").length;
    const unkCount  = issuesDraft.filter((i) => i.politicalSideFit === "unclear").length;
    logger.success(`[Step 5] 점수화 + 채널 분류 완료: ${issuesDraft.length}건`);
    logger.info(`         ├─ 보수채널 적합 : ${consCount}건`);
    logger.info(`         ├─ 진보채널 적합 : ${progCount}건`);
    logger.info(`         ├─ 혼재          : ${mixCount}건`);
    logger.info(`         └─ 불명확        : ${unkCount}건`);

    // 상위 5개 미리보기
    issuesDraft.slice(0, 5).forEach((issue) => {
      logger.info(
        `         [${issue.rank}위] ${issue.keyword} | ${issue.politicalSideFit} | ${issue.scores.finalScore}점`
      );
    });

    // ── Step 6: 평가 루프 ────────────────────────
    logger.info("[Step 6] 이슈 품질 평가 및 검토 대기 분류");

    const { issues: evaluatedIssues, evaluationLog } = evaluateAndRefine(issuesDraft);

    status.evaluate = true;
    if (evaluationLog.length > 0) {
      logger.warn(`         검토 필요 이슈 ${evaluationLog.length}건:`);
      evaluationLog.slice(0, 5).forEach((log) => logger.warn(`         · ${log}`));
      if (evaluationLog.length > 5) {
        logger.warn(`         · ... 외 ${evaluationLog.length - 5}건`);
      }
    } else {
      logger.info("         모든 이슈 품질 기준 충족");
    }

    // ── Step 6.5: 분류 샘플 출력 (상위 10건) ─────
    logger.info("[Step 6.5] 분류 결과 샘플 — 상위 10건 상세");
    evaluatedIssues.slice(0, 10).forEach((issue, i) => {
      logger.info(`  [${i + 1}] ${issue.keyword}  →  ${issue.reviewStatus}`);
      logger.info(`       politicalSideFit  : ${issue.politicalSideFit}`);
      logger.info(`       fitReason         : ${issue.fitReason}`);
      logger.info(`       evidenceKeywords  : ${issue.evidenceKeywords.join(", ") || "(없음)"}`);
      logger.info(`       reviewMemo        : ${issue.reviewMemo || "(없음)"}`);
    });

    // ── Step 7: 초안 JSON 저장 ───────────────────
    logger.info("[Step 7] 초안 JSON 저장");

    const draftResult: PoliticalResearchResult = {
      researchedAt: new Date().toISOString(),
      totalIssues:  evaluatedIssues.length,
      issues:       evaluatedIssues,
      summary:      buildSummary(evaluatedIssues),
    };

    const draftPath = saveJson(
      "outputs/political/data",
      `${today}-political-draft.json`,
      draftResult
    );
    archiveJson("political-data", "draft", draftResult, ats);
    logger.info(`         초안 저장 → ${draftPath}`);

    // ── Step 8: 최종 리포트 3종 생성 ────────────
    logger.info("[Step 8] 최종 리포트 3종 생성 (마스터 / 보수 / 진보)");

    const reportPaths = generatePoliticalResearchReport(draftResult, ats);
    status.report = true;
    logger.success(`[Step 8] 리포트 생성 완료`);
    logger.success(`         마스터   → ${reportPaths.masterPath}`);
    logger.success(`         보수채널 → ${reportPaths.conservativePath}`);
    logger.success(`         진보채널 → ${reportPaths.progressivePath}`);

    // ── Step 9: 엑셀 5시트 생성 ─────────────────
    logger.info("[Step 9] 엑셀(5시트) 생성");

    try {
      const excelPath = await generatePoliticalExcelExport(draftResult, ats);
      status.excel = true;
      logger.success(`[Step 9] 엑셀 생성 완료 → ${excelPath}`);
    } catch (excelErr) {
      const msg = (excelErr as Error).message ?? "";
      if (msg.includes("EBUSY") || msg.includes("locked")) {
        logger.warn(`[Step 9] 엑셀 파일이 열려 있어 저장을 건너뜁니다. 파일을 닫고 재실행하세요.`);
      } else {
        logger.warn(`[Step 9] 엑셀 생성 실패 (건너뜀): ${msg}`);
      }
    }

    // ── 최종 JSON 저장 ────────────────────────────
    const finalPath = saveJson(
      "outputs/political/data",
      `${today}-political-final.json`,
      draftResult
    );
    archiveJson("political-data", "final", draftResult, ats);
    logger.success(`         최종 JSON → ${finalPath}`);

  } catch (err) {
    const failedStep = !status.collect   ? "Step 1 (수집)"
      : !status.filter    ? "Step 2 (필터링)"
      : !status.signals   ? "Step 4 (신호 수집)"
      : !status.classify  ? "Step 5 (채널 분류)"
      : !status.evaluate  ? "Step 6 (평가)"
      : !status.report    ? "Step 8 (리포트)"
      : "Step 9 (엑셀)";
    const errMsg   = (err as Error).message ?? String(err);
    const errStack = (err as Error).stack ?? "";
    const stackExcerpt = errStack.split("\n").slice(0, 4).join(" | ");
    logger.error(`정치 리서치 파이프라인 실패 — ${failedStep}: ${errMsg}`);
    if (stackExcerpt) logger.error(`  스택: ${stackExcerpt}`);
    throw err;

  } finally {
    logger.divider("정치 리서치 실행 결과 요약");
    logger.info(`  Step 1 수집:         ${status.collect  ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 2 필터링:       ${status.filter   ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 4 신호 수집:    ${status.signals  ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 5 점수화/분류:  ${status.classify ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 6 품질 평가:    ${status.evaluate ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 8 리포트:       ${status.report   ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  Step 9 엑셀:         ${status.excel    ? "✅ 성공" : "❌ 실패"}`);
    logger.info(`  아카이브: outputs/archive/.../political*/`);
    logger.info(`  로그 파일: ${logger.getLogFilePath()}`);
    logger.divider();
  }
}

// npm run political 로 직접 실행할 때만 즉시 실행
// 스케줄러에서 import 할 때는 실행되지 않음
if (require.main === module) {
  runPoliticalResearchPipeline().catch((err) => {
    console.error("치명적 오류:", err);
    process.exit(1);
  });
}
