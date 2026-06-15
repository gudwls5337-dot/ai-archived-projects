import { ScoredIssue, ShortsPackage } from "../types/news";

// =============================================
// 숏츠 이슈 유형 분류
// 키워드로 유형을 파악해서 문안 톤을 다르게
// =============================================
type IssueType = "tech" | "economy" | "politics" | "social" | "world" | "general";

function classifyIssueType(keyword: string, titles: string[]): IssueType {
  const combined = (keyword + " " + titles.join(" ")).toLowerCase();
  if (/ai|gpt|반도체|로봇|배터리|우주|테크|it|앱|플랫폼/.test(combined)) return "tech";
  if (/주가|증시|금리|환율|물가|부동산|경제|gdp|수출|투자/.test(combined)) return "economy";
  if (/대통령|국회|정당|선거|여당|야당|정부|정치/.test(combined)) return "politics";
  if (/사망|사고|재난|범죄|수사|시위|파업/.test(combined)) return "social";
  if (/미국|중국|일본|러시아|유럽|글로벌|국제/.test(combined)) return "world";
  return "general";
}

// =============================================
// 30초용 핵심 요약 생성
// 대표 기사 제목 + description 에서 핵심만 뽑음
// =============================================
function buildSummary(issue: ScoredIssue): string {
  const keyword = issue.clusterKeyword;
  const title = issue.representativeTitle;

  // description 중 가장 긴 것 하나 선택
  const bestDesc = issue.articles
    .map((a) => a.description)
    .filter((d) => d.length > 20)
    .sort((a, b) => b.length - a.length)[0] ?? "";

  // 설명문 앞 200자 사용
  const shortDesc = bestDesc.slice(0, 200).trim();

  // 출처 수 정보 추가
  const sourceInfo =
    issue.sources.length > 1
      ? `${issue.sources.length}개 언론이 주목한 `
      : `${issue.sources[0]}이 보도한 `;

  const summary = `${sourceInfo}오늘의 핵심 이슈입니다. ${keyword} 관련해서 "${title.slice(0, 25)}"${shortDesc ? ` — ${shortDesc}` : ""}`;

  return summary;
}

// =============================================
// 영상 제목 후보 3개 생성
// 세 가지 포맷으로 각각 생성
// =============================================
function buildTitleCandidates(
  issue: ScoredIssue,
  type: IssueType
): string[] {
  const kw = issue.clusterKeyword;
  const shortTitle = issue.representativeTitle.slice(0, 20);

  // 포맷 1: 질문형 — 궁금증 유발
  const q = `"${kw}" 지금 무슨 일이? 30초 완전 정리`;

  // 포맷 2: 숫자형 — 구체적 정보 약속
  const count = issue.articleCount;
  const n = `${count}개 기사가 동시에 다룬 오늘의 ${kw} 이슈`;

  // 포맷 3: 유형별 맞춤 포맷
  const typeMap: Record<IssueType, string> = {
    tech:     `${kw} 트렌드 | 오늘 꼭 알아야 할 기술 이슈`,
    economy:  `${kw} 변화 | 내 지갑에 영향 있나? 빠르게 정리`,
    politics: `${kw} 상황 정리 | 팩트만 뽑아드립니다`,
    social:   `${kw} 사건 | 지금 어떻게 됐나요?`,
    world:    `글로벌 이슈 | ${kw}, 한국엔 어떤 영향?`,
    general:  `오늘의 이슈 "${shortTitle}..." 30초 요약`,
  };

  return [q, n, typeMap[type]];
}

// =============================================
// 오프닝 훅 문구 3개 생성
// 첫 3초 안에 시청자를 붙잡는 문장
// =============================================
function buildHooks(issue: ScoredIssue, type: IssueType): string[] {
  const kw = issue.clusterKeyword;
  const sourceCount = issue.sources.length;

  // 훅 1: 숫자로 신뢰감
  const h1 = `지금 ${sourceCount}개 이상의 언론이 "${kw}"를 동시에 보도하고 있습니다.`;

  // 훅 2: 유형별 맞춤 훅
  const hookMap: Record<IssueType, string> = {
    tech:     `AI 시대, ${kw} 모르면 뒤처집니다. 30초만 투자하세요.`,
    economy:  `${kw} 때문에 내 돈이 달라질 수 있습니다. 지금 확인하세요.`,
    politics: `${kw}에 대해 알아야 할 핵심 팩트, 30초에 정리해드립니다.`,
    social:   `지금 ${kw} 관련해서 중요한 상황이 벌어지고 있습니다.`,
    world:    `해외에서 ${kw} 이슈가 터졌습니다. 한국에 영향 있을까요?`,
    general:  `오늘 꼭 알아야 할 이슈, ${kw}! 30초면 충분합니다.`,
  };
  const h2 = hookMap[type];

  // 훅 3: 시청 완료 유도
  const h3 = `이 영상 끝까지 보시면 "${kw}" 이슈, 완전히 이해하실 수 있습니다.`;

  return [h1, h2, h3];
}

// =============================================
// 유튜브 description 설명문 생성
// 검색 노출을 고려한 자연스러운 문장
// =============================================
function buildDescription(issue: ScoredIssue): string {
  const kw = issue.clusterKeyword;
  const date = issue.latestPubDate.slice(0, 10); // YYYY-MM-DD
  const sourceList = issue.sources.slice(0, 3).join(", ");

  return (
    `${date} 기준, "${kw}" 관련 핵심 이슈를 30초로 요약했습니다.\n` +
    `여러 언론의 보도를 바탕으로 사실 위주로 정리했습니다.\n\n` +
    `📰 참고 출처: ${sourceList}${issue.sources.length > 3 ? ` 외 ${issue.sources.length - 3}곳` : ""}\n` +
    `⚠️ 본 영상은 뉴스 요약 콘텐츠이며, 특정 입장을 대변하지 않습니다.`
  );
}

