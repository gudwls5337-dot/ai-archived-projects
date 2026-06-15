import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

// =============================================
// 아카이브 타임스탬프 구조
// 파이프라인 시작 시 한 번만 생성해서 모든 단계에 전달
// =============================================
export interface ArchiveTs {
  date: string;  // YYYY-MM-DD
  hour: string;  // HH (24시간제)
  ts:   string;  // YYYY-MM-DD-HH-mm-ss
}

export function getArchiveTs(): ArchiveTs {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10);
  const hour = String(now.getHours()).padStart(2, "0");
  const min  = String(now.getMinutes()).padStart(2, "0");
  const sec  = String(now.getSeconds()).padStart(2, "0");
  return { date, hour, ts: `${date}-${hour}-${min}-${sec}` };
}

// =============================================
// 아카이브 디렉토리 생성 + 경로 반환
// outputs/archive/{category}/YYYY-MM-DD/HH/
// =============================================
function makeArchiveDir(category: string, ats: ArchiveTs): string {
  const dir = path.join("outputs/archive", category, ats.date, ats.hour);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// =============================================
// JSON 아카이브 저장
// =============================================
export function archiveJson(
  category: string,
  prefix: string,
  data: unknown,
  ats?: ArchiveTs
): string {
  const a = ats ?? getArchiveTs();
  const dir = makeArchiveDir(category, a);
  const filePath = path.join(dir, `${prefix}-${a.ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  return filePath;
}

// =============================================
// 텍스트 파일 아카이브 저장 (csv, md 등)
// =============================================
export function archiveText(
  category: string,
  prefix: string,
  ext: string,
  content: string,
  ats?: ArchiveTs
): string {
  const a = ats ?? getArchiveTs();
  const dir = makeArchiveDir(category, a);
  const filePath = path.join(dir, `${prefix}-${a.ts}.${ext}`);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// =============================================
// xlsx 아카이브 저장 (ExcelJS Workbook 직접 전달)
// =============================================
export async function archiveXlsx(
  category: string,
  prefix: string,
  workbook: ExcelJS.Workbook,
  ats?: ArchiveTs
): Promise<string> {
  const a = ats ?? getArchiveTs();
  const dir = makeArchiveDir(category, a);
  const filePath = path.join(dir, `${prefix}-${a.ts}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}
