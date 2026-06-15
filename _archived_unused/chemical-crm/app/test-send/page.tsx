"use client";

import { useState } from "react";
import Link from "next/link";

type SendResult = {
  email: string;
  status: "success" | "failed";
  error?: string;
};

const EMPTY_EMAILS = ["", "", ""];

export default function TestSendPage() {
  const [emails, setEmails]     = useState<string[]>([...EMPTY_EMAILS]);
  const [subject, setSubject]   = useState("");
  const [body, setBody]         = useState("");
  const [sending, setSending]   = useState(false);
  const [results, setResults]   = useState<SendResult[] | null>(null);

  function updateEmail(idx: number, value: string) {
    setEmails((prev) => prev.map((e, i) => (i === idx ? value : e)));
  }

  async function handleSend() {
    const targets = emails.map((e) => e.trim()).filter((e) => e.length > 0);
    if (targets.length === 0) {
      alert("이메일 주소를 최소 1개 입력해주세요.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      alert("제목과 본문을 입력해주세요.");
      return;
    }
    if (!confirm(`${targets.length}개 주소로 테스트 발송하시겠습니까?`)) return;

    setSending(true);
    setResults(null);

    const resultList: SendResult[] = [];

    for (const email of targets) {
      console.log(`[test-send] 발송 시작: ${email}`);
      try {
        const res = await fetch("/api/mail/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: email, subject: subject.trim(), text: body.trim() }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          console.log(`[test-send] 성공: ${email}`);
          resultList.push({ email, status: "success" });
        } else {
          console.error(`[test-send] 실패: ${email}`, data.error);
          resultList.push({ email, status: "failed", error: data.error ?? "알 수 없는 오류" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[test-send] 네트워크 오류: ${email}`, msg);
        resultList.push({ email, status: "failed", error: msg });
      }

      // 각 발송 사이 결과를 즉시 반영
      setResults([...resultList]);
    }

    console.log("[test-send] 전체 완료:", resultList);
    setSending(false);
  }

  function handleReset() {
    setEmails([...EMPTY_EMAILS]);
    setSubject("");
    setBody("");
    setResults(null);
  }

  const successCount = results?.filter((r) => r.status === "success").length ?? 0;
  const failedCount  = results?.filter((r) => r.status === "failed").length ?? 0;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto max-w-2xl px-6 py-8">

        {/* 헤더 */}
        <div className="mb-6">
          <Link
            href="/leads"
            className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-gray-900 hover:text-gray-900"
          >
            ← 리드 목록
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">테스트 발송</h1>
          <p className="mt-1 text-sm text-gray-900">
            대량 발송 전에 최대 3개 이메일 주소로 먼저 확인하세요.
          </p>
        </div>

        {/* 입력 폼 */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">

          {/* 수신자 */}
          <div className="mb-5">
            <p className="mb-2 text-sm font-bold text-gray-900">
              수신자 이메일 <span className="font-normal text-gray-900">(최대 3개)</span>
            </p>
            <div className="space-y-2">
              {emails.map((email, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs font-bold text-gray-900">{idx + 1}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => updateEmail(idx, e.target.value)}
                    placeholder={`test${idx + 1}@example.com`}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900
                      placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 제목 */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-bold text-gray-900">
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="이메일 제목을 입력하세요"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900
                placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 본문 */}
          <div className="mb-6">
            <label className="mb-1 block text-sm font-bold text-gray-900">
              본문 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"안녕하세요,\n\n이메일 본문을 입력하세요."}
              rows={8}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900
                placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 발송 버튼 */}
          <button
            onClick={handleSend}
            disabled={sending}
            style={{
              backgroundColor: sending ? "#9ca3af" : "#1d4ed8",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 700,
              padding: "12px 0",
              borderRadius: "10px",
              width: "100%",
              border: "none",
              cursor: sending ? "not-allowed" : "pointer",
              boxShadow: sending ? "none" : "0 2px 8px rgba(29,78,216,0.3)",
            }}
          >
            {sending ? "발송 중..." : "테스트 발송"}
          </button>
        </div>

        {/* 발송 결과 */}
        {results && results.length > 0 && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">발송 결과</h2>
              <div className="flex gap-2">
                {successCount > 0 && (
                  <span
                    style={{ backgroundColor: "#16a34a", color: "#fff" }}
                    className="rounded-full px-3 py-1 text-sm font-bold"
                  >
                    성공 {successCount}건
                  </span>
                )}
                {failedCount > 0 && (
                  <span
                    style={{ backgroundColor: "#ef4444", color: "#fff" }}
                    className="rounded-full px-3 py-1 text-sm font-bold"
                  >
                    실패 {failedCount}건
                  </span>
                )}
                {sending && (
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-sm font-bold text-gray-900">
                    발송 중...
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {results.map((r, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 rounded-lg px-4 py-3 ${
                    r.status === "success" ? "bg-green-50" : "bg-red-50"
                  }`}
                >
                  <span
                    style={{
                      display: "inline-block",
                      minWidth: 48,
                      textAlign: "center",
                      borderRadius: "9999px",
                      padding: "2px 10px",
                      fontSize: "12px",
                      fontWeight: 700,
                      backgroundColor: r.status === "success" ? "#16a34a" : "#ef4444",
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {r.status === "success" ? "성공" : "실패"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{r.email}</p>
                    {r.error && (
                      <p className="mt-0.5 text-xs font-medium text-red-600">{r.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 완료 후 다시 시작 버튼 */}
            {!sending && (
              <button
                onClick={handleReset}
                className="mt-5 w-full rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                초기화 후 다시 시작
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
