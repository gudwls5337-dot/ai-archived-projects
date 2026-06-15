"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

type SequenceStep = {
  id: string;
  stepOrder: number;
  subject: string;
  body: string;
  delayDays: number;
};

type Sequence = {
  id: string;
  name: string;
  description: string | null;
  steps: SequenceStep[];
};

type StepForm = { subject: string; body: string; delayDays: number };
const emptyForm: StepForm = { subject: "", body: "", delayDays: 0 };

type StepStat = {
  stepId:      string;
  stepOrder:   number;
  subject:     string;
  totalSent:   number;
  totalOpened: number;
  notOpened:   number;
  openRate:    number;
};

type EnrollmentStat = {
  enrollmentId: string;
  contactId:    string;
  contactName:  string;
  contactEmail: string;
  companyId:    string;
  companyName:  string;
  currentStep:  number;
  status:       string;
  lastSentAt:   string | null;
  logs: Record<number, {
    sentAt:       string | null;
    openedAt:     string | null;
    lastOpenedAt: string | null;
    openCount:    number;
  }>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

type OpenFilter = "all" | "opened" | "not_opened";
const openFilterLabels: Record<OpenFilter, string> = {
  all:        "전체",
  opened:     "열람함",
  not_opened: "미열람",
};

// 영업상태 필터 옵션 (value="" = 전체)
const salesStatusFilterOptions: { value: string; label: string }[] = [
  { value: "",      label: "영업상태 전체" },
  { value: "미발송", label: "미발송(신규/없음)" },
  { value: "1차발송", label: "1차발송" },
  { value: "2차예정", label: "2차예정" },
  { value: "회신옴",  label: "회신옴" },
  { value: "관심있음", label: "관심있음" },
  { value: "미응답",  label: "미응답" },
  { value: "거래중",  label: "거래중" },
  { value: "보류",   label: "보류" },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SequenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router  = useRouter();

  const [sequence,       setSequence]       = useState<Sequence | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [addingStep,     setAddingStep]     = useState(false);
  const [stepForm,       setStepForm]       = useState<StepForm>(emptyForm);
  const [editingStepId,  setEditingStepId]  = useState<string | null>(null);
  const [editForm,       setEditForm]       = useState<StepForm>(emptyForm);
  const [editingName,    setEditingName]    = useState(false);
  const [nameForm,       setNameForm]       = useState({ name: "", description: "" });
  const [saving,         setSaving]         = useState(false);
  const [sending,        setSending]        = useState<number | null>(null);
  const [stepCounts,     setStepCounts]     = useState<Record<number, number>>({});

  // open filter per step (only relevant for step > 1)
  const [openFilters,  setOpenFilters]  = useState<Record<number, OpenFilter>>({});
  // 영업상태 필터 per step
  const [ssFilters, setSsFilters] = useState<Record<number, string>>({});

  // stats
  const [stats,        setStats]        = useState<{ stepStats: StepStat[]; enrollments: EnrollmentStat[] } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showStats,    setShowStats]    = useState(false);
  const [enrollFilter, setEnrollFilter] = useState<OpenFilter>("all"); // for enrollment table

  // ── Data loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/sequences/${id}`)
      .then(r => r.json())
      .then((data: Sequence) => {
        setSequence(data);
        setNameForm({ name: data.name, description: data.description ?? "" });
        for (const step of data.steps) {
          fetch(`/api/sequences/${id}/send-step?step=${step.stepOrder}`)
            .then(r => r.json())
            .then(({ count }) => setStepCounts(prev => ({ ...prev, [step.stepOrder]: count })))
            .catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function loadStats() {
    setStatsLoading(true);
    try {
      const res  = await fetch(`/api/sequences/${id}/stats`);
      const data = await res.json();
      setStats(data);
    } catch {
      alert("통계 조회에 실패했습니다.");
    } finally {
      setStatsLoading(false);
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleAddStep(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/sequences/${id}/steps`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(stepForm),
    });
    const newStep = await res.json();
    setSequence(prev => prev ? { ...prev, steps: [...prev.steps, newStep] } : prev);
    setStepForm(emptyForm);
    setAddingStep(false);
    setSaving(false);
  }

  async function handleUpdateStep(stepId: string) {
    setSaving(true);
    const res = await fetch(`/api/sequences/${id}/steps/${stepId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(editForm),
    });
    const updated = await res.json();
    setSequence(prev =>
      prev ? { ...prev, steps: prev.steps.map(s => s.id === stepId ? updated : s) } : prev
    );
    setEditingStepId(null);
    setSaving(false);
  }

  async function handleDeleteStep(stepId: string) {
    if (!confirm("이 단계를 삭제할까요?")) return;
    await fetch(`/api/sequences/${id}/steps/${stepId}`, { method: "DELETE" });
    setSequence(prev =>
      prev ? { ...prev, steps: prev.steps.filter(s => s.id !== stepId) } : prev
    );
  }

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/sequences/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: nameForm.name, description: nameForm.description || null }),
    });
    const updated = await res.json();
    setSequence(prev => prev ? { ...prev, name: updated.name, description: updated.description } : prev);
    setEditingName(false);
    setSaving(false);
  }

  async function handleSendStep(stepOrder: number) {
    const openFilter  = openFilters[stepOrder] ?? "all";
    const salesStatus = ssFilters[stepOrder]   ?? "";

    // 대상자 수 재조회 (openFilter + salesStatus 반영)
    const countRes = await fetch(
      `/api/sequences/${id}/send-step?step=${stepOrder}&openFilter=${openFilter}&salesStatus=${encodeURIComponent(salesStatus)}`
    );
    const { count } = await countRes.json();

    if (count === 0) {
      alert(`Step ${stepOrder}의 발송 가능 대상자가 없습니다.`);
      return;
    }

    const openLabel = openFilterLabels[openFilter];
    const ssLabel   = salesStatus
      ? salesStatusFilterOptions.find(o => o.value === salesStatus)?.label ?? salesStatus
      : null;
    const filterDesc = [openLabel !== "전체" ? openLabel : null, ssLabel].filter(Boolean).join(" / ") || "전체";
    if (!confirm(`Step ${stepOrder} [${filterDesc}] 대상자 ${count}명에게 메일을 발송하시겠습니까?`)) return;

    setSending(stepOrder);
    try {
      const res = await fetch(`/api/sequences/${id}/send-step`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ stepOrder, openFilter, salesStatus }),
      });
      const result = await res.json();
      const msgs = [
        `성공: ${result.sent}건`,
        result.failed     > 0 ? `실패: ${result.failed}건`           : null,
        result.unsubscribed > 0 ? `수신거부 제외: ${result.unsubscribed}건` : null,
        result.filtered   > 0 ? `오픈필터 제외: ${result.filtered}건`  : null,
      ].filter(Boolean).join(", ");
      alert(`발송 완료 — ${msgs}`);
      setStepCounts(prev => ({ ...prev, [stepOrder]: 0 }));
      // 통계 갱신
      if (showStats) loadStats();
    } catch {
      alert("발송 중 오류가 발생했습니다.");
    } finally {
      setSending(null);
    }
  }

  async function handleDelete() {
    if (!sequence) return;
    if (!confirm(`"${sequence.name}" 시퀀스를 삭제할까요?`)) return;
    await fetch(`/api/sequences/${id}`, { method: "DELETE" });
    router.push("/sequences");
  }

  // ── Enrollment filter for stats table ────────────────────────────────────────

  function filteredEnrollments(): EnrollmentStat[] {
    if (!stats) return [];
    if (enrollFilter === "all") return stats.enrollments;
    // find latest sent step for each enrollment
    return stats.enrollments.filter(e => {
      const latestSentStep = Math.max(0, ...Object.keys(e.logs).map(Number));
      if (latestSentStep === 0) return enrollFilter === "not_opened";
      const log = e.logs[latestSentStep];
      return enrollFilter === "opened" ? !!log?.openedAt : !log?.openedAt;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  if (!sequence) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">시퀀스를 찾을 수 없습니다.</p>
          <Link href="/sequences" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            시퀀스 목록으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/sequences" className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          ← 시퀀스 목록
        </Link>

        {/* 헤더 */}
        <div className="mb-8 mt-4 flex items-start justify-between">
          {editingName ? (
            <form onSubmit={handleUpdateName} className="flex-1">
              <input
                className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={nameForm.name}
                onChange={e => setNameForm(f => ({ ...f, name: e.target.value }))}
                required
              />
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="설명 (선택)"
                value={nameForm.description}
                onChange={e => setNameForm(f => ({ ...f, description: e.target.value }))}
              />
              <div className="mt-2 flex gap-2">
                <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">저장</button>
                <button type="button" onClick={() => setEditingName(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50">취소</button>
              </div>
            </form>
          ) : (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{sequence.name}</h1>
              {sequence.description && <p className="mt-1 text-sm text-gray-500">{sequence.description}</p>}
            </div>
          )}
          <div className="ml-4 flex shrink-0 gap-2">
            {!editingName && (
              <button onClick={() => setEditingName(true)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50">
                이름 수정
              </button>
            )}
            <button onClick={handleDelete} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
              삭제
            </button>
          </div>
        </div>

        {/* ── 단계 목록 ──────────────────────────────────────────────────────────── */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            단계 목록 <span className="text-sm font-normal text-gray-500">({sequence.steps.length}단계)</span>
          </h2>
          <button
            onClick={() => { setAddingStep(true); setEditingStepId(null); }}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + 단계 추가
          </button>
        </div>

        {sequence.steps.length === 0 && !addingStep && (
          <div className="mb-4 rounded-lg border border-dashed border-gray-300 bg-white py-12 text-center">
            <p className="text-sm text-gray-500">등록된 단계가 없습니다.</p>
            <p className="mt-1 text-xs text-gray-400">위 버튼을 눌러 첫 단계를 추가하세요.</p>
          </div>
        )}

        <div className="space-y-3">
          {sequence.steps.map((step, idx) => (
            <div key={step.id} className="rounded-lg border border-gray-200 bg-white shadow-sm">
              {editingStepId === step.id ? (
                <div className="p-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{idx + 1}단계 수정</p>
                  <div className="mb-3">
                    <label className="mb-1 block text-sm font-medium text-gray-900">발송 지연</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.delayDays} onChange={e => setEditForm(f => ({ ...f, delayDays: Number(e.target.value) }))} />
                      <span className="text-sm text-gray-500">일 후 발송</span>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="mb-1 block text-sm font-medium text-gray-900">제목 *</label>
                    <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.subject} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} required />
                  </div>
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-900">본문 *</label>
                    <textarea rows={5} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={editForm.body} onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))} required />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdateStep(step.id)} disabled={saving} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">저장</button>
                    <button onClick={() => setEditingStepId(null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50">취소</button>
                  </div>
                </div>
              ) : (
                <div className="p-5">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {idx + 1}단계{step.delayDays > 0 && ` · ${step.delayDays}일 후`}
                      </span>
                      <p className="mt-0.5 font-medium text-gray-900 truncate">{step.subject}</p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {/* 영업상태 필터 (모든 step) */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">영업상태:</span>
                        <select
                          value={ssFilters[step.stepOrder] ?? ""}
                          onChange={e => setSsFilters(prev => ({ ...prev, [step.stepOrder]: e.target.value }))}
                          className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          {salesStatusFilterOptions.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Open filter (2단계 이상에서만 노출) */}
                      {step.stepOrder > 1 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400">열람여부:</span>
                          <select
                            value={openFilters[step.stepOrder] ?? "all"}
                            onChange={e => setOpenFilters(prev => ({
                              ...prev,
                              [step.stepOrder]: e.target.value as OpenFilter,
                            }))}
                            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          >
                            {(Object.keys(openFilterLabels) as OpenFilter[]).map(f => (
                              <option key={f} value={f}>{openFilterLabels[f]}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* 현재 적용 중인 필터 뱃지 */}
                      {(ssFilters[step.stepOrder] || (step.stepOrder > 1 && openFilters[step.stepOrder] && openFilters[step.stepOrder] !== "all")) && (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {ssFilters[step.stepOrder] && (
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 border border-indigo-200">
                              {salesStatusFilterOptions.find(o => o.value === ssFilters[step.stepOrder])?.label ?? ssFilters[step.stepOrder]}
                            </span>
                          )}
                          {step.stepOrder > 1 && openFilters[step.stepOrder] && openFilters[step.stepOrder] !== "all" && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 border border-blue-200">
                              {openFilterLabels[openFilters[step.stepOrder]]}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSendStep(step.stepOrder)}
                          disabled={sending === step.stepOrder}
                          style={{
                            backgroundColor: sending === step.stepOrder ? "#9ca3af" : "#16a34a",
                            color: "#fff", fontWeight: 700, fontSize: "14px",
                            padding: "8px 18px", borderRadius: "8px", border: "none",
                            cursor: sending === step.stepOrder ? "not-allowed" : "pointer",
                            whiteSpace: "nowrap",
                            boxShadow: sending === step.stepOrder ? "none" : "0 2px 8px rgba(22,163,74,0.4)",
                          }}
                        >
                          {sending === step.stepOrder
                            ? "발송 중..."
                            : stepCounts[step.stepOrder] !== undefined
                              ? `Step 발송 (${stepCounts[step.stepOrder]}명)`
                              : "Step 발송"}
                        </button>
                        <button
                          onClick={() => {
                            setEditingStepId(step.id);
                            setEditForm({ subject: step.subject, body: step.body, delayDays: step.delayDays });
                            setAddingStep(false);
                          }}
                          className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteStep(step.id)}
                          className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-500 line-clamp-2">{step.body}</p>
                </div>
              )}
            </div>
          ))}

          {/* 단계 추가 폼 */}
          {addingStep && (
            <form onSubmit={handleAddStep} className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-500">
                {sequence.steps.length + 1}단계 추가
              </p>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-900">발송 지연</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={stepForm.delayDays} onChange={e => setStepForm(f => ({ ...f, delayDays: Number(e.target.value) }))} />
                  <span className="text-sm text-gray-500">일 후 발송</span>
                </div>
              </div>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-900">제목 *</label>
                <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="메일 제목" value={stepForm.subject} onChange={e => setStepForm(f => ({ ...f, subject: e.target.value }))} required />
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-900">본문 *</label>
                <textarea rows={6} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="메일 본문을 입력하세요" value={stepForm.body} onChange={e => setStepForm(f => ({ ...f, body: e.target.value }))} required />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">저장</button>
                <button type="button" onClick={() => setAddingStep(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">취소</button>
              </div>
            </form>
          )}
        </div>

        {/* ── 발송 / 오픈 현황 ──────────────────────────────────────────────────── */}
        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">발송 / 오픈 현황</h2>
            <button
              onClick={() => {
                setShowStats(v => !v);
                if (!showStats && !stats) loadStats();
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {showStats ? "접기" : "현황 보기"}
            </button>
          </div>

          {showStats && (
            <>
              {statsLoading ? (
                <p className="py-6 text-center text-sm text-gray-400">통계 불러오는 중...</p>
              ) : stats ? (
                <>
                  {/* Step 별 집계 */}
                  {stats.stepStats.length > 0 && (
                    <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                      <div className="border-b border-gray-100 px-5 py-3">
                        <span className="text-sm font-bold text-gray-900">단계별 발송·오픈 집계</span>
                      </div>
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border-b border-gray-100 px-4 py-2.5 text-left text-xs font-bold text-gray-500">단계</th>
                            <th className="border-b border-gray-100 px-4 py-2.5 text-left text-xs font-bold text-gray-500">제목</th>
                            <th className="border-b border-gray-100 px-4 py-2.5 text-right text-xs font-bold text-gray-500">발송</th>
                            <th className="border-b border-gray-100 px-4 py-2.5 text-right text-xs font-bold text-gray-500">열람</th>
                            <th className="border-b border-gray-100 px-4 py-2.5 text-right text-xs font-bold text-gray-500">미열람</th>
                            <th className="border-b border-gray-100 px-4 py-2.5 text-right text-xs font-bold text-gray-500">열람율</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.stepStats.map(s => (
                            <tr key={s.stepId} className="border-b border-gray-50">
                              <td className="px-4 py-2.5 font-semibold text-gray-700">{s.stepOrder}단계</td>
                              <td className="max-w-[200px] truncate px-4 py-2.5 text-gray-600">{s.subject}</td>
                              <td className="px-4 py-2.5 text-right text-gray-900">{s.totalSent}</td>
                              <td className="px-4 py-2.5 text-right font-medium text-green-600">{s.totalOpened}</td>
                              <td className="px-4 py-2.5 text-right text-gray-400">{s.notOpened}</td>
                              <td className="px-4 py-2.5 text-right">
                                <span className={`font-bold ${s.openRate >= 30 ? "text-green-600" : s.openRate >= 10 ? "text-yellow-600" : "text-red-500"}`}>
                                  {s.openRate}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 대상자별 오픈 현황 */}
                  {stats.enrollments.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                        <span className="text-sm font-bold text-gray-900">
                          대상자별 오픈 현황
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            ({filteredEnrollments().length}명)
                          </span>
                        </span>
                        {/* 필터 */}
                        <div className="flex gap-1">
                          {(["all", "opened", "not_opened"] as OpenFilter[]).map(f => (
                            <button
                              key={f}
                              onClick={() => setEnrollFilter(f)}
                              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                enrollFilter === f
                                  ? "bg-blue-600 text-white"
                                  : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              {openFilterLabels[f]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="border-b border-gray-100 px-4 py-2.5 text-left text-xs font-bold text-gray-500">회사</th>
                              <th className="border-b border-gray-100 px-4 py-2.5 text-left text-xs font-bold text-gray-500">담당자</th>
                              <th className="border-b border-gray-100 px-4 py-2.5 text-left text-xs font-bold text-gray-500">이메일</th>
                              <th className="border-b border-gray-100 px-4 py-2.5 text-center text-xs font-bold text-gray-500">현재 단계</th>
                              <th className="border-b border-gray-100 px-4 py-2.5 text-left text-xs font-bold text-gray-500">마지막 발송</th>
                              {sequence.steps.map(s => (
                                <th key={s.id} className="border-b border-gray-100 px-3 py-2.5 text-center text-xs font-bold text-gray-500">
                                  {s.stepOrder}차
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredEnrollments().slice(0, 200).map(e => (
                              <tr key={e.enrollmentId} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="max-w-[120px] truncate px-4 py-2 text-gray-900" title={e.companyName}>{e.companyName}</td>
                                <td className="px-4 py-2 text-gray-700">{e.contactName}</td>
                                <td className="px-4 py-2 text-gray-500">{e.contactEmail}</td>
                                <td className="px-4 py-2 text-center text-gray-500">{e.currentStep}</td>
                                <td className="px-4 py-2 text-xs text-gray-400">{fmt(e.lastSentAt)}</td>
                                {sequence.steps.map(s => {
                                  const log = e.logs[s.stepOrder];
                                  if (!log) {
                                    return (
                                      <td key={s.id} className="px-3 py-2 text-center">
                                        <span className="text-xs text-gray-300">—</span>
                                      </td>
                                    );
                                  }
                                  return (
                                    <td key={s.id} className="px-3 py-2 text-center" title={log.openedAt ? `최초: ${fmt(log.openedAt)}\n마지막: ${fmt(log.lastOpenedAt)}\n${log.openCount}회` : "미열람"}>
                                      {log.openedAt ? (
                                        <span className="inline-flex items-center gap-0.5">
                                          <span className="text-xs font-bold text-green-600">열람</span>
                                          {log.openCount > 1 && (
                                            <span className="rounded-full bg-green-100 px-1 text-[10px] font-bold text-green-700">
                                              {log.openCount}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-gray-400">미열람</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                            {filteredEnrollments().length > 200 && (
                              <tr>
                                <td colSpan={5 + sequence.steps.length} className="px-4 py-3 text-center text-xs text-gray-400">
                                  200건까지만 표시
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {stats.stepStats.length === 0 && stats.enrollments.length === 0 && (
                    <p className="py-6 text-center text-sm text-gray-400">아직 발송 이력이 없습니다.</p>
                  )}
                </>
              ) : null}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
