import { resolveMx } from "dns/promises";

/**
 * 이메일 정규화 및 중복 제거 유틸
 */

export function normalizeEmail(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^mailto:/i, "")
    .split(/[\s,;]+/)[0]
    .trim();
}

/**
 * 정규화된 이메일이 발송 가능한 형식인지 검증.
 */
export function isValidEmail(raw: string): boolean {
  const norm = normalizeEmail(raw);
  if (!norm) return false;
  if (/https?:\/\//i.test(norm)) return false;
  if (/\s/.test(norm)) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(norm)) return false;
  return true;
}

// ── MX 도메인 확인 ────────────────────────────────────────────────────────────

// 프로세스 수명 동안 도메인 결과 캐시 (동일 배치에서 중복 조회 방지)
const _mxCache = new Map<string, boolean>();

/**
 * 이메일 도메인의 MX 레코드 존재 여부 확인.
 * 결과는 프로세스 메모리에 캐시됨.
 * SKIP_MX_CHECK=true 환경변수로 전체 스킵 가능.
 */
export async function checkMxDomain(email: string): Promise<boolean> {
  if (process.env.SKIP_MX_CHECK === "true") return true;
  const domain = normalizeEmail(email).split("@")[1]?.toLowerCase();
  if (!domain) return false;
  if (_mxCache.has(domain)) return _mxCache.get(domain)!;
  try {
    const records = await resolveMx(domain);
    const ok = Array.isArray(records) && records.length > 0;
    _mxCache.set(domain, ok);
    return ok;
  } catch {
    _mxCache.set(domain, false);
    return false;
  }
}

/**
 * 여러 이메일에 대해 MX 도메인 확인을 배치 실행.
 * 같은 도메인은 캐시로 1번만 조회.
 * CONCURRENCY 개씩 묶어서 조회 → libuv 스레드풀/소켓 폭주 방지.
 * @returns invalid email 목록
 */
export async function filterInvalidMxEmails(emails: string[]): Promise<Set<string>> {
  const CONCURRENCY = 20; // 한 번에 최대 20개 도메인만 병렬 조회

  // 고유 도메인 추출 (캐시에 없는 것만)
  const domains = new Set<string>();
  for (const email of emails) {
    const domain = normalizeEmail(email).split("@")[1]?.toLowerCase();
    if (domain && !_mxCache.has(domain)) domains.add(domain);
  }

  // 배치별 MX 조회
  const domainList = [...domains];
  for (let i = 0; i < domainList.length; i += CONCURRENCY) {
    const batch = domainList.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(d => checkMxDomain(`x@${d}`)));
  }

  // invalid 이메일 수집
  const invalid = new Set<string>();
  for (const email of emails) {
    const domain = normalizeEmail(email).split("@")[1]?.toLowerCase();
    if (!domain || _mxCache.get(domain) === false) {
      invalid.add(normalizeEmail(email));
    }
  }
  return invalid;
}

// ── SMTP 실패 분류 ─────────────────────────────────────────────────────────────

export type SmtpFailureReason =
  | "invalid_domain_or_mx"   // 도메인 없음 / MX 레코드 없음 / 550 5.4.4
  | "invalid_email"           // 이메일 형식 오류
  | "delayed"                 // 임시 장애 / 4xx 일시적 거절
  | "too_many_messages"       // 발송 속도 제한 421
  | "too_many_recipients"     // 수신자 수 초과 452 4.5.3
  | "smtp_auth_error"         // 인증 실패 535
  | "mailbox_unavailable"     // 수신함 없음 / 사용자 없음
  | "spam_or_policy_block"    // 스팸·정책 차단 550 5.7.x
  | "unknown";

/**
 * SMTP 발송 에러를 사유별로 분류.
 */
