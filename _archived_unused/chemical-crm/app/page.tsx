import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">케미칼 CRM</h1>
        <p className="mt-2 text-gray-500">B2B 화학소재 영업 관리</p>
        <div className="mt-8">
          <Link
            href="/leads"
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            리드 목록 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
