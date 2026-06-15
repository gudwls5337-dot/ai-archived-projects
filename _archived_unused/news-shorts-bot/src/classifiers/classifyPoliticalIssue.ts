import { ScoredIssue } from "../types/news";

// =============================================
// 정치 이슈 판별 키워드 (기존 scoreIssues.ts 보다 확장)
// =============================================

// 강한 키워드: 1개만 있어도 정치 이슈
const POLITICS_STRONG = new Set([
  "대통령", "국회", "선거", "탄핵", "헌재", "정당", "총선", "대선",
  "여당", "야당", "국민의힘", "민주당", "정의당", "개혁신당",
  "국무총리", "대통령실", "청와대", "용산",
]);

// 중간 키워드: 1개 이상이면 정치 이슈
const POLITICS_MEDIUM = new Set([
  "국정감사", "국정조사", "특검", "공수처", "검찰", "법무부",
  "헌법재판소", "대법원", "감사원", "중앙선거관리위원회",
  "국방부", "외교부", "통일부",
  "지지율", "여론조사", "정상회담", "계엄", "개헌",
]);

// 약한 키워드: 2개 이상 있어야 정치 이슈
const POLITICS_WEAK = new Set([
  "정부", "장관", "국정", "법안", "본회의", "의결",
  "외교", "안보", "국방", "예산", "정책",
  "민생", "의원", "당대표", "원내대표",
]);

// =============================================
// 분류 결과 타입
// =============================================
export interface PoliticalClassification {
  isPolitical: boolean;
  confidence: "high" | "medium" | "low";
  matchedKeywords: string[];
  reason: string;
}

// =============================================
// 정치 이슈 여부 분류
// ScoredIssue 의 제목/키워드 텍스트 기반으로 판정
// =============================================
export function classifyPoliticalIssue(issue: ScoredIssue): PoliticalClassification {
  const text = [
    issue.clusterKeyword,
    issue.representativeTitle,
    ...issue.representativeKeywords,
    ...issue.articles.map((a) => a.title),
  ].join(" ");

  const matchedStrong: string[] = [];
  const matchedMedium: string[] = [];
  const matchedWeak: string[] = [];

  for (const kw of POLITICS_STRONG) {
    if (text.includes(kw)) matchedStrong.push(kw);
  }
  for (const kw of POLITICS_MEDIUM) {
    if (text.includes(kw)) matchedMedium.push(kw);
  }
  for (const kw of POLITICS_WEAK) {
    if (text.includes(kw)) matchedWeak.push(kw);
  }

  // 판정 1: 강한 키워드 1개 이상 → 고신뢰도
  if (matchedStrong.length >= 1) {
    return {
      isPolitical: true,
      confidence: "high",
      matchedKeywords: [...matchedStrong, ...matchedMedium].slice(0, 5),
      reason: `강한 정치 키워드 포함: ${matchedStrong.slice(0, 3).join(", ")}`,
    };
  }

  // 판정 2: 중간 키워드 1개 이상 → 중신뢰도
  if (matchedMedium.length >= 1) {
    return {
      isPolitical: true,
      confidence: "medium",
      matchedKeywords: [...matchedMedium, ...matchedWeak].slice(0, 5),
      reason: `정치 제도/기관 키워드 포함: ${matchedMedium.slice(0, 3).join(", ")}`,
    };
  }

  // 판정 3: 약한 키워드 2개 이상 → 저신뢰도
  if (matchedWeak.length >= 2) {
    return {
      isPolitical: true,
      confidence: "low",
      matchedKeywords: matchedWeak.slice(0, 5),
      reason: `약한 정치 키워드 2개 이상: ${matchedWeak.slice(0, 3).join(", ")}`,
    };
  }

  return {
    isPolitical: false,
    confidence: "low",
    matchedKeywords: [],
    reason: "정치 관련 키워드 부족",
  };
}
