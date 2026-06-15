"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Segment, PipelineStage } from "../types/lead";

const segmentLabels: Record<Segment, string> = {
  exhibition_booth: "전시회 부스",
  tendata_volume: "텐데이터 볼륨",
  distributor_by_country: "국가별 디스트리뷰터",
  met_in_person: "직접 만남",
  inbound: "인바운드",
};

const pipelineStageLabels: PipelineStage[] = ["신규", "접촉중", "제안완료", "계약완료"];

const stageColors: Record<PipelineStage, string> = {
  신규: "bg-gray-100 text-gray-700",
  접촉중: "bg-blue-100 text-blue-700",
  제안완료: "bg-yellow-100 text-yellow-700",
  계약완료: "bg-green-100 text-green-700",
};

const salesStatusOptions = ["신규", "1차발송", "2차예정", "회신옴", "관심있음", "미응답", "제외", "거래중", "보류"];

const salesStatusColors: Record<string, string> = {
  신규: "bg-gray-100 text-gray-600",
  "1차발송": "bg-blue-100 text-blue-700",
  "2차예정": "bg-indigo-100 text-indigo-700",
  회신옴: "bg-green-100 text-green-700",
  관심있음: "bg-emerald-100 text-emerald-700",
  미응답: "bg-yellow-100 text-yellow-700",
  제외: "bg-red-100 text-red-700",
  거래중: "bg-green-200 text-green-800",
  보류: "bg-orange-100 text-orange-700",
};

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

type MailEngagementFilter = "" | "열람" | "미열람" | "답장옴" | "미응답";

