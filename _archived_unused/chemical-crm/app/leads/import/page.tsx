"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  pickSheet,
  detectHeaderRow,
  buildColumnMap,
  parseGrid,
} from "@/lib/excelParser";

// ── Types ──────────────────────────────────────────────────────────────────────

type PreviewRow = {
  rowIndex: number;
  status: "normal" | "excluded";
  issues: string[];
  companyName: string;
  email: string;
  country: string;
  website: string;
  emailSubject: string;
  emailBody: string;
};

type AbmSaveResult = {
  createdCompanies:  number;
  createdContacts:   number;
  skippedDuplicates: number;
  invalidRows:       number;
};

// ── Validation ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPreviewRow(parsed: ReturnType<typeof parseGrid>[number]): PreviewRow {
  const issues: string[] = [];
  let status: PreviewRow["status"] = "normal";

  if (!parsed.companyName) issues.push("회사명 없음");
  if (!parsed.email) {
    issues.push("이메일 없음");
  } else if (!EMAIL_RE.test(parsed.email)) {
    issues.push("이메일 형식 오류");
  }
  if (issues.length > 0) status = "excluded";

  return { ...parsed, status, issues };
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter();

  const [fileName, setFileName]             = useState("");
  const [fullGrid, setFullGrid]             = useState<unknown[][]>([]);
  const [detectedSheetName, setDetectedSheetName] = useState("");
  const [sheetFound, setSheetFound]         = useState(false);
  const [abmSaving, setAbmSaving]           = useState(false);
  const [abmSaveResult, setAbmSaveResult]   = useState<AbmSaveResult | null>(null);
  const [saveError, setSaveError]           = useState<string | null>(null);
  const [showDebug, setShowDebug]           = useState(false);
  const [expandedRows, setExpandedRows]     = useState<Set<number>>(new Set());

  // ── Derived values ───────────────────────────────────────────────────────────

  const headerRowIdx = useMemo(() => detectHeaderRow(fullGrid), [fullGrid]);
  const columnMap    = useMemo(
    () => buildColumnMap((fullGrid[headerRowIdx] ?? []) as unknown[]),
    [fullGrid, headerRowIdx],
  );

  const rows: PreviewRow[] = useMemo(() => {
    if (!fullGrid.length) return [];
    return parseGrid(fullGrid, headerRowIdx, columnMap)
      .slice(0, 200)
      .map(toPreviewRow);
  }, [fullGrid, headerRowIdx, columnMap]);

  const total    = rows.length;
  const normal   = rows.filter(r => r.status === "normal").length;
  const excluded = rows.filter(r => r.status === "excluded").length;

  const mappingOk =
    (columnMap["companyName"] !== undefined ||
     columnMap["companyNameEn"] !== undefined ||
     columnMap["companyNameLat"] !== undefined) &&
    columnMap["email"] !== undefined;

  const showActionBar = total > 0 && !abmSaveResult;

  // Debug: detected header row cells
  const headerCells = useMemo(
    () => (fullGrid[headerRowIdx] ?? []) as unknown[],
    [fullGrid, headerRowIdx],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFullGrid([]);
    setAbmSaveResult(null);
    setSaveError(null);
    setExpandedRows(new Set());

    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target?.result, { type: "binary" });
      const { name: sheetName, matchedPreferred } = pickSheet(workbook.SheetNames);
      const sheet = workbook.Sheets[sheetName];
      setDetectedSheetName(sheetName);
      setSheetFound(matchedPreferred);
      setFullGrid(
        XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }),
      );
    };
    reader.readAsBinaryString(file);
  }

  function toggleRow(idx: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  async function handleSave() {
    const normalRows = rows.filter(r => r.status === "normal");
    if (normalRows.length === 0) {
      alert("저장 가능한 정상 행이 없습니다.");
      return;
    }
    if (!confirm(`정상 ${normalRows.length}건을 CRM에 저장하시겠습니까?`)) return;

    setAbmSaving(true);
    setSaveError(null);

    const payload = {
      rows: normalRows.map(r => ({
        companyName:  r.companyName,
        email:        r.email,
        country:      r.country,
        emailSubject: r.emailSubject,
        emailBody:    r.emailBody,
      })),
    };

    try {
      const res = await fetch("/api/leads/import/abm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`서버 오류 ${res.status}: ${await res.text()}`);
      setAbmSaveResult(await res.json() as AbmSaveResult);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setAbmSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ① 고정 액션 바 */}
      {showActionBar && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999 }}
          className="border-b-2 border-gray-300 bg-white shadow-lg"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-gray-900">
                {detectedSheetName}
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-xs text-gray-500">헤더 {headerRowIdx + 1}행</span>
              <span className="text-gray-300">|</span>
              <span className="text-base font-bold text-gray-900">총 {total}건</span>
              <span
                style={{ backgroundColor: "#16a34a", color: "#fff" }}
                className="rounded-full px-3 py-1 text-sm font-bold"
              >
                정상 {normal}건
              </span>
              {excluded > 0 && (
                <span
                  style={{ backgroundColor: "#dc2626", color: "#fff" }}
                  className="rounded-full px-3 py-1 text-sm font-bold"
                >
                  제외 {excluded}건
                </span>
              )}
              {!mappingOk && (
                <span
                  style={{ backgroundColor: "#d97706", color: "#fff" }}
                  className="rounded-full px-3 py-1 text-sm font-bold"
                >
                  ⚠ 컬럼 매핑 오류
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/leads"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                ← 리드 목록
              </Link>
              <button
                onClick={handleSave}
                disabled={abmSaving || normal === 0}
                style={{
                  backgroundColor: normal > 0 ? "#16a34a" : "#9ca3af",
                  color: "#fff",
                  fontSize: "15px",
                  fontWeight: 700,
                  padding: "10px 28px",
                  borderRadius: "8px",
                  cursor: normal > 0 && !abmSaving ? "pointer" : "not-allowed",
                  border: "none",
                  boxShadow: normal > 0 ? "0 2px 8px rgba(22,163,74,0.4)" : "none",
                }}
              >
                {abmSaving ? "저장 중..." : `저장하기 (${normal}건)`}
              </button>
            </div>
          </div>
          {saveError && (
            <div className="border-t border-red-200 bg-red-50 px-6 py-2 text-sm font-semibold text-red-700">
              저장 실패: {saveError}
              <span className="ml-2 text-xs font-normal text-red-500">(F12 콘솔 확인)</span>
            </div>
          )}
        </div>
      )}

      {showActionBar && <div style={{ height: 64 }} />}

      <div className="mx-auto max-w-7xl px-6 py-6">

        {/* 페이지 제목 */}
        {!showActionBar && !abmSaveResult && (
          <div className="mb-6">
            <Link
              href="/leads"
              className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-gray-900 hover:text-gray-900"
            >
              ← 리드 목록
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">ABM 가져오기</h1>
            <p className="mt-1 text-sm text-gray-900">
              시트·헤더 행·컬럼명을 자동으로 감지합니다.
            </p>
          </div>
        )}

        {/* ② 파일 업로드 */}
        {!abmSaveResult && (
          <div className="mb-6 rounded-xl border-2 border-dashed border-gray-300 bg-white px-8 py-8 text-center shadow-sm">
            <p className="mb-2 text-base font-bold text-gray-900">
              ABM 엑셀 파일(.xlsx)을 선택하세요
            </p>
            <p className="mb-4 text-sm text-gray-500">
              시트명·헤더 위치·컬럼명을 자동으로 감지합니다
            </p>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFile}
              className="mx-auto block text-sm text-gray-900
                file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-gray-300
                file:bg-gray-50 file:px-5 file:py-2 file:text-sm file:font-semibold file:text-gray-900
                hover:file:bg-gray-100"
            />
            {fileName && (
              <p className="mt-3 text-sm font-semibold text-gray-900">
                선택됨: <span className="text-blue-600">{fileName}</span>
              </p>
            )}
          </div>
        )}

        {/* ③ 상태 카드 */}
        {fullGrid.length > 0 && !abmSaveResult && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className={`rounded-xl border-2 px-4 py-3 ${sheetFound ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">시트</p>
              <p className={`mt-1 text-sm font-bold truncate ${sheetFound ? "text-green-700" : "text-amber-700"}`}>
                {sheetFound ? "✓ 우선 시트" : "⚠ 첫 번째 시트"}
              </p>
              <p className="truncate text-xs text-gray-500" title={detectedSheetName}>{detectedSheetName}</p>
            </div>
            <div className={`rounded-xl border-2 px-4 py-3 ${mappingOk ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">컬럼 매핑</p>
              <p className={`mt-1 text-sm font-bold ${mappingOk ? "text-green-700" : "text-amber-700"}`}>
                {mappingOk ? "✓ 완료" : "⚠ 일부 실패"}
              </p>
              <button
                onClick={() => setShowDebug(v => !v)}
                className="text-xs text-blue-600 underline hover:text-blue-800"
              >
                {showDebug ? "숨기기" : "상세 보기"}
              </button>
            </div>
            <div className="rounded-xl border-2 border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">전체 행</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{total}</p>
              <p className="text-xs text-gray-400">헤더: {headerRowIdx + 1}행</p>
            </div>
            <div className="rounded-xl border-2 border-green-300 bg-green-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">저장 가능</p>
              <p className="mt-1 text-2xl font-bold text-green-700">{normal}</p>
              {excluded > 0 && <p className="text-xs font-bold text-red-500">제외 {excluded}건</p>}
            </div>
          </div>
        )}

        {/* 디버그 패널 */}
        {showDebug && fullGrid.length > 0 && (
          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-xs font-mono text-gray-900">
            <p className="mb-2 font-bold text-gray-900">컬럼 매핑 결과 (헤더 {headerRowIdx + 1}행):</p>
            {[
              ["companyName",    "회사명 (업체명)"],
              ["companyNameEn",  "회사명 (영문)"],
              ["companyNameLat", "회사명 (Company)"],
              ["email",          "이메일"],
              ["country",        "국가"],
              ["website",        "웹사이트"],
              ["emailSubject",   "이메일 제목"],
              ["emailBody",      "이메일 본문"],
            ].map(([field, label]) => {
              const idx = columnMap[field];
              const headerVal = idx !== undefined ? String(headerCells[idx] ?? "") : "";
              return (
                <div key={field} className={idx === undefined ? "font-bold text-red-600" : "text-gray-700"}>
                  {label} → {idx !== undefined ? `col ${idx}: "${headerVal}"` : "⚠ 없음"}
                </div>
              );
            })}
            <div className="mt-3 border-t border-gray-200 pt-2 text-gray-400">
              헤더 행 앞 8개: {(headerCells as unknown[]).slice(0, 8).map((h, i) => `[${i}]${String(h ?? "") || "—"}`).join("  ")}
            </div>
          </div>
        )}

        {/* ④ 미리보기 테이블 */}
        {showActionBar && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-xl font-bold text-gray-900">
                총 {total}건 미리보기
              </h2>
              <p className="text-sm font-medium text-gray-900">
                제목·본문 셀 클릭 → 전체 내용 보기
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="w-10 border-b border-gray-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-900">행</th>
                    <th className="w-16 border-b border-gray-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-900">상태</th>
                    <th className="w-44 border-b border-gray-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-900">회사명</th>
                    <th className="w-48 border-b border-gray-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-900">이메일</th>
                    <th className="w-20 border-b border-gray-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-900">국가</th>
                    <th className="w-52 border-b border-gray-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-900">이메일 제목</th>
                    <th className="w-80 border-b border-gray-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-900">이메일 본문</th>
                    <th className="border-b border-gray-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-900">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const isExcluded = row.status === "excluded";
                    const isExpanded = expandedRows.has(row.rowIndex);
                    return (
                      <tr
                        key={row.rowIndex}
                        className={`border-b border-gray-100 ${isExcluded ? "bg-red-50" : "hover:bg-gray-50"}`}
                        style={isExcluded ? { borderLeft: "4px solid #f87171" } : {}}
                      >
                        <td className="px-4 py-4 text-sm font-medium text-gray-900">{row.rowIndex}</td>
                        <td className="px-4 py-4">
                          <span
                            style={{
                              display: "inline-block",
                              borderRadius: "9999px",
                              padding: "2px 12px",
                              fontSize: "12px",
                              fontWeight: 700,
                              backgroundColor: isExcluded ? "#ef4444" : "#16a34a",
                              color: "#fff",
                            }}
                          >
                            {isExcluded ? "제외" : "정상"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {row.companyName
                            ? <span className="text-sm font-semibold text-gray-900">{row.companyName}</span>
                            : <span className="text-sm font-bold text-red-500">없음</span>}
                        </td>
                        <td className="px-4 py-4">
                          {row.email
                            ? <span className="text-sm text-gray-900">{row.email}</span>
                            : <span className="text-sm font-bold text-red-500">없음</span>}
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-gray-900">{row.country || <span className="text-gray-400">—</span>}</span>
                        </td>
                        <td className="cursor-pointer px-4 py-4" onClick={() => toggleRow(row.rowIndex)}>
                          {row.emailSubject ? (
                            <div>
                              <p
                                className="text-sm text-gray-900"
                                style={isExpanded
                                  ? { whiteSpace: "pre-wrap" }
                                  : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                              >
                                {row.emailSubject}
                              </p>
                              <span className="mt-1 block text-xs font-bold text-blue-600">
                                {isExpanded ? "▲ 접기" : "▼ 더보기"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                        <td className="cursor-pointer px-4 py-4" onClick={() => toggleRow(row.rowIndex)}>
                          {row.emailBody ? (
                            <div>
                              <p
                                className="text-sm text-gray-900"
                                style={isExpanded
                                  ? { whiteSpace: "pre-wrap" }
                                  : { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                              >
                                {row.emailBody}
                              </p>
                              <span className="mt-1 block text-xs font-bold text-blue-600">
                                {isExpanded ? "▲ 접기" : "▼ 더보기"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-bold text-red-600">{row.issues.join(" · ")}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-5">
              <p className="text-sm font-medium text-gray-900">
                정상 <strong className="text-gray-900">{normal}건</strong>이 저장됩니다.
                {excluded > 0 && (
                  <span className="ml-2 font-semibold text-red-500">제외 {excluded}건은 저장되지 않습니다.</span>
                )}
              </p>
              <button
                onClick={handleSave}
                disabled={abmSaving || normal === 0}
                style={{
                  backgroundColor: normal > 0 ? "#16a34a" : "#9ca3af",
                  color: "#fff",
                  fontSize: "16px",
                  fontWeight: 700,
                  padding: "12px 36px",
                  borderRadius: "10px",
                  cursor: normal > 0 && !abmSaving ? "pointer" : "not-allowed",
                  border: "none",
                  boxShadow: normal > 0 ? "0 2px 8px rgba(22,163,74,0.4)" : "none",
                }}
              >
                {abmSaving ? "저장 중..." : `저장하기 (${normal}건)`}
              </button>
            </div>
          </div>
        )}

        {/* ⑤ 저장 완료 */}
        {abmSaveResult && (
          <div className="rounded-xl border-2 border-green-300 bg-green-50 px-8 py-10 text-center shadow-sm">
            <h2 className="mb-2 text-2xl font-bold text-green-800">저장 완료</h2>
            <p className="mb-8 text-sm font-medium text-green-700">ABM 데이터가 CRM에 저장되었습니다.</p>
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl bg-white px-6 py-5 shadow">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">신규 회사</p>
                <p className="mt-2 text-4xl font-bold text-green-600">{abmSaveResult.createdCompanies}</p>
              </div>
              <div className="rounded-xl bg-white px-6 py-5 shadow">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">신규 컨택트</p>
                <p className="mt-2 text-4xl font-bold text-green-600">{abmSaveResult.createdContacts}</p>
              </div>
              <div className="rounded-xl bg-white px-6 py-5 shadow">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">중복 건너뜀</p>
                <p className="mt-2 text-4xl font-bold text-orange-500">{abmSaveResult.skippedDuplicates}</p>
              </div>
              <div className="rounded-xl bg-white px-6 py-5 shadow">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">오류</p>
                <p className={`mt-2 text-4xl font-bold ${abmSaveResult.invalidRows > 0 ? "text-red-600" : "text-gray-300"}`}>
                  {abmSaveResult.invalidRows}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push("/leads")}
              className="rounded-xl bg-green-700 px-10 py-3 text-base font-bold text-white shadow hover:bg-green-800"
            >
              리드 목록으로 이동 →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