export function classifySmtpError(err: unknown): SmtpFailureReason {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const responseCode: number = (err as any)?.responseCode ?? 0;

  // ① 도메인/MX 실패 — 네트워크 레벨 DNS 실패 또는 550 5.4.4 (unroutable)
  if (
    /enotfound|couldn.t find any host|name or service not known|host.*not.*found/.test(msg) ||
    /5\.4\.4|unroutable address/.test(msg) ||
    (responseCode === 550 && /5\.4/.test(msg))
  ) {
    return "invalid_domain_or_mx";
  }

  // ② 발송 속도 제한 — 421 Too many messages / rate limit
  if (
    responseCode === 421 ||
    /too.many.messages|rate.limit|connection.*throttl/.test(msg)
  ) {
    return "too_many_messages";
  }

  // ③ 수신자 수 초과 — 452 4.5.3
  if (
    /4\.5\.3|too.many.recipients/.test(msg) ||
    (responseCode === 452 && /recipient/.test(msg))
  ) {
    return "too_many_recipients";
  }

  // ④ 스팸·정책 차단 — 550 5.7.x
  if (
    /5\.7\.|spam|policy.*block|reject.*policy|blocked.*message/.test(msg) ||
    (responseCode === 550 && /5\.7/.test(msg))
  ) {
    return "spam_or_policy_block";
  }

  // ⑤ SMTP 인증 실패
  if (/authentication|auth.*fail|535/.test(msg) || responseCode === 535) {
    return "smtp_auth_error";
  }

  // ⑥ 수신함 없음 / 사용자 없음
  if (
    /mailbox.*unavailable|user.*unknown|no.*such.*user|address.*rejected/.test(msg) ||
    [551, 552, 553].includes(responseCode) ||
    (responseCode === 550 && !/5\.\d\.\d/.test(msg))
  ) {
    return "mailbox_unavailable";
  }

  // ⑦ 4xx 임시 오류 → 지연
  if (responseCode >= 400 && responseCode < 500) {
    return "delayed";
  }

  return "unknown";
}

// ── Contact 중복 제거 ─────────────────────────────────────────────────────────

export type ContactForDedup = {
  id: string;
  email: string;
  hasReplied: boolean;
  excludedFromSending: boolean;
  duplicateOfContactId: string | null;
  createdAt: Date;
  title?: string | null;
  mailLogs?: { openCount: number }[];
  company: { name: string };
};

export type DuplicateGroup = {
  normalizedEmail: string;
  keptContactId: string;
  excludedContactIds: string[];
  companyNames: string[];
};

/**
 * 동일 normalized email 기준으로 1개만 남김.
 */
export function dedupeContactsByEmail<T extends ContactForDedup>(
  contacts: T[]
): { kept: T[]; duplicateGroups: DuplicateGroup[] } {
  const emailMap = new Map<string, T[]>();

  for (const contact of contacts) {
    const norm = normalizeEmail(contact.email);
    if (!norm) continue;
    if (!emailMap.has(norm)) emailMap.set(norm, []);
    emailMap.get(norm)!.push(contact);
  }

  const kept: T[] = [];
  const duplicateGroups: DuplicateGroup[] = [];

  for (const [normalizedEmail, group] of emailMap.entries()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }

    const sorted = [...group].sort((a, b) => {
      if (!a.excludedFromSending && b.excludedFromSending) return -1;
      if (a.excludedFromSending && !b.excludedFromSending) return 1;
      if (!a.duplicateOfContactId && b.duplicateOfContactId) return -1;
      if (a.duplicateOfContactId && !b.duplicateOfContactId) return 1;
      if (a.hasReplied && !b.hasReplied) return -1;
      if (!a.hasReplied && b.hasReplied) return 1;
      const aOpen = (a.mailLogs ?? []).reduce((s, l) => s + l.openCount, 0);
      const bOpen = (b.mailLogs ?? []).reduce((s, l) => s + l.openCount, 0);
      if (aOpen !== bOpen) return bOpen - aOpen;
      if (a.title && !b.title) return -1;
      if (!a.title && b.title) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    kept.push(sorted[0]);
    duplicateGroups.push({
      normalizedEmail,
      keptContactId: sorted[0].id,
      excludedContactIds: sorted.slice(1).map((c) => c.id),
      companyNames: sorted.map((c) => c.company.name),
    });
  }

  return { kept, duplicateGroups };
}
