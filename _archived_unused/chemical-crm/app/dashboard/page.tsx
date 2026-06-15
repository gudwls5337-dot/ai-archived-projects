import Link from "next/link";
import { prisma } from "@/lib/prisma";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const [
    totalCompanies,
    totalContacts,
    activeCount,
    pausedCount,
    completedCount,
    stepGroups,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.contact.count(),
    prisma.contactSequenceEnrollment.count({ where: { status: "ACTIVE" } }),
    prisma.contactSequenceEnrollment.count({ where: { status: "PAUSED" } }),
    prisma.contactSequenceEnrollment.count({ where: { status: "COMPLETED" } }),
    prisma.contactSequenceEnrollment.groupBy({
      by: ["currentStep"],
      _count: { id: true },
      orderBy: { currentStep: "asc" },
    }),
  ]);

  const kpis = [
    { label: "전체 회사 수", value: totalCompanies, color: "bg-blue-50 border-blue-200", textColor: "text-blue-700" },
    { label: "전체 담당자 수", value: totalContacts, color: "bg-indigo-50 border-indigo-200", textColor: "text-indigo-700" },
    { label: "진행중 시퀀스", value: activeCount, color: "bg-green-50 border-green-200", textColor: "text-green-700" },
    { label: "완료된 시퀀스", value: completedCount, color: "bg-gray-50 border-gray-300", textColor: "text-gray-900" },
  ];

  const statusRows = [
    { label: "진행중 (ACTIVE)", value: activeCount, badge: "bg-green-100 text-green-700" },
    { label: "일시정지 (PAUSED)", value: pausedCount, badge: "bg-yellow-100 text-yellow-700" },
    { label: "완료 (COMPLETED)", value: completedCount, badge: "bg-gray-100 text-gray-900" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
            <p className="mt-1 text-sm text-gray-500">CRM 전체 현황</p>
          </div>
          <Link
            href="/leads"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            ← 리드 목록
          </Link>
        </div>

        {/* KPI 카드 */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className={`rounded-lg border ${kpi.color} bg-white px-5 py-5 shadow-sm`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{kpi.label}</p>
              <p className={`mt-2 text-3xl font-bold ${kpi.textColor}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* 상태별 현황 */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-bold text-gray-900">시퀀스 상태별 현황</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {statusRows.map((row) => (
                <li key={row.label} className="flex items-center justify-between px-5 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${row.badge}`}>
                    {row.label}
                  </span>
                  <span className="text-lg font-bold text-gray-900">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 단계별 현황 */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-bold text-gray-900">시퀀스 단계별 현황</h2>
            </div>
            {stepGroups.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500">등록된 데이터가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {stepGroups.map((row) => (
                  <li key={row.currentStep} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm font-medium text-gray-900">{row.currentStep}단계</span>
                    <span className="text-lg font-bold text-gray-900">{row._count.id}명</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 동적 섹션: 발송 현황 / 큐 / 시퀀스 등록 */}
        <div className="mt-8">
          <DashboardClient />
        </div>
      </div>
    </div>
  );
}
