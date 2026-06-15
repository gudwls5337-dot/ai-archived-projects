/**
 * 정치 파이프라인 피드백 저장/조회/반영 유틸리티
 *
 * 흐름:
 *   1. political-verify  → feedback-template-YYYY-MM-DD.json 자동 생성
 *   2. 검수자가 userDecision 필드 수정
 *   3. political-feedback → history 저장 + adjustments 재빌드
 *   4. political 실행 시  → adjustments 로드 → 분류 점수에 반영
 */

import fs from "fs";
import path from "path";
import { PoliticalIssue } from "../types/political";

// =============================================
// 경로 상수
// =============================================
const FEEDBACK_DIR       = "outputs/political/feedback";
const HISTORY_FILE       = path.join(FEEDBACK_DIR, "feedback-history.json");
const ADJUSTMENTS_FILE   = path.join(FEEDBACK_DIR, "feedback-adjustments.json");

// =============================================
// 기본 타입
// =============================================
export interface FeedbackItem {
  date: string;
  keyword: string;
  title: string;
  autoClassification: string;
  autoReviewStatus: string;
  fitReason: string;
  evidenceKeywords: string[];
  personContextMatched: string[];
  userDecision: string;   // 빈 문자열 = 미검토
  note: string;
  savedAt?: string;
}

export interface FeedbackTemplate {
  date: string;
  generatedAt: string;
  instructions: string;
  totalItems: number;
  items: FeedbackItem[];
}

// =============================================
// 조정값 타입
// =============================================
export interface KeywordAdjustment {
  keyword: string;
  conservativeDelta: number;   // 양수 = 보수 강화, 음수 = 보수 약화
  progressiveDelta:  number;   // 양수 = 진보 강화, 음수 = 진보 약화
  correctionCount: number;     // 누적 보정 횟수
  isAutoCorrectionCandidate: boolean; // 2회 이상 동일 방향 보정
  correctionBreakdown: Array<{  // 보정 이력 요약
    from: string;
    to: string;
    count: number;
  }>;
  lastCorrectedTo: string;
  lastUpdated: string;
}

export interface FeedbackAdjustments {
  generatedAt: string;
  totalDecisions: number;           // 히스토리 전체 건수
  totalCorrected: number;           // autoClassification != userDecision 건수
  keywordAdjustments: Record<string, KeywordAdjustment>;
  autoCorrectionCandidates: KeywordAdjustment[];  // correctionCount >= 2
  frequentlyRejected: string[];     // rejected 2회 이상 키워드
  topMisclassifiedPatterns: Array<{ // 가장 자주 수정된 패턴
    from: string;
    to: string;
    keywords: string[];
    count: number;
  }>;
}

// =============================================
// 디렉토리 보장
// =============================================
function ensureDir(): void {
  if (!fs.existsSync(FEEDBACK_DIR)) fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
}

// =============================================
// 보정 방향 → 델타 계산
//
// MIN_HITS_FOR_CLEAR = 2 기준:
//   unclear  → conservative  : conservativeDelta += 2 (최소 히트 확보)
//   unclear  → progressive   : progressiveDelta  += 2
//   mixed    → conservative  : conservativeDelta += 2 (비율 달성 지원)
//   mixed    → progressive   : progressiveDelta  += 2
//   con      → progressive   : progressiveDelta  += 4, conservativeDelta -= 2 (방향 역전)
//   prog     → conservative  : conservativeDelta += 4, progressiveDelta  -= 2
//   *        → unclear       : 양쪽 -2 (분류 억제)
// =============================================
function calcDelta(from: string, to: string): { cDelta: number; pDelta: number } {
  if (to === "approved" || to === "rejected" || to === from) {
    return { cDelta: 0, pDelta: 0 };
  }

  switch (to) {
    case "conservative_positive":
      return from === "progressive_positive"
        ? { cDelta: 4, pDelta: -2 }
        : { cDelta: 2, pDelta: 0 };

    case "progressive_positive":
      return from === "conservative_positive"
        ? { cDelta: -2, pDelta: 4 }
        : { cDelta: 0, pDelta: 2 };

    case "mixed":
      return { cDelta: 1, pDelta: 1 };

    case "unclear":
      return { cDelta: -2, pDelta: -2 };

    default:
      return { cDelta: 0, pDelta: 0 };
  }
}

