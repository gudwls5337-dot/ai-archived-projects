"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

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
  steps: SequenceStep[];
};

function MailForm() {
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    to: "",
    subject: "",
    text: "",
  });
  const [leadId, setLeadId] = useState<string>("");
  const [contactId, setContactId] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [selectedSeqId, setSelectedSeqId] = useState("");
  const [selectedStepId, setSelectedStepId] = useState("");

  useEffect(() => {
    const to = searchParams.get("to");
    const lid = searchParams.get("leadId");
    const cid = searchParams.get("contactId");
    if (to) setForm((prev) => ({ ...prev, to }));
    if (lid) setLeadId(lid);
    if (cid) setContactId(cid);
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/sequences")
      .then((r) => r.json())
      .then((list: { id: string; name: string; _count: { steps: number } }[]) => {
        const withSteps = list.filter((s) => s._count.steps > 0);
        if (withSteps.length === 0) return;
        Promise.all(
          withSteps.map((s) => fetch(`/api/sequences/${s.id}`).then((r) => r.json()))
        ).then(setSequences);
      });
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSelectStep(seqId: string, stepId: string) {
    setSelectedSeqId(seqId);
    setSelectedStepId(stepId);
    const seq = sequences.find((s) => s.id === seqId);
    const step = seq?.steps.find((st) => st.id === stepId);
    if (step) {
      setForm((prev) => ({ ...prev, subject: step.subject, text: step.body }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    try {
      const res = await fetch("/api/mail/test", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ ...form, contactId: contactId || undefined }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMessage(data.error ?? "알 수 없는 오류");
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "네트워크 오류");
    }
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none";

  const selectedSeq = sequences.find((s) => s.id === selectedSeqId);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-6 py-10">
        <Link href={leadId ? `/leads/${leadId}` : "/leads"} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-900 hover:text-gray-900">
          ← {leadId ? "리드 상세로" : "리드 목록"}
        </Link>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">메일 보내기</h1>
        <p className="mb-6 text-sm text-gray-900">NAVER WORKS SMTP</p>

        {/* 시퀀스 템플릿 선택 */}
        {sequences.length > 0 && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-medium text-gray-900">시퀀스 템플릿 불러오기</p>
            <div className="flex gap-2">
              <select
                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedSeqId}
                onChange={(e) => { setSelectedSeqId(e.target.value); setSelectedStepId(""); }}
              >
                <option value="">시퀀스 선택</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {selectedSeqId && (
                <select
                  className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedStepId}
                  onChange={(e) => handleSelectStep(selectedSeqId, e.target.value)}
                >
                  <option value="">단계 선택</option>
                  {selectedSeq?.steps.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.stepOrder}단계{st.delayDays > 0 ? ` (+${st.delayDays}일)` : ""} - {st.subject}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {selectedStepId && (
              <p className="mt-2 text-xs text-blue-600">템플릿을 불러왔습니다. 내용을 자유롭게 수정하세요.</p>
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">받는 이메일</label>
            <input
              name="to"
              type="email"
              value={form.to}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">제목</label>
            <input
              name="subject"
              value={form.subject}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">본문</label>
            <textarea
              name="text"
              value={form.text}
              onChange={handleChange}
              required
              rows={8}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {status === "sending" ? "발송 중..." : "메일 보내기"}
          </button>

          {status === "success" && (
            <div className="rounded-md bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              발송 성공
            </div>
          )}
          {status === "error" && (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              <span className="font-medium">발송 실패:</span> {errorMessage}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function MailTestPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-50"><p className="text-sm text-gray-900">불러오는 중...</p></div>}>
      <MailForm />
    </Suspense>
  );
}
