import { ProcessedArticle, TopComment } from "./news";

// =============================================
// 채널 적합도 타입
// =============================================
export type ChannelFit =
  | "conservative_positive"
  | "progressive_positive"
  | "mixed"
  | "unclear";

// =============================================
// 민감도 수준
// =============================================
export type SensitivityLevel = "low" | "medium" | "high";

// =============================================
// YouTube 신호 타입
// =============================================
export interface YoutubeSignal {
  searchKeyword: string;
  estimatedVideoCount: number;
  topVideoTitles: string[];
  signalStrength: "none" | "low" | "medium" | "high";
  collectedAt: string;
}

// =============================================
// Reddit 신호 타입
// =============================================
export interface RedditSignal {
  searchKeyword: string;
  postCount: number;
  topPostTitles: string[];
  signalStrength: "none" | "low" | "medium" | "high";
  collectedAt: string;
}

// =============================================
// 정치 이슈 점수 세분화
// =============================================
export interface PoliticalIssueScore {
  sourceDiversity: number;    // 0~20: 출처 다양성
  freshness: number;          // 0~20: 최신성
  reactionIntensity: number;  // 0~20: 반응 강도 (댓글/좋아요)
  politicalRelevance: number; // 0~20: 정치 관련도
  channelFit: number;         // 0~10: 채널 적합도 명확성
  shortsPotential: number;    // 0~10: 숏폼 제작 잠재력
  duplicatePenalty: number;   // 0 또는 음수
  finalScore: number;         // 합계
}

// =============================================
// 정치 이슈 메인 타입
// =============================================
export interface PoliticalIssue {
  rank: number;
  title: string;              // 대표 기사 제목
  keyword: string;            // 클러스터 대표 키워드
  sources: string[];          // 출처 목록 (중복 제거)
  sourceCount: number;        // 고유 출처 수
  articleCount: number;       // 기사 수
  representativeUrl: string;  // 대표 기사 URL
  topComments: TopComment[];  // 주요 댓글 (최대 5개)
  reactionScore: number;      // 반응 강도 점수 (0~100 정규화)
  youtubeSignal: YoutubeSignal | null;
  redditSignal: RedditSignal | null;
  politicalSideFit: ChannelFit;
  fitReason: string;          // 채널 분류 근거 설명
  evidenceKeywords: string[]; // 채널 분류 근거 키워드
  shortsPotential: number;    // 숏폼 잠재력 (0~100 정규화)
  sensitivityLevel: SensitivityLevel;
  reviewMemo: string;         // 검토 필요 이유 (빈 문자열 = 검토 불필요)
  reviewStatus: ReviewStatus; // 검토 상태 (자동 초기값, 사람이 변경 가능)
  oneLineSummary:    string;  // 이슈 한 줄 요약
  channelWhyItFits:  string;  // 해당 채널에 맞는 이유
  thumbnailKeywords: string[]; // 썸네일 후보 키워드 (최대 5개)
  videoRiskNote:     string;  // 영상 제작 리스크 메모
  titleIdea:         string;  // 영상 제목 아이디어
  hookIdea:          string;  // 영상 도입부 훅 문장
  angleNote:         string;  // 콘텐츠 접근 방향 메모
  scores: PoliticalIssueScore;
  articles: ProcessedArticle[];
  latestPubDate: string;
  collectedAt: string;
}

// =============================================
// 파이프라인 결과 요약
// =============================================
export interface PoliticalResearchSummary {
  conservativePositiveCount: number;
  progressivePositiveCount: number;
  mixedCount: number;
  unclearCount: number;
  highSensitivityCount: number;
  reviewQueueCount: number;
  topKeywords: string[];      // 상위 5개 키워드
}

// =============================================
// 검토 상태 — 사람이 엑셀에서 직접 편집 가능
// =============================================
export type ReviewStatus = "approved" | "review_needed" | "rejected";

// =============================================
// 파이프라인 전체 결과
// =============================================
export interface PoliticalResearchResult {
  researchedAt: string;
  totalIssues: number;
  issues: PoliticalIssue[];
  summary: PoliticalResearchSummary;
}
