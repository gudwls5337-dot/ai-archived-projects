/**
 * 정치 파이프라인 피드백 저장 커맨드
 *
 * 사용법: npm run political-feedback
 *
 * 흐름:
 *   1. outputs/political/feedback/ 에서 최신 feedback-template.json 읽기
 *   2. userDecision 이 채워진 항목만 추출
 *   3. feedback-history.json 에 누적 저장
 *   4. 누적 패턴 분석 결과 출력
 */

import fs from "fs";
import {
  FeedbackItem,
  FeedbackTemplate,
  appendFeedbackHistory,
  loadFeedbackHistory,
  analyzeHistoryPatterns,
  buildAndSaveAdjustments,
  getLatestFeedbackTemplate,
} from "../utils/politicalFeedback";

function hr(char = "─", len = 60): string {
  return char.repeat(len);
}

const VALID_DECISIONS = [
  "approved",
  "rejected",
  "conservative_positive",
  "progressive_positive",
  "mixed",
  "unclear",
];

async function runFeedback(): Promise<void> {
  console.log("\n" + hr("="));
  console.log("  정치 파이프라인 피드백 저장");
  console.log(hr("="));

  // ── 최신 템플릿 파일 로드 ────────────────────
  const templatePath = getLatestFeedbackTemplate();
  if (!templatePath) {
    console.log("\n❌ 피드백 템플릿 없음.");
    console.log("   먼저 [npm run political-verify] 를 실행하면 템플릿이 생성됩니다.\n");
    return;
  }

  console.log(`\n  템플릿 파일: ${templatePath}`);

  let template: FeedbackTemplate;
  try {
    template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
  } catch (e) {
    console.log("\n❌ 템플릿 파일 읽기 실패:", (e as Error).message);
    return;
  }

  // ── userDecision 채워진 항목 추출 ────────────
  const decided: FeedbackItem[] = template.items.filter(
    (item) => item.userDecision && VALID_DECISIONS.includes(item.userDecision)
  );

  const invalidItems = template.items.filter(
    (item) =>
      item.userDecision &&
      !VALID_DECISIONS.includes(item.userDecision)
  );

  if (invalidItems.length > 0) {
    console.log(`\n⚠️  유효하지 않은 userDecision ${invalidItems.length}건 (무시됨):`);
    invalidItems.forEach((item) => {
      console.log(`   - ${item.keyword}: "${item.userDecision}" — 유효값: ${VALID_DECISIONS.join(" | ")}`);
    });
  }

  if (decided.length === 0) {
    console.log("\n  결정된 항목 없음.");
    console.log(`  템플릿 파일을 열어 userDecision 필드를 채운 후 다시 실행하세요.`);
    console.log(`  파일 경로: ${templatePath}\n`);
    return;
  }

  // ── 히스토리 저장 ─────────────────────────────
  appendFeedbackHistory(decided);
  console.log(`\n  저장 완료: ${decided.length}건`);

  // ── 조정값 재빌드 ─────────────────────────────
  const adj = buildAndSaveAdjustments();
  console.log(`  조정값 재빌드: 키워드 ${Object.keys(adj.keywordAdjustments).length}개`);
  console.log(`  자동 보정 후보: ${adj.autoCorrectionCandidates.length}건`);
  console.log(`  조정 파일: outputs/political/feedback/feedback-adjustments.json`);

  // ── 저장 내용 요약 ────────────────────────────
  console.log("\n" + hr());
  console.log("[ 저장된 피드백 내용 ]");
  console.log(hr());
  const byDecision: Record<string, string[]> = {};
  for (const item of decided) {
    if (!byDecision[item.userDecision]) byDecision[item.userDecision] = [];
    byDecision[item.userDecision].push(item.keyword);
  }
  for (const [decision, keywords] of Object.entries(byDecision)) {
    console.log(`  ${decision.padEnd(24)} : ${keywords.join(", ")}`);
  }

  // ── 적용된 조정값 상세 출력 ──────────────────
  if (Object.keys(adj.keywordAdjustments).length > 0) {
    console.log("\n" + hr());
    console.log("[ 적용된 피드백 조정값 ]");
    console.log(hr());
    const sortedAdj = Object.values(adj.keywordAdjustments)
      .sort((a, b) => b.correctionCount - a.correctionCount)
      .slice(0, 10);
    sortedAdj.forEach((a) => {
      const cStr = `C${a.conservativeDelta >= 0 ? "+" : ""}${a.conservativeDelta}`;
      const pStr = `P${a.progressiveDelta  >= 0 ? "+" : ""}${a.progressiveDelta}`;
      const cand = a.isAutoCorrectionCandidate ? " ★자동보정후보" : "";
      console.log(`  ${a.keyword.padEnd(14)} ${cStr} ${pStr}  (${a.correctionCount}회 보정 → ${a.lastCorrectedTo})${cand}`);
    });
  }

  // ── 자주 수정된 패턴 TOP ──────────────────────
  if (adj.topMisclassifiedPatterns.length > 0) {
    console.log("\n" + hr());
    console.log("[ 가장 자주 수정된 분류 패턴 TOP 10 ]");
    console.log(hr());
    adj.topMisclassifiedPatterns.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.from} → ${p.to}  (${p.count}건): ${p.keywords.slice(0, 5).join(", ")}`);
    });
  }

  // ── 자동 보정 후보 TOP ────────────────────────
  if (adj.autoCorrectionCandidates.length > 0) {
    console.log("\n" + hr());
    console.log("[ 자동 보정 후보 TOP 10 — 키워드 사전 보강 검토 권장 ]");
    console.log(hr());
    adj.autoCorrectionCandidates.forEach((c, i) => {
      console.log(`  ${i + 1}. "${c.keyword}"  → 항상 ${c.lastCorrectedTo} 로 보정됨 (${c.correctionCount}회)`);
    });
  }

  // ── 누적 히스토리 요약 ────────────────────────
  const history = loadFeedbackHistory();
  console.log(`\n  누적 피드백: ${history.length}건 | 분류 수정: ${adj.totalCorrected}건`);

  const patterns = analyzeHistoryPatterns();
  if (patterns.frequentlyMisclas.length > 0) {
    console.log(`  자동분류 오류 잦은 키워드: ${patterns.frequentlyMisclas.join(", ")}`);
    console.log(`  💡 위 키워드는 classifyChannelFit.ts 키워드 사전 보강을 검토하세요.`);
  }

  console.log("\n  피드백 파일들:");
  console.log("    history    : outputs/political/feedback/feedback-history.json");
  console.log("    adjustments: outputs/political/feedback/feedback-adjustments.json\n");
}

runFeedback().catch((err) => {
  console.error("피드백 저장 실패:", err);
  process.exit(1);
});
