import axios from "axios";
import { CommentMeta, TopComment } from "../types/news";

// =============================================
// 댓글 수집 타임아웃 (ms)
// =============================================
const TIMEOUT_MS = 5000;
const PLAYWRIGHT_TIMEOUT_MS = 15000;

// =============================================
// Stage 1: HTML 정적 파싱
//
// 한국 뉴스 사이트 대부분은 동적 댓글 로드를 사용하므로
// HTML만으로는 대부분 null 반환 (정상)
// JSON-LD / 인라인 JSON / 한국어 텍스트 패턴으로 시도
// =============================================
function tryExtractFromHtml(html: string): {
  totalCommentCount: number | null;
  totalLikeCount: number | null;
  totalDislikeCount: number | null;
  topComments: TopComment[];
} | null {
  // ── 전체 댓글 수 ──────────────────────────
  const countPatterns = [
    /"commentCount"\s*:\s*(\d+)/,
    /"reply_count"\s*:\s*(\d+)/,
    /"comment_count"\s*:\s*(\d+)/,
    /"replyCount"\s*:\s*(\d+)/,
    /"totalCommentCount"\s*:\s*(\d+)/,
    /댓글\s*\((\d+)\)/,
    /댓글\s+(\d+)\s*건/,
    /댓글\s+(\d+)\s*개/,
    /댓글\s*:\s*(\d+)/,
  ];

  let totalCommentCount: number | null = null;
  for (const pattern of countPatterns) {
    const m = html.match(pattern);
    if (m) { totalCommentCount = parseInt(m[1], 10); break; }
  }

  // 댓글 수조차 없으면 수집 불가
  if (totalCommentCount === null) return null;

  // ── 기사 공감/비공감 ─────────────────────
  let totalLikeCount: number | null = null;
  let totalDislikeCount: number | null = null;

  const likePatterns = [
    /"sympathyCount"\s*:\s*(\d+)/,
    /"likeCount"\s*:\s*(\d+)/,
    /"upCount"\s*:\s*(\d+)/,
    /"goodCount"\s*:\s*(\d+)/,
  ];
  for (const p of likePatterns) {
    const m = html.match(p);
    if (m) { totalLikeCount = parseInt(m[1], 10); break; }
  }

  const dislikePatterns = [
    /"antipathyCount"\s*:\s*(\d+)/,
    /"dislikeCount"\s*:\s*(\d+)/,
    /"downCount"\s*:\s*(\d+)/,
    /"badCount"\s*:\s*(\d+)/,
  ];
  for (const p of dislikePatterns) {
    const m = html.match(p);
    if (m) { totalDislikeCount = parseInt(m[1], 10); break; }
  }

  // ── 베스트 댓글 (인라인 JSON에서 시도) ───
  const topComments: TopComment[] = [];

  // 댓글 내용 패턴 (10~200자)
  const bodyPattern = /"(?:body|content|text|contents)"\s*:\s*"([^"]{10,200})"/g;
  const authorPattern = /"(?:authorName|writer|nickname|nick|userId)"\s*:\s*"([^"]{1,30})"/g;
  const likeCountPattern = /"(?:likeCount|sympathyCount|upCount|likeItCount)"\s*:\s*(\d+)/g;

  const bodies: string[] = [];
  const authors: string[] = [];
  const likes: number[] = [];

  let m: RegExpExecArray | null;
  while ((m = bodyPattern.exec(html)) !== null && bodies.length < 5) {
    const text = m[1].replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
    if (text.length >= 10) bodies.push(text);
  }
  while ((m = authorPattern.exec(html)) !== null && authors.length < 5) {
    authors.push(m[1]);
  }
  while ((m = likeCountPattern.exec(html)) !== null && likes.length < 5) {
    likes.push(parseInt(m[1], 10));
  }

  for (let i = 0; i < bodies.length; i++) {
    topComments.push({
      author:     authors[i] ?? null,
      content:    bodies[i],
      likeCount:  likes[i] ?? null,
      replyCount: null,
    });
  }

  return { totalCommentCount, totalLikeCount, totalDislikeCount, topComments };
}

