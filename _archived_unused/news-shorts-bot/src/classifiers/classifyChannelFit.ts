import { ChannelFit, SensitivityLevel } from "../types/political";
import { ScoredIssue } from "../types/news";
import { loadAdjustments, FeedbackAdjustments } from "../utils/politicalFeedback";

// =============================================
// 조정값 모듈 단위 캐시 (프로세스당 1회 로드)
// =============================================
let _adjustmentsCache: FeedbackAdjustments | null | undefined = undefined;

function getCachedAdjustments(): FeedbackAdjustments | null {
  if (_adjustmentsCache === undefined) {
    _adjustmentsCache = loadAdjustments();
  }
  return _adjustmentsCache;
}

// =============================================
// 보수채널 이슈 키워드 (인물명 제외)
// 인물명은 아래 PERSON_CONTEXT_RULES 에서 별도 처리
// =============================================
const CONSERVATIVE_KEYWORDS = [
  "국민의힘", "자유당", "보수", "우파",
  "한미동맹", "안보", "북한", "반공", "친미", "주한미군",
  "시장경제", "규제완화", "감세", "친기업",
  "법치", "질서", "전통",
  "공수처폐지", "검수완박반대",
  "자유민주주의", "헌법수호",
];

// =============================================
// 진보채널 이슈 키워드 (인물명 제외)
// =============================================
const PROGRESSIVE_KEYWORDS = [
  "민주당", "진보", "좌파",
  "검찰개혁", "검찰수사", "특검", "공수처",
  "노동", "복지", "평등", "인권", "최저임금",
  "재벌개혁", "대기업규제", "부동산규제",
  "탄핵", "국정조사",
  "기후변화", "다양성", "사회안전망",
];

// =============================================
// 인물명 + 문맥 조합 스코어링
//
// 인물명 단독 매칭은 분류 근거로 사용하지 않음.
// 반드시 방향성 문맥 키워드가 함께 나타나야 점수 부여.
// =============================================
interface PersonContextRule {
  person: string;
  direction: "conservative" | "progressive";
  contextKeywords: string[];
  score: number;  // 해당 방향에 더하는 가중치 (최대 2)
}

const PERSON_CONTEXT_RULES: PersonContextRule[] = [
  // ── 이재명 비판 → 보수 신호 ──────────────────
  {
    person: "이재명",
    direction: "conservative",
    contextKeywords: ["비판", "규탄", "수사", "의혹", "구속", "기소", "반대", "논란", "거짓", "실패", "사기", "체포"],
    score: 2,
  },
  // ── 이재명 지지/정책 → 진보 신호 ─────────────
  {
    person: "이재명",
    direction: "progressive",
    contextKeywords: ["성과", "지지", "공약", "추진", "발표", "정책", "개혁", "복지", "민생", "약속"],
    score: 2,
  },
  // ── 윤석열 비판/탄핵 → 진보 신호 ────────────
  {
    person: "윤석열",
    direction: "progressive",
    contextKeywords: ["탄핵", "구속", "수사", "비판", "규탄", "실패", "논란", "내란", "계엄", "파면"],
    score: 2,
  },
  // ── 윤석열 옹호/복권 → 보수 신호 ────────────
  {
    person: "윤석열",
    direction: "conservative",
    contextKeywords: ["지지", "복권", "무죄", "석방", "옹호", "선처", "구명"],
    score: 2,
  },
  // ── 김정은 언급 → 안보 이슈 → 보수 신호 ──────
  {
    person: "김정은",
    direction: "conservative",
    contextKeywords: ["도발", "미사일", "핵", "위협", "침략", "도전", "긴장"],
    score: 1,
  },
];

// =============================================
// 고민감도 키워드
// =============================================
const HIGH_SENSITIVITY_KEYWORDS = [
  "탄핵", "계엄", "쿠데타", "혁명", "반란",
  "체포", "구속", "기소", "수사",
  "내란", "반역", "폭동",
];

// =============================================
// 중간 민감도 키워드
// =============================================
const MEDIUM_SENSITIVITY_KEYWORDS = [
  "충돌", "갈등", "대립", "논란", "파장",
  "외교마찰", "북핵", "전쟁", "충격", "파문",
];

