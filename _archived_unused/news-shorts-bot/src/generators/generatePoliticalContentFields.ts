/**
 * 정치 이슈 실전 필드 생성
 * 규칙 기반 (AI API 미사용)
 *
 * 생성 필드:
 *   oneLineSummary    — 이슈 한 줄 요약
 *   channelWhyItFits  — 해당 채널에 맞는 이유
 *   thumbnailKeywords — 썸네일 후보 키워드
 *   videoRiskNote     — 영상 제작 리스크 메모
 */

import { ScoredIssue } from "../types/news";
import { ChannelFitResult } from "../classifiers/classifyChannelFit";

export interface ContentFields {
  oneLineSummary:    string;
  channelWhyItFits:  string;
  thumbnailKeywords: string[];
  videoRiskNote:     string;
  titleIdea:         string;
  hookIdea:          string;
  angleNote:         string;
}

// ─────────────────────────────────────────────
// 제목 축약 (말줄임표 포함 maxLen 이하)
// ─────────────────────────────────────────────
function shortTitle(title: string, maxLen = 38): string {
  if (title.length <= maxLen) return title;
  return title.slice(0, maxLen - 1) + "…";
}

// ─────────────────────────────────────────────
// oneLineSummary
// 형식: {keyword} — {출처 수} | {핵심 제목}
// ─────────────────────────────────────────────
function buildOneLineSummary(issue: ScoredIssue): string {
  const srcLabel =
    issue.sourceCount >= 4 ? `${issue.sourceCount}개 매체` :
    issue.sourceCount === 3 ? "3개 매체" :
    issue.sourceCount === 2 ? "2개 매체" :
    "단독 보도";
  return `${issue.clusterKeyword} — ${srcLabel} | ${shortTitle(issue.representativeTitle)}`;
}

// ─────────────────────────────────────────────
// channelWhyItFits
// 채널 분류 결과 + 근거 키워드 기반 자연어 설명
// ─────────────────────────────────────────────
function buildChannelWhyItFits(channelFit: ChannelFitResult): string {
  // 피드백보정 태그, 인물+조합 태그 제외한 순수 키워드만
  const kws = channelFit.evidenceKeywords
    .filter((k) => !k.includes("+") && !k.includes("[") && !k.includes("피드백"))
    .slice(0, 3)
    .join(", ");

  switch (channelFit.fit) {
    case "conservative_positive":
      return kws
        ? `보수 시청자 관심 키워드 포함 (${kws})`
        : "안보·경제·법치 관련 이슈 — 보수채널 적합";
    case "progressive_positive":
      return kws
        ? `진보 시청자 관심 키워드 포함 (${kws})`
        : "개혁·복지·인권 관련 이슈 — 진보채널 적합";
    case "mixed":
      return "여야 모두 관심 이슈 — 양쪽 채널 테스트 권장, 단독 사용 주의";
    default:
      return "채널 미분류 — 콘텐츠 방향 결정 후 사용 권장";
  }
}

// ─────────────────────────────────────────────
// thumbnailKeywords
// clusterKeyword + representativeKeywords 짧은 것 + evidenceKeywords 순수 항목
// 최대 5개, 중복 제거
// ─────────────────────────────────────────────
function buildThumbnailKeywords(issue: ScoredIssue, channelFit: ChannelFitResult): string[] {
  const result: string[] = [issue.clusterKeyword];

  // 짧고 임팩트 있는 representativeKeywords
  issue.representativeKeywords
    .filter((k) => k.length <= 6 && k !== issue.clusterKeyword)
    .slice(0, 3)
    .forEach((k) => result.push(k));

  // 순수 evidenceKeywords (조합/태그 제외)
  channelFit.evidenceKeywords
    .filter((k) => !k.includes("+") && !k.includes("[") && !k.includes("피드백") && k !== issue.clusterKeyword)
    .slice(0, 2)
    .forEach((k) => result.push(k));

  return [...new Set(result)].slice(0, 5);
}

