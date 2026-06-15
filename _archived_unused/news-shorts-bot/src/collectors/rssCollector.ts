import Parser from "rss-parser";
import https from "https";
import constants from "constants";
import { NewsItem } from "../types/news";
import { RSS_SOURCES } from "../config/sources";

// SSL 구버전 협상을 허용하는 HTTPS 에이전트 (일부 국내 사이트 대응)
const sslAgent = new https.Agent({
  secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

// rss-parser 인스턴스 생성
const parser = new Parser({
  timeout: 10000, // 10초 안에 응답 없으면 포기
  requestOptions: { agent: sslAgent },
});

/**
 * RSS 피드 한 개를 파싱해서 뉴스 목록으로 반환
 */
async function fetchOneFeed(
  name: string,
  url: string
): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(url);

    // feed.items 에서 필요한 필드만 추출
    return (feed.items || []).map((item) => ({
      title: item.title ?? "(제목 없음)",
      link: item.link ?? "",
      description: item.contentSnippet ?? item.content ?? "",
      pubDate: item.pubDate ?? new Date().toISOString(),
      source: name,
    }));
  } catch (err) {
    // 한 피드가 실패해도 전체를 멈추지 않고 빈 배열 반환
    console.warn(`[RSS] ${name} 수집 실패:`, (err as Error).message);
    return [];
  }
}

/**
 * 설정된 모든 RSS 소스에서 뉴스를 수집해서 합쳐서 반환
 */
export async function collectFromRSS(): Promise<NewsItem[]> {
  console.log(`[RSS] ${RSS_SOURCES.length}개 피드 수집 시작...`);

  // 모든 피드를 동시에 요청 (Promise.all로 병렬 처리)
  const results = await Promise.all(
    RSS_SOURCES.map((src) => fetchOneFeed(src.name, src.url))
  );

  // 2차원 배열을 1차원으로 합치기
  const allItems = results.flat();

  console.log(`[RSS] 총 ${allItems.length}건 수집 완료`);
  return allItems;
}
