"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Segment      = "exhibition_booth" | "tendata_volume" | "distributor_by_country" | "met_in_person" | "inbound";
type PipelineStage = "NEW" | "CONTACTED" | "PROPOSED" | "CONTRACTED";

const segmentLabels: Record<Segment, string> = {
  exhibition_booth:       "전시회 부스",
  tendata_volume:         "텐데이터 볼륨",
  distributor_by_country: "국가별 디스트리뷰터",
  met_in_person:          "직접 만남",
  inbound:                "인바운드",
};

const stageLabels: Record<PipelineStage, string> = {
  NEW:        "신규",
  CONTACTED:  "접촉중",
  PROPOSED:   "제안완료",
  CONTRACTED: "계약완료",
};

type ContactRow = {
  id:        string;
  name:      string;
  email:     string;
  companyId: string;
  company:   { id: string; name: string; country: string; segment: Segment; pipelineStage: PipelineStage };
};

type PreviewSummary = {
  rawContactCount:        number;
  dedupedContactCount:    number;
  mailSentFilteredCount:  number;
  duplicateExcludedCount: number;
  unsubscribedCount:      number;
  totalCompanies:         number;
  dailyLimit:             number;
  todaySent:              number;
  remainingToday:         number;
};

type MailSentFilter = "" | "0" | "1" | "1plus" | "2plus" | "range";

type Sequence = { id: string; name: string };

