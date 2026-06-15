"use client";

import { useEffect, useState, useCallback } from "react";

type Queue = {
  id: string;
  status: string;
  label: string | null;
  subject: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  batchDelayMin: number;
  nextBatchAt: string | null;
  createdAt: string;
  completedAt: string | null;
};

type QueueApiResponse = { queues: Queue[] };

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:              "bg-yellow-100 text-yellow-800",
    processing:           "bg-blue-100 text-blue-800",
    deferred_to_next_day: "bg-orange-100 text-orange-800",
    completed:            "bg-green-100 text-green-800",
    cancelled:            "bg-gray-100 text-gray-600",
    failed:               "bg-red-100 text-red-800",
  };
  const label: Record<string, string> = {
    pending:              "대기중",
    processing:           "발송중",
    deferred_to_next_day: "내일 재개",
    completed:            "완료",
    cancelled:            "취소됨",
    failed:               "실패",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {label[status] ?? status}
    </span>
  );
}

export default function MailQueueAdminPage() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" | "warn" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" | "warn" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchQueues = useCallback(async () => {
    try {
      // 활성 큐 + 최근 완료/취소 큐 포함해 보여주기 위해 전체 조회
      const res  = await fetch("/api/mail-queue/all");
      const data: QueueApiResponse = await res.json();
      setQueues(data.queues ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueues();
    const id = setInterval(fetchQueues, 30_000);
    return () => clearInterval(id);
  }, [fetchQueues]);

  async function handleProcess(queueId: string) {
    setProcessing(prev => new Set([...prev, queueId]));
    try {
      const res  = await fetch(`/api/mail-queue/${queueId}/process`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        showToast(`오류: ${data.error}`, "err");
      } else if (data.done) {
        showToast(`완료 — 발송 ${data.totalSent}건`, "ok");
      } else if (data.limitReached) {
        showToast(data.message ?? "일일 한도 도달", "warn");
      } else {
        showToast(`발송 ${data.sent}건 / 실패 ${data.failed}건`, "ok");
      }
      await fetchQueues();
    } catch {
      showToast("처리 중 오류 발생", "err");
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(queueId); return s; });
    }
  }

  async function handleCancel(queueId: string) {
    if (!confirm("큐를 취소하시겠습니까?")) return;
    await fetch(`/api/mail-queue/${queueId}`, { method: "DELETE" });
    showToast("큐 취소됨", "warn");
    await fetchQueues();
  }

  const active   = queues.filter(q => ["pending", "processing", "deferred_to_next_day"].includes(q.status));
  const inactive = queues.filter(q => !["pending", "processing", "deferred_to_next_day"].includes(q.status));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold mb-4">발송 큐 관리</h1>

      {/* ── 발송 정책 패널 ──────────────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm font-semibold text-blue-800 mb-3">현재 발송 정책 (잠금 상태)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div className="rounded-lg bg-white border border-blue-100 px-3 py-2 text-center">
            <p className="text-xs text-gray-500 mb-0.5">발송 단위</p>
            <p className="text-lg font-bold text-blue-700">1건</p>
          </div>
          <div className="rounded-lg bg-white border border-blue-100 px-3 py-2 text-center">
            <p className="text-xs text-gray-500 mb-0.5">발송 간격</p>
            <p className="text-lg font-bold text-blue-700">1분</p>
          </div>
          <div className="rounded-lg bg-white border border-blue-100 px-3 py-2 text-center">
            <p className="text-xs text-gray-500 mb-0.5">하루 한도</p>
            <p className="text-lg font-bold text-blue-700">100건</p>
          </div>
          <div className="rounded-lg bg-white border border-orange-100 px-3 py-2 text-center">
            <p className="text-xs text-gray-500 mb-0.5">초과분</p>
            <p className="text-sm font-bold text-orange-600">다음 날 자동 재개</p>
          </div>
        </div>
        <div className="rounded bg-gray-900 text-green-400 text-xs px-3 py-2 font-mono">
          <span className="text-gray-500">// SMTP 발송 허용 경로</span>
          <br />
          <span className="text-yellow-300">lib/smtp-transport.ts</span>
          <span className="text-gray-400"> → </span>
          <span className="text-green-300">lib/queue-processor.ts</span>
          <span className="text-gray-400"> → </span>
          <span className="text-white">processQueueBatch()</span>
          <br />
          <span className="text-gray-500">// 다른 경로에서 sendMail() 호출 시: ESLint 오류 + 런타임 throw</span>
        </div>
      </div>

      {toast && (
        <div className={`mb-4 rounded px-4 py-2 text-sm ${
          toast.type === "ok"   ? "bg-green-100 text-green-800"  :
          toast.type === "warn" ? "bg-yellow-100 text-yellow-800" :
                                  "bg-red-100 text-red-800"
        }`}>
          {toast.msg}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">불러오는 중...</p>
      ) : (
        <>
          {/* ── 활성 큐 ── */}
          <section className="mb-8">
            <h2 className="text-base font-semibold mb-2">활성 큐 ({active.length})</h2>
            {active.length === 0 ? (
              <p className="text-sm text-gray-500">진행 중인 큐가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {active.map(q => {
                  const done    = q.sentCount + q.failedCount;
                  const pct     = q.totalCount > 0 ? Math.round((done / q.totalCount) * 100) : 0;
                  const isProc  = processing.has(q.id);
                  return (
                    <div key={q.id} className="border rounded-lg p-4 bg-white shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {statusBadge(q.status)}
                          <span className="text-sm font-medium truncate max-w-xs">{q.subject}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleProcess(q.id)}
                            disabled={isProc}
                            className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isProc ? "처리중..." : "1건 처리"}
                          </button>
                          <button
                            onClick={() => handleCancel(q.id)}
                            className="text-xs px-3 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                        <span>진행: {done}/{q.totalCount} ({pct}%)</span>
                        <span>성공: {q.sentCount}</span>
                        <span>실패: {q.failedCount}</span>
                        <span>간격: {q.batchDelayMin}분</span>
                        {q.nextBatchAt && (
                          <span>
                            다음 발송: {new Date(q.nextBatchAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {q.label && <span className="text-gray-400 font-mono">{q.label}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── 최근 완료/취소 큐 ── */}
          {inactive.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-2">최근 완료 / 취소 큐</h2>
              <div className="space-y-2">
                {inactive.slice(0, 10).map(q => (
                  <div key={q.id} className="border rounded-lg p-3 bg-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {statusBadge(q.status)}
                      <span className="text-sm truncate max-w-xs">{q.subject}</span>
                    </div>
                    <div className="text-xs text-gray-500 text-right">
                      <div>{q.sentCount}/{q.totalCount}건</div>
                      {q.completedAt && (
                        <div>{new Date(q.completedAt).toLocaleDateString("ko-KR")}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
