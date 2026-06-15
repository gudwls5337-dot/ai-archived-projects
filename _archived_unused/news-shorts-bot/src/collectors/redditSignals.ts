import axios from "axios";
import { RedditSignal } from "../types/political";
import { logger } from "../utils/logger";

// =============================================
// Reddit 공개 JSON API 기반 신호 수집
// API 키 불필요 — USE_REDDIT=false 로 비활성화 가능
// =============================================

interface RedditPost {
  data: {
    title: string;
    score: number;
    num_comments: number;
  };
}

async function fetchRedditSignal(keyword: string): Promise<RedditSignal> {
  try {
    const response = await axios.get(
      "https://www.reddit.com/search.json",
      {
        params: {
          q: keyword,
          sort: "top",
          t: "day",
          limit: 10,
        },
        headers: {
          "User-Agent": "news-research-bot/1.0 (political research)",
        },
        timeout: 10000,
      }
    );

    const posts: RedditPost[] = response.data?.data?.children ?? [];
    const titles = posts.map((p) => p.data.title).filter(Boolean);
    const count = posts.length;

    let strength: RedditSignal["signalStrength"] = "none";
    if (count >= 8)      strength = "high";
    else if (count >= 5) strength = "medium";
    else if (count >= 2) strength = "low";

    return {
      searchKeyword: keyword,
      postCount: count,
      topPostTitles: titles.slice(0, 5),
      signalStrength: strength,
      collectedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`[Reddit] "${keyword}" 신호 수집 실패: ${(err as Error).message}`);
    return {
      searchKeyword: keyword,
      postCount: 0,
      topPostTitles: [],
      signalStrength: "none",
      collectedAt: new Date().toISOString(),
    };
  }
}

// =============================================
// 복수 키워드 Reddit 신호 수집
// =============================================
export async function collectRedditSignals(
  keywords: string[]
): Promise<Map<string, RedditSignal | null>> {
  const result = new Map<string, RedditSignal | null>();

  // USE_REDDIT=false 이면 비활성화
  if (process.env.USE_REDDIT === "false") {
    logger.info("[Reddit] USE_REDDIT=false → Reddit 신호 수집 건너뜀");
    for (const kw of keywords) result.set(kw, null);
    return result;
  }

  logger.info(`[Reddit] ${keywords.length}개 키워드 신호 수집 시작`);

  const settled = await Promise.allSettled(
    keywords.map((kw) => fetchRedditSignal(kw))
  );

  settled.forEach((res, i) => {
    result.set(keywords[i], res.status === "fulfilled" ? res.value : null);
  });

  const detected = [...result.values()].filter(
    (v) => v !== null && v.signalStrength !== "none"
  ).length;
  logger.info(`[Reddit] 신호 수집 완료: ${detected}건 신호 감지`);

  return result;
}
