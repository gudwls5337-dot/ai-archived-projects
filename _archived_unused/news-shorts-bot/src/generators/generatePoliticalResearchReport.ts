import fs from "fs";
import path from "path";
import { PoliticalIssue, PoliticalResearchResult, ChannelFit } from "../types/political";
import { archiveText, ArchiveTs } from "../utils/archiveWriter";

// =============================================
// 리포트 3종 생성
//   1. 마스터 (전체 이슈)
//   2. 보수채널 (conservative_positive)
//   3. 진보채널 (progressive_positive)
//
// 목적: 영상 제작 전 시장조사 참고용 문서
//       자극적 문구 X, 근거 기반 분류 + 반응 정리
// =============================================

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  } catch {
    return iso;
  }
}

function sensitivityBadge(level: string): string {
  if (level === "high")   return "🔴 고민감";
  if (level === "medium") return "🟡 중간";
  return "🟢 낮음";
}

function channelBadge(fit: ChannelFit): string {
  if (fit === "conservative_positive") return "🔵 보수채널 적합";
  if (fit === "progressive_positive")  return "🔴 진보채널 적합";
  if (fit === "mixed")                 return "🟣 혼재(양쪽 참고)";
  return "⬜ 불명확";
}

// =============================================
// 이슈 한 건 섹션 렌더링
// =============================================
function renderIssueSection(issue: PoliticalIssue, index: number): string {
  const lines: string[] = [];

  lines.push(`## ${index + 1}위. ${issue.keyword}`);
  lines.push(``);
  lines.push(`**대표 기사:** ${issue.title}`);
  lines.push(`**URL:** <${issue.representativeUrl}>`);
  lines.push(`**최신 발행:** ${formatDate(issue.latestPubDate)}`);
  lines.push(`**채널 적합도:** ${channelBadge(issue.politicalSideFit)}`);
  lines.push(`**분류 근거:** ${issue.fitReason}`);
  lines.push(`**민감도:** ${sensitivityBadge(issue.sensitivityLevel)}`);
  lines.push(``);

  lines.push(`### 수집 현황`);
  lines.push(`| 항목 | 값 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 출처 수 | ${issue.sourceCount}개 |`);
  lines.push(`| 출처 목록 | ${issue.sources.join(", ")} |`);
  lines.push(`| 기사 수 | ${issue.articleCount}건 |`);
  lines.push(`| 최종 점수 | **${issue.scores.finalScore}점** |`);
  lines.push(``);

  lines.push(`### 점수 세부`);
  lines.push(`| 기준 | 점수 | 만점 |`);
  lines.push(`|------|------|------|`);
  lines.push(`| 출처 다양성 | ${issue.scores.sourceDiversity} | 20 |`);
  lines.push(`| 최신성 | ${issue.scores.freshness} | 20 |`);
  lines.push(`| 반응 강도 | ${issue.scores.reactionIntensity} | 20 |`);
  lines.push(`| 정치 관련도 | ${issue.scores.politicalRelevance} | 20 |`);
  lines.push(`| 채널 적합도 | ${issue.scores.channelFit} | 10 |`);
  lines.push(`| 숏폼 잠재력 | ${issue.scores.shortsPotential} | 10 |`);
  if (issue.scores.duplicatePenalty < 0) {
    lines.push(`| 중복 페널티 | ${issue.scores.duplicatePenalty} | — |`);
  }
  lines.push(``);

  if (issue.evidenceKeywords.length > 0) {
    lines.push(`**채널 분류 근거 키워드:** ${issue.evidenceKeywords.join(", ")}`);
    lines.push(``);
  }

  // 댓글 반응
  if (issue.topComments.length > 0) {
    lines.push(`### 주요 댓글 반응`);
    issue.topComments.slice(0, 3).forEach((c) => {
      const likes = c.likeCount !== null ? ` (좋아요 ${c.likeCount})` : "";
      lines.push(`- "${c.content}"${likes}`);
    });
    lines.push(``);
  }

  // YouTube 신호
  if (issue.youtubeSignal && issue.youtubeSignal.signalStrength !== "none") {
    const yt = issue.youtubeSignal;
    lines.push(`### YouTube 신호`);
    lines.push(`- 신호 강도: **${yt.signalStrength}** (24시간 내 영상 ${yt.estimatedVideoCount}건 추정)`);
    if (yt.topVideoTitles.length > 0) {
      yt.topVideoTitles.slice(0, 3).forEach((t) => lines.push(`- ${t}`));
    }
    lines.push(``);
  }

  // Reddit 신호
  if (issue.redditSignal && issue.redditSignal.signalStrength !== "none") {
    const rd = issue.redditSignal;
    lines.push(`### Reddit 신호`);
    lines.push(`- 신호 강도: **${rd.signalStrength}** (게시물 ${rd.postCount}건)`);
    if (rd.topPostTitles.length > 0) {
      rd.topPostTitles.slice(0, 2).forEach((t) => lines.push(`- ${t}`));
    }
    lines.push(``);
  }

  // 검토 메모
  if (issue.reviewMemo) {
    lines.push(`> ⚠️ **검토 필요:** ${issue.reviewMemo}`);
    lines.push(``);
  }

  // 제작 참고 (4개 필드)
  lines.push(`### 제작 참고`);
  lines.push(`| 항목 | 내용 |`);
  lines.push(`|------|------|`);
  lines.push(`| 한줄 요약 | ${issue.oneLineSummary} |`);
  lines.push(`| 채널 적합 이유 | ${issue.channelWhyItFits} |`);
  lines.push(`| 썸네일 키워드 | ${issue.thumbnailKeywords.join(" · ")} |`);
  lines.push(`| 영상 리스크 | ${issue.videoRiskNote} |`);
  lines.push(`| 제목 아이디어 | ${issue.titleIdea} |`);
  lines.push(`| 훅 문장 | ${issue.hookIdea} |`);
  lines.push(`| 앵글 메모 | ${issue.angleNote} |`);
  lines.push(``);

  lines.push(`---`);
  lines.push(``);

  return lines.join("\n");
}

