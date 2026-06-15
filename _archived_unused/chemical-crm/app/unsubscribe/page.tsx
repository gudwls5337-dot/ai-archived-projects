"use client";

import { useState } from "react";

export default function UnsubscribePage() {
  const [email, setEmail]   = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), reason: reason.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "오류가 발생했습니다.");
        return;
      }

      setStatus("done");
      setMessage(
        data.alreadyExists
          ? "이미 수신 거부 목록에 등록된 이메일입니다."
          : "수신 거부가 완료되었습니다. 이후 발송 목록에서 제외됩니다."
      );
    } catch {
      setStatus("error");
      setMessage("서버 연결에 실패했습니다.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-md">
        <h1 className="mb-1 text-xl font-bold text-gray-900">수신 거부</h1>
        <p className="mb-6 text-sm text-gray-900">
          아래 이메일 주소를 입력하면 이후 발송 목록에서 영구 제외됩니다.
        </p>

        {status === "done" ? (
          <div className="rounded-xl bg-green-50 px-6 py-5 text-center">
            <p className="text-base font-semibold text-green-800">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-900">
                이메일 주소 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="example@company.com"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900
                  placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-900">
                사유 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 관심 없음, 이미 거래 중, 잘못 수신 등"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900
                  placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {status === "error" && (
              <p className="text-sm font-semibold text-red-600">{message}</p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-lg bg-gray-900 py-3 text-sm font-bold text-white
                hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading" ? "처리 중..." : "수신 거부 신청"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
