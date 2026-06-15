// =============================================
// Step 1: 수집 직후의 원본 뉴스 타입
// =============================================

export interface NewsItem {
  title: string;
  link: string;
  originalLink?: string;  // 네이버 API의 originallink (원본 기사 URL)
  description: string;
  pubDate: string;
  source: string;
  category?: string;
}

export interface CollectResult {
  collectedAt: string;
  totalCount: number;
  items: NewsItem[];
}

// =============================================
// Step 2: 전처리 후 정리된 뉴스 타입
// =============================================

export interface ProcessedArticle {
  title: string;
  link: string;
  originalLink?: string;  // 원본 기사 URL (네이버 API 수집 시 제공)
  description: string;
  pubDate: string;      // ISO 8601
  source: string;
  category?: string;
}

export interface ProcessResult {
  processedAt: string;
  rawCount: number;
  processedCount: number;
  removedDuplicates: number;
  items: ProcessedArticle[];
}

// =============================================
// Step 3: 클러스터링 + 점수화 타입
// =============================================

export interface ArticleCluster {
  clusterKeyword: string;
  topKeywords: string[];   // 빈도 상위 키워드 (최대 3개)
  articles: ProcessedArticle[];
}

export interface IssueScore {
  sourceDiversityScore: number;
  freshnessScore: number;
  keywordRepeatScore: number;
  shortsFitScore: number;
  briefPenalty: number;    // 단신 페널티 (0 또는 음수)
  finalScore: number;
}

// =============================================
// 댓글/반응 메타데이터
// 수집 가능한 경우에만 채워짐 — 불가능하면 null
// =============================================
export interface TopComment {
  author:     string | null;  // 작성자 닉네임 (없으면 null)
  content:    string;         // 댓글 내용
  likeCount:  number | null;  // 좋아요 수
  replyCount: number | null;  // 답글 수
}

export interface CommentMeta {
  totalCommentCount:  number | null;   // 전체 댓글 수
  totalLikeCount:     number | null;   // 기사 공감(좋아요) 수
  totalDislikeCount:  number | null;   // 기사 비공감(싫어요) 수
  topComments:        TopComment[];    // 반응 상위 댓글 최대 5개
  commentSource:      string;          // 댓글이 수집된 사이트 도메인
  commentCollectedAt: string;          // 수집 시각 (ISO 8601)
}

export interface ScoredIssue {
  rank: number;
  clusterKeyword: string;
  representativeTitle: string;
  representativeKeywords: string[];  // 이슈 대표 키워드 (최대 3개)
  representativeUrl: string;         // 대표 기사 URL
  articleCount: number;
  sourceCount: number;               // 고유 출처 수
  sources: string[];
  latestPubDate: string;
  score: IssueScore;
  articles: ProcessedArticle[];
  commentMeta: CommentMeta | null;   // 댓글 메타 (수집 성공 시만 채워짐)
  // 2차 유사도 체크 결과
  duplicateGroupId: number | null;                         // 같은 그룹이면 같은 숫자
  duplicateLevel: "none" | "similar" | "near-duplicate";  // 유사도 수준
  isNearDuplicate: boolean;                                // 상위 이슈의 근중복 여부
}

export interface RankResult {
  rankedAt: string;
  totalIssues: number;
  topN: number;
  items: ScoredIssue[];
}

// =============================================
// Step 4: 숏츠 제작용 문안 패키지 타입
// =============================================

// 이슈 한 건에 대한 숏츠 제작 문안 전체
export interface ShortsPackage {
  rank: number;                  // 원본 이슈 순위
  clusterKeyword: string;        // 대표 키워드
  representativeTitle: string;   // 대표 기사 제목
  representativeUrl: string;     // 대표 기사 URL

  summary: string;               // 30초용 핵심 요약 (80~120자)
  titleCandidates: string[];     // 영상 제목 후보 3개
  hooks: string[];               // 오프닝 훅 문구 3개
  description: string;           // 영상 설명문 (유튜브 description 용)
  hashtags: string[];            // 해시태그 10개
  thumbnailTexts: string[];      // 썸네일에 넣을 짧은 문구 3개
  screenIdeas: string[];         // 화면 연출 아이디어 3개

  riskNotes?: string;            // 민감 이슈일 때만 추가되는 주의사항
  commentMeta: CommentMeta | null; // 댓글 메타 (수집 성공 시만)

  sourceCount: number;           // 참고 출처 수
  sources: string[];             // 참고 출처 목록
  generatedAt: string;           // 문안 생성 시각
  // 2차 유사도 체크 결과 (ScoredIssue에서 전파)
  duplicateGroupId: number | null;
  duplicateLevel: "none" | "similar" | "near-duplicate";
  isNearDuplicate: boolean;
}

// Step 4 저장 결과 전체
export interface ShortsResult {
  generatedAt: string;
  totalPackages: number;
  items: ShortsPackage[];
}
