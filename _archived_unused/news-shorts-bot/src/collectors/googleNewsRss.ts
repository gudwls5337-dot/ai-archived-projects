import Parser from "rss-parser";
import https from "https";
import constants from "constants";
import { NewsItem } from "../types/news";
import { logger } from "../utils/logger";

// =============================================
// Google News RSS 검색용 정치 키워드
// =============================================
export const GOOGLE_NEWS_POLITICAL_KEYWORDS = [
  "대통령",
  "국회",
  "탄핵",
  "총선 대선",
  "검찰",
  "여당 야당",
];

// =============================================
// 추가 정치 뉴스 RSS 소스 (Google News 외)
// =============================================
export const POLITICAL_RSS_SOURCES = [
  { name: "연합뉴스", url: "https://www.yna.co.kr/RSS/politics.xml" },
  { name: "경향신문", url: "https://www.khan.co.kr/rss/rssdata/politic_news.xml" },
  { name: "KBS뉴스", url: "https://news.kbs.co.kr/rss/rss.xml" },
  { name: "MBC뉴스", url: "https://imnews.imbc.com/rss/news/news_00.xml" },
];

const sslAgent = new https.Agent({
  secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

const parser = new Parser({
  timeout: 15000,
  requestOptions: { agent: sslAgent },
});

// =============================================
// Google News RSS URL 생성
// =============================================
function buildGoogleNewsUrl(keyword: string): string {
  const encoded = encodeURIComponent(keyword);
  return `https://news.google.com/rss/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko`;
}

// =============================================
// Google News RSS 피드 한 개 파싱
// =============================================
async function fetchGoogleNewsFeed(keyword: string): Promise<NewsItem[]> {
  const url = buildGoogleNewsUrl(keyword);
  try {
    const feed = await parser.parseURL(url);
    return (feed.items ?? []).map((item) => ({
      title: item.title ?? "(제목 없음)",
      link: item.link ?? "",
      description: item.contentSnippet ?? item.content ?? "",
      pubDate: item.pubDate ?? new Date().toISOString(),
      source: "Google뉴스",
      category: keyword,
    }));
  } catch (err) {
    logger.warn(`[GoogleNews] "${keyword}" 수집 실패: ${(err as Error).message}`);
    return [];
  }
}

// =============================================
// 추가 RSS 소스 피드 한 개 파싱
// =============================================
async function fetchPoliticalRssFeed(name: string, url: string): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items ?? []).map((item) => ({
      title: item.title ?? "(제목 없음)",
      link: item.link ?? "",
      description: item.contentSnippet ?? item.content ?? "",
      pubDate: item.pubDate ?? new Date().toISOString(),
      source: name,
    }));
  } catch (err) {
    logger.warn(`[PoliticalRSS] ${name} 수집 실패: ${(err as Error).message}`);
    return [];
  }
}

// =============================================
// Google News RSS 정치 키워드 검색
// =============================================
export async function collectFromGoogleNews(
  keywords: string[] = GOOGLE_NEWS_POLITICAL_KEYWORDS
): Promise<NewsItem[]> {
  logger.info(`[GoogleNews] ${keywords.length}개 키워드 RSS 수집 시작`);
  const results = await Promise.all(keywords.map((kw) => fetchGoogleNewsFeed(kw)));
  const all = results.flat();
  logger.info(`[GoogleNews] 수집 완료: ${all.length}건`);
  return all;
}

// =============================================
// 추가 정치 RSS 소스 수집
// =============================================
export async function collectFromPoliticalRss(): Promise<NewsItem[]> {
  logger.info(`[PoliticalRSS] ${POLITICAL_RSS_SOURCES.length}개 추가 소스 수집 시작`);
  const results = await Promise.all(
    POLITICAL_RSS_SOURCES.map((src) => fetchPoliticalRssFeed(src.name, src.url))
  );
  const all = results.flat();
  logger.info(`[PoliticalRSS] 수집 완료: ${all.length}건`);
  return all;
}
