"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { use } from "react";

export default function NewContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", title: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/leads/${id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "저장 중 오류가 발생했습니다.");
      setSubmitting(false);
      return;
    }

    router.push(`/leads/${id}`);
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-6 py-10">
        <Link
          href={`/leads/${id}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          ← 상세 페이지
        </Link>

        <h1 className="mb-8 mt-4 text-2xl font-bold text-gray-900">담당자 추가</h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className={inputClass}
              placeholder="홍길동"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">
              이메일 <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className={inputClass}
              placeholder="contact@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">
              직함 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              className={inputClass}
              placeholder="구매 담당자"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Link
              href={`/leads/${id}`}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 hover:bg-gray-50"
            >
              취소
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
