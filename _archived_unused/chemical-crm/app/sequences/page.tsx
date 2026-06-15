"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Sequence = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count: { steps: number };
};

export default function SequencesPage() {
  const router = useRouter();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  useEffect(() => {
    fetch("/api/sequences")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSequences(data);
        } else {
          setDbError(true);
        }
      })
      .catch(() => setDbError(true))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const res = await fetch("/api/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined }),
    });
    const seq = await res.json();
    router.push(`/sequences/${seq.id}`);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 시퀀스를 삭제할까요?`)) return;
    await fetch(`/api/sequences/${id}`, { method: "DELETE" });
    setSequences((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link href="/leads" className="text-sm text-gray-900 hover:text-gray-900">
              ← 리드 목록
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">이메일 시퀀스</h1>
          </div>
          <button
            onClick={() => setCreating(!creating)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + 시퀀스 추가
          </button>
        </div>

        {creating && (
          <form
            onSubmit={handleCreate}
            className="mb-6 rounded-lg border border-blue-200 bg-white p-5 shadow-sm"
          >
            <h2 className="mb-4 text-base font-semibold text-gray-900">새 시퀀스</h2>
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-gray-900">이름 *</label>
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="예: 전시회 후속 시퀀스"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-900">설명 (선택)</label>
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="시퀀스에 대한 간략한 설명"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                생성
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </form>
        )}

        {dbError && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            DB 연결 오류: Supabase 프로젝트가 일시 정지되었을 수 있습니다. 대시보드에서 프로젝트를 재개해 주세요.
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-900">불러오는 중...</p>
        ) : sequences.length === 0 && !dbError ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="text-sm text-gray-900">등록된 시퀀스가 없습니다.</p>
            <p className="mt-1 text-xs text-gray-900">위 버튼을 눌러 첫 시퀀스를 만드세요.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {sequences.map((seq) => (
              <li
                key={seq.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm"
              >
                <Link href={`/sequences/${seq.id}`} className="flex-1">
                  <p className="font-medium text-gray-900 hover:text-blue-600">{seq.name}</p>
                  {seq.description && (
                    <p className="mt-0.5 text-sm text-gray-900">{seq.description}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-900">
                    {seq._count.steps}단계 · {seq.createdAt.slice(0, 10)}
                  </p>
                </Link>
                <div className="ml-4 flex gap-2">
                  <Link
                    href={`/sequences/${seq.id}`}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
                  >
                    편집
                  </Link>
                  <button
                    onClick={() => handleDelete(seq.id, seq.name)}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
