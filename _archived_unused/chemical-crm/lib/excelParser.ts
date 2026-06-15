/**
 * lib/excelParser.ts
 * Universal Excel parser for CRM import.
 * No server-only imports — safe for both client and server.
 */

export type ParsedRow = {
  rowIndex: number;     // 1-based row number in the sheet
  companyName: string;
  email: string;
  country: string;
  website: string;
  emailSubject: string;
  emailBody: string;
};

// ── Normalization ──────────────────────────────────────────────────────────────

/** Lowercase + strip everything except Korean letters, Latin letters, digits.
 *  Handles spaces, underscores, parentheses, emojis, slashes, dots, etc. */
function nk(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

// ── Column aliases ─────────────────────────────────────────────────────────────

const ALIASES: Record<string, string[]> = {
  no:             ['no', 'no.', '번호'],
  // Priority 1: Korean company names
  companyName:    ['업체명', '회사명', '업체명(companyname)'],
  // Priority 2: English/bilingual company names
  companyNameEn:  ['영문업체명(englishname)', 'englishname', 'english name'],
  // Priority 3: generic "Company" column
  companyNameLat: ['company'],
  country:        ['국가', '국가/지역', '국가(country)', 'country'],
  website:        ['website', '홈페이지', '웹사이트'],
  email:          ['email', '이메일', 'e-mail', '대표메일'],
  emailSubject:   ['abm_첫메일_제목(영문)'],
  emailBody:      ['abm_첫메일_본문(영문,부담없이)', 'abm_첫메일_본문(영문)'],
};

const ALIAS_MAP = new Map<string, string>();
for (const [field, list] of Object.entries(ALIASES)) {
  for (const a of list) ALIAS_MAP.set(nk(a), field);
}

// ── Sheet selection ────────────────────────────────────────────────────────────

const PREFERRED_NK = nk('여과지관련업체');

export function pickSheet(sheetNames: string[]): { name: string; matchedPreferred: boolean } {
  const preferred = sheetNames.find(n => nk(n).includes(PREFERRED_NK));
  if (preferred) return { name: preferred, matchedPreferred: true };
  return { name: sheetNames[0] ?? '', matchedPreferred: false };
}

// ── Header row detection ───────────────────────────────────────────────────────

const COMPANY_NK = new Set([
  '업체명', '회사명', '업체명(companyname)',
  '영문업체명(englishname)', 'englishname', 'company',
].map(nk));

const CONTACT_NK = new Set([
  'website', '홈페이지', '웹사이트', 'email', '이메일', 'e-mail', '대표메일',
].map(nk));

/** Scan up to maxScan rows and return the 0-based index of the header row.
 *  A row is a header if it contains a company-name column AND a contact column. */
export function detectHeaderRow(grid: unknown[][], maxScan = 15): number {
  for (let i = 0; i < Math.min(maxScan, grid.length); i++) {
    const cells = (grid[i] as unknown[]).map(c => nk(c));
    if (cells.some(c => COMPANY_NK.has(c)) && cells.some(c => CONTACT_NK.has(c))) return i;
  }
  return 0;
}

// ── Column map ─────────────────────────────────────────────────────────────────

export function buildColumnMap(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  (headerRow ?? []).forEach((cell, idx) => {
    const field = ALIAS_MAP.get(nk(cell));
    if (field && !(field in map)) map[field] = idx;
  });
  return map;
}

// ── Value sanitization ─────────────────────────────────────────────────────────

const PLACEHOLDER_RE = [
  /^\s*\(공개/,
  /^\s*\(공식/,
  /없음\)/,
  /^\s*[-—]+\s*$/,
  /^\s*n\/a\s*$/i,
  /^\s*미확인\s*$/,
];

function isPlaceholder(v: string): boolean {
  return !v.trim() || PLACEHOLDER_RE.some(r => r.test(v));
}

/** Common TLDs — used to find where a domain legitimately ends
 *  even when extra text is concatenated directly after (e.g., ".coma1filter"). */
const KNOWN_TLDS = new Set([
  'com', 'net', 'org', 'io', 'info', 'biz', 'edu', 'gov', 'co',
  'de', 'fr', 'uk', 'cn', 'kr', 'jp', 'it', 'es', 'nl', 'se',
  'no', 'fi', 'dk', 'pl', 'cz', 'at', 'ch', 'be', 'au', 'ca',
  'us', 'ru', 'br', 'in', 'mx', 'za', 'ae', 'sg', 'hk', 'tw',
  'tr', 'il', 'sa', 'my', 'th', 'id', 'ph', 'vn', 'ro', 'hu',
  'eu', 'me', 'tv', 'tech', 'site', 'online',
]);

/** Find the last dot in s, then truncate after the shortest known TLD that starts
 *  at that position.  Falls back to the pure-alpha prefix if TLD is unknown. */
function truncateAtTld(s: string): string {
  const lastDot = s.lastIndexOf('.');
  if (lastDot < 0) return s;
  const tldRaw = s.slice(lastDot + 1).toLowerCase();
  // Try longest-first so "com" wins over "co"
  for (let len = Math.min(tldRaw.length, 6); len >= 2; len--) {
    if (KNOWN_TLDS.has(tldRaw.slice(0, len))) {
      return s.slice(0, lastDot + 1 + len);
    }
  }
  const alpha = tldRaw.match(/^[a-zA-Z]{2,6}/);
  return alpha ? s.slice(0, lastDot + 1 + alpha[0].length) : s;
}

/** Extract the first valid-looking email from a potentially dirty string.
 *  e.g. "sales10@4gefilter.com4gefilter" → "sales10@4gefilter.com" */
export function extractEmail(raw: string): string {
  if (isPlaceholder(raw)) return '';
  const match = raw.match(/[a-zA-Z0-9._%+\-]+@([a-zA-Z0-9\-]+\.)+[a-zA-Z0-9]+/);
  if (!match) return '';
  return truncateAtTld(match[0]);
}

/** Extract the first valid http/https URL from a potentially dirty string.
 *  e.g. "https://www.a1filter.coma1filter+1" → "https://www.a1filter.com"
 *  e.g. "https://www.atmcoil.com (ATM Coil)chillventa+2" → "https://www.atmcoil.com" */
export function extractUrl(raw: string): string {
  if (isPlaceholder(raw)) return '';
  // Split on space or opening parenthesis to discard trailing annotation text
  const candidate = raw.split(/[\s(]/)[0];
  if (!/^https?:\/\//i.test(candidate)) return '';
  const protoMatch = candidate.match(/^https?:\/\//i) as RegExpMatchArray;
  const proto = protoMatch[0];
  const withoutProto = candidate.slice(proto.length);
  const slashIdx = withoutProto.indexOf('/');
  const domainRaw = slashIdx >= 0 ? withoutProto.slice(0, slashIdx) : withoutProto;
  const path = slashIdx >= 0 ? withoutProto.slice(slashIdx) : '';
  const domain = truncateAtTld(domainRaw).replace(/[+,;:!?]+$/, '');
  return proto + domain + path;
}

// ── Main parser ────────────────────────────────────────────────────────────────

function cell(row: unknown[], idx: number | undefined): string {
  return idx !== undefined && idx >= 0 ? String(row[idx] ?? '').trim() : '';
}

export function parseGrid(
  grid: unknown[][],
  headerRowIdx: number,
  colMap: Record<string, number>,
): ParsedRow[] {
  return grid
    .slice(headerRowIdx + 1)
    .filter(r => (r as unknown[]).some(c => String(c ?? '').trim()))
    .map((r, i) => ({
      rowIndex: headerRowIdx + 2 + i,
      // Company name: Korean name → English/bilingual name → generic "Company" column
      companyName:
        cell(r as unknown[], colMap['companyName']) ||
        cell(r as unknown[], colMap['companyNameEn']) ||
        cell(r as unknown[], colMap['companyNameLat']),
      email:        extractEmail(cell(r as unknown[], colMap['email'])),
      website:      extractUrl(cell(r as unknown[], colMap['website'])),
      country:      cell(r as unknown[], colMap['country']),
      emailSubject: cell(r as unknown[], colMap['emailSubject']),
      emailBody:    cell(r as unknown[], colMap['emailBody']),
    }));
}