// ─────────────────────────────────────────────
// videoRiskNote
// 민감도 + 채널 분류 + 출처 단수 + 기사 수 기반 리스크 문자열
// ─────────────────────────────────────────────
function buildVideoRiskNote(issue: ScoredIssue, channelFit: ChannelFitResult): string {
  const risks: string[] = [];

  if (channelFit.sensitivityLevel === "high") {
    risks.push("고민감도 — 자극적 표현 주의");
  } else if (channelFit.sensitivityLevel === "medium") {
    risks.push("중민감도 — 맥락 설명 권장");
  }

  if (channelFit.fit === "mixed") {
    risks.push("양측 반응 유발 가능 — 댓글 관리 필요");
  }

  if (issue.sourceCount < 2) {
    risks.push("단독 보도 — 사실 확인 필요");
  }

  if (issue.articleCount === 1) {
    risks.push("기사 1건 — 이슈 지속성 불확실");
  }

  return risks.length > 0 ? risks.join(" / ") : "특이 리스크 없음";
}

// ─────────────────────────────────────────────
// titleIdea
// 채널 적합도 + 키워드 기반 영상 제목 후보
// ─────────────────────────────────────────────
function buildTitleIdea(issue: ScoredIssue, channelFit: ChannelFitResult): string {
  const kw = issue.clusterKeyword;
  switch (channelFit.fit) {
    case "conservative_positive":
      return `${kw}, 지금 당장 알아야 할 진실`;
    case "progressive_positive":
      return `${kw}, 왜 지금 바꿔야 하는가`;
    case "mixed":
      return `${kw} 쟁점 총정리 — 찬반 양론`;
    default:
      return `${kw} 지금 무슨 일이`;
  }
}

// ─────────────────────────────────────────────
// hookIdea
// 민감도 + 채널 분류 기반 도입부 훅 문장
// ─────────────────────────────────────────────
function buildHookIdea(issue: ScoredIssue, channelFit: ChannelFitResult): string {
  const kw = issue.clusterKeyword;
  if (channelFit.sensitivityLevel === "high") {
    return `"${kw}, 이 내용 지금 바로 확인하셔야 합니다."`;
  }
  switch (channelFit.fit) {
    case "conservative_positive":
      return `"${kw}에 대해 우리가 몰랐던 사실, 지금 공개합니다."`;
    case "progressive_positive":
      return `"${kw}, 이대로 둬도 괜찮을까요? 지금 짚어봅니다."`;
    case "mixed":
      return `"${kw}를 둘러싼 논란, 양쪽 입장을 직접 비교합니다."`;
    default:
      return `"${kw}, 지금 어떤 상황인지 3분만에 정리해드립니다."`;
  }
}

// ─────────────────────────────────────────────
// angleNote
// 채널 분류 + 근거 키워드 기반 콘텐츠 접근 방향
// ─────────────────────────────────────────────
function buildAngleNote(channelFit: ChannelFitResult): string {
  const kws = channelFit.evidenceKeywords
    .filter((k) => !k.includes("+") && !k.includes("[") && !k.includes("피드백"))
    .slice(0, 2)
    .join(", ");

  switch (channelFit.fit) {
    case "conservative_positive":
      return kws
        ? `보수 관점 — ${kws} 비판·우려 중심 편집`
        : "보수 관점 — 안보·법치·경제 비판 중심 편집";
    case "progressive_positive":
      return kws
        ? `진보 관점 — ${kws} 개혁·촉구 중심 편집`
        : "진보 관점 — 개혁·복지·인권 촉구 중심 편집";
    case "mixed":
      return "중립 비교 앵글 — 찬반 균형 편집, 자극 표현 최소화";
    default:
      return "중립 사실 전달 — 입장 없이 현황 위주 편집";
  }
}

// ─────────────────────────────────────────────
// 메인 exports
// ─────────────────────────────────────────────
export function generateContentFields(
  issue: ScoredIssue,
  channelFit: ChannelFitResult
): ContentFields {
  return {
    oneLineSummary:    buildOneLineSummary(issue),
    channelWhyItFits:  buildChannelWhyItFits(channelFit),
    thumbnailKeywords: buildThumbnailKeywords(issue, channelFit),
    videoRiskNote:     buildVideoRiskNote(issue, channelFit),
    titleIdea:         buildTitleIdea(issue, channelFit),
    hookIdea:          buildHookIdea(issue, channelFit),
    angleNote:         buildAngleNote(channelFit),
  };
}
