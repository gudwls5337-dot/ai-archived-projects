"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Segment, PipelineStage } from "../../../types/lead";

const segmentOptions: { value: Segment; label: string }[] = [
  { value: "exhibition_booth", label: "전시회 부스" },
  { value: "tendata_volume", label: "텐데이터 볼륨" },
  { value: "distributor_by_country", label: "국가별 디스트리뷰터" },
  { value: "met_in_person", label: "직접 만남" },
  { value: "inbound", label: "인바운드" },
];

const pipelineStages: PipelineStage[] = ["신규", "접촉중", "제안완료", "계약완료"];

const salesStatusOptions = ["신규", "1차발송", "2차예정", "회신옴", "관심있음", "미응답", "제외", "거래중", "보류"];

const sourceOptions = [
  { value: "exhibition", label: "전시회" },
  { value: "abm", label: "ABM" },
  { value: "manual", label: "수동등록" },
  { value: "inbound", label: "인바운드" },
  { value: "referral", label: "소개" },
  { value: "existing_client", label: "기존거래처" },
  { value: "exhibition_import", label: "엑셀 가져오기" },
  { value: "abm_import", label: "ABM 가져오기" },
];

const PRESET_TAGS = ["필터여과지", "HVAC", "냉동공조", "디스트리뷰터", "OEM"];

type Form = {
  companyName: string;
  contactName: string;
  email: string;
  country: string;
  segment: Segment | "";
  pipelineStage: PipelineStage | "";
  source: string;
  salesStatus: string;
  tags: string[];
};

export default function EditLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [form, setForm] = useState<Form>({
    companyName: "",
    contactName: "",
    email: "",
    country: "",
    segment: "",
    pipelineStage: "",
    source: "",
    salesStatus: "",
    tags: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(({ id }) => {
      setId(id);
      fetch(`/api/leads/${id}`)
        .then((res) => res.json())
        .then((data) => {
          setForm({
            companyName: data.companyName,
            contactName: data.contactName,
            email: data.email,
            country: data.country,
            segment: data.segment,
            pipelineStage: data.pipelineStage,
            source: data.source ?? "",
            salesStatus: data.salesStatus ?? "",
            tags: data.tags ?? [],
          });
          setLoading(false);
        });
    });
  }, [params]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function toggleTag(tag: string) {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    router.push(`/leads/${id}`);
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-6 py-10">
        <Link
          href={`/leads/${id}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          ← 상세 페이지
        </Link>

        <h1 className="mb-8 mt-4 text-2xl font-bold text-gray-900">리드 수정</h1>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {/* 기본 정보 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">회사명</label>
            <input name="companyName" value={form.companyName} onChange={handleChange} required className={inputClass} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">담당자명</label>
            <input name="contactName" value={form.contactName} onChange={handleChange} required className={inputClass} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">이메일</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} required className={inputClass} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">국가</label>
            <input name="country" value={form.country} onChange={handleChange} required className={inputClass} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">세그먼트</label>
            <select name="segment" value={form.segment} onChange={handleChange} required className={inputClass}>
              <option value="">선택해주세요</option>
              {segmentOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">파이프라인 단계</label>
            <select name="pipelineStage" value={form.pipelineStage} onChange={handleChange} required className={inputClass}>
              <option value="">선택해주세요</option>
              {pipelineStages.map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          </div>

          {/* 분류 정보 */}
          <hr className="border-gray-100" />
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">업체 분류</p>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">영업 상태</label>
            <select name="salesStatus" value={form.salesStatus} onChange={handleChange} className={inputClass}>
              <option value="">선택 안 함</option>
              {salesStatusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">유입 출처</label>
            <select name="source" value={form.source} onChange={handleChange} className={inputClass}>
              <option value="">선택 안 함</option>
              {sourceOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-900">업체 태그</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    form.tags.includes(tag)
                      ? "bg-purple-600 text-white"
                      : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            {form.tags.length > 0 && (
              <p className="mt-2 text-xs text-gray-400">선택됨: {form.tags.join(", ")}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Link
              href={`/leads/${id}`}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 hover:bg-gray-50"
            >
              취소
            </Link>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
