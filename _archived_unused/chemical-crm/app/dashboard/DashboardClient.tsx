"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

type QueueItem = {
  id: string;
  status: string;
  label: string | null;
  subject: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  batchSize: number;
  batchDelayMin: number;
  nextBatchAt: string;
  createdAt: string;
  completedAt: string | null;
};

type MailSentFilter = "" | "0" | "1" | "1plus" | "2plus" | "range";

type TodayStats = {
  date: string;
  dailyRemaining: number | null;
  dailyLimit: number | null;
  summary: {
    totalSent: number;
    successSent: number;
    archived: number;
    notArchived: number;
    failedSend: number;
    delayedCount: number;
    invalidDomainCount: number;
  };
};

type LeadRow = {
  id: string;
  companyName: string;
  country: string;
  salesStatus: string | null;
  segment: string;
  mailSentCount: number;
  lastSentAt: string | null;
};

type Sequence = { id: string; name: string };

type Toast = { id: number; msg: string; kind: "ok" | "err" | "warn" };

let toastSeq = 0;

export default function DashboardClient() {
  const [queues,      setQueues]      = useState<QueueItem[]>([]);
  const [todayStats,  setTodayStats]  = useState<TodayStats | null>(null);
  const [processing,  setProcessing]  = useState<Set<string>>(new Set());
  const [backfilling, setBackfilling] = useState(false);

  const [leads,        setLeads]        = useState<LeadRow[]>([]);
  const [sequences,    setSequences]    = useState<Sequence[]>([]);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [seqId,        setSeqId]        = useState("");
  const [enrolling,    setEnrolling]    = useState(false);
  const [visibleCount, setVisibleCount] = useState(100);

  // 누적 발송수 필터
  const [mailSentFilter, setMailSentFilter] = useState<MailSentFilter>("");
  const [mailSentMin,    setMailSentMin]    = useState("");
  const [mailSentMax,    setMailSentMax]    = useState("");

  const [toasts, setToasts] = useState<Toast[]>([]);

  function addToast(msg: string, kind: Toast["kind"] = "ok") {
    const id = ++toastSeq;
    setToasts(prev => [...prev, { id, msg, kind }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }

  const fetchQueues = useCallback(async () => {
    try {
      const res = await fetch("/api/mail-queue");
      const data = await res.json();
      setQueues(data.queues ?? []);
    } catch { /* silent */ }
  }, []);

  const fetchTodayStats = useCallback(async () => {
    try {
      const res = await fetch("/api/archive/stats");
      const data = await res.json();
      setTodayStats(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchQueues();
    fetchTodayStats();
    fetch("/api/leads").then(r => r.json()).then((arr: LeadRow[]) => setLeads(arr ?? []));
    fetch("/api/sequences").then(r => r.json()).then(setSequences);

    const iv = setInterval(() => {
      fetchQueues();
      fetchTodayStats();
    }, 30000);
    return () => clearInterval(iv);
  }, [fetchQueues, fetchTodayStats]);

  async function handleProcess(queueId: string) {
    setProcessing(prev => new Set([...prev, queueId]));
    try {
      const res  = await fetch(`/api/mail-queue/${queueId}/process`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        addToast(`처리 오류: ${data.error}`, "err");
      } else if (data.done) {
        addToast(`큐 완료 — 발송 ${data.totalSent}건`, "ok");
      } else {
        addToast(`배치 처리 — 발송 ${data.sent}건 / 실패 ${data.failed}건`, "ok");
      }
      await fetchQueues();
      await fetchTodayStats();
    } catch {
      addToast("처리 요청 실패", "err");
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(queueId); return s; });
    }
  }

  async function handleCancelQueue(queueId: string) {
    if (!confirm("큐를 취소하시겠습니까?")) return;
    await fetch(`/api/mail-queue/${queueId}`, { method: "DELETE" });
    addToast("큐 취소됨", "warn");
    await fetchQueues();
  }

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const res  = await fetch("/api/archive/backfill", { method: "POST" });
      const data = await res.json();
      addToast(`백필 완료 — ${data.archived ?? 0}건 아카이브`, "ok");
      await fetchTodayStats();
    } catch {
      addToast("백필 실패", "err");
    } finally {
      setBackfilling(false);
    }
  }

  async function handleEnroll() {
    if (!seqId || selected.size === 0) {
      addToast("시퀀스와 회사를 선택해주세요.", "warn");
      return;
    }
    setEnrolling(true);
    try {
      const res  = await fetch("/api/sequences/bulk-enroll", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ companyIds: [...selected], sequenceId: seqId }),
      });
      const data = await res.json();
      if (data.error) {
        addToast(data.error, "err");
      } else {
        addToast(`등록 완료 — ${data.enrolled}명 등록 / ${data.skipped}명 이미 등록`, "ok");
        setSelected(new Set());
      }
    } catch {
      addToast("등록 실패", "err");
    } finally {
      setEnrolling(false);
    }
  }

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (!mailSentFilter) return true;
      const c = l.mailSentCount;
      if (mailSentFilter === "0")     return c === 0;
      if (mailSentFilter === "1")     return c === 1;
      if (mailSentFilter === "1plus") return c >= 1;
      if (mailSentFilter === "2plus") return c >= 2;
      if (mailSentFilter === "range") {
        const min = mailSentMin ? parseInt(mailSentMin) : null;
        const max = mailSentMax ? parseInt(mailSentMax) : null;
        if (min !== null && c < min) return false;
        if (max !== null && c > max) return false;
        return true;
      }
      return true;
    });
  }, [leads, mailSentFilter, mailSentMin, mailSentMax]);

  function toggleAll() {
    const allFilteredSelected = filteredLeads.every(l => selected.has(l.id));
    if (allFilteredSelected && filteredLeads.length > 0) {
      setSelected(prev => {
        const s = new Set(prev);
        filteredLeads.forEach(l => s.delete(l.id));
        return s;
      });
    } else {
      setSelected(prev => new Set([...prev, ...filteredLeads.map(l => l.id)]));
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  const processed = (q: QueueItem) => q.sentCount + q.failedCount;
  const remaining = (q: QueueItem) => q.totalCount - processed(q);
  const pct       = (q: QueueItem) => q.totalCount > 0 ? Math.round((processed(q) / q.totalCount) * 100) : 0;

  function fmtTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }

  const toastColor: Record<Toast["kind"], string> = {
    ok:   "bg-green-600",
    err:  "bg-red-600",
    warn: "bg-amber-500",
  };

  return (
    <div className="space-y-8">

      {/* 토스트 */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toastColor[t.kind]}`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ─── 오늘 발송 현황 ─────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900">오늘 발송 현황</h2>
            {todayStats && (
              <p className="mt-0.5 text-xs text-gray-400">{todayStats.date}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {todayStats?.dailyLimit && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                (todayStats.dailyRemaining ?? 0) === 0
                  ? "bg-red-100 text-red-700"
                  : "bg-blue-100 text-blue-700"
              }`}>
                오늘 잔여 {todayStats.dailyRemaining ?? 0} / {todayStats.dailyLimit}건
              </span>
            )}
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {backfilling ? "백필 중..." : "IMAP 백필"}
            </button>
            <button
              onClick={fetchTodayStats}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              새로고침
            </button>
          </div>
        </div>
        {todayStats ? (
          <div className="grid grid-cols-4 divide-x divide-gray-100">
            <Stat label="발송 시도" value={todayStats.summary.totalSent} />
            <Stat label="발송 성공" value={todayStats.summary.successSent} color="text-green-600" />
            <Stat label="발송 실패" value={todayStats.summary.failedSend} color={todayStats.summary.failedSend > 0 ? "text-red-500" : undefined} />
            <Stat label="아카이브 누락" value={todayStats.summary.notArchived} color={todayStats.summary.notArchived > 0 ? "text-amber-500" : undefined} />
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-gray-400">로딩 중...</p>
        )}
      </section>

      {/* ─── 진행 중 배치 ───────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">진행 중 발송 큐</h2>
          <button
            onClick={fetchQueues}
            className="text-xs text-blue-600 hover:underline"
          >
            새로고침
          </button>
        </div>

        {queues.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-white px-5 py-6 text-center text-sm text-gray-400">
            진행 중인 발송 큐가 없습니다.{" "}
            <a href="/bulk-send" className="text-blue-600 hover:underline">대량 발송</a>에서 큐를 등록하세요.
          </div>
        ) : (
          <div className="space-y-3">
            {queues.map(q => (
              <div key={q.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 truncate max-w-xs">{q.label || q.subject}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(q.createdAt).toLocaleString("ko-KR")} 등록 ·{" "}
                      총 {q.totalCount}건 · 1건/분 간격
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      q.status === "pending"              ? "bg-gray-100 text-gray-600" :
                      q.status === "processing"           ? "bg-blue-100 text-blue-700" :
                      q.status === "deferred_to_next_day" ? "bg-amber-100 text-amber-700" :
                      "bg-green-100 text-green-700"
                    }`}>
                      {q.status === "pending"              ? "대기" :
                       q.status === "processing"           ? "처리중" :
                       q.status === "deferred_to_next_day" ? "내일 재개" : "완료"}
                    </span>
                    <button
                      onClick={() => handleProcess(q.id)}
                      disabled={processing.has(q.id)}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {processing.has(q.id) ? "처리중..." : "지금 배치 실행"}
                    </button>
                    <button
                      onClick={() => handleCancelQueue(q.id)}
                      className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      취소
                    </button>
                  </div>
                </div>

                {/* 프로그레스 바 */}
                <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${pct(q)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    발송 완료 {q.sentCount}건 · 실패 {q.failedCount}건 · 남은 {remaining(q)}건
                    {q.status === "deferred_to_next_day" && (
                      <span className="ml-1 text-amber-600">(내일 이월 {remaining(q)}건)</span>
                    )}
                  </span>
                  <span>
                    {q.status === "deferred_to_next_day"
                      ? "내일 cron 자동 재개"
                      : `다음 발송: ${fmtTime(q.nextBatchAt)}`
                    }
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── 리드 시퀀스 일괄 등록 ──────────────────────────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-bold text-gray-900">리드 시퀀스 일괄 등록</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            회사를 선택하고 시퀀스에 일괄 등록합니다. (이미 등록된 담당자는 스킵)
          </p>
        </div>

        <div className="border-b border-gray-100 px-5 py-3 flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">시퀀스 선택</label>
          <select
            value={seqId}
            onChange={e => setSeqId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- 시퀀스 선택 --</option>
            {sequences.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* 누적 발송수 필터 */}
          <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">누적 발송수</label>
          <select
            value={mailSentFilter}
            onChange={e => setMailSentFilter(e.target.value as MailSentFilter)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체</option>
            <option value="0">0회 (미발송)</option>
            <option value="1">1회</option>
            <option value="1plus">1회 이상</option>
            <option value="2plus">2회 이상</option>
            <option value="range">직접 입력</option>
          </select>
          {mailSentFilter === "range" && (
            <>
              <input
                type="number" min={0} value={mailSentMin}
                onChange={e => setMailSentMin(e.target.value)}
                placeholder="최소" className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-500">~</span>
              <input
                type="number" min={0} value={mailSentMax}
                onChange={e => setMailSentMax(e.target.value)}
                placeholder="최대" className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </>
          )}

          <button
            onClick={handleEnroll}
            disabled={enrolling || selected.size === 0 || !seqId}
            className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {enrolling ? "등록 중..." : `시퀀스 등록 (${selected.size}개 회사)`}
          </button>
          <span className="ml-auto text-xs text-gray-400">
            {Math.min(visibleCount, filteredLeads.length)} / {filteredLeads.length}건 표시
            {mailSentFilter && filteredLeads.length !== leads.length && (
              <span className="ml-1 text-blue-500">(전체 {leads.length}건 중 필터됨)</span>
            )}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="border-b border-gray-100 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={filteredLeads.length > 0 && filteredLeads.every(l => selected.has(l.id))}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                </th>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">회사명</th>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">국가</th>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">영업상태</th>
                <th
                  title="이 회사의 모든 담당자에게 발송 성공한 총 이메일 수 (전체 시퀀스 합산)"
                  className="border-b border-gray-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 cursor-help"
                >
                  누적 발송수 ℹ
                </th>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">마지막 발송일</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.slice(0, visibleCount).map(l => (
                <tr
                  key={l.id}
                  onClick={() => toggle(l.id)}
                  className={`cursor-pointer border-b border-gray-50 hover:bg-blue-50 ${selected.has(l.id) ? "bg-blue-50" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={() => toggle(l.id)}
                      onClick={e => e.stopPropagation()}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{l.companyName}</td>
                  <td className="px-4 py-2.5 text-gray-500">{l.country || "—"}</td>
                  <td className="px-4 py-2.5">
                    {l.salesStatus ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{l.salesStatus}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{l.mailSentCount > 0 ? l.mailSentCount : <span className="text-gray-300">0</span>}</td>
                  <td className="px-4 py-2.5 text-gray-500">{l.lastSentAt ?? <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredLeads.length > visibleCount && (
          <div className="border-t border-gray-100 px-5 py-3 text-center">
            <button
              onClick={() => setVisibleCount(v => v + 100)}
              className="rounded-md border border-gray-300 px-5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              더보기 ({filteredLeads.length - visibleCount}건 남음)
            </button>
          </div>
        )}
      </section>

    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="px-4 py-4 text-center">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? "text-gray-700"}`}>{value}</p>
    </div>
  );
}