// 분류 최소 히트 수 (이 미만이면 unclear)
const MIN_HITS_FOR_CLEAR = 2;
// 양쪽 히트 시 우세 비율 (이 미만이면 mixed)
const CLEAR_RATIO = 2.0;

// =============================================
// 분류 결과 타입
// =============================================
export interface ChannelFitResult {
  fit: ChannelFit;
  reason: string;
  evidenceKeywords: string[];
  sensitivityLevel: SensitivityLevel;
  reviewMemo: string;
  personContextMatched: string[];
  feedbackAdjusted: boolean;   // 피드백 보정이 적용된 경우 true
  feedbackNote: string;        // 보정 내용 요약 (빈 문자열 = 미적용)
}

function extractText(issue: ScoredIssue): string {
  return [
    issue.clusterKeyword,
    issue.representativeTitle,
    ...issue.representativeKeywords,
    ...issue.articles.map((a) => a.title + " " + (a.description ?? "")),
  ].join(" ");
}

// =============================================
// 인물 + 문맥 조합 점수 계산
// =============================================
function calcPersonContextScore(text: string): {
  conservative: number;
  progressive: number;
  matched: string[];
} {
  let conservative = 0;
  let progressive  = 0;
  const matched: string[] = [];

  for (const rule of PERSON_CONTEXT_RULES) {
    if (!text.includes(rule.person)) continue;

    const hitContext = rule.contextKeywords.find((kw) => text.includes(kw));
    if (!hitContext) continue;

    const label = `${rule.person}+${hitContext}`;
    if (!matched.includes(label)) {
      matched.push(label);
      if (rule.direction === "conservative") conservative += rule.score;
      else                                   progressive  += rule.score;
    }
  }

  return { conservative, progressive, matched };
}

