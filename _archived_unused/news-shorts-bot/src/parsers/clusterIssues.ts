import { ProcessedArticle, ArticleCluster } from "../types/news";

// -----------------------------------------------
// 한국어 불용어 목록
// 이 단어들은 키워드로 사용하지 않음
// -----------------------------------------------
const STOPWORDS = new Set([
  "이", "가", "을", "를", "의", "에", "에서", "은", "는", "과", "와",
  "로", "으로", "도", "만", "까지", "부터", "이다", "있다", "없다",
  "하다", "되다", "대한", "위한", "통해", "위해", "관련", "및",
  "등", "또", "더", "이번", "지난", "올해", "내년", "오늘", "어제",
  "내일", "이후", "이전", "한국", "국내", "국외", "글로벌",
  "공개", "발표", "진행", "시작", "예정", "계획", "추진",
  "대표", "기자", "뉴스", "보도", "기사", "전문", "전체",
  // 과도한 단어 1개 클러스터링을 유발하는 범용 단어 추가
  "정부", "업계", "시장", "경제", "사회", "문화", "정치",
  "기업", "회사", "서비스", "사업", "분야", "지역", "상황",
  "문제", "결과", "영향", "효과", "방안", "방법", "방향",
]);

// -----------------------------------------------
// 제목에서 유효한 키워드 추출
// - 2글자 이상
// - 불용어 제외
// - 숫자만인 단어 제외
// -----------------------------------------------
export function extractKeywords(title: string): string[] {
  const tokens = title
    .replace(/[^\w\sㄱ-힣]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return tokens.filter(
    (t) =>
      t.length >= 2 &&
      !STOPWORDS.has(t) &&
      !/^\d+$/.test(t)
  );
}

// -----------------------------------------------
// 두 키워드 집합 사이에 겹치는 단어 수 반환
// -----------------------------------------------
function countOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const word of a) {
    if (b.has(word)) count++;
  }
  return count;
}

// -----------------------------------------------
// 두 키워드 배열 사이의 겹침 정보 반환 (외부 재사용용)
// - count: 겹치는 단어 수
// - maxLen: 겹치는 단어 중 가장 긴 글자 수
// -----------------------------------------------
export function computeKeywordOverlap(
  a: string[],
  b: string[]
): { count: number; maxLen: number } {
  const setB = new Set(b);
  let count = 0;
  let maxLen = 0;
  for (const word of a) {
    if (setB.has(word)) {
      count++;
      if (word.length > maxLen) maxLen = word.length;
    }
  }
  return { count, maxLen };
}

// -----------------------------------------------
// 겹치는 키워드 중 가장 긴 단어 길이 반환
// -----------------------------------------------
function maxOverlapWordLength(a: Set<string>, b: Set<string>): number {
  let maxLen = 0;
  for (const word of a) {
    if (b.has(word) && word.length > maxLen) maxLen = word.length;
  }
  return maxLen;
}

// -----------------------------------------------
// 기사 목록을 비슷한 주제끼리 묶기
//
// 알고리즘 (탐욕적 방식):
//   1. 첫 번째 기사로 첫 번째 클러스터 생성
//   2. 이후 기사마다 기존 클러스터 키워드와 비교
//   3. 공통 키워드 판정:
//      - 기본 기준: 공통 키워드 2개 이상 (MIN_OVERLAP)
//      - 예외 허용: 공통 키워드가 1개라도 4글자 이상이면 동일 이슈로 인정
//        (예: "삼성전자", "인공지능"처럼 구체적인 고유 명사)
//   4. 기준 충족 시 기존 클러스터에 합류, 미충족 시 새 클러스터 생성
// -----------------------------------------------
const MIN_OVERLAP = 2;           // 공통 키워드 최소 개수 (1→2로 상향)
const LONG_KEYWORD_LENGTH = 4;   // 긴 키워드 기준: 4글자 이상이면 1개만 겹쳐도 허용

export function clusterIssues(articles: ProcessedArticle[]): ArticleCluster[] {
  const clusters: { keywords: Set<string>; articles: ProcessedArticle[] }[] = [];

  for (const article of articles) {
    const articleKeywords = new Set(extractKeywords(article.title));

    if (articleKeywords.size === 0) {
      clusters.push({ keywords: articleKeywords, articles: [article] });
      continue;
    }

    let bestClusterIdx = -1;
    let bestOverlap = 0;
    let bestMaxWordLen = 0;

    for (let i = 0; i < clusters.length; i++) {
      const overlap = countOverlap(articleKeywords, clusters[i].keywords);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMaxWordLen = maxOverlapWordLength(articleKeywords, clusters[i].keywords);
        bestClusterIdx = i;
      } else if (overlap === bestOverlap && overlap > 0) {
        // 겹침 수가 같으면 가장 긴 단어를 공유하는 쪽 우선
        const wordLen = maxOverlapWordLength(articleKeywords, clusters[i].keywords);
        if (wordLen > bestMaxWordLen) {
          bestMaxWordLen = wordLen;
          bestClusterIdx = i;
        }
      }
    }

    // 클러스터 합류 판정:
    //   - 공통 키워드 2개 이상 → 합류
    //   - 공통 키워드 1개 + 해당 단어가 4글자 이상 → 합류
    const shouldMerge =
      bestOverlap >= MIN_OVERLAP ||
      (bestOverlap === 1 && bestMaxWordLen >= LONG_KEYWORD_LENGTH);

    if (shouldMerge) {
      clusters[bestClusterIdx].articles.push(article);
      for (const kw of articleKeywords) {
        clusters[bestClusterIdx].keywords.add(kw);
      }
    } else {
      clusters.push({ keywords: articleKeywords, articles: [article] });
    }
  }

  // 클러스터 대표 키워드: 기사 제목에 가장 많이 등장한 단어 상위 3개
  return clusters.map((c) => {
    const keywordFreq: Record<string, number> = {};
    for (const article of c.articles) {
      for (const kw of extractKeywords(article.title)) {
        keywordFreq[kw] = (keywordFreq[kw] ?? 0) + 1;
      }
    }

    const sorted = Object.entries(keywordFreq)
      .sort((a, b) => b[1] - a[1])
      .map(([kw]) => kw);

    const topKeyword = sorted[0] ?? "기타";
    const topKeywords = sorted.slice(0, 3);

    return {
      clusterKeyword: topKeyword,
      topKeywords,
      articles: c.articles,
    };
  });
}
