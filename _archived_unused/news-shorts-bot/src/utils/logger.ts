import fs from "fs";
import path from "path";

// =============================================
// 로그 레벨 정의
// =============================================
type LogLevel = "INFO" | "WARN" | "ERROR" | "SUCCESS";

// 콘솔 출력 색상 (터미널에서 구분하기 쉽게)
const COLORS: Record<LogLevel, string> = {
  INFO:    "\x1b[37m",   // 흰색
  WARN:    "\x1b[33m",   // 노란색
  ERROR:   "\x1b[31m",   // 빨간색
  SUCCESS: "\x1b[32m",   // 초록색
};
const RESET = "\x1b[0m";

// =============================================
// Logger 클래스
// - 콘솔에 컬러로 출력
// - outputs/logs/YYYY-MM-DD.log 파일에도 저장
// =============================================
class Logger {
  private logDir: string;
  private logFilePath: string;

  constructor() {
    this.logDir = "outputs/logs";
    this.logFilePath = path.join(this.logDir, this.getToday() + ".log");
    this.ensureDir();
  }

  private getToday(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // 로그 디렉토리가 없으면 자동 생성
  private ensureDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  // 타임스탬프 포함 로그 한 줄 생성
  private formatLine(level: LogLevel, message: string): string {
    const time = new Date().toISOString().replace("T", " ").slice(0, 19);
    return `[${time}] [${level.padEnd(7)}] ${message}`;
  }

  // 오늘 날짜 기준 로그 파일 경로 (자정 넘어도 갱신)
  private todayLogPath(): string {
    return path.join(this.logDir, this.getToday() + ".log");
  }

  // 실제 출력 (콘솔 + 파일)
  private write(level: LogLevel, message: string): void {
    const line = this.formatLine(level, message);
    const filePath = this.todayLogPath();

    // 콘솔: 컬러 출력
    console.log(`${COLORS[level]}${line}${RESET}`);

    // 파일: 색상 코드 없이 저장 (날짜별 자동 분리)
    this.ensureDir();
    fs.appendFileSync(filePath, line + "\n", "utf-8");
  }

  // ── 공개 메서드 ────────────────────────────
  info(message: string): void    { this.write("INFO", message); }
  warn(message: string): void    { this.write("WARN", message); }
  error(message: string): void   { this.write("ERROR", message); }
  success(message: string): void { this.write("SUCCESS", message); }

  // 구분선 (단계 시작/끝 표시용)
  divider(title?: string): void {
    const line = title
      ? `\n${"=".repeat(36)}\n  ${title}\n${"=".repeat(36)}`
      : "=".repeat(36);
    console.log(line);
    fs.appendFileSync(this.logFilePath, line + "\n", "utf-8");
  }

  // 현재 로그 파일 경로 반환 (오늘 날짜 기준)
  getLogFilePath(): string {
    return this.todayLogPath();
  }
}

// 싱글턴 인스턴스 — 앱 전체에서 하나만 사용
export const logger = new Logger();
