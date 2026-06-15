import axios from "axios";
import { NewsItem } from "../types/news";
import { DEFAULT_KEYWORDS } from "../config/sources";
import { logger } from "../utils/logger";

// 네이버 뉴스 API 응답 아이템 타입 (내부용)
interface NaverNewsItem {
  title: string;
  link: string;
  originallink?: string;  // 원본 기사 URL (네이버 링크와 다를 수 있음)
  description: string;
  pubDate: string;
}

// HTTP 상태코드별 에러 안내 메시지
function resolveNaverError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 401) return "API 키가 올바르지 않습니다. .env 의 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 을 확인하세요.";
    if (status === 403) return "API 권한이 없습니다. 네이버 개발자 센터에서 '검색' API 사용 설정을 확인하세요.";
    if (status === 429) return "API 호출 한도를 초과했습니다. 잠시 후 다시 실행하세요.";
    if (status) return `API 오류 (HTTP ${status}). 네이버 개발자 센터에서 애플리케이션 상태를 확인하세요.`;
    if (err.code === "ECONNABORTED") return "요청 시간이 초과되었습니다. 네트워크 상태를 확인하세요.";
    if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") return "네트워크에 연결할 수 없습니다. 인터넷 연결을 확인하세요.";
  }
  return (err as Error).message ?? "알 수 없는 오류";
}

/**
 * 네이버 뉴스 검색 API로 키워드 한 개를 검색
 */
async function searchNaverNews(
  keyword: string,
  clientId: string,
  clientSecret: string
): Promise<NewsItem[]> {
  try {
    const response = await axios.get(
      "https://openapi.naver.com/v1/search/news.json",
      {
        params: {
          query: keyword,
          display: 20,  // 키워드당 최대 20건
          sort: "date",
        },
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
        timeout: 10000,
      }
    );

    const items: NaverNewsItem[] = response.data.items ?? [];

    return items.map((item) => ({
      // 네이버 API는 HTML 태그를 포함하므로 제거
      title: item.title.replace(/<[^>]+>/g, ""),
      link: item.link,
      ...(item.originallink ? { originalLink: item.originallink } : {}),
      description: item.description.replace(/<[^>]+>/g, ""),
      pubDate: item.pubDate,
      source: "네이버뉴스",
      category: keyword,
    }));
  } catch (err) {
    logger.warn(`[Naver] "${keyword}" 검색 실패 → ${resolveNaverError(err)}`);
    return [];
  }
}

/**
 * 네이버 뉴스 API로 여러 키워드를 검색해서 합쳐서 반환
 * API 키가 없으면 수집을 건너뜀
 */
export async function collectFromNaver(): Promise<NewsItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID ?? "";
  const clientSecret = process.env.NAVER_CLIENT_SECRET ?? "";

  // 키가 없거나 예시값 그대로이면 스킵
  const isPlaceholder =
    clientId.includes("여기에") ||
    clientId === "your_naver_client_id" ||
    clientSecret.includes("여기에") ||
    clientSecret === "your_naver_client_secret";

  if (!clientId || !clientSecret || isPlaceholder) {
    logger.info("[Naver] API 키 없음 → 네이버 수집 건너뜀 (RSS만 사용)");
    logger.info("[Naver] 네이버 뉴스를 추가하려면 .env 에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 을 입력하세요.");
    logger.info("[Naver] 발급: https://developers.naver.com → [Application] → [애플리케이션 등록] → 검색 API 선택");
    return [];
  }

  // .env 의 SEARCH_KEYWORDS 또는 기본값 사용
  const keywords = process.env.SEARCH_KEYWORDS
    ? process.env.SEARCH_KEYWORDS.split(",").map((k) => k.trim()).filter(Boolean)
    : DEFAULT_KEYWORDS;

  logger.info(`[Naver] API 키 확인 ✅ → ${keywords.length}개 키워드 검색 시작: [${keywords.join(", ")}]`);

  const results = await Promise.all(
    keywords.map((kw) => searchNaverNews(kw, clientId, clientSecret))
  );

  const allItems = results.flat();
  logger.success(`[Naver] 수집 완료: 총 ${allItems.length}건`);
  return allItems;
}
