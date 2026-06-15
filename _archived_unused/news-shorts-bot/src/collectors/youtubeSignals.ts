import axios from "axios";
import { YoutubeSignal } from "../types/political";
import { logger } from "../utils/logger";

// =============================================
// YouTube Data API v3 기반 신호 수집
// .env 에 YOUTUBE_API_KEY 가 없으면 자동 건너뜀
// =============================================

async function fetchYoutubeSignal(keyword: string, apiKey: string): Promise<YoutubeSignal> {
  // 24시간 이내 영상만 조회
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/search",
      {
        params: {
          part: "snippet",
          q: keyword,
          type: "video",
          regionCode: "KR",
          relevanceLanguage: "ko",
          publishedAfter: since,
          maxResults: 10,
          key: apiKey,
          order: "relevance",
        },
        timeout: 10000,
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = response.data.items ?? [];
    const titles: string[] = items
      .map((item) => item.snippet?.title ?? "")
      .filter(Boolean);

    const totalResults: number = response.data.pageInfo?.totalResults ?? items.length;

    let strength: YoutubeSignal["signalStrength"] = "none";
    if (totalResults >= 50) strength = "high";
    else if (totalResults >= 20) strength = "medium";
    else if (totalResults >= 5)  strength = "low";

    return {
      searchKeyword: keyword,
      estimatedVideoCount: totalResults,
      topVideoTitles: titles.slice(0, 5),
      signalStrength: strength,
      collectedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`[YouTube] "${keyword}" 신호 수집 실패: ${(err as Error).message}`);
    return {
      searchKeyword: keyword,
      estimatedVideoCount: 0,
      topVideoTitles: [],
      signalStrength: "none",
      collectedAt: new Date().toISOString(),
    };
  }
}

// =============================================
// 복수 키워드 YouTube 신호 수집
// API 키 없으면 전부 null 로 반환 (비치명적)
// =============================================
export async function collectYoutubeSignals(
  keywords: string[]
): Promise<Map<string, YoutubeSignal | null>> {
  const result = new Map<string, YoutubeSignal | null>();

  const apiKey = process.env.YOUTUBE_API_KEY ?? "";
  const isPlaceholder = !apiKey || apiKey === "your_youtube_api_key";

  if (isPlaceholder) {
    logger.info("[YouTube] API 키 없음 → YouTube 신호 수집 건너뜀 (.env 에 YOUTUBE_API_KEY 설정 시 활성화)");
    for (const kw of keywords) result.set(kw, null);
    return result;
  }

  logger.info(`[YouTube] ${keywords.length}개 키워드 신호 수집 시작`);

  const settled = await Promise.allSettled(
    keywords.map((kw) => fetchYoutubeSignal(kw, apiKey))
  );

  settled.forEach((res, i) => {
    result.set(keywords[i], res.status === "fulfilled" ? res.value : null);
  });

  const detected = [...result.values()].filter(
    (v) => v !== null && v.signalStrength !== "none"
  ).length;
  logger.info(`[YouTube] 신호 수집 완료: ${detected}건 신호 감지`);

  return result;
}
