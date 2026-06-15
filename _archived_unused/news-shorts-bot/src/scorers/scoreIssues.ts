import { ArticleCluster, ScoredIssue, IssueScore } from "../types/news";
import { computeKeywordOverlap } from "../parsers/clusterIssues";

// -----------------------------------------------
// 숏츠에 어울리는 이슈성 키워드 목록
// 이 단어가 제목에 있으면 shortsFitScore 가산
// -----------------------------------------------
const SHORTS_KEYWORDS = [
  "터졌다", "충격", "논란", "위기", "폭로", "최초", "단독",
  "긴급", "속보", "사망", "구속", "파산", "역대", "최대",
  "돌파", "붕괴", "폭등", "폭락", "급등", "급락",
  "AI", "GPT", "로봇", "반도체", "배터리", "우주",
];

// -----------------------------------------------
// 1. sourceDiversityScore (0~25점)
//    1개→5점 / 2개→11점 / 3개→18점 / 4개+→25점
// -----------------------------------------------
function calcSourceDiversity(sources: string[]): number {
  const uniqueCount = new Set(sources).size;
  if (uniqueCount >= 4) return 25;
  if (uniqueCount === 3) return 18;
  if (uniqueCount === 2) return 11;
  return 5;
}

// -----------------------------------------------
// 2. freshnessScore (0~25점)
//    1시간 이내 = 25점, 24시간 이후 = 0점
// -----------------------------------------------
function calcFreshness(pubDates: string[]): number {
  const validDates = pubDates
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t));

  if (validDates.length === 0) return 0;

  const latest = Math.max(...validDates);
  const ageHours = (Date.now() - latest) / (1000 * 60 * 60);

  if (ageHours <= 1) return 25;
  if (ageHours >= 24) return 0;
  return Math.round(25 * (1 - (ageHours - 1) / 23));
}

// -----------------------------------------------
// 3. keywordRepeatScore (0~25점) — 로그 스케일
//    1개→12점 / 2개→19점 / 3개+→24점 / 4개+→25점
// -----------------------------------------------
function calcKeywordRepeat(articleCount: number): number {
  return Math.min(25, Math.round(Math.log2(articleCount + 1) * 12));
}

// -----------------------------------------------
// 4. shortsFitScore (0~25점)
//    이슈성 키워드 포함 여부 + 제목 길이
// -----------------------------------------------
function calcShortsFit(titles: string[]): number {
  let keywordHits = 0;
  for (const title of titles) {
    for (const kw of SHORTS_KEYWORDS) {
      if (title.includes(kw)) {
        keywordHits++;
        break;
      }
    }
  }
  const keywordScore = Math.min(15, Math.round((keywordHits / titles.length) * 15));

  const avgLength = titles.reduce((sum, t) => sum + t.length, 0) / titles.length;
  const lengthScore = avgLength <= 20 ? 10 : Math.max(0, Math.round(10 - (avgLength - 20) / 3));

  return keywordScore + lengthScore;
}

// -----------------------------------------------
// 5. briefPenalty (0 또는 음수)
//    기사 1개짜리 단독 클러스터: -8점
//    설명 평균 30자 미만 단신성 클러스터: -5점
// -----------------------------------------------
function calcBriefPenalty(articleCount: number, descriptions: string[]): number {
  const avgDescLen =
    descriptions.reduce((s, d) => s + (d?.length ?? 0), 0) / descriptions.length;

  if (articleCount === 1) return -8;
  if (avgDescLen < 30) return -5;
  return 0;
}

// -----------------------------------------------
// 클러스터 하나를 ScoredIssue 로 변환
// -----------------------------------------------
function scoreCluster(cluster: ArticleCluster): ScoredIssue {
  const { articles, clusterKeyword, topKeywords } = cluster;

  const sources = articles.map((a) => a.source);
  const pubDates = articles.map((a) => a.pubDate);
  const titles = articles.map((a) => a.title);
  const descriptions = articles.map((a) => a.description ?? "");

  const sourceDiversityScore = calcSourceDiversity(sources);
  const freshnessScore = calcFreshness(pubDates);
  const keywordRepeatScore = calcKeywordRepeat(articles.length);
  const shortsFitScore = calcShortsFit(titles);
  const briefPenalty = calcBriefPenalty(articles.length, descriptions);

  const rawScore = sourceDiversityScore + freshnessScore + keywordRepeatScore + shortsFitScore;
  const finalScore = Math.max(0, rawScore + briefPenalty);

  const score: IssueScore = {
    sourceDiversityScore,
    freshnessScore,
    keywordRepeatScore,
    shortsFitScore,
    briefPenalty,
    finalScore,
  };

  const latestArticle = [...articles].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  )[0];

  const uniqueSources = [...new Set(sources)];
  const latestPubDate = pubDates.reduce((latest, d) =>
    new Date(d) > new Date(latest) ? d : latest
  );

  return {
    rank: 0,
    clusterKeyword,
    representativeTitle: latestArticle.title,
    // originalLink 있으면 원본 기사 URL 우선 사용, 없으면 link 사용
    representativeUrl: latestArticle.originalLink ?? latestArticle.link,
    representativeKeywords: topKeywords,
    articleCount: articles.length,
    sourceCount: uniqueSources.length,
    sources: uniqueSources,
    latestPubDate,
    score,
    articles,
    commentMeta: null,  // morningRun 에서 수집 후 채워짐
    // dedup 기본값 — markNearDuplicates 에서 덮어씀
    duplicateGroupId: null,
    duplicateLevel: "none",
    isNearDuplicate: false,
  };
}

