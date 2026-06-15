import axios from "axios";
import { NewsItem } from "../types/news";
import { logger } from "../utils/logger";

// =============================================
// 정치 전용 네이버 뉴스 검색 키워드
// .env 의 POLITICAL_SEARCH_KEYWORDS 로 오버라이드 가능
// =============================================
export const POLITICAL_SEARCH_KEYWORDS = [
  "대통령",
  "국회",
  "탄핵",
  "총선",
  "검찰",
  "여당",
  "야당",
  "헌재",
];

interface NaverNewsItem {
  title: string;
  link: string;
  originallink?: string;
  description: string;
  pubDate: string;
}

async function searchNaverPolitical(
  keyword: string,
  clientId: string,
  clientSecret: string
): Promise<NewsItem[]> {
  try {
    const response = await axios.get(
      "https://openapi.naver.com/v1/search/news.json",
      {
        params: { query: keyword, display: 20, sort: "date" },
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
        timeout: 10000,
      }
    );
    const items: NaverNewsItem[] = response.data.items ?? [];
    return items.map((item) => ({
      title: item.title.replace(/<[^>]+>/g, ""),
      link: item.link,
      ...(item.originallink ? { originalLink: item.originallink } : {}),
      description: item.description.replace(/<[^>]+>/g, ""),
      pubDate: item.pubDate,
      source: "네이버뉴스",
      category: keyword,
    }));
  } catch (err) {
    logger.warn(`[NaverPolitical] "${keyword}" 검색 실패: ${(err as Error).message}`);
    return [];
  }
}

// =============================================
// 정치 키워드로 네이버 뉴스 수집
// (기존 collectFromNaver 와 별도 — 정치 전용 키워드 사용)
// =============================================
export async function collectPoliticalFromNaver(): Promise<NewsItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID ?? "";
  const clientSecret = process.env.NAVER_CLIENT_SECRET ?? "";

  const isPlaceholder =
    clientId.includes("여기에") ||
    clientId === "your_naver_client_id" ||
    clientSecret.includes("여기에") ||
    clientSecret === "your_naver_client_secret";

  if (!clientId || !clientSecret || isPlaceholder) {
    logger.info("[NaverPolitical] API 키 없음 → 네이버 정치 수집 건너뜀");
    return [];
  }

  // .env 의 POLITICAL_SEARCH_KEYWORDS 로 오버라이드 가능
  const keywords = process.env.POLITICAL_SEARCH_KEYWORDS
    ? process.env.POLITICAL_SEARCH_KEYWORDS.split(",").map((k) => k.trim()).filter(Boolean)
    : POLITICAL_SEARCH_KEYWORDS;

  logger.info(`[NaverPolitical] ${keywords.length}개 정치 키워드 검색 시작: [${keywords.join(", ")}]`);
  const results = await Promise.all(
    keywords.map((kw) => searchNaverPolitical(kw, clientId, clientSecret))
  );
  const all = results.flat();
  logger.success(`[NaverPolitical] 수집 완료: ${all.length}건`);
  return all;
}
