/**
 * 정치 파이프라인 1차 검증 모드
 *
 * 사용법: npm run political-verify
 *
 * 출력:
 *   - 분류 요약
 *   - TOP 5 (강한이슈 / 보수 / 진보 / 검토필요)
 *   - 분류 품질 분석 (unclear 패턴 / mixed 패턴 / review_needed 원인 / 오분류 위험 패턴)
 *   - 상위 10건 분류 상세
 *   - 피드백 템플릿 자동 생성
 */

import fs from "fs";
import path from "path";
import { PoliticalIssue, PoliticalResearchResult } from "../types/political";
import {
  saveFeedbackTemplate,
  loadFeedbackHistory,
  loadAdjustments,
  analyzeHistoryPatterns,
} from "../utils/politicalFeedback";

// =============================================
// 헬퍼
// =============================================
function getLatestFile(dir: string, pattern: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.includes(pattern))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(dir, files[0]) : null;
}

function hr(char = "─", len = 60): string {
  return char.repeat(len);
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

// =============================================
// 분류 품질 분석
// =============================================
function printClassificationAnalytics(issues: PoliticalIssue[]): void {
  const total      = issues.length;
  const unclearIssues = issues.filter((i) => i.politicalSideFit === "unclear");
  const mixedIssues   = issues.filter((i) => i.politicalSideFit === "mixed");
  const reviewIssues  = issues.filter((i) => i.reviewMemo !== "");

  console.log("\n" + hr("="));
  console.log("[ 분류 품질 분석 ]");
  console.log(hr("="));

  // ── unclear 분석 ──────────────────────────────
  console.log(`\n  ⬜ unclear ${unclearIssues.length}건 (${pct(unclearIssues.length, total)})`);

  const unclearReasons: Record<string, number> = {};
  unclearIssues.forEach((i) => {
    const reason =
      i.fitReason.includes("키워드 없음") ? "키워드 없음" :
      i.fitReason.includes("근거 불충분")  ? "단일 신호 — 근거 불충분" :
      i.fitReason;
    unclearReasons[reason] = (unclearReasons[reason] ?? 0) + 1;
  });
  Object.entries(unclearReasons)
    .sort((a, b) => b[1] - a[1])
    .forEach(([r, cnt]) => console.log(`    · ${r} : ${cnt}건`));

  // unclear 이슈에서 가장 자주 나오는 evidenceKeyword
  const unclearKwFreq: Record<string, number> = {};
  unclearIssues.forEach((i) => {
    i.evidenceKeywords.forEach((kw) => {
      unclearKwFreq[kw] = (unclearKwFreq[kw] ?? 0) + 1;
    });
  });
  const topUnclearKw = Object.entries(unclearKwFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (topUnclearKw.length > 0) {
    console.log(`    단일 신호에 자주 등장하는 키워드 (보강 후보):`);
    topUnclearKw.forEach(([kw, cnt]) =>
      console.log(`      "${kw}" — ${cnt}건 (단독으로는 분류 기준 미달)`)
    );
  }

  // ── mixed 분석 ───────────────────────────────
  console.log(`\n  🟣 mixed ${mixedIssues.length}건 (${pct(mixedIssues.length, total)})`);

  if (mixedIssues.length > 0) {
    // 공통적으로 나타나는 보수+진보 공존 키워드
    const allMixedKw: string[] = mixedIssues.flatMap((i) => i.evidenceKeywords);
    const mixedKwFreq: Record<string, number> = {};
    allMixedKw.forEach((kw) => {
      mixedKwFreq[kw] = (mixedKwFreq[kw] ?? 0) + 1;
    });
    const topMixedKw = Object.entries(mixedKwFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    if (topMixedKw.length > 0) {
      console.log(`    혼재 이슈에 공통 등장 키워드 (노이즈 키워드 후보):`);
      topMixedKw.forEach(([kw, cnt]) =>
        console.log(`      "${kw}" — ${cnt}건`)
      );
    }
    // 대표 패턴 출력
    console.log(`    혼재 이슈 키워드 패턴:`);
    mixedIssues.slice(0, 3).forEach((i) => {
      console.log(`      ${i.keyword}: ${i.fitReason}`);
    });
  }

  // ── review_needed 원인 분석 ──────────────────
  console.log(`\n  ⚠️  review_needed ${reviewIssues.length}건 (${pct(reviewIssues.length, total)})`);

  const reviewCauses: Record<string, number> = {};
  reviewIssues.forEach((i) => {
    // reviewMemo에서 원인 구분
    const memo = i.reviewMemo;
    if (memo.includes("키워드 없음"))       reviewCauses["보수/진보 키워드 없음"] = (reviewCauses["보수/진보 키워드 없음"] ?? 0) + 1;
    if (memo.includes("단일 신호") || memo.includes("근거 불충분")) reviewCauses["신호 1개 — 근거 불충분"] = (reviewCauses["신호 1개 — 근거 불충분"] ?? 0) + 1;
    if (memo.includes("혼재"))              reviewCauses["보수+진보 혼재"]       = (reviewCauses["보수+진보 혼재"] ?? 0) + 1;
    if (memo.includes("출처 단독"))         reviewCauses["출처 단독(1개)"]        = (reviewCauses["출처 단독(1개)"] ?? 0) + 1;
    if (memo.includes("기사 1건"))          reviewCauses["기사 1건"]             = (reviewCauses["기사 1건"] ?? 0) + 1;
    if (memo.includes("숏폼 활용도"))       reviewCauses["숏폼 활용도 낮음"]      = (reviewCauses["숏폼 활용도 낮음"] ?? 0) + 1;
    if (memo.includes("점수 낮음"))         reviewCauses["종합 점수 낮음"]        = (reviewCauses["종합 점수 낮음"] ?? 0) + 1;
  });

  const topCauses = Object.entries(reviewCauses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (topCauses.length > 0) {
    console.log(`    review_needed 원인 TOP:`);
    topCauses.forEach(([cause, cnt]) =>
      console.log(`      · ${cause.padEnd(22)} : ${cnt}건`)
    );
  }

  // ── 잘못 분류되기 쉬운 패턴 ──────────────────
  console.log(`\n  🚨 오분류 위험 패턴`);

  // 1. 인물명+문맥 조합만으로 분류된 이슈
  const onlyPersonBased = issues.filter(
    (i) =>
      i.evidenceKeywords.length > 0 &&
      i.evidenceKeywords.every((kw) => kw.includes("+"))
  );
  if (onlyPersonBased.length > 0) {
    console.log(`    · 인물+문맥 조합만으로 분류: ${onlyPersonBased.length}건 — 이슈 키워드 사전 보강 권장`);
    onlyPersonBased.slice(0, 3).forEach((i) =>
      console.log(`      "${i.keyword}" → ${i.politicalSideFit} | ${i.evidenceKeywords.join(", ")}`)
    );
  }

  // 2. 고민감도 + unclear 이슈
  const highUnclear = issues.filter(
    (i) => i.sensitivityLevel === "high" && i.politicalSideFit === "unclear"
  );
  if (highUnclear.length > 0) {
    console.log(`    · 고민감도 + 분류불가 : ${highUnclear.length}건 — 채널 노출 전 반드시 수동 확인`);
    highUnclear.slice(0, 3).forEach((i) =>
      console.log(`      "${i.keyword}"`)
    );
  }

  // 3. 단일 인물명만 근거인 unclear (인물+문맥 조합 미성립)
  const singlePersonUnclear = issues.filter(
    (i) =>
      i.politicalSideFit === "unclear" &&
      i.evidenceKeywords.length > 0 &&
      i.fitReason.includes("근거 불충분")
  );
  if (singlePersonUnclear.length > 0) {
    console.log(`    · 단일 신호 unclear : ${singlePersonUnclear.length}건 — 방향성 문맥 키워드 없이는 분류 불가`);
  }
}

// =============================================
// 검증 메인
// =============================================
async function runVerify(): Promise<void> {
  const dataDir   = "outputs/political/data";
  const reportDir = "outputs/political/reports";
  const excelDir  = "outputs/political/excel";

  const latestFile = getLatestFile(dataDir, "-political-final.json");
  const today      = new Date().toISOString().slice(0, 10);

  console.log("\n" + hr("="));
  console.log("  정치 파이프라인 검증 모드");
  console.log(hr("="));

  if (!latestFile) {
    console.log("\n❌ 출력 데이터 없음. 먼저 [npm run political] 을 실행하세요.\n");
    return;
  }

  const result: PoliticalResearchResult = JSON.parse(
    fs.readFileSync(latestFile, "utf-8")
  );

  console.log(`\n  데이터 파일 : ${latestFile}`);
  console.log(`  생성 시각   : ${result.researchedAt}`);
  console.log(`  이슈 총 건수: ${result.totalIssues}건`);

  // ── 분류 요약 ────────────────────────────────
  const { summary } = result;
  const total = result.totalIssues;
  console.log("\n" + hr());
  console.log("[ 분류 요약 ]");
  console.log(hr());
  console.log(`  🔵 보수채널 적합 : ${summary.conservativePositiveCount}건 (${pct(summary.conservativePositiveCount, total)})`);
  console.log(`  🔴 진보채널 적합 : ${summary.progressivePositiveCount}건 (${pct(summary.progressivePositiveCount, total)})`);
  console.log(`  🟣 혼재          : ${summary.mixedCount}건 (${pct(summary.mixedCount, total)})`);
  console.log(`  ⬜ 불명확        : ${summary.unclearCount}건 (${pct(summary.unclearCount, total)})`);
  console.log(`  🔴 고민감도      : ${summary.highSensitivityCount}건`);
  console.log(`  ⚠️  검토 대기    : ${summary.reviewQueueCount}건`);
  if (summary.topKeywords.length > 0) {
    console.log(`\n  오늘의 주요 키워드: ${summary.topKeywords.join(" · ")}`);
  }

  // ── 가장 강한 이슈 TOP 5 ─────────────────────
  console.log("\n" + hr());
  console.log("[ 가장 강한 이슈 TOP 5 ]");
  console.log(hr());
  [...result.issues]
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore)
    .slice(0, 5)
    .forEach((issue, i) => {
      console.log(
        `  ${i + 1}. [${issue.scores.finalScore}점] ${issue.keyword}  |  ${issue.politicalSideFit}  |  민감도:${issue.sensitivityLevel}`
      );
    });

  // ── 보수 채널 추천 TOP 5 ─────────────────────
  console.log("\n" + hr());
  console.log("[ 보수 채널 추천 TOP 5 ]");
  console.log(hr());
  const cons = result.issues
    .filter((i) => i.politicalSideFit === "conservative_positive")
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore)
    .slice(0, 5);
  if (cons.length > 0) {
    cons.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue.keyword}  (${issue.scores.finalScore}점)`);
      console.log(`       근거: ${issue.evidenceKeywords.join(", ") || "(없음)"}`);
    });
  } else {
    console.log("  오늘 보수채널 적합 이슈 없음");
  }

  // ── 진보 채널 추천 TOP 5 ─────────────────────
  console.log("\n" + hr());
  console.log("[ 진보 채널 추천 TOP 5 ]");
  console.log(hr());
  const prog = result.issues
    .filter((i) => i.politicalSideFit === "progressive_positive")
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore)
    .slice(0, 5);
  if (prog.length > 0) {
    prog.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue.keyword}  (${issue.scores.finalScore}점)`);
      console.log(`       근거: ${issue.evidenceKeywords.join(", ") || "(없음)"}`);
    });
  } else {
    console.log("  오늘 진보채널 적합 이슈 없음");
  }

  // ── 검토 필요 이슈 TOP 5 ─────────────────────
  console.log("\n" + hr());
  console.log("[ 검토 필요 이슈 TOP 5 ]");
  console.log(hr());
  const reviewQueue = result.issues
    .filter((i) => i.reviewMemo !== "")
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore)
    .slice(0, 5);
  if (reviewQueue.length > 0) {
    reviewQueue.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue.keyword}  (${issue.reviewStatus})`);
      console.log(`       이유: ${issue.reviewMemo}`);
    });
  } else {
    console.log("  검토 필요 이슈 없음 — 전체 품질 기준 충족");
  }

  // ── 분류 품질 분석 ────────────────────────────
  printClassificationAnalytics(result.issues);

  // ── 상위 10건 분류 상세 ───────────────────────
  console.log("\n" + hr("="));
  console.log("[ 상위 10건 분류 상세 — 직접 검토용 ]");
  console.log(hr("="));
  result.issues.slice(0, 10).forEach((issue, i) => {
    console.log(`\n  [${i + 1}위] ${issue.keyword}`);
    console.log(`    대표 기사        : ${issue.title}`);
    console.log(`    politicalSideFit : ${issue.politicalSideFit}`);
    console.log(`    fitReason        : ${issue.fitReason}`);
    console.log(`    evidenceKeywords : ${issue.evidenceKeywords.join(", ") || "(없음)"}`);
    console.log(`    reviewMemo       : ${issue.reviewMemo || "(없음)"}`);
    console.log(`    reviewStatus     : ${issue.reviewStatus}`);
    console.log(`    최종 점수        : ${issue.scores.finalScore}점`);
    console.log(`    민감도           : ${issue.sensitivityLevel}`);
    console.log(`    출처(${issue.sourceCount}개)           : ${issue.sources.join(", ")}`);
  });

  // ── 피드백 반영 현황 ─────────────────────────
  const history     = loadFeedbackHistory();
  const adjustments = loadAdjustments();

  if (adjustments || history.length > 0) {
    console.log("\n" + hr("="));
    console.log("[ 피드백 반영 현황 ]");
    console.log(hr("="));

    // 이번 실행 결과에서 조정이 적용된 이슈 수
    const adjKeywords   = Object.keys(adjustments?.keywordAdjustments ?? {});
    const adjustedIssues = result.issues.filter((i) =>
      adjKeywords.includes(i.keyword)
    );
    console.log(`\n  최근 피드백 반영 건수   : ${adjustedIssues.length}건 (누적 히스토리 ${history.length}건)`);
    if (adjustedIssues.length > 0) {
      adjustedIssues.slice(0, 5).forEach((i) => {
        const a = adjustments!.keywordAdjustments[i.keyword];
        const cStr = `C${a.conservativeDelta >= 0 ? "+" : ""}${a.conservativeDelta}`;
        const pStr = `P${a.progressiveDelta  >= 0 ? "+" : ""}${a.progressiveDelta}`;
        console.log(`    · "${i.keyword}" → ${i.politicalSideFit}  [${cStr} ${pStr}, ${a.correctionCount}회]`);
      });
    }

    // 가장 자주 수정된 분류 패턴 TOP 10
    if (adjustments?.topMisclassifiedPatterns && adjustments.topMisclassifiedPatterns.length > 0) {
      console.log("\n" + hr());
      console.log("[ 가장 자주 수정된 분류 패턴 TOP 10 ]");
      console.log(hr());
      adjustments.topMisclassifiedPatterns.slice(0, 10).forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.from.padEnd(24)} → ${p.to}  (${p.count}건): ${p.keywords.slice(0, 4).join(", ")}`);
      });
    }

    // 자동 보정 후보 TOP 10
    if (adjustments?.autoCorrectionCandidates && adjustments.autoCorrectionCandidates.length > 0) {
      console.log("\n" + hr());
      console.log("[ 자동 보정 후보 TOP 10 — 키워드 사전 보강 권장 ]");
      console.log(hr());
      adjustments.autoCorrectionCandidates.slice(0, 10).forEach((c, i) => {
        const cStr = `C${c.conservativeDelta >= 0 ? "+" : ""}${c.conservativeDelta}`;
        const pStr = `P${c.progressiveDelta  >= 0 ? "+" : ""}${c.progressiveDelta}`;
        console.log(`  ${i + 1}. "${c.keyword}"  ${cStr} ${pStr}  (${c.correctionCount}회 → 항상 ${c.lastCorrectedTo})`);
      });
    } else {
      const patterns = analyzeHistoryPatterns();
      if (patterns.frequentlyMisclas.length > 0) {
        console.log(`\n  자동분류 오류 잦은 키워드: ${patterns.frequentlyMisclas.join(", ")}`);
      }
    }
  }

  // ── 출력 파일 경로 ───────────────────────────
  console.log("\n" + hr());
  console.log("[ 생성된 출력 파일 ]");
  console.log(hr());
  if (fs.existsSync(reportDir)) {
    const reports = fs.readdirSync(reportDir).sort().reverse().slice(0, 3);
    console.log("  리포트:");
    reports.forEach((f) => console.log(`    ${path.join(reportDir, f)}`));
  }
  if (fs.existsSync(excelDir)) {
    const excels = fs.readdirSync(excelDir).sort().reverse().slice(0, 1);
    console.log("  엑셀:");
    excels.forEach((f) => console.log(`    ${path.join(excelDir, f)}`));
  }

  // ── 피드백 템플릿 생성 ────────────────────────
  const templatePath = saveFeedbackTemplate(result.issues, today);
  console.log(`\n  피드백 템플릿: ${templatePath}`);
  console.log(`  ↑ 이 파일에서 userDecision 채운 후 [npm run political-feedback] 실행`);

  // ── 검수 순서 ────────────────────────────────
  console.log("\n" + hr("="));
  console.log("[ 검수자가 보는 순서 ]");
  console.log(hr("="));
  console.log("  1. 위 [ 분류 품질 분석 ] 에서 unclear 원인 → 키워드 사전 보강 여부 판단");
  console.log("  2. 고민감도(high) + unclear 이슈 → 채널 노출 전 수동 확인");
  console.log("  3. 엑셀 ReviewQueue 시트 열어 review_needed 항목 육안 검토");
  console.log("  4. 피드백 템플릿 JSON 에서 userDecision 채움");
  console.log("  5. npm run political-feedback 실행 → 결정 저장 + 패턴 분석\n");
}

runVerify().catch((err) => {
  console.error("검증 실패:", err);
  process.exit(1);
});