// =============================================
// Stage 2: Playwright 동적 수집 (USE_PLAYWRIGHT=true 시)
//
// Playwright 가 설치되지 않은 환경에서는 동적 import 실패로
// 자동으로 null 반환 — 파이프라인을 중단하지 않음
// =============================================
export async function collectCommentMetaPlaywright(
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any  // playwright.Browser — any 로 선언해서 playwright 미설치 시 타입 오류 방지
): Promise<CommentMeta | null> {
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "ko-KR",
    });
    const page = await context.newPage();

    try {
      await page.goto(url, {
        timeout: PLAYWRIGHT_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
      });

      // 댓글 위젯이 로드될 시간 (최대 3초)
      await page
        .waitForSelector(
          '.u_cbox_contents, .comment_content, [class*="commentText"]',
          { timeout: 3000 }
        )
        .catch(() => {});

      // 페이지 내 데이터 추출 (브라우저 컨텍스트에서 실행)
      type EvalResult = {
        totalCommentCount: number | null;
        totalLikeCount: number | null;
        totalDislikeCount: number | null;
        topComments: Array<{
          author: string | null;
          content: string;
          likeCount: number | null;
          replyCount: number | null;
        }>;
      };

      const result: EvalResult = await page.evaluate((): EvalResult => {
        function getNum(selector: string): number | null {
          const el = document.querySelector(selector);
          if (!el) return null;
          const n = parseInt((el.textContent || "").replace(/[^0-9]/g, ""), 10);
          return isNaN(n) ? null : n;
        }

        // 전체 댓글 수
        const totalCommentCount =
          getNum(".u_cbox_count") ??
          getNum(".comment_count") ??
          getNum("[class*='commentCount']") ??
          getNum("[class*='replyCount']") ??
          null;

        // 기사 공감/비공감
        const totalLikeCount =
          getNum(".sympathy_count") ??
          getNum("[class*='sympathy']") ??
          getNum("[class*='likeCount']") ??
          null;
        const totalDislikeCount =
          getNum(".antipathy_count") ??
          getNum("[class*='antipathy']") ??
          getNum("[class*='dislikeCount']") ??
          null;

        // 베스트 댓글 (최대 5개)
        const contentSelectors = [
          ".u_cbox_contents",
          ".comment_content",
          "[class*='commentText']",
          "[class*='comment_text']",
          "[class*='CommentText']",
        ];
        const topComments: EvalResult["topComments"] = [];

        for (const sel of contentSelectors) {
          const els = Array.from(document.querySelectorAll(sel)).slice(0, 5);
          if (els.length === 0) continue;
          for (const el of els) {
            const content = (el.textContent || "").trim();
            if (content.length < 5) continue;

            const item =
              el.closest(".u_cbox_comment_box") ??
              el.closest(".comment_item") ??
              el.closest("[class*='comment-item']") ??
              el.parentElement;

            let likeCount: number | null = null;
            let replyCount: number | null = null;
            let author: string | null = null;

            if (item) {
              const likeEl =
                item.querySelector(".u_cbox_cnt_recomm") ??
                item.querySelector("[class*='recomm']") ??
                item.querySelector("[class*='good']");
              if (likeEl) {
                const n = parseInt(
                  (likeEl.textContent || "").replace(/[^0-9]/g, ""),
                  10
                );
                if (!isNaN(n)) likeCount = n;
              }

              const replyEl =
                item.querySelector(".u_cbox_cnt_reply") ??
                item.querySelector("[class*='reply_count']");
              if (replyEl) {
                const n = parseInt(
                  (replyEl.textContent || "").replace(/[^0-9]/g, ""),
                  10
                );
                if (!isNaN(n)) replyCount = n;
              }

              const authorEl =
                item.querySelector(".u_cbox_nick") ??
                item.querySelector("[class*='author']") ??
                item.querySelector("[class*='nick']");
              if (authorEl) {
                author = (authorEl.textContent || "").trim() || null;
              }
            }

            topComments.push({ author, content, likeCount, replyCount });
          }
          if (topComments.length > 0) break;
        }

        return { totalCommentCount, totalLikeCount, totalDislikeCount, topComments };
      });

      let commentSource = url;
      try { commentSource = new URL(url).hostname; } catch { /* ignore */ }

      return {
        totalCommentCount:  result.totalCommentCount,
        totalLikeCount:     result.totalLikeCount,
        totalDislikeCount:  result.totalDislikeCount,
        topComments:        result.topComments,
        commentSource,
        commentCollectedAt: new Date().toISOString(),
      };
    } finally {
      await context.close();
    }
  } catch {
    return null;
  }
}

// =============================================
// 메인 함수: URL → CommentMeta | null (Stage 1)
//
// 실패 시 절대 예외를 던지지 않음 — null 반환
// =============================================
export async function collectCommentMeta(url: string): Promise<CommentMeta | null> {
  try {
    const response = await axios.get(url, {
      timeout: TIMEOUT_MS,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      maxRedirects: 3,
    });

    const html: string =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

    const extracted = tryExtractFromHtml(html);
    if (!extracted) return null;

    let commentSource = url;
    try { commentSource = new URL(url).hostname; } catch { /* ignore */ }

    return {
      totalCommentCount:  extracted.totalCommentCount,
      totalLikeCount:     extracted.totalLikeCount,
      totalDislikeCount:  extracted.totalDislikeCount,
      topComments:        extracted.topComments,
      commentSource,
      commentCollectedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