// -----------------------------------------------
// 두 ScoredIssue 사이의 유사도 수준 판정
//
// 기준:
//   near-duplicate : clusterKeyword 동일
//                    OR representativeKeywords 2개 이상 공통
//   similar        : representativeKeywords 1개 공통 + 해당 단어 4글자 이상
//   none           : 그 외
// -----------------------------------------------
function computeDuplicateLevel(
  a: ScoredIssue,
  b: ScoredIssue
): "none" | "similar" | "near-duplicate" {
  if (a.clusterKeyword === b.clusterKeyword) return "near-duplicate";

  const { count, maxLen } = computeKeywordOverlap(
    a.representativeKeywords,
    b.representativeKeywords
  );

  if (count >= 2) return "near-duplicate";
  if (count === 1 && maxLen >= 4) return "similar";
  return "none";
}

// -----------------------------------------------
// 상위 N개 이슈끼리 2차 유사도 체크
//
// - 순위가 좋은 이슈(낮은 rank)가 기준이 됨
// - 하위 이슈에만 isNearDuplicate: true 표시
//   (상위 이슈가 "원본", 하위 이슈가 "중복")
// - 같은 그룹에는 동일한 duplicateGroupId 부여
// -----------------------------------------------
export function markNearDuplicates(issues: ScoredIssue[]): ScoredIssue[] {
  const n = issues.length;
  const groupIds: (number | null)[] = new Array(n).fill(null);
  const levels: ("none" | "similar" | "near-duplicate")[] = new Array(n).fill("none");
  const isDup: boolean[] = new Array(n).fill(false);

  let nextGroupId = 1;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const level = computeDuplicateLevel(issues[i], issues[j]);
      if (level === "none") continue;

      // 기존 그룹이 있으면 이어받고, 없으면 새 그룹 생성
      const existingGroupId = groupIds[i] ?? groupIds[j];
      const gid = existingGroupId ?? nextGroupId++;

      groupIds[i] = gid;
      groupIds[j] = gid;

      // i(상위)는 레벨 기록, isDup은 변경 안 함 (원본)
      if (levels[i] !== "near-duplicate") levels[i] = level;

      // j(하위)는 레벨 기록 + near-duplicate면 isDup 플래그
      levels[j] = level;
      if (level === "near-duplicate") isDup[j] = true;
    }
  }

  return issues.map((iss, idx) => ({
    ...iss,
    duplicateGroupId: groupIds[idx],
    duplicateLevel: levels[idx],
    isNearDuplicate: isDup[idx],
  }));
}

// -----------------------------------------------
// 정치 이슈 판별용 키워드
//
// 강한 키워드: 1개만 있어도 정치 이슈로 인정
// 약한 키워드: 2개 이상 있어야 정치 이슈로 인정
// -----------------------------------------------
const POLITICS_STRONG = new Set([
  "대통령", "국회", "선거", "탄핵", "헌재", "정당", "총선", "대선", "여당", "야당",
]);

const POLITICS_WEAK = new Set([
  "정부", "후보", "국정", "청와대", "용산", "장관", "국무회의", "법안", "본회의",
  "의결", "외교", "안보", "국방", "정상회담", "지지율", "정책", "예산", "검찰",
  "공수처", "감사원", "법원",
]);

function isPoliticsIssue(issue: ScoredIssue): boolean {
  const text = [
    issue.clusterKeyword,
    issue.representativeTitle,
    ...issue.representativeKeywords,
    ...issue.articles.map((a) => a.title),
  ].join(" ");

  for (const kw of POLITICS_STRONG) {
    if (text.includes(kw)) return true;
  }

  let weakCount = 0;
  for (const kw of POLITICS_WEAK) {
    if (text.includes(kw)) {
      weakCount++;
      if (weakCount >= 2) return true;
    }
  }
  return false;
}

// -----------------------------------------------
// 메인 함수: 클러스터 목록 → 점수 계산 → 정렬 → 상위 N개 반환
//            → 2차 유사도 체크까지 자동 실행
// -----------------------------------------------
export function scoreAndRank(
  clusters: ArticleCluster[],
  topN: number = 20
): ScoredIssue[] {
  const scored = clusters.map(scoreCluster);
  scored.sort((a, b) => b.score.finalScore - a.score.finalScore);

  const politicsIssues = scored.filter(isPoliticsIssue);

  const topIssues = politicsIssues.slice(0, topN).map((issue, i) => ({
    ...issue,
    rank: i + 1,
  }));

  return markNearDuplicates(topIssues);
}