type Lead = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  country: string;
  segment: Segment;
  pipelineStage: PipelineStage;
  source: string | null;
  salesStatus: string | null;
  tags: string[];
  hasOpenedMail: boolean;
  hasReplied: boolean;
  mailSentCount: number;
  createdAt: string;
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment | "">("");
  const [selectedStage, setSelectedStage] = useState<PipelineStage | "">("");
  const [selectedSalesStatus, setSelectedSalesStatus] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedEngagement, setSelectedEngagement] = useState<MailEngagementFilter>("");
  const [countrySearch, setCountrySearch] = useState("");
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    fetch("/api/leads")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setLeads(data);
        } else {
          setDbError(true);
        }
      })
      .catch(() => setDbError(true));
  }, []);

  // 현재 데이터에서 태그 목록 추출
  const allTags = [...new Set(leads.flatMap((l) => l.tags))].sort();

  const filtered = leads.filter((lead) => {
    if (selectedSegment && lead.segment !== selectedSegment) return false;
    if (selectedStage && lead.pipelineStage !== selectedStage) return false;
    if (selectedSalesStatus && lead.salesStatus !== selectedSalesStatus) return false;
    if (selectedSource && lead.source !== selectedSource) return false;
    if (selectedTag && !lead.tags.includes(selectedTag)) return false;
    if (countrySearch && !lead.country.toLowerCase().includes(countrySearch.toLowerCase())) return false;
    if (selectedEngagement === "열람" && !lead.hasOpenedMail) return false;
    if (selectedEngagement === "미열람" && (lead.mailSentCount === 0 || lead.hasOpenedMail)) return false;
    if (selectedEngagement === "답장옴" && !lead.hasReplied) return false;
    if (selectedEngagement === "미응답" && (lead.mailSentCount === 0 || lead.hasReplied)) return false;
    return true;
  });

  const hasAnyFilter = selectedSegment || selectedStage || selectedSalesStatus || selectedSource || selectedTag || countrySearch || selectedEngagement;

  function resetFilters() {
    setSelectedSegment("");
    setSelectedStage("");
    setSelectedSalesStatus("");
    setSelectedSource("");
    setSelectedTag("");
    setCountrySearch("");
    setSelectedEngagement("");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">리드 목록</h1>
            <p className="mt-1 text-sm text-gray-900">총 {filtered.length}개의 리드</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard" className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">대시보드</Link>
            <Link href="/bulk-send" className="rounded-md border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50">대량 발송</Link>
            <Link href="/sequences" className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">시퀀스 관리</Link>
            <Link href="/leads/import" className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">엑셀 가져오기</Link>
            <Link href="/test-send" className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">테스트 발송</Link>
            <Link href="/leads/new" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+ 리드 추가</Link>
          </div>
        </div>

        {/* 필터 — 1행 */}
        <div className="mb-2 flex flex-wrap gap-2">
          <select
            value={selectedSegment}
            onChange={(e) => setSelectedSegment(e.target.value as Segment | "")}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">세그먼트 전체</option>
            {(Object.keys(segmentLabels) as Segment[]).map((seg) => (
              <option key={seg} value={seg}>{segmentLabels[seg]}</option>
            ))}
          </select>

          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value as PipelineStage | "")}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">파이프라인 전체</option>
            {pipelineStageLabels.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>

          <select
            value={selectedSalesStatus}
            onChange={(e) => setSelectedSalesStatus(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">영업 상태 전체</option>
            {salesStatusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">유입 출처 전체</option>
            {sourceOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* 필터 — 2행 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={countrySearch}
            onChange={(e) => setCountrySearch(e.target.value)}
            placeholder="국가 검색"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none"
          />

          {allTags.length > 0 && (
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">태그 전체</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          )}

          <select
            value={selectedEngagement}
            onChange={(e) => setSelectedEngagement(e.target.value as MailEngagementFilter)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">메일 반응 전체</option>
            <option value="열람">열람함</option>
            <option value="미열람">미열람 (발송됨)</option>
            <option value="답장옴">답장 옴</option>
            <option value="미응답">미응답 (발송됨)</option>
          </select>

          {hasAnyFilter && (
            <button
              onClick={resetFilters}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-100"
            >
              필터 초기화
            </button>
          )}
        </div>

        {dbError && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            DB 연결 오류: Supabase 프로젝트가 일시 정지되었을 수 있습니다. 대시보드에서 프로젝트를 재개해 주세요.
          </div>
        )}

        {/* 테이블 */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-700">
              <tr>
                <th className="px-6 py-3 text-left">회사명</th>
                <th className="px-6 py-3 text-left">담당자</th>
                <th className="px-6 py-3 text-left">국가</th>
                <th className="px-6 py-3 text-left">세그먼트</th>
                <th className="px-6 py-3 text-left">파이프라인</th>
                <th className="px-6 py-3 text-left">영업 상태</th>
                <th className="px-6 py-3 text-left">반응</th>
                <th className="px-6 py-3 text-left">등록일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gray-500">
                    해당하는 리드가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((lead) => (
                  <tr key={lead.id} className="cursor-pointer hover:bg-blue-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <Link href={`/leads/${lead.id}`} className="block hover:text-blue-600">
                        {lead.companyName}
                        {lead.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {lead.tags.map((tag) => (
                              <span key={tag} className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <div>{lead.contactName}</div>
                        <div className="text-xs text-gray-400">{lead.email}</div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      <Link href={`/leads/${lead.id}`} className="block">{lead.country}</Link>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      <Link href={`/leads/${lead.id}`} className="block">{segmentLabels[lead.segment]}</Link>
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${stageColors[lead.pipelineStage]}`}>
                          {lead.pipelineStage}
                        </span>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/leads/${lead.id}`} className="block">
                        {lead.salesStatus ? (
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${salesStatusColors[lead.salesStatus] ?? "bg-gray-100 text-gray-600"}`}>
                            {lead.salesStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <div className="flex gap-1">
                          {lead.hasReplied && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">답장</span>
                          )}
                          {lead.hasOpenedMail && !lead.hasReplied && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600">열람</span>
                          )}
                          {lead.mailSentCount > 0 && !lead.hasOpenedMail && !lead.hasReplied && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">미열람</span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      <Link href={`/leads/${lead.id}`} className="block">{lead.createdAt}</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
