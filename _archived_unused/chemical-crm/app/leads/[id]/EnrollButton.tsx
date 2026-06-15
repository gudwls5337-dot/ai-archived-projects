"use client";

import { useState } from "react";

interface Sequence {
  id: string;
  name: string;
}

export default function EnrollButton({ contactId }: { contactId: string }) {
  const [loading, setLoading] = useState(false);
  const [sequences, setSequences] = useState<Sequence[] | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function openSelect() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sequences");
      const data = await res.json();
      setSequences(data);
      setSelectedId(data[0]?.id ?? "");
      setOpen(true);
    } catch {
      setMessage({ text: "시퀀스 목록을 불러오지 못했습니다.", ok: false });
    } finally {
      setLoading(false);
    }
  }

  async function enroll() {
    if (!selectedId) return;
    setLoading(true);
    console.log("[EnrollButton] enroll 호출 — sequenceId:", selectedId, "contactId:", contactId);
    let data: { error?: string } = {};
    try {
      const res = await fetch(`/api/sequences/${selectedId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      data = await res.json();
      console.log("[EnrollButton] API 응답 — status:", res.status, "body:", data);
      if (res.ok) {
        // 201 = 신규 등록, 200 = 이미 등록됨
        const text = res.status === 201 ? "시퀀스에 등록되었습니다." : "이미 등록된 시퀀스입니다.";
        setMessage({ text, ok: true });
      } else {
        setMessage({ text: data.error ?? "등록에 실패했습니다.", ok: false });
      }
    } catch (err) {
      console.error("[EnrollButton] fetch 오류:", err);
      setMessage({ text: data.error ?? "네트워크 오류가 발생했습니다.", ok: false });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {!open ? (
        <button
          onClick={openSelect}
          disabled={loading}
          className="shrink-0 rounded-md border border-purple-600 bg-white px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "시퀀스 등록"}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-900"
          >
            {sequences?.length === 0 && (
              <option value="">시퀀스 없음</option>
            )}
            {sequences?.map((seq) => (
              <option key={seq.id} value={seq.id}>
                {seq.name}
              </option>
            ))}
          </select>
          <button
            onClick={enroll}
            disabled={loading || !selectedId}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            등록
          </button>
          <button
            onClick={() => { setOpen(false); setMessage(null); }}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-900 hover:bg-gray-50"
          >
            취소
          </button>
        </div>
      )}
      {message && (
        <span className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
