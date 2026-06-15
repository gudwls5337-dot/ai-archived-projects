"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface ImapStatus { ok: boolean; reason?: string; }
interface CheckData { date: string; unarchived: number; imap: ImapStatus; }
interface BackfillResult { date: string; archived: number; failed: number; total: number; message?: string; error?: string; }
interface ResendResult { sent: number; failed: number; skippedDueToLimit: number; total: number; message?: string; error?: string; }

interface Summary {
  totalSent: number; successSent: number; archived: number; notArchived: number;
  failedSend: number; delayedCount: number; invalidDomainCount: number;
}
interface MailRow {
  id: string; sentAt: string | null; company: string;
  email: string; subject: string; status: "SUCCESS" | "FAILED"; failReason: string;
}
interface StatsData {
  date: string; summary: Summary;
  failedList: MailRow[]; unarchivedList: MailRow[]; delayedList: MailRow[];
  dailyRemaining: number | null; dailyLimit: number | null;
}
interface Toast { id: number; kind: "ok" | "err" | "warn"; msg: string; }

// ── 상수 ──────────────────────────────────────────────────────────────────────

const FAIL_REASON_LABEL: Record<string, string> = {
  invalid_domain_or_mx:  "도메인/MX 없음",
  invalid_email:         "이메일 형식 오류",
  dns_or_host_not_found: "DNS/호스트 없음",
  too_many_messages:     "발송 속도 제한 (421)",
  too_many_recipients:   "수신자 수 초과 (452)",
  smtp_auth_error:       "SMTP 인증 실패",
  mailbox_unavailable:   "수신함 없음",
  spam_or_policy_block:  "스팸/정책 차단",
  delayed:               "발송 지연",
  archive_failed:        "IMAP 저장 실패",
  unknown:               "원인 불명",
};

// 재발송 가능 사유 (일시 오류 — 재시도 의미 있음)
const RESENDABLE = new Set(["delayed", "too_many_messages", "too_many_recipients", "unknown"]);

function isResendable(reason: string) { return RESENDABLE.has(reason); }

function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

// ── 페이지 ────────────────────────────────────────────────────────────────────