export default function BulkSendPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);

  // 필터
  const [segment,        setSegment]        = useState<Segment | "">("");
  const [pipelineStage,  setPipelineStage]  = useState<PipelineStage | "">("");
  const [country,        setCountry]        = useState("");
  const [sequenceId,     setSequenceId]     = useState("");
  const [salesStatus,    setSalesStatus]    = useState("");
  const [mailEngagement, setMailEngagement] = useState("");
  const [mailSentFilter, setMailSentFilter] = useState<MailSentFilter>("");
  const [mailSentMin,    setMailSentMin]    = useState("");
  const [mailSentMax,    setMailSentMax]    = useState("");

  // 메일 내용
  const [subject, setSubject] = useState("");
  const [body,    setBody]    = useState("");

  // 미리보기
  const [contacts, setContacts] = useState<ContactRow[] | null>(null);
  const [summary,  setSummary]  = useState<PreviewSummary | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // 미리보기 실행 시점의 필터 스냅샷 (결과 표시용)
  const [appliedFilters, setAppliedFilters] = useState<{
    segment: Segment | "";
    pipelineStage: PipelineStage | "";
    country: string;
    sequenceId: string;
    sequenceName: string;
    salesStatus: string;
    mailEngagement: string;
  } | null>(null);

  // 발송 큐 등록
  const [sending, setSending] = useState(false);
  const [result,  setResult]  = useState<{
    queued: boolean;
    queueId?: string;
    totalCount?: number;
    todayCount?: number;
    deferredCount?: number;
    estimatedDays?: number;
    estMinutesToday?: number;
    sendIntervalMin?: number;
    invalidEmailCount?: number;
    invalidDomainCount?: number;
    activeQueueId?: string;
    error?: string;
    details?: string;
    message?: string;
    httpStatus?: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/sequences").then(r => r.json()).then(setSequences);
  }, []);

  async function handlePreview() {
    setPreviewing(true);
    setResult(null);
    const params = new URLSearchParams();
    if (segment)        params.set("segment",        segment);
    if (pipelineStage)  params.set("pipelineStage",  pipelineStage);
    if (country)        params.set("country",         country);
    if (sequenceId)     params.set("sequenceId",      sequenceId);
    if (salesStatus)    params.set("salesStatus",     salesStatus);
    if (mailEngagement) params.set("mailEngagement",  mailEngagement);
    // 누적 발송수 필터
    if (mailSentFilter === "0")     { params.set("mailSentMin", "0"); params.set("mailSentMax", "0"); }
    else if (mailSentFilter === "1")     { params.set("mailSentMin", "1"); params.set("mailSentMax", "1"); }
    else if (mailSentFilter === "1plus") { params.set("mailSentMin", "1"); }
    else if (mailSentFilter === "2plus") { params.set("mailSentMin", "2"); }
    else if (mailSentFilter === "range") {
      if (mailSentMin) params.set("mailSentMin", mailSentMin);
      if (mailSentMax) params.set("mailSentMax", mailSentMax);
    }

    // 미리보기 시점 필터 스냅샷 저장
    const seqName = sequenceId
      ? (sequences.find(s => s.id === sequenceId)?.name ?? sequenceId)
      : "";
    setAppliedFilters({ segment, pipelineStage, country, sequenceId, sequenceName: seqName, salesStatus, mailEngagement });

    try {
      const res  = await fetch(`/api/bulk-send?${params.toString()}`);
      const data = await res.json();
      setContacts(data.contacts ?? []);
      setSummary(data.summary ?? null);
    } catch {
      alert("미리보기 조회에 실패했습니다. 콘솔을 확인해주세요.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSend() {
    if (!contacts?.length) return;
    if (!subject || !body) { alert("제목과 본문을 입력해주세요."); return; }

    const remaining     = summary?.remainingToday ?? 100;
    const dailyLimit    = summary?.dailyLimit ?? 100;
    const todayCount    = Math.min(contacts.length, remaining);
    const deferredCount = Math.max(0, contacts.length - remaining);
    const estimatedDays = Math.ceil(contacts.length / dailyLimit);
    const confirmMsg = deferredCount > 0
      ? `총 ${contacts.length}명 큐 등록 (1건/1분 간격, 하루 ${dailyLimit}건 한도):\n· 오늘 발송 예정: ${todayCount}건 (~${todayCount}분)\n· 내일 이후 자동 이월: ${deferredCount}건\n· 전체 예상 기간: 약 ${estimatedDays}일\n\n등록하시겠습니까?`
      : `${contacts.length}명에게 메일 발송 큐를 등록하시겠습니까?\n(1건/1분 간격 · 약 ${contacts.length}분 소요)\n대시보드에서 진행 상황을 확인할 수 있습니다.`;
    if (!confirm(confirmMsg)) return;

    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/bulk-send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ contactIds: contacts.map(c => c.id), subject, body }),
      });
      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => "(응답 없음)");
        setResult({
          queued: false,
          httpStatus: res.status,
          error: `응답이 JSON이 아닙니다 (HTTP ${res.status})`,
          details: text.slice(0, 2000),
        });
        return;
      }
      if (!res.ok) {
        setResult({
          queued: false,
          httpStatus: res.status,
          error: (data.error as string) ?? (data.message as string) ?? `HTTP ${res.status}`,
          details: (data.details as string) ?? undefined,
          activeQueueId: data.activeQueueId as string | undefined,
        });
        return;
      }
      setResult(data as typeof result);
    } catch (err) {
      setResult({
        queued: false,
        error: `네트워크 오류`,
        details: err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-10">

        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">대량 메일 발송</h1>
            <p className="mt-1 text-sm text-gray-500">필터로 대상을 선택하고 메일을 일괄 발송합니다.</p>
          </div>
          <Link
            href="/leads"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            ← 리드 목록
          </Link>
        </div>

        {/* 필터 */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-gray-900">발송 대상 필터</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">세그먼트</label>
              <select
                value={segment}
                onChange={e => setSegment(e.target.value as Segment | "")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체</option>
                {(Object.keys(segmentLabels) as Segment[]).map(s => (
                  <option key={s} value={s}>{segmentLabels[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">파이프라인 단계</label>
              <select
                value={pipelineStage}
                onChange={e => setPipelineStage(e.target.value as PipelineStage | "")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체</option>
                {(Object.keys(stageLabels) as PipelineStage[]).map(s => (
                  <option key={s} value={s}>{stageLabels[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">국가 (부분 검색)</label>
              <input
                value={country}
                onChange={e => setCountry(e.target.value)}
                placeholder="예: Korea"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                시퀀스 진행중 대상{" "}
                <span className="font-normal text-gray-400">(선택 시 범위 축소)</span>
              </label>
              <select
                value={sequenceId}
                onChange={e => setSequenceId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체 (시퀀스 미선택)</option>
                {sequences.map(seq => (
                  <option key={seq.id} value={seq.id}>{seq.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-amber-600">
                시퀀스를 선택하면 이 시퀀스에 등록되어 현재 진행 중인 대상만 표시합니다.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">영업 상태</label>
              <select
                value={salesStatus}
                onChange={e => setSalesStatus(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체</option>
                {["신규","1차발송","2차예정","회신옴","관심있음","미응답","제외","거래중","보류"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">메일 반응 기준</label>
              <select
                value={mailEngagement}
                onChange={e => setMailEngagement(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체</option>
                <option value="열람">열람함</option>
                <option value="미열람">미열람 (발송됨)</option>
                <option value="2회이상열람">2회 이상 열람</option>
                <option value="답장옴">답장 옴</option>
                <option value="미응답">미응답 (발송됨)</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">
                후속 메일 대상 필터링에 활용하세요.
              </p>
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-700">누적 발송수</label>
              <div className="flex items-center gap-2">
                <select
                  value={mailSentFilter}
                  onChange={e => setMailSentFilter(e.target.value as MailSentFilter)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">전체</option>
                  <option value="0">0회 (미발송)</option>
                  <option value="1">1회</option>
                  <option value="1plus">1회 이상</option>
                  <option value="2plus">2회 이상</option>
                  <option value="range">직접 입력 범위</option>
                </select>
                {mailSentFilter === "range" && (
                  <>
                    <input
                      type="number"
                      min={0}
                      value={mailSentMin}
                      onChange={e => setMailSentMin(e.target.value)}
                      placeholder="최소"
                      className="w-20 rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-500">~</span>
                    <input
                      type="number"
                      min={0}
                      value={mailSentMax}
                      onChange={e => setMailSentMax(e.target.value)}
                      placeholder="최대"
                      className="w-20 rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">회 (비워두면 무제한)</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handlePreview}
            disabled={previewing}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {previewing ? "조회 중..." : "대상 미리보기"}
          </button>
        </div>

        {/* 미리보기 결과 */}
        {contacts !== null && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">

            {/* 적용된 필터 표시 */}
            {appliedFilters && (
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-5 py-3">
                <span className="text-xs font-semibold text-gray-500">적용된 필터:</span>
                {appliedFilters.pipelineStage ? (
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    단계: {stageLabels[appliedFilters.pipelineStage]}
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">단계: 전체</span>
                )}
                {appliedFilters.segment ? (
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    세그먼트: {segmentLabels[appliedFilters.segment]}
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">세그먼트: 전체</span>
                )}
                {appliedFilters.country && (
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    국가: {appliedFilters.country}
                  </span>
                )}
                {appliedFilters.sequenceId ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    시퀀스 진행중: {appliedFilters.sequenceName}
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">시퀀스: 미선택 (전체)</span>
                )}
                {appliedFilters.salesStatus && (
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    영업 상태: {appliedFilters.salesStatus}
                  </span>
                )}
                {appliedFilters.mailEngagement && (
                  <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                    메일 반응: {appliedFilters.mailEngagement}
                  </span>
                )}
              </div>
            )}

            {/* 요약 카드 */}
            {summary && (
              <>
                <div className="grid grid-cols-5 divide-x divide-gray-100 border-b border-gray-100">
                  <div className="px-4 py-4 text-center">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">원본 컨택트</p>
                    <p className="mt-1 text-2xl font-bold text-gray-700">{summary.rawContactCount}</p>
                  </div>
                  <div className="px-4 py-4 text-center">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">발송 대상 (중복제거 후)</p>
                    <p className="mt-1 text-2xl font-bold text-blue-600">{summary.dedupedContactCount}</p>
                  </div>
                  <div className="px-4 py-4 text-center">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">중복 제외</p>
                    <p className={`mt-1 text-2xl font-bold ${summary.duplicateExcludedCount > 0 ? "text-amber-500" : "text-gray-300"}`}>
                      {summary.duplicateExcludedCount}
                    </p>
                  </div>
                  <div className="px-4 py-4 text-center">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">수신거부 제외</p>
                    <p className={`mt-1 text-2xl font-bold ${summary.unsubscribedCount > 0 ? "text-red-500" : "text-gray-300"}`}>
                      {summary.unsubscribedCount}
                    </p>
                  </div>
                  <div className="px-4 py-4 text-center">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">오늘 남은 한도</p>
                    <p className={`mt-1 text-2xl font-bold ${summary.remainingToday === 0 ? "text-red-600" : summary.remainingToday < 50 ? "text-amber-500" : "text-green-600"}`}>
                      {summary.remainingToday}
                    </p>
                    <p className="text-xs text-gray-400">/ {summary.dailyLimit}건</p>
                  </div>
                </div>
                {/* 오늘/내일 이월 안내 배너 */}
                {contacts && contacts.length > 0 && (() => {
                  const todayCnt    = Math.min(contacts.length, summary.remainingToday);
                  const deferredCnt = Math.max(0, contacts.length - summary.remainingToday);
                  const estDays     = Math.ceil(contacts.length / summary.dailyLimit);
                  return (
                    <div className={`border-b px-5 py-3 ${deferredCnt > 0 ? "border-amber-200 bg-amber-50" : "border-blue-100 bg-blue-50"}`}>
                      <p className={`text-sm font-semibold ${deferredCnt > 0 ? "text-amber-800" : "text-blue-700"}`}>
                        오늘 발송 예정: {todayCnt}건 (~{todayCnt}분)
                        {deferredCnt > 0 && (
                          <> · 이월 예정: {deferredCnt}건 · 전체 예상 기간: 약 {estDays}일</>
                        )}
                        <span className="ml-2 text-xs font-normal opacity-70">
                          1건/1분 간격 · 하루 {summary.dailyLimit}건 한도
                        </span>
                      </p>
                    </div>
                  );
                })()}
              </>
            )}

            {contacts.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm font-medium text-gray-500">조건에 맞는 담당자가 없습니다.</p>
                <p className="mt-1 text-xs text-gray-400">필터를 변경하거나 DB에 해당 조건의 데이터가 있는지 확인해주세요.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border-b border-gray-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">회사명</th>
                      <th className="border-b border-gray-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">국가</th>
                      <th className="border-b border-gray-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">단계</th>
                      <th className="border-b border-gray-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">담당자</th>
                      <th className="border-b border-gray-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">이메일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.slice(0, 200).map(ct => (
                      <tr key={ct.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{ct.company.name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{ct.company.country || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-500">{stageLabels[ct.company.pipelineStage]}</td>
                        <td className="px-4 py-2.5 text-gray-700">{ct.name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{ct.email}</td>
                      </tr>
                    ))}
                    {contacts.length > 200 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-center text-xs text-gray-400">
                          200건까지만 표시 (전체 {contacts.length}건)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 메일 내용 */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-gray-900">메일 내용</h2>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-semibold text-gray-700">제목 *</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="메일 제목을 입력하세요"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">본문 *</label>
            <textarea
              rows={8}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="메일 본문을 입력하세요"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 발송 버튼 */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSend}
            disabled={sending || !contacts?.length || !subject || !body}
            className="rounded-md bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {sending
              ? "큐 등록 중..."
              : `발송 큐 등록${contacts?.length ? ` (${contacts.length}명)` : ""}`}
          </button>
          {result && (
            result.queued ? (
              <span className="text-sm font-medium text-green-700">
                큐 등록 완료 — 총 {result.totalCount}명
                {(result.deferredCount ?? 0) > 0
                  ? ` (오늘 ${result.todayCount}건 · 이월 ${result.deferredCount}건 · 약 ${result.estimatedDays}일 소요).`
                  : ` (약 ${result.estMinutesToday}분 소요).`}
                {" "}<a href="/dashboard" className="underline">대시보드에서 진행 확인</a>
                {(result.invalidEmailCount ?? 0) > 0 && (
                  <span className="ml-2 text-amber-600">형식 오류 {result.invalidEmailCount}건 제외</span>
                )}
                {(result.invalidDomainCount ?? 0) > 0 && (
                  <span className="ml-2 text-red-500">도메인 오류 {result.invalidDomainCount}건 제외</span>
                )}
              </span>
            ) : result.activeQueueId ? (
              <span className="text-sm font-medium text-orange-600">
                {result.error}{" "}
                <a href="/dashboard" className="underline">대시보드 확인</a>
              </span>
            ) : (
              <div className="flex-1 rounded-md border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-700">
                  큐 등록 실패
                  {result.httpStatus && (
                    <span className="ml-2 rounded bg-red-200 px-1.5 py-0.5 text-xs font-mono text-red-800">
                      HTTP {result.httpStatus}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm text-red-600">
                  {result.error ?? result.message ?? "발송 가능한 대상이 없습니다."}
                </p>
                {result.details && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-red-500 hover:text-red-700">
                      상세 오류 보기
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-red-100 p-2 text-xs text-red-800">
                      {result.details}
                    </pre>
                  </details>
                )}
              </div>
            )
          )}
        </div>

      </div>
    </div>
  );
}