// =============================================
// 히스토리에서 조정값 재빌드 + 저장
// (political-feedback 실행 시 호출)
// =============================================
export function buildAndSaveAdjustments(): FeedbackAdjustments {
  ensureDir();
  const history = loadFeedbackHistory();

  // keyword → 누적 델타 계산
  const kwMap: Record<string, {
    cTotal: number;
    pTotal: number;
    correctionCount: number;
    breakdown: Record<string, number>;  // "from→to" → count
    lastTo: string;
    lastUpdated: string;
  }> = {};

  const rejectedCount: Record<string, number> = {};
  // pattern: "from→to" → { keywords, count }
  const patternMap: Record<string, { keywords: Set<string>; count: number }> = {};

  for (const item of history) {
    if (!item.userDecision) continue;

    // rejected 집계
    if (item.userDecision === "rejected") {
      rejectedCount[item.keyword] = (rejectedCount[item.keyword] ?? 0) + 1;
      continue;
    }

    // approved는 분류 신뢰 → 조정 없음
    if (item.userDecision === "approved") continue;

    // 실제 분류 변경인 경우만
    if (item.userDecision === item.autoClassification) continue;

    const { cDelta, pDelta } = calcDelta(item.autoClassification, item.userDecision);
    if (cDelta === 0 && pDelta === 0) continue;

    if (!kwMap[item.keyword]) {
      kwMap[item.keyword] = {
        cTotal: 0, pTotal: 0,
        correctionCount: 0,
        breakdown: {},
        lastTo: item.userDecision,
        lastUpdated: item.savedAt ?? item.date,
      };
    }

    const entry = kwMap[item.keyword];
    // 누적 (최대 ±8 캡)
    entry.cTotal = Math.max(-8, Math.min(8, entry.cTotal + cDelta));
    entry.pTotal = Math.max(-8, Math.min(8, entry.pTotal + pDelta));
    entry.correctionCount += 1;
    entry.lastTo      = item.userDecision;
    entry.lastUpdated = item.savedAt ?? item.date;

    const bKey = `${item.autoClassification}→${item.userDecision}`;
    entry.breakdown[bKey] = (entry.breakdown[bKey] ?? 0) + 1;

    // 패턴 집계
    if (!patternMap[bKey]) patternMap[bKey] = { keywords: new Set(), count: 0 };
    patternMap[bKey].keywords.add(item.keyword);
    patternMap[bKey].count += 1;
  }

  // KeywordAdjustment 빌드
  const keywordAdjustments: Record<string, KeywordAdjustment> = {};
  for (const [kw, entry] of Object.entries(kwMap)) {
    const breakdown = Object.entries(entry.breakdown).map(([key, count]) => {
      const [from, to] = key.split("→");
      return { from, to, count };
    });

    // 2회 이상 동일 방향 보정 여부
    const isCandidate = entry.correctionCount >= 2 &&
      breakdown.some((b) => b.count >= 2);

    keywordAdjustments[kw] = {
      keyword: kw,
      conservativeDelta: entry.cTotal,
      progressiveDelta:  entry.pTotal,
      correctionCount:   entry.correctionCount,
      isAutoCorrectionCandidate: isCandidate,
      correctionBreakdown: breakdown,
      lastCorrectedTo: entry.lastTo,
      lastUpdated: entry.lastUpdated,
    };
  }

  // 자동 보정 후보 (correctionCount >= 2, 상위 10개)
  const autoCorrectionCandidates = Object.values(keywordAdjustments)
    .filter((a) => a.isAutoCorrectionCandidate)
    .sort((a, b) => b.correctionCount - a.correctionCount)
    .slice(0, 10);

  // 자주 rejected (2회 이상)
  const frequentlyRejected = Object.entries(rejectedCount)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([kw]) => kw);

  // 패턴 TOP (count 기준)
  const topMisclassifiedPatterns = Object.entries(patternMap)
    .map(([key, val]) => {
      const [from, to] = key.split("→");
      return { from, to, keywords: Array.from(val.keywords), count: val.count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const correctedItems = history.filter(
    (i) => i.userDecision && i.userDecision !== "approved" && i.userDecision !== "rejected"
  );

  const result: FeedbackAdjustments = {
    generatedAt: new Date().toISOString(),
    totalDecisions: history.filter((i) => !!i.userDecision).length,
    totalCorrected: correctedItems.length,
    keywordAdjustments,
    autoCorrectionCandidates,
    frequentlyRejected,
    topMisclassifiedPatterns,
  };

  fs.writeFileSync(ADJUSTMENTS_FILE, JSON.stringify(result, null, 2), "utf-8");
  return result;
}

// =============================================
// 조정값 파일 로드 (classifyChannelFit 에서 호출)
// =============================================
export function loadAdjustments(): FeedbackAdjustments | null {
  if (!fs.existsSync(ADJUSTMENTS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(ADJUSTMENTS_FILE, "utf-8")) as FeedbackAdjustments;
  } catch {
    return null;
  }
}

// =============================================
// 피드백 템플릿 생성
// =============================================
export function saveFeedbackTemplate(
  issues: PoliticalIssue[],
  date: string
): string {
  ensureDir();

  const reviewItems = issues
    .filter((i) => i.reviewMemo !== "" || i.reviewStatus !== "approved")
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore);

  const items: FeedbackItem[] = reviewItems.map((issue) => ({
    date,
    keyword: issue.keyword,
    title: issue.title,
    autoClassification: issue.politicalSideFit,
    autoReviewStatus: issue.reviewStatus,
    fitReason: issue.fitReason,
    evidenceKeywords: issue.evidenceKeywords,
    personContextMatched: (issue as any).personContextMatched ?? [],
    userDecision: "",
    note: "",
  }));

  const template: FeedbackTemplate = {
    date,
    generatedAt: new Date().toISOString(),
    instructions:
      "userDecision 을 다음 중 하나로 변경 후 npm run political-feedback 실행: " +
      "approved | rejected | conservative_positive | progressive_positive | mixed | unclear",
    totalItems: items.length,
    items,
  };

  const filePath = path.join(FEEDBACK_DIR, `${date}-feedback-template.json`);
  fs.writeFileSync(filePath, JSON.stringify(template, null, 2), "utf-8");
  return filePath;
}

// =============================================
// 피드백 히스토리 로드
// =============================================
export function loadFeedbackHistory(): FeedbackItem[] {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8")) as FeedbackItem[];
  } catch {
    return [];
  }
}