// =============================================
// 해시태그 10개 생성
// =============================================
function buildHashtags(issue: ScoredIssue, type: IssueType): string[] {
  const kw = issue.clusterKeyword;

  // 기본 공통 해시태그
  const base = ["#뉴스요약", "#숏츠", "#오늘뉴스", "#30초뉴스", "#이슈"];

  // 유형별 해시태그
  const typeHashtags: Record<IssueType, string[]> = {
    tech:     ["#테크뉴스", "#IT이슈", "#기술트렌드"],
    economy:  ["#경제뉴스", "#재테크", "#주식"],
    politics: ["#정치뉴스", "#시사", "#팩트체크"],
    social:   ["#사회이슈", "#시사뉴스", "#사건사고"],
    world:    ["#글로벌이슈", "#해외뉴스", "#국제"],
    general:  ["#시사", "#뉴스", "#정보"],
  };

  // 키워드 기반 해시태그 (공백 제거)
  const kwTag = `#${kw.replace(/\s+/g, "")}`;

  const combined = [kwTag, ...base, ...typeHashtags[type]];

  // 중복 제거 후 10개로 제한
  return [...new Set(combined)].slice(0, 10);
}

// =============================================
// 썸네일 문구 3개 생성
// 짧고 임팩트 있게 (10자 이내 권장)
// =============================================
function buildThumbnailTexts(
  issue: ScoredIssue,
  type: IssueType
): string[] {
  const kw = issue.clusterKeyword;

  // 문구 1: 키워드 + 긴급감
  const t1 = `${kw} 긴급 🚨`;

  // 문구 2: 유형별
  const typeMap: Record<IssueType, string> = {
    tech:     `${kw} 혁신`,
    economy:  `${kw} 변동 📈`,
    politics: `${kw} 팩트`,
    social:   `${kw} 상황`,
    world:    `글로벌 ${kw}`,
    general:  `${kw} 정리`,
  };
  const t2 = typeMap[type];

  // 문구 3: 공통 행동 유도
  const t3 = "30초 완전 정리";

  return [t1, t2, t3];
}

// =============================================
// 화면 연출 아이디어 3개 생성
// 유형별로 다른 영상 구성 제안
// =============================================
function buildScreenIdeas(issue: ScoredIssue, type: IssueType): string[] {
  const kw = issue.clusterKeyword;

  const ideaMap: Record<IssueType, string[]> = {
    tech: [
      `화면 상단에 "${kw}" 키워드 크게 띄우고, 관련 기술 이미지(AI 칩, 로봇 등) 배경`,
      `뉴스 헤드라인을 카드 슬라이드 형식으로 순서대로 등장`,
      `숫자(출처 수, 관련 수치)를 카운트업 애니메이션으로 강조`,
    ],
    economy: [
      `주가·환율 등 숫자 차트 화면 배경으로 사용`,
      `뉴스 헤드라인을 자막 형태로 하단에 흘려보내기`,
      `변화량(상승/하락)을 화살표 그래픽으로 시각화`,
    ],
    politics: [
      `관련 인물 or 장소 이미지(국회, 청와대 등)를 배경으로 흐리게 처리`,
      `핵심 발언을 큰 자막으로 화면 가운데 표시`,
      `팩트 vs 루머를 두 컬럼으로 나눠 정리`,
    ],
    social: [
      `뉴스 현장 느낌의 배경(속보 자막바 스타일)`,
      `타임라인 형식으로 사건 경과 정리`,
      `인포그래픽으로 핵심 숫자(피해 규모, 인원 등) 강조`,
    ],
    world: [
      `세계 지도에서 해당 국가/지역 하이라이트`,
      `외신 헤드라인을 자막으로 등장시킨 뒤 한국어 번역 표시`,
      `"한국에 미치는 영향" 섹션을 별도 카드로 마무리`,
    ],
    general: [
      `뉴스 제목을 큰 폰트로 중앙에 배치, 배경은 단색 또는 흐린 이미지`,
      `핵심 포인트를 번호 리스트로 순차 등장`,
      `마지막 화면에 출처 목록 표시 후 구독 유도 자막`,
    ],
  };

  return ideaMap[type];
}

// =============================================
// 메인 함수: ScoredIssue 하나 → ShortsPackage 하나
// =============================================
export function generateShortsPackage(issue: ScoredIssue): ShortsPackage {
  const type = classifyIssueType(
    issue.clusterKeyword,
    issue.articles.map((a) => a.title)
  );

  return {
    rank: issue.rank,
    clusterKeyword: issue.clusterKeyword,
    representativeTitle: issue.representativeTitle,
    representativeUrl: issue.representativeUrl,

    summary: buildSummary(issue),
    titleCandidates: buildTitleCandidates(issue, type),
    hooks: buildHooks(issue, type),
    description: buildDescription(issue),
    hashtags: buildHashtags(issue, type),
    thumbnailTexts: buildThumbnailTexts(issue, type),
    screenIdeas: buildScreenIdeas(issue, type),

    riskNotes: undefined,
    commentMeta: issue.commentMeta,

    sourceCount: issue.sources.length,
    sources: issue.sources,
    generatedAt: new Date().toISOString(),

    // 2차 유사도 체크 결과 전파
    duplicateGroupId: issue.duplicateGroupId,
    duplicateLevel: issue.duplicateLevel,
    isNearDuplicate: issue.isNearDuplicate,
  };
}

// =============================================
// 배열 전체 처리
// =============================================
export function generateAllPackages(issues: ScoredIssue[]): ShortsPackage[] {
  return issues.map(generateShortsPackage);
}
