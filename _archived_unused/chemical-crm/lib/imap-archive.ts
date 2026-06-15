/**
 * NAVER WORKS IMAP 기반 발송 메일 아카이브 유틸리티
 *
 * 사용 패턴 (배치당 한 번 연결 재활용):
 *   const archiver = new ImapArchiver(now);
 *   await archiver.init();          // IMAP 연결 + 폴더 보장
 *   await archiver.save({ ... });   // 메일 한 건 APPEND
 *   await archiver.close();         // 연결 종료
 *
 * 환경변수:
 *   NAVER_WORKS_IMAP_HOST
 *   NAVER_WORKS_IMAP_PORT           (기본 993)
 *   NAVER_WORKS_IMAP_USER
 *   NAVER_WORKS_IMAP_PASSWORD
 *   NAVER_WORKS_SENT_ARCHIVE_ROOT   (기본 "ABM콜드메일")
 *
 * 폴더 구조: ABM콜드메일/YYYY-MM-DD
 */

import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";

// ── 폴더 경로 계산 ────────────────────────────────────────────────────────────

function archiveRoot(): string {
  return process.env.NAVER_WORKS_SENT_ARCHIVE_ROOT ?? "ABM콜드메일";
}

function dayFolder(sentAt: Date): string {
  const y = sentAt.getFullYear();
  const m = String(sentAt.getMonth() + 1).padStart(2, "0");
  const d = String(sentAt.getDate()).padStart(2, "0");
  return `${archiveRoot()}/${y}-${m}-${d}`;
}

function campaignTag(sentAt: Date): string {
  const y = sentAt.getFullYear();
  const m = String(sentAt.getMonth() + 1).padStart(2, "0");
  const d = String(sentAt.getDate()).padStart(2, "0");
  return `[ABM][${y}-${m}-${d}]`;
}

// ── 원시 RFC 2822 메시지 생성 (nodemailer streamTransport 활용) ───────────────

async function buildRaw(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  date: Date;
  xCampaign: string;
}): Promise<Buffer> {
  const t = nodemailer.createTransport({ streamTransport: true, newline: "crlf" });
  // nodemailer v8 returns a promise; streamTransport puts the raw message in info.message
  const info = await (t.sendMail as Function)({
    from: `"SILVERSTARCHEMICAL" <${process.env.NAVER_WORKS_EMAIL}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    date: opts.date,
    textEncoding: "base64",
    headers: {
      "Content-Language": "ko",
      "X-Campaign": opts.xCampaign, // 캠페인 식별자 (내부 헤더)
    },
  });

  const chunks: Buffer[] = [];
  for await (const chunk of info.message as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ── ImapArchiver 클래스 ───────────────────────────────────────────────────────

export class ImapArchiver {
  private client: ImapFlow | null = null;
  private ready = false;
  private folder: string;
  private root: string;
  private tag: string;

  constructor(private sentAt: Date) {
    this.root = archiveRoot();
    this.folder = dayFolder(sentAt);
    this.tag = campaignTag(sentAt);
  }

  /**
   * IMAP 연결 후 필요한 폴더를 생성(이미 있으면 무시).
   * 설정 누락 또는 연결 실패 시 false 반환 — 이후 save() 호출은 no-op.
   */
  async init(): Promise<boolean> {
    const host = process.env.NAVER_WORKS_IMAP_HOST;
    const port = Number(process.env.NAVER_WORKS_IMAP_PORT ?? "993");
    const user = process.env.NAVER_WORKS_IMAP_USER ?? process.env.NAVER_WORKS_EMAIL ?? "";
    const pass = process.env.NAVER_WORKS_IMAP_PASSWORD ?? process.env.NAVER_WORKS_APP_PASSWORD ?? "";

    if (!host) {
      console.warn(
        "[imap-archive] IMAP 설정 미완료 — .env 에 NAVER_WORKS_IMAP_HOST / NAVER_WORKS_IMAP_USER / NAVER_WORKS_IMAP_PASSWORD 를 추가하세요.",
      );
      return false;
    }

    this.client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user, pass },
      logger: false,
      connectionTimeout: 10_000, // 10초 타임아웃
    });

    try {
      await this.client.connect();
      console.log(`[imap-archive] IMAP 연결 성공 (user=${user})`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[imap-archive] IMAP 연결 실패 (host=${host}, user=${user}): ${reason}`);
      return false;
    }

    try {
      // 루트 폴더 생성 (없으면)
      const rootRes = await this.client.mailboxCreate(this.root);
      if (rootRes.created) {
        console.log(`[imap-archive] 루트 폴더 생성: ${this.root}`);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[imap-archive] 루트 폴더 생성 실패 (${this.root}): ${reason}`);
      return false;
    }

    try {
      // 날짜별 폴더 생성 (없으면)
      const dayRes = await this.client.mailboxCreate(this.folder);
      if (dayRes.created) {
        console.log(`[imap-archive] 날짜 폴더 생성: ${this.folder}`);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[imap-archive] 날짜 폴더 생성 실패 (${this.folder}): ${reason}`);
      return false;
    }

    this.ready = true;
    return true;
  }

  /**
   * 메일 한 건을 아카이브 폴더에 APPEND.
   * init() 실패 시 false 반환. 저장 성공 시 true, 실패 시 false.
   * 실패해도 예외 대신 로그만 남김.
   * opts.sentAt 을 전달하면 메일 Date 헤더에 실제 발송 시각을 사용 (backfill용).
   */
  async save(opts: {
    to: string;
    subject: string;
    text: string;
    html: string;
    sentAt?: Date;
  }): Promise<boolean> {
    if (!this.ready || !this.client) return false;

    try {
      const raw = await buildRaw({
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        date: opts.sentAt ?? this.sentAt,
        xCampaign: this.tag,
      });

      await this.client.append(this.folder, raw, ["\\Seen"], this.sentAt);

      console.log(
        `[imap-archive] archive folder: ${this.folder} | to: ${opts.to} | save: success`,
      );
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `[imap-archive] archive folder: ${this.folder} | to: ${opts.to} | save: fail | reason: ${reason}`,
      );
      return false;
    }
  }

  /** IMAP 연결 종료 */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // 종료 실패는 무시
      }
      this.client = null;
    }
  }

  /**
   * IMAP 연결 가능 여부만 확인하고 즉시 종료.
   * 관리자 페이지 상태 표시용.
   */
  static async checkConnection(): Promise<{ ok: boolean; reason?: string }> {
    const host = process.env.NAVER_WORKS_IMAP_HOST;
    const port = Number(process.env.NAVER_WORKS_IMAP_PORT ?? "993");
    const user = process.env.NAVER_WORKS_IMAP_USER ?? process.env.NAVER_WORKS_EMAIL ?? "";
    const pass = process.env.NAVER_WORKS_IMAP_PASSWORD ?? process.env.NAVER_WORKS_APP_PASSWORD ?? "";

    if (!host) {
      return { ok: false, reason: "NAVER_WORKS_IMAP_HOST 환경변수 누락" };
    }

    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user, pass },
      logger: false,
      connectionTimeout: 8_000,
    });

    try {
      await client.connect();
      await client.logout();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