// =============================================
// 피드백 히스토리에 추가 저장
// =============================================
export function appendFeedbackHistory(newItems: FeedbackItem[]): void {
  ensureDir();
  const existing = loadFeedbackHistory();

  const deduped = [...existing];
  for (const item of newItems) {
    const idx = deduped.findIndex(
      (e) => e.date === item.date && e.keyword === item.keyword
    );
    if (idx >= 0) {
      deduped[idx] = { ...item, savedAt: new Date().toISOString() };
    } else {
      deduped.push({ ...item, savedAt: new Date().toISOString() });
    }
  }

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(deduped, null, 2), "utf-8");
}

// =============================================
// 히스토리 요약 분석 (politicalVerifyRun 에서 사용)
// =============================================
export function analyzeHistoryPatterns(): {
  frequentlyRejected: string[];
  frequentlyMisclas:  string[];
  approvedPatterns:   string[];
} {
  const history = loadFeedbackHistory();

  const rejectedFreq: Record<string, number> = {};
  const misclasFreq:  Record<string, number> = {};
  const approvedFreq: Record<string, number> = {};

  for (const item of history) {
    if (!item.userDecision) continue;
    if (item.userDecision === "rejected") {
      rejectedFreq[item.keyword] = (rejectedFreq[item.keyword] ?? 0) + 1;
    }
    if (
      item.userDecision !== "" &&
      item.userDecision !== item.autoClassification &&
      item.userDecision !== "approved" &&
      item.userDecision !== "rejected"
    ) {
      misclasFreq[item.keyword] = (misclasFreq[item.keyword] ?? 0) + 1;
    }
    if (item.userDecision === "approved") {
      approvedFreq[item.keyword] = (approvedFreq[item.keyword] ?? 0) + 1;
    }
  }

  const topN = (freq: Record<string, number>, n: number) =>
    Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `${k}(${v}회)`);

  return {
    frequentlyRejected: topN(rejectedFreq, 5),
    frequentlyMisclas:  topN(misclasFreq,  5),
    approvedPatterns:   topN(approvedFreq, 5),
  };
}

// =============================================
// 최신 피드백 템플릿 경로 조회
// =============================================
export function getLatestFeedbackTemplate(): string | null {
  if (!fs.existsSync(FEEDBACK_DIR)) return null;
  const files = fs
    .readdirSync(FEEDBACK_DIR)
    .filter((f) => f.endsWith("-feedback-template.json"))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(FEEDBACK_DIR, files[0]) : null;
}
