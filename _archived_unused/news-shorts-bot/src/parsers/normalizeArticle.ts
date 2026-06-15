import { NewsItem, ProcessedArticle } from "../types/news";

// -----------------------------------------------
// HTML 태그 제거
// 예: "<b>AI 혁신</b> 뉴스" → "AI 혁신 뉴스"
// -----------------------------------------------
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")       // HTML 태그 제거
    .replace(/&amp;/g, "&")        // HTML 엔티티 복원
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// -----------------------------------------------
// 날짜 정규화
// 다양한 형식의 날짜를 ISO 8601로 통일
// 파싱 실패 시 현재 시각 사용
// -----------------------------------------------
function normalizeDate(raw: string): string {
  try {
    const parsed = new Date(raw);
    // Invalid Date 체크
    if (isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }
    return parsed.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// -----------------------------------------------
// 출처명 정리
// RSS 피드에서 오는 긴 출처명을 간결하게 정리
// 예: "한겨레 - 전체기사" → "한겨레"
// -----------------------------------------------
function normalizeSource(source: string): string {
  return source
    .replace(/\s*[-–—]\s*.+$/, "") // " - 전체기사" 같은 뒷부분 제거
    .trim();
}

// -----------------------------------------------
// 메인 함수: NewsItem 한 건을 ProcessedArticle로 변환
// -----------------------------------------------
export function normalizeArticle(item: NewsItem): ProcessedArticle {
  return {
    title: stripHtml(item.title),
    link: item.link.trim(),
    ...(item.originalLink ? { originalLink: item.originalLink.trim() } : {}),
    description: stripHtml(item.description),
    pubDate: normalizeDate(item.pubDate),
    source: normalizeSource(item.source),
    ...(item.category ? { category: item.category } : {}),
  };
}

// -----------------------------------------------
// 배열 전체를 한 번에 정규화
// -----------------------------------------------
export function normalizeAll(items: NewsItem[]): ProcessedArticle[] {
  return items.map(normalizeArticle);
}
