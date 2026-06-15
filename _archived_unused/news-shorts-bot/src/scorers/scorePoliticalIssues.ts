import { ScoredIssue } from "../types/news";
import { PoliticalIssueScore, ChannelFit } from "../types/political";
import { ChannelFitResult } from "../classifiers/classifyChannelFit";

// -----------------------------------------------
// 1. sourceDiversity (0~20)
//    출처 수에 따라 단계적 가중
// -----------------------------------------------
function calcSourceDiversity(sources: string[]): number {
  const unique = new Set(sources).size;
  if (unique >= 5) return 20;
  if (unique === 4) return 16;
  if (unique === 3) return 12;
  if (unique === 2) return 7;
  return 3;
}

// -----------------------------------------------
// 2. freshness (0~20)
//    1시간 이내 = 20점, 24시간 이후 = 0점
// -----------------------------------------------
function calcFreshness(latestPubDate: string): number {
  const t = new Date(latestPubDate).getTime();
  if (isNaN(t)) return 0;
  const ageHours = (Date.now() - t) / (1000 * 60 * 60);
  if (ageHours <= 1)  return 20;
  if (ageHours >= 24) return 0;
  return Math.round(20 * (1 - (ageHours - 1) / 23));
}

// -----------------------------------------------
// 3. reactionIntensity (0~20)
//    댓글 수 + 좋아요 수 기반 (수집 실패 시 기본값 5)
// -----------------------------------------------
function calcReactionIntensity(issue: ScoredIssue): number {
  const meta = issue.commentMeta;
  if (!meta) return 5; // 수집 불가 → 기본값 (사이트 차단 정상)

  const comments = meta.totalCommentCount ?? 0;
  const likes    = meta.totalLikeCount    ?? 0;
  const total    = comments + likes;

  if (total >= 10000) return 20;
  if (total >= 5000)  return 17;
  if (total >= 1000)  return 13;
  if (total >= 500)   return 9;
  if (total >= 100)   return 6;
  if (total > 0)      return 3;
  return 2;
}

// -----------------------------------------------
// 4. politicalRelevance (0~20)
//    정치 키워드 매칭 수 + 기사 볼륨 복합
// -----------------------------------------------
function calcPoliticalRelevance(issue: ScoredIssue, matchedKeywords: string[]): number {
  const density     = matchedKeywords.length;
  const keywordScore = Math.min(12, density * 3);
  const volumeScore  = Math.min(8, Math.floor(Math.log2(issue.articleCount + 1) * 4));
  return keywordScore + volumeScore;
}

// -----------------------------------------------
// 5. channelFit (0~10)
//    명확한 분류일수록 높은 점수
// -----------------------------------------------
function calcChannelFit(fit: ChannelFit): number {
  if (fit === "conservative_positive" || fit === "progressive_positive") return 10;
  if (fit === "mixed")    return 5;
  return 0; // unclear
}

// -----------------------------------------------
// 6. shortsPotential (0~10)
//    숏폼 이슈성 키워드 + 출처 수 보너스
// -----------------------------------------------
const SHORTS_POTENTIAL_KEYWORDS = [
  "터졌다", "충격", "논란", "위기", "폭로", "단독", "긴급", "속보",
  "파문", "경악", "분노", "환호", "반전", "폭탄", "직격", "파장",
];

function calcShortsPotential(issue: ScoredIssue): number {
  const text = [
    issue.representativeTitle,
    ...issue.articles.map((a) => a.title),
  ].join(" ");

  const hits        = SHORTS_POTENTIAL_KEYWORDS.filter((kw) => text.includes(kw)).length;
  const keywordScore = Math.min(6, hits * 2);
  const sourceBonus  = issue.sourceCount >= 3 ? 4 : issue.sourceCount >= 2 ? 2 : 0;
  return Math.min(10, keywordScore + sourceBonus);
}

// -----------------------------------------------
// 7. duplicatePenalty (0 또는 음수)
//    근중복 이슈는 페널티 부여
// -----------------------------------------------
function calcDuplicatePenalty(issue: ScoredIssue): number {
  if (issue.isNearDuplicate)              return -15;
  if (issue.duplicateLevel === "similar") return -5;
  return 0;
}

// -----------------------------------------------
// 메인: ScoredIssue + 채널분류 결과 → PoliticalIssueScore
// -----------------------------------------------
export function scorePoliticalIssue(
  issue: ScoredIssue,
  channelFit: ChannelFitResult,
  matchedKeywords: string[]
): PoliticalIssueScore {
  const sourceDiversity   = calcSourceDiversity(issue.sources);
  const freshness         = calcFreshness(issue.latestPubDate);
  const reactionIntensity = calcReactionIntensity(issue);
  const politicalRelevance = calcPoliticalRelevance(issue, matchedKeywords);
  const channelFitScore   = calcChannelFit(channelFit.fit);
  const shortsPotential   = calcShortsPotential(issue);
  const duplicatePenalty  = calcDuplicatePenalty(issue);

  const rawScore = sourceDiversity + freshness + reactionIntensity +
                   politicalRelevance + channelFitScore + shortsPotential;
  const finalScore = Math.max(0, rawScore + duplicatePenalty);

  return {
    sourceDiversity,
    freshness,
    reactionIntensity,
    politicalRelevance,
    channelFit: channelFitScore,
    shortsPotential,
    duplicatePenalty,
    finalScore,
  };
}

// -----------------------------------------------
// 리뷰 메모 자동 생성
// 평가 기준 미달 항목을 파악해 문자열로 반환
// 빈 문자열 = 검토 불필요
// -----------------------------------------------
export function generateReviewMemo(
  issue: ScoredIssue,
  scores: PoliticalIssueScore,
  channelFit: ChannelFitResult,
  matchedKeywords: string[]
): string {
  const reasons: string[] = [];

  // 평가 기준 1: 진짜 정치 이슈인가
  if (matchedKeywords.length === 0) {
    reasons.push("정치 키워드 근거 없음");
  }

  // 평가 기준 2: 출처와 반응 근거가 충분한가
  if (issue.sourceCount < 2) {
    reasons.push("출처 단독(1건) — 단독 보도 확인 필요");
  }
  if (issue.articleCount === 1) {
    reasons.push("기사 1건 — 이슈화 여부 불확실");
  }

  // 평가 기준 3: 중복이 과도하지 않은가
  if (issue.isNearDuplicate) {
    reasons.push(`근중복 이슈 (그룹 ${issue.duplicateGroupId ?? "?"}) — 상위 이슈와 통합 검토`);
  }

  // 평가 기준 4: 보수/진보 채널 분류 이유가 설명되는가
  if (channelFit.reviewMemo) {
    reasons.push(channelFit.reviewMemo);
  }

  // 평가 기준 5: 영상 기획 참고용으로 충분한가
  if (scores.shortsPotential < 3 && issue.articleCount < 3) {
    reasons.push("숏폼 활용도 낮음 — 이슈 강도 약함");
  }

  return reasons.join(" | ");
}