// =============================================
// 리포트 헤더 생성
// =============================================
function buildReportHeader(
  title: string,
  result: PoliticalResearchResult,
  issueCount: number
): string {
  const { summary } = result;
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push(``);
  lines.push(`> **생성 목적:** 정치 숏폼 영상 제작 전 이슈 시장조사 참고용`);
  lines.push(`> **생성 시각:** ${formatDate(result.researchedAt)}`);
  lines.push(`> **대상 이슈:** ${issueCount}건`);
  lines.push(``);
  lines.push(`## 오늘의 요약`);
  lines.push(``);
  lines.push(`| 분류 | 건수 |`);
  lines.push(`|------|------|`);
  lines.push(`| 🔵 보수채널 적합 | ${summary.conservativePositiveCount}건 |`);
  lines.push(`| 🔴 진보채널 적합 | ${summary.progressivePositiveCount}건 |`);
  lines.push(`| 🟣 혼재 | ${summary.mixedCount}건 |`);
  lines.push(`| ⬜ 불명확 | ${summary.unclearCount}건 |`);
  lines.push(`| 🔴 고민감도 이슈 | ${summary.highSensitivityCount}건 |`);
  lines.push(`| ⚠️ 검토 대기 | ${summary.reviewQueueCount}건 |`);
  lines.push(``);

  if (summary.topKeywords.length > 0) {
    lines.push(`**오늘의 주요 정치 키워드:** ${summary.topKeywords.join(" · ")}`);
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(``);

  return lines.join("\n");
}

// =============================================
// TOP 5 요약 섹션 — 리포트 상단 삽입
// =============================================
function buildTopSections(result: PoliticalResearchResult): string {
  const { issues } = result;
  const lines: string[] = [];

  // 오늘 가장 강한 이슈 TOP 5
  lines.push(`## 🏆 오늘 가장 강한 이슈 TOP 5`);
  lines.push(``);
  const byScore = [...issues].sort((a, b) => b.scores.finalScore - a.scores.finalScore).slice(0, 5);
  if (byScore.length > 0) {
    byScore.forEach((issue, i) => {
      lines.push(
        `${i + 1}. **${issue.keyword}** — ${issue.scores.finalScore}점 | ${channelBadge(issue.politicalSideFit)} | ${sensitivityBadge(issue.sensitivityLevel)}`
      );
    });
  } else {
    lines.push(`*이슈 없음*`);
  }
  lines.push(``);

  // 보수 채널용 추천 TOP 5
  lines.push(`## 🔵 보수 채널용 추천 TOP 5`);
  lines.push(``);
  const cons = issues
    .filter((i) => i.politicalSideFit === "conservative_positive")
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore)
    .slice(0, 5);
  if (cons.length > 0) {
    cons.forEach((issue, i) => {
      const kw = issue.evidenceKeywords.length > 0 ? ` | 근거: ${issue.evidenceKeywords.join(", ")}` : "";
      lines.push(`${i + 1}. **${issue.keyword}** — ${issue.fitReason}${kw}`);
    });
  } else {
    lines.push(`*오늘 보수채널 적합 이슈 없음*`);
  }
  lines.push(``);

  // 진보 채널용 추천 TOP 5
  lines.push(`## 🔴 진보 채널용 추천 TOP 5`);
  lines.push(``);
  const prog = issues
    .filter((i) => i.politicalSideFit === "progressive_positive")
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore)
    .slice(0, 5);
  if (prog.length > 0) {
    prog.forEach((issue, i) => {
      const kw = issue.evidenceKeywords.length > 0 ? ` | 근거: ${issue.evidenceKeywords.join(", ")}` : "";
      lines.push(`${i + 1}. **${issue.keyword}** — ${issue.fitReason}${kw}`);
    });
  } else {
    lines.push(`*오늘 진보채널 적합 이슈 없음*`);
  }
  lines.push(``);

  // 검토 필요 이슈 TOP 5
  lines.push(`## ⚠️ 검토 필요 이슈 TOP 5`);
  lines.push(``);
  const review = issues
    .filter((i) => i.reviewMemo !== "")
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore)
    .slice(0, 5);
  if (review.length > 0) {
    review.forEach((issue, i) => {
      lines.push(`${i + 1}. **${issue.keyword}** — ${issue.reviewMemo}`);
    });
  } else {
    lines.push(`*검토 필요 이슈 없음 — 전체 품질 기준 충족*`);
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  return lines.join("\n");
}

