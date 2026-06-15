import { ProcessedArticle } from "../types/news";

// -----------------------------------------------
// 중복 제거 기준:
//   1순위: URL(link)이 완전히 동일한 경우
//   2순위: 제목이 완전히 동일한 경우
// 먼저 나온 기사를 유지하고 나중 것을 제거
// -----------------------------------------------
export function dedupeArticles(items: ProcessedArticle[]): {
  unique: ProcessedArticle[];
  removedCount: number;
} {
  const seenUrls = new Set<string>();   // 이미 본 URL 목록
  const seenTitles = new Set<string>(); // 이미 본 제목 목록
  const unique: ProcessedArticle[] = [];

  for (const item of items) {
    const url = item.link.toLowerCase();
    const title = item.title.toLowerCase();

    // URL 또는 제목이 이미 나왔으면 건너뜀
    if (seenUrls.has(url) || seenTitles.has(title)) {
      continue;
    }

    // 처음 보는 기사라면 목록에 추가하고 기록
    seenUrls.add(url);
    seenTitles.add(title);
    unique.push(item);
  }

  const removedCount = items.length - unique.length;
  return { unique, removedCount };
}
