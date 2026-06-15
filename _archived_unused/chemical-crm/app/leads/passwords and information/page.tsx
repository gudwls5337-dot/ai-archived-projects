"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Segment, PipelineStage } from "../../types/lead";

const segmentOptions: { value: Segment; label: string }[] = [
  { value: "exhibition_booth", label: "전시회 부스" },
  { value: "tendata_volume", label: "텐데이터 볼륨" },
  { value: "distributor_by_country", label: "국가별 디스트리뷰터" },
  { value: "met_in_person", label: "직접 만남" },
  { value: "inbound", label: "인바운드" },
];

const pipelineStages: PipelineStage[] = ["신규", "접촉중", "제안완료", "계약완료"];

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    country: "",
    segment: "" as Segment | "",
    pipelineStage: "" as PipelineStage | "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log("submit fired", form); // ← submit 진입 확인용
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    router.push("/leads");
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-6 py-10">
        <Link
          href="/leads"
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          ← 리드 목록
        </Link>

        <h1 className="mb-8 mt-4 text-2xl font-bold text-gray-900">리드 추가</h1>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">회사명</label>
            <input
              name="companyName"
              value={form.companyName}
              onChange={handleChange}
              required
              className={inputClass}
              placeholder="예: ACME Corp"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">담당자명</label>
            <input
              name="contactName"
              value={form.contactName}
              onChange={handleChange}
              required
              className={inputClass}
              placeholder="예: 홍길동"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">이메일</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className={inputClass}
              placeholder="예: contact@acme.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">국가</label>
            <input
              name="country"
              value={form.country}
              onChange={handleChange}
              required
              className={inputClass}
              placeholder="예: 미국"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">세그먼트</label>
            <select
              name="segment"
              value={form.segment}
              onChange={handleChange}
              required
              className={inputClass}
            >
              <option value="">선택해주세요</option>
              {segmentOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">파이프라인 단계</label>
            <select
              name="pipelineStage"
              value={form.pipelineStage}
              onChange={handleChange}
              required
              className={inputClass}
            >
              <option value="">선택해주세요</option>
              {pipelineStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Link
              href="/leads"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 hover:bg-gray-50"
            >
              취소
            </Link>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              추가하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