export default function ArchiveAdminPage() {
  const [date, setDate]                 = useState(todayStr);
  const [check, setCheck]               = useState<CheckData | null>(null);
  const [stats, setStats]               = useState<StatsData | null>(null);
  const [loading, setLoading]           = useState<"check" | "backfill" | "resend" | null>(null);
  const [tab, setTab]                   = useState<"failed" | "delayed" | "unarchived">("failed");
  const [reasonFilter, setReasonFilter] = useState("");
  const [toasts, setToasts]             = useState<Toast[]>([]);
  const toastId = useRef(0);

  // ── Toast ─────────────────────────────────────────────────────────────────

  function pushToast(kind: "ok" | "err" | "warn", msg: string) {
    const id = ++toastId.current;
    setToasts(t => [...t, { id, kind, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 6000);
  }

  // ── 데이터 조회 ─────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async (d: string) => {
    const [checkRes, statsRes] = await Promise.all([
      fetch(`/api/archive/backfill?date=${d}`),
      fetch(`/api/archive/stats?date=${d}`),
    ]);
    setCheck(await checkRes.json());
    setStats(await statsRes.json());
  }, []);

  useEffect(() => { fetchStats(todayStr()).catch(() => {}); }, [fetchStats]);

  // ── 핸들러 ─────────────────────────────────────────────────────────────────

  async function handleCheck() {
    setLoading("check");
    try { await fetchStats(date); }
    catch { pushToast("err", "현황 조회 실패"); }
    finally { setLoading(null); }
  }

  async function handleBackfill() {
    setLoading("backfill");
    try {
      const res  = await fetch("/api/archive/backfill", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data: BackfillResult = await res.json();
      if (!res.ok) {
        pushToast("err", `백필 실패 — ${data.error ?? "알 수 없는 오류"}`);
      } else {
        const msg = data.total === 0
          ? "아카이브 누락 건 없음 (모두 정상)"
          : `백필 완료 — 총 ${data.total}건 중 성공 ${data.archived}건${data.failed > 0 ? `, 실패 ${data.failed}건` : ""}`;
        pushToast(data.failed === 0 ? "ok" : "err", msg);
        await fetchStats(date);
      }
    } catch { pushToast("err", "백필 실행 중 오류 발생"); }
    finally { setLoading(null); }
  }

  async function handleResend() {
    setLoading("resend");
    try {
      const res  = await fetch("/api/archive/resend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data: ResendResult = await res.json();
      if (!res.ok || data.error) {
        pushToast("err", `재발송 실패 — ${data.error ?? "알 수 없는 오류"}`);
      } else if (data.total === 0) {
        pushToast("warn", "재발송 대상 없음 (delayed / unknown 건 없음)");
      } else {
        const parts = [
          `성공 ${data.sent}건`,
          data.failed > 0 ? `재실패 ${data.failed}건` : null,
          data.skippedDueToLimit > 0 ? `일일 한도 초과 스킵 ${data.skippedDueToLimit}건` : null,
        ].filter(Boolean).join(" · ");
        pushToast(data.failed === 0 && data.skippedDueToLimit === 0 ? "ok" : "warn", `재발송 완료 — ${parts}`);
        await fetchStats(date);
      }
    } catch { pushToast("err", "재발송 중 오류 발생"); }
    finally { setLoading(null); }
  }

  // ── 파생 값 ────────────────────────────────────────────────────────────────

  const rawTabList: MailRow[] = stats
    ? tab === "failed"  ? stats.failedList
    : tab === "delayed" ? stats.delayedList
    : stats.unarchivedList
    : [];

  const tabList = reasonFilter ? rawTabList.filter(r => r.failReason === reasonFilter) : rawTabList;
  const reasonOptions = [...new Set(rawTabList.map(r => r.failReason))].filter(Boolean);

  // 현재 탭 + 필터 기준 재발송 가능 건수
  const resendableInTab = rawTabList.filter(r => isResendable(r.failReason)).length;

  // 전체 재발송 가능 건수 (failed + delayed 탭 합산)
  const totalResendable = stats
    ? [...stats.failedList, ...stats.delayedList].filter(r => isResendable(r.failReason)).length
    : 0;

  const hasIssue = stats && (
    stats.summary.failedSend > 0 || stats.summary.delayedCount > 0 || stats.summary.notArchived > 0
  );

  // ── 렌더 ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">

      {/* Toast */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium
            ${t.kind === "ok" ? "bg-emerald-600 text-white" : t.kind === "warn" ? "bg-amber-500 text-white" : "bg-red-600 text-white"}`}>
            <span className="mt-0.5 text-base leading-none">{t.kind === "ok" ? "✓" : t.kind === "warn" ? "!" : "✕"}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">메일 아카이브 관리</h1>
        <p className="mt-1 text-sm text-gray-500">IMAP 아카이브 점검 · 누락분 백필 · 실패 메일 재발송</p>
      </div>

      {/* ── 컨트롤 카드 ───────────────────────────────────────────────────────── */}
      <div className="mb-8 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

        {/* 날짜 + 조회 + IMAP 상태 + 일일 잔여 */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-medium text-gray-600">조회 날짜</span>
          <input type="date" value={date}
            onChange={(e) => { setDate(e.target.value); setCheck(null); setStats(null); }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button onClick={handleCheck} disabled={!!loading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors">
            {loading === "check" ? "조회 중…" : "현황 조회"}
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* IMAP 상태 */}
            {check && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${check.imap.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                IMAP {check.imap.ok ? "정상" : `오류`}
              </span>
            )}
            {/* 오늘 남은 발송 슬롯 */}
            {stats && stats.dailyLimit !== null && (
              <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                (stats.dailyRemaining ?? 0) > 50
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : (stats.dailyRemaining ?? 0) > 0
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-red-50 text-red-600 border-red-200"
              }`}>
                오늘 잔여 발송 {stats.dailyRemaining?.toLocaleString() ?? 0} / {stats.dailyLimit.toLocaleString()}건
              </span>
            )}
          </div>
        </div>

        {/* 액션 버튼 2개 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 py-5">
          {/* 백필 */}
          <div>
            <button onClick={handleBackfill} disabled={!!loading}
              className={`w-full rounded-xl py-4 text-base font-bold tracking-wide transition-all shadow-md
                ${loading === "backfill" ? "bg-gray-400 text-white cursor-not-allowed shadow-none" : "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.99] shadow-emerald-200"}`}>
              {loading === "backfill" ? "⏳ 백필 실행 중…" : "⚡ 미아카이브 백필 실행"}
            </button>
            <p className="mt-1.5 text-center text-xs text-gray-400">
              SUCCESS · archivedAt 없는 건 → IMAP 재저장
            </p>
          </div>

          {/* 재발송 */}
          <div>
            <button onClick={handleResend} disabled={!!loading || totalResendable === 0}
              className={`w-full rounded-xl py-4 text-base font-bold tracking-wide transition-all shadow-md
                ${loading === "resend"
                  ? "bg-gray-400 text-white cursor-not-allowed shadow-none"
                  : totalResendable === 0
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                    : "bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] shadow-blue-200"
                }`}>
              {loading === "resend"
                ? "⏳ 재발송 중…"
                : totalResendable > 0
                  ? `↩ 실패 메일 재발송 (${totalResendable}건)`
                  : "↩ 재발송 대상 없음"}
            </button>
            <p className="mt-1.5 text-center text-xs text-gray-400">
              delayed · too_many · unknown → 배치 재전송 · 영구 오류 자동 제외
            </p>
          </div>
        </div>
      </div>

      {/* ── 요약 카드 ─────────────────────────────────────────────────────────── */}
      {stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <SummaryCard label="총 발송 시도"    value={stats.summary.totalSent}          color="blue" />
          <SummaryCard label="발송 성공"        value={stats.summary.successSent}        color="green" />
          <SummaryCard label="발송 실패"        value={stats.summary.failedSend}         color={stats.summary.failedSend         > 0 ? "red"    : "gray"} />
          <SummaryCard label="지연/미처리"      value={stats.summary.delayedCount}       color={stats.summary.delayedCount       > 0 ? "yellow" : "gray"} />
          <SummaryCard label="도메인/MX 오류"   value={stats.summary.invalidDomainCount} color={stats.summary.invalidDomainCount > 0 ? "orange" : "gray"} />
          <SummaryCard label="아카이브 누락"    value={stats.summary.notArchived}        color={stats.summary.notArchived        > 0 ? "orange" : "gray"} />
        </div>
      ) : (
        <div className="mb-8 rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
          로딩 중…
        </div>
      )}

      {/* ── 이슈 목록 탭 ──────────────────────────────────────────────────────── */}
      {stats && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

          {/* 탭 헤더 */}
          <div className="flex border-b border-gray-100">
            <TabBtn active={tab === "failed"}     onClick={() => { setTab("failed");     setReasonFilter(""); }} count={stats.failedList.length}     label="발송 실패"     activeColor="red" />
            <TabBtn active={tab === "delayed"}    onClick={() => { setTab("delayed");    setReasonFilter(""); }} count={stats.delayedList.length}    label="지연/미처리"   activeColor="yellow" />
            <TabBtn active={tab === "unarchived"} onClick={() => { setTab("unarchived"); setReasonFilter(""); }} count={stats.unarchivedList.length} label="아카이브 누락" activeColor="orange" />
          </div>

          {/* 탭 서브바 — 설명 + 재발송 가능 수 + 필터 */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {tab === "failed"     && "status=FAILED (delayed 제외)"}
                {tab === "delayed"    && "failReason=delayed 또는 status ∉ {SUCCESS,FAILED}"}
                {tab === "unarchived" && "status=SUCCESS · archivedAt 없는 건"}
              </span>
              {(tab === "failed" || tab === "delayed") && resendableInTab > 0 && (
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                  재발송 가능 {resendableInTab}건
                </span>
              )}
            </div>
            {reasonOptions.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">사유 필터:</span>
                <select value={reasonFilter} onChange={e => setReasonFilter(e.target.value)}
                  className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
                  <option value="">전체 ({rawTabList.length}건)</option>
                  {reasonOptions.map(r => (
                    <option key={r} value={r}>
                      {FAIL_REASON_LABEL[r] ?? r} ({rawTabList.filter(x => x.failReason === r).length}건)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 목록 */}
          {tabList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400">
              <span className="text-3xl mb-2">✓</span>
              <span className="text-sm">이슈 없음</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-2.5 text-left font-semibold">발송 시각</th>
                    <th className="px-4 py-2.5 text-left font-semibold">회사</th>
                    <th className="px-4 py-2.5 text-left font-semibold">이메일</th>
                    <th className="px-4 py-2.5 text-left font-semibold">제목</th>
                    <th className="px-4 py-2.5 text-left font-semibold">상태</th>
                    <th className="px-4 py-2.5 text-left font-semibold">사유</th>
                    <th className="px-4 py-2.5 text-center font-semibold">재발송</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tabList.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">
                        {row.sentAt ? new Date(row.sentAt).toLocaleString("ko-KR") : "—"}
                      </td>
                      <td className="px-4 py-2.5 max-w-[130px] truncate font-medium text-gray-800" title={row.company}>{row.company}</td>
                      <td className="px-4 py-2.5 max-w-[170px] truncate text-xs text-gray-500" title={row.email}>{row.email}</td>
                      <td className="px-4 py-2.5 max-w-[200px] truncate text-gray-700" title={row.subject}>{row.subject}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tab={tab} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {FAIL_REASON_LABEL[row.failReason] ?? row.failReason}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isResendable(row.failReason)
                          ? <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">가능</span>
                          : <span className="text-xs text-gray-300">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tabList.length >= 200 && (
                <p className="px-4 py-3 text-center text-xs text-gray-400 border-t">200건까지만 표시</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 이슈 없음 배너 */}
      {stats && !hasIssue && (
        <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-200 px-6 py-4 text-sm text-emerald-700 font-medium text-center">
          ✓ 오늘 발송 이슈 없음 — 모든 메일 정상 아카이브 완료
        </div>
      )}
    </div>
  );
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

const CARD_COLOR: Record<string, string> = {
  blue:   "bg-blue-50    text-blue-700   border-blue-100",
  green:  "bg-emerald-50 text-emerald-700 border-emerald-100",
  orange: "bg-orange-50  text-orange-700 border-orange-100",
  red:    "bg-red-50     text-red-700    border-red-100",
  yellow: "bg-yellow-50  text-yellow-700 border-yellow-100",
  gray:   "bg-gray-50    text-gray-500   border-gray-100",
};

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${CARD_COLOR[color] ?? CARD_COLOR.gray}`}>
      <div className="text-3xl font-bold tabular-nums">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

const TAB_ACTIVE: Record<string, string> = {
  red:    "border-red-500    text-red-600",
  yellow: "border-yellow-500 text-yellow-600",
  orange: "border-orange-500 text-orange-600",
};
const COUNT_BADGE: Record<string, string> = {
  red:    "bg-red-100    text-red-600",
  yellow: "bg-yellow-100 text-yellow-600",
  orange: "bg-orange-100 text-orange-600",
};

function TabBtn({ active, onClick, label, count, activeColor }: { active: boolean; onClick: () => void; label: string; count: number; activeColor: string; }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
        active ? TAB_ACTIVE[activeColor] ?? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}>
      {label}
      {count > 0 && (
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${active ? COUNT_BADGE[activeColor] ?? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function StatusBadge({ tab }: { tab: "failed" | "delayed" | "unarchived" }) {
  if (tab === "failed")     return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100    text-red-700">발송 실패</span>;
  if (tab === "delayed")    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">지연/미처리</span>;
  return                           <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">미아카이브</span>;
}
