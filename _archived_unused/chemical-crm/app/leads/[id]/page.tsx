import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PipelineStage as PrismaStage, Segment as PrismaSegment } from "@prisma/client";
import EnrollButton from "./EnrollButton";
import ReplyButton from "./ReplyButton";

const segmentLabels: Record<PrismaSegment, string> = {
  exhibition_booth: "전시회 부스",
  tendata_volume: "텐데이터 볼륨",
  distributor_by_country: "국가별 디스트리뷰터",
  met_in_person: "직접 만남",
  inbound: "인바운드",
};

const stageLabels: Record<PrismaStage, string> = {
  NEW: "신규",
  CONTACTED: "접촉중",
  PROPOSED: "제안완료",
  CONTRACTED: "계약완료",
};

const stageColors: Record<PrismaStage, string> = {
  NEW: "bg-gray-100 text-gray-900",
  CONTACTED: "bg-blue-100 text-blue-700",
  PROPOSED: "bg-yellow-100 text-yellow-700",
  CONTRACTED: "bg-green-100 text-green-700",
};

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

const sourceLabels: Record<string, string> = {
  exhibition: "전시회",
  abm: "ABM",
  manual: "수동등록",
  inbound: "인바운드",
  referral: "소개",
  existing_client: "기존거래처",
  exhibition_import: "엑셀 가져오기",
  abm_import: "ABM 가져오기",
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      contacts: {
        orderBy: { createdAt: "asc" },
        include: {
          mailLogs: { orderBy: { createdAt: "desc" } },
          enrollments: {
            include: { sequence: true },
            orderBy: { enrolledAt: "desc" },
          },
        },
      },
    },
  });

  if (!company) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">리드를 찾을 수 없습니다.</p>
          <Link href="/leads" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            리드 목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const rep = company.contacts[0] ?? null;

  const allMailLogs = company.contacts
    .flatMap((ct) => ct.mailLogs)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-6 py-10">
        {/* 뒤로가기 */}
        <Link href="/leads" className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          ← 리드 목록
        </Link>

        {/* 헤더 */}
        <div className="mb-8 mt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${stageColors[company.pipelineStage]}`}>
                  {stageLabels[company.pipelineStage]}
                </span>
                {company.salesStatus && (
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${salesStatusColors[company.salesStatus] ?? "bg-gray-100 text-gray-600"}`}>
                    {company.salesStatus}
                  </span>
                )}
                {company.source && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-500">
                    {sourceLabels[company.source] ?? company.source}
                  </span>
                )}
              </div>
              {company.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {company.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-600">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {rep && (
                <Link
                  href={`/mail/test?to=${encodeURIComponent(rep.email)}&contactId=${rep.id}&leadId=${company.id}`}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  메일 보내기
                </Link>
              )}
              <Link
                href={`/leads/${id}/edit`}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                회사 수정
              </Link>
              <Link
                href={`/leads/${id}/contacts/new`}
                className="rounded-md border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
              >
                담당자 추가
              </Link>
            </div>
          </div>
        </div>

        {/* 회사 기본 정보 카드 */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <dl className="divide-y divide-gray-100">
            {[
              { label: "회사명", value: company.name },
              { label: "국가", value: company.country },
              { label: "세그먼트", value: segmentLabels[company.segment] },
              { label: "등록일", value: company.createdAt.toISOString().slice(0, 10) },
            ].map(({ label, value }) => (
              <div key={label} className="grid grid-cols-3 gap-4 px-6 py-4">
                <dt className="text-sm font-semibold text-gray-900">{label}</dt>
                <dd className="col-span-2 text-sm font-medium text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 담당자 목록 */}
        <div className="mt-8">
          <h2 className="mb-3 text-base font-semibold text-gray-900">담당자 목록</h2>
          {company.contacts.length === 0 ? (
            <p className="text-sm text-gray-500">등록된 담당자가 없습니다.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <ul className="divide-y divide-gray-100">
                {company.contacts.map((ct, idx) => (
                  <li key={ct.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{ct.name}</span>
                        {idx === 0 && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                            대표 담당자
                          </span>
                        )}
                        {ct.hasReplied && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            답장옴
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-sm text-gray-600">{ct.email}</div>
                      {ct.title && (
                        <div className="mt-0.5 text-xs text-gray-400">{ct.title}</div>
                      )}
                      {/* 시퀀스 등록 상태 */}
                      <div className="mt-2">
                        {ct.enrollments.length === 0 ? (
                          <span className="text-xs text-gray-400">등록된 시퀀스 없음</span>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {ct.enrollments.map((enroll) => (
                              <li key={enroll.id} className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-700">{enroll.sequence.name}</span>
                                <span className="text-xs text-gray-400">· {enroll.currentStep}단계</span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  enroll.status === "ACTIVE"
                                    ? "bg-green-100 text-green-700"
                                    : enroll.status === "PAUSED"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-gray-100 text-gray-500"
                                }`}>
                                  {enroll.status === "ACTIVE" ? "진행중" : enroll.status === "PAUSED" ? "일시정지" : "완료"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Link
                        href={`/mail/test?to=${encodeURIComponent(ct.email)}&contactId=${ct.id}&leadId=${company.id}`}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        메일 보내기
                      </Link>
                      <ReplyButton contactId={ct.id} initialHasReplied={ct.hasReplied} />
                      <EnrollButton contactId={ct.id} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 메일 발송 이력 */}
        <div className="mt-8 mb-10">
          <h2 className="mb-3 text-base font-semibold text-gray-900">메일 발송 이력</h2>
          {allMailLogs.length === 0 ? (
            <p className="text-sm text-gray-500">발송 이력이 없습니다.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">일시</th>
                    <th className="px-4 py-3 text-left">제목</th>
                    <th className="px-4 py-3 text-left">상태</th>
                    <th className="px-4 py-3 text-left">열람</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allMailLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {log.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{log.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          log.status === "SUCCESS"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {log.status === "SUCCESS" ? "성공" : "실패"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {log.openedAt ? (
                          <span
                            title={log.openedAt.toISOString().slice(0, 16).replace("T", " ")}
                            className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                          >
                            열람{log.openCount > 1 ? ` (${log.openCount}회)` : ""}
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                            미열람
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