// =============================================
// 채널 적합도 분류
// =============================================
export function classifyChannelFit(issue: ScoredIssue): ChannelFitResult {
  const text = extractText(issue);

  const conservativeHits = CONSERVATIVE_KEYWORDS.filter((kw) => text.includes(kw));
  const progressiveHits  = PROGRESSIVE_KEYWORDS.filter((kw) => text.includes(kw));
  const personScore      = calcPersonContextScore(text);

  // 민감도 판정
  const highSensHits = HIGH_SENSITIVITY_KEYWORDS.filter((kw) => text.includes(kw));
  const medSensHits  = MEDIUM_SENSITIVITY_KEYWORDS.filter((kw) => text.includes(kw));
  let sensitivityLevel: SensitivityLevel = "low";
  if (highSensHits.length >= 1)     sensitivityLevel = "high";
  else if (medSensHits.length >= 1) sensitivityLevel = "medium";

  // ── 피드백 조정값 적용 ────────────────────────
  const adjustments    = getCachedAdjustments();
  const kwAdj          = adjustments?.keywordAdjustments[issue.clusterKeyword];
  const cAdj           = kwAdj?.conservativeDelta ?? 0;
  const pAdj           = kwAdj?.progressiveDelta  ?? 0;
  const feedbackAdjusted = cAdj !== 0 || pAdj !== 0;
  const feedbackNote   = feedbackAdjusted
    ? `피드백보정[${kwAdj!.correctionCount}회: ${kwAdj!.lastCorrectedTo}] C${cAdj >= 0 ? "+" : ""}${cAdj} P${pAdj >= 0 ? "+" : ""}${pAdj}`
    : "";

  // 합산 점수 (피드백 조정 포함, 최소 0)
  const cScore = Math.max(0, conservativeHits.length + personScore.conservative + cAdj);
  const pScore = Math.max(0, progressiveHits.length  + personScore.progressive  + pAdj);

  // 증거 키워드 목록
  const allEvidence = [
    ...conservativeHits,
    ...progressiveHits,
    ...personScore.matched,
    ...(feedbackAdjusted ? [feedbackNote] : []),
  ];

  const base = { sensitivityLevel, personContextMatched: personScore.matched, feedbackAdjusted, feedbackNote };

  // ── 케이스 1: 양쪽 없음 ──────────────────────
  if (cScore === 0 && pScore === 0) {
    return {
      ...base,
      fit: "unclear",
      reason: "보수/진보 특징 키워드 없음 — 분류 불가",
      evidenceKeywords: [],
      reviewMemo: "보수/진보 키워드 없음 — 정치 이슈 여부 수동 확인 필요",
    };
  }

  // ── 케이스 2: 한쪽 있지만 MIN_HITS 미만 ──────
  if (cScore > 0 && pScore === 0 && cScore < MIN_HITS_FOR_CLEAR) {
    return {
      ...base,
      fit: "unclear",
      reason: `보수 신호 ${cScore}점 — 근거 불충분으로 불명확 처리`,
      evidenceKeywords: allEvidence.slice(0, 5),
      reviewMemo: `보수 신호 ${cScore}점(${allEvidence.slice(0,3).join(", ")}) — 근거 불충분`,
    };
  }

  if (pScore > 0 && cScore === 0 && pScore < MIN_HITS_FOR_CLEAR) {
    return {
      ...base,
      fit: "unclear",
      reason: `진보 신호 ${pScore}점 — 근거 불충분으로 불명확 처리`,
      evidenceKeywords: allEvidence.slice(0, 5),
      reviewMemo: `진보 신호 ${pScore}점(${allEvidence.slice(0,3).join(", ")}) — 근거 불충분`,
    };
  }

  // ── 케이스 3: 한쪽 MIN_HITS 이상, 반대 0 ─────
  if (cScore >= MIN_HITS_FOR_CLEAR && pScore === 0) {
    return {
      ...base,
      fit: "conservative_positive",
      reason: `보수채널 적합 (키워드 ${conservativeHits.length}개 + 인물조합 ${personScore.conservative}점${feedbackAdjusted ? " + 피드백보정" : ""})`,
      evidenceKeywords: allEvidence.slice(0, 5),
      reviewMemo: "",
    };
  }

  if (pScore >= MIN_HITS_FOR_CLEAR && cScore === 0) {
    return {
      ...base,
      fit: "progressive_positive",
      reason: `진보채널 적합 (키워드 ${progressiveHits.length}개 + 인물조합 ${personScore.progressive}점${feedbackAdjusted ? " + 피드백보정" : ""})`,
      evidenceKeywords: allEvidence.slice(0, 5),
      reviewMemo: "",
    };
  }

  // ── 케이스 4: 양쪽 히트 — 비율 판정 ─────────
  if (cScore >= MIN_HITS_FOR_CLEAR && cScore > pScore * CLEAR_RATIO) {
    return {
      ...base,
      fit: "conservative_positive",
      reason: `보수 신호 우세 (보수 ${cScore}점 vs 진보 ${pScore}점${feedbackAdjusted ? ", 피드백보정 포함" : ""})`,
      evidenceKeywords: allEvidence.slice(0, 5),
      reviewMemo: "",
    };
  }

  if (pScore >= MIN_HITS_FOR_CLEAR && pScore > cScore * CLEAR_RATIO) {
    return {
      ...base,
      fit: "progressive_positive",
      reason: `진보 신호 우세 (진보 ${pScore}점 vs 보수 ${cScore}점${feedbackAdjusted ? ", 피드백보정 포함" : ""})`,
      evidenceKeywords: allEvidence.slice(0, 5),
      reviewMemo: "",
    };
  }

  // ── 케이스 5: 비율 미달 → mixed ──────────────
  const cEvidence = [
    ...conservativeHits,
    ...personScore.matched.filter((m) =>
      PERSON_CONTEXT_RULES.find((r) => r.direction === "conservative" && m.startsWith(r.person))
    ),
  ];
  const pEvidence = [
    ...progressiveHits,
    ...personScore.matched.filter((m) =>
      PERSON_CONTEXT_RULES.find((r) => r.direction === "progressive" && m.startsWith(r.person))
    ),
  ];

  return {
    ...base,
    fit: "mixed",
    reason: `보수(${cScore}점) + 진보(${pScore}점) 혼재 — 양쪽 채널 참고 가능`,
    evidenceKeywords: allEvidence.slice(0, 6),
    reviewMemo: `혼재 — 보수신호(${cEvidence.join(",") || "-"}) + 진보신호(${pEvidence.join(",") || "-"}) 단독 채널 사용 주의`,
  };
}
