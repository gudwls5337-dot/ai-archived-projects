import fs from "fs";
import path from "path";
import { ShortsPackage, ShortsResult } from "../types/news";
import { logger } from "../utils/logger";
import { ArchiveTs, archiveText } from "../utils/archiveWriter";

// =============================================
// 날짜 포맷 헬퍼
// =============================================
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(iso: string): string {
  return iso.replace("T", " ").slice(0, 19);
}

// =============================================
// 이슈 한 건을 markdown 블록으로 변환
// =============================================
function renderIssueBlock(pkg: ShortsPackage): string {
  const dupBadge = pkg.isNearDuplicate ? " [근중복]" : "";
  const lines: string[] = [];

  // 이슈 헤더
  lines.push(`## #${pkg.rank}${dupBadge} ${pkg.clusterKeyword}`);
  lines.push("");

  // 근중복 경고 (있을 때만)
  if (pkg.isNearDuplicate) {
    const gid = pkg.duplicateGroupId !== null ? ` (그룹 G${pkg.duplicateGroupId})` : "";
    lines.push(`> 🔁 **근중복 이슈**${gid}: 같은 그룹의 상위 이슈와 내용이 매우 유사합니다. 동시 업로드 시 중복이 될 수 있습니다.`);
    lines.push("");
  } else if (pkg.duplicateLevel === "similar") {
    const gid = pkg.duplicateGroupId !== null ? ` (그룹 G${pkg.duplicateGroupId})` : "";
    lines.push(`> ↔️ **유사 이슈**${gid}: 같은 그룹의 다른 이슈와 관련 키워드가 겹칩니다.`);
    lines.push("");
  }

  // 핵심 메타
  lines.push(`- **대표 기사**: ${pkg.representativeTitle}`);
  lines.push(`- **URL**: ${pkg.representativeUrl}`);
  lines.push(`- **최종 점수**: ${pkg.sources.length}개 출처 | 생성: ${formatDateTime(pkg.generatedAt)}`);
  lines.push(`- **참고 출처**: ${pkg.sources.join(", ")}`);
  lines.push("");

  // 요약
  lines.push("### 📝 30초 요약");
  lines.push(`> ${pkg.summary}`);
  lines.push("");

  // 제목 후보
  lines.push("### 🎬 제목 후보");
  pkg.titleCandidates.forEach((t, i) => {
    lines.push(`${i + 1}. ${t}`);
  });
  lines.push("");

  // 훅 문구
  lines.push("### 🎣 훅 문구 (오프닝)");
  pkg.hooks.forEach((h, i) => {
    lines.push(`${i + 1}. ${h}`);
  });
  lines.push("");

  // 썸네일 문구
  lines.push("### 🖼️ 썸네일 문구");
  pkg.thumbnailTexts.forEach((t, i) => {
    lines.push(`${i + 1}. **${t}**`);
  });
  lines.push("");

  // 해시태그
  lines.push("### #️⃣ 해시태그");
  lines.push(pkg.hashtags.join("  "));
  lines.push("");

  // 댓글/반응 정보 (수집 성공 시만 표시)
  if (pkg.commentMeta) {
    const cm = pkg.commentMeta;
    lines.push("### 💬 반응 정보");

    const countParts: string[] = [];
    if (cm.totalCommentCount != null) countParts.push(`댓글 ${cm.totalCommentCount}개`);
    if (cm.totalLikeCount    != null) countParts.push(`공감 👍 ${cm.totalLikeCount}`);
    if (cm.totalDislikeCount != null) countParts.push(`비공감 👎 ${cm.totalDislikeCount}`);
    if (countParts.length > 0) lines.push(`- ${countParts.join(" | ")}`);

    if (cm.topComments.length > 0) {
      lines.push(`- **상위 댓글:**`);
      cm.topComments.forEach((c) => {
        const author  = c.author     ? `**[${c.author}]** ` : "";
        const likes   = c.likeCount  != null ? ` 👍 ${c.likeCount}`  : "";
        const replies = c.replyCount != null ? ` 💬 ${c.replyCount}` : "";
        lines.push(`  > ${author}${c.content}${likes}${replies}`);
      });
    }

    lines.push(`- 출처: ${cm.commentSource} | 수집: ${cm.commentCollectedAt.slice(0, 16).replace("T", " ")}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

// =============================================
// 상단 요약 테이블 생성
// =============================================
function renderSummaryTable(packages: ShortsPackage[]): string {
  const lines: string[] = [];

  lines.push("## 📊 전체 이슈 요약 테이블");
  lines.push("");
  lines.push("| 순위 | 키워드 | 출처 수 | 중복 여부 | 대표 제목 (앞 25자) |");
  lines.push("|------|--------|---------|-----------|----------------------|");

  for (const pkg of packages) {
    const dup = pkg.isNearDuplicate
      ? `🔁 근중복 G${pkg.duplicateGroupId}`
      : pkg.duplicateLevel === "similar"
      ? `↔️ 유사 G${pkg.duplicateGroupId}`
      : "-";
    const shortTitle = pkg.representativeTitle.slice(0, 25) + (pkg.representativeTitle.length > 25 ? "…" : "");
    lines.push(
      `| #${pkg.rank} | **${pkg.clusterKeyword}** | ${pkg.sourceCount}개 | ${dup} | ${shortTitle} |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

// =============================================
// 검토 가이드 (리포트 맨 아래 고정)
// =============================================
function renderReviewGuide(): string {
  return `---

## ✅ 검토 체크리스트

업로드 전 아래 항목을 확인하세요.

- [ ] **제목 후보** 중 가장 자연스러운 것 선택
- [ ] **훅 문구** 중 첫 3초에 어울리는 것 선택
- [ ] **썸네일 문구** 확인 — 너무 자극적이지 않은지
- [ ] 실제 기사 원문 링크를 확인하고 사실 여부 검토
- [ ] 해시태그 10개 중 관련성 낮은 것 제거

---
*이 리포트는 자동 생성된 초안입니다. 최종 판단은 사람이 합니다.*
`;
}

// =============================================
// 전체 markdown 문서 조립
// =============================================
function buildMarkdown(packages: ShortsPackage[], generatedAt: string): string {
  const today = getToday();
  const nearDupCount = packages.filter((p) => p.isNearDuplicate).length;

  const header = [
    `# 📰 뉴스 숏츠 일일 리포트 — ${today}`,
    "",
    `> **생성 시각**: ${formatDateTime(generatedAt)}  `,
    `> **총 이슈**: ${packages.length}개 (정치 이슈만 선별)  `,
    `> **근중복 이슈**: ${nearDupCount}건 (🔁 표시 항목 — 상위 이슈와 내용 중복 가능성 있음)`,
    "",
    "---",
    "",
  ].join("\n");

  const table = renderSummaryTable(packages);
  const issues = packages.map(renderIssueBlock).join("");
  const guide = renderReviewGuide();

  return header + table + "\n---\n\n" + issues + guide;
}

// =============================================
// 파일로 저장 + 아카이브
// =============================================
function saveReport(markdown: string, ats?: ArchiveTs): string {
  const dir = "outputs/reports";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fileName = `${getToday()}-report.md`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, markdown, "utf-8");

  archiveText("reports", "report", "md", markdown, ats);

  return filePath;
}

// =============================================
// 메인 함수: ShortsPackage 배열 → 리포트 생성
// =============================================
export function generateReport(
  packages: ShortsPackage[],
  generatedAt: string,
  ats?: ArchiveTs
): string {
  const markdown = buildMarkdown(packages, generatedAt);
  return saveReport(markdown, ats);
}

// =============================================
// 독립 실행용: 오늘 날짜 shorts JSON을 읽어서 리포트 생성
// npm run report 로 호출됨
// =============================================
export async function generateReportFromFile(): Promise<void> {
  const shortsPath = path.join("outputs/shorts", `${getToday()}.json`);

  if (!fs.existsSync(shortsPath)) {
    logger.error(`[Report] 파일을 찾을 수 없습니다: ${shortsPath}`);
    logger.error(`[Report] 먼저 npm run dev 를 실행해 shorts 파일을 생성하세요.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(shortsPath, "utf-8");
  const data: ShortsResult = JSON.parse(raw);

  logger.info(`[Report] ${data.items.length}개 패키지 로드 완료 → 리포트 생성 중...`);
  const reportPath = generateReport(data.items, data.generatedAt);
  logger.success(`[Report] 리포트 저장 완료 → ${reportPath}`);
}