// =============================================
// 파일 저장 헬퍼
// =============================================
function saveReport(dir: string, filename: string, content: string): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// =============================================
// 결과 경로 타입
// =============================================
export interface PoliticalReportPaths {
  masterPath: string;
  conservativePath: string;
  progressivePath: string;
}

// =============================================
// 리포트 3종 생성 메인 함수
// =============================================
export function generatePoliticalResearchReport(
  result: PoliticalResearchResult,
  ats: ArchiveTs
): PoliticalReportPaths {
  const today     = getToday();
  const reportDir = "outputs/political/reports";

  // ── 1. 마스터 리포트 (전체) ──────────────────
  const masterIssues  = result.issues;
  const masterHeader  = buildReportHeader("정치 이슈 시장조사 리포트 — 마스터", result, masterIssues.length);
  const masterTopSections = buildTopSections(result);
  const masterBody    = masterIssues.length > 0
    ? masterIssues.map((issue, i) => renderIssueSection(issue, i)).join("")
    : "*오늘 수집된 정치 이슈 없음*\n";
  const masterContent = masterHeader + masterTopSections + masterBody;

  const masterPath = saveReport(reportDir, `${today}-political-master.md`, masterContent);
  archiveText("political-reports", "master", "md", masterContent, ats);

  // ── 2. 보수채널 리포트 ───────────────────────
  const conservativeIssues = result.issues.filter(
    (i) => i.politicalSideFit === "conservative_positive"
  );
  const conservativeHeader  = buildReportHeader(
    "정치 이슈 시장조사 리포트 — 보수채널 (conservative_positive)",
    result,
    conservativeIssues.length
  );
  const conservativeBody    = conservativeIssues.length > 0
    ? conservativeIssues.map((issue, i) => renderIssueSection(issue, i)).join("")
    : "*오늘 보수채널 적합 이슈 없음*\n";
  const conservativeContent = conservativeHeader + conservativeBody;

  const conservativePath = saveReport(reportDir, `${today}-political-conservative.md`, conservativeContent);
  archiveText("political-reports", "conservative", "md", conservativeContent, ats);

  // ── 3. 진보채널 리포트 ───────────────────────
  const progressiveIssues = result.issues.filter(
    (i) => i.politicalSideFit === "progressive_positive"
  );
  const progressiveHeader  = buildReportHeader(
    "정치 이슈 시장조사 리포트 — 진보채널 (progressive_positive)",
    result,
    progressiveIssues.length
  );
  const progressiveBody    = progressiveIssues.length > 0
    ? progressiveIssues.map((issue, i) => renderIssueSection(issue, i)).join("")
    : "*오늘 진보채널 적합 이슈 없음*\n";
  const progressiveContent = progressiveHeader + progressiveBody;

  const progressivePath = saveReport(reportDir, `${today}-political-progressive.md`, progressiveContent);
  archiveText("political-reports", "progressive", "md", progressiveContent, ats);

  return { masterPath, conservativePath, progressivePath };
}
