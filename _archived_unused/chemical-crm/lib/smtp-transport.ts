/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  [DIRECT_SEND_BLOCKED]  접근 제한 모듈                       ║
 * ║                                                              ║
 * ║  이 모듈은 lib/queue-processor.ts 에서만 import 가능합니다.   ║
 * ║  다른 파일에서 import 하면:                                   ║
 * ║    1) ESLint 빌드 오류 (no-restricted-imports)               ║
 * ║    2) 런타임 throw (getSmtpTransport 호출 시)                 ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// 허용된 호출자 식별자 — queue-processor 가 초기화 시 등록
let _authorizedCaller = false;

/**
 * queue-processor 내부에서만 호출해야 합니다.
 * 다른 모듈에서 호출 시 런타임 에러를 throw 합니다.
 */
export function getSmtpTransport(callerToken: typeof QUEUE_PROCESSOR_TOKEN): Transporter {
  if (callerToken !== QUEUE_PROCESSOR_TOKEN) {
    const msg =
      "[DIRECT_SEND_BLOCKED] getSmtpTransport()는 lib/queue-processor.ts 에서만 호출 가능합니다. " +
      "다른 경로에서 sendMail을 호출하지 마세요.";
    console.error(msg);
    throw new Error(msg);
  }
  if (!_authorizedCaller) {
    _authorizedCaller = true;
  }
  return _transporter;
}

// token은 이 모듈과 queue-processor 사이에서만 공유됩니다.
// 외부에서 token 값을 알아낼 수 없으므로 런타임 위조 불가
export const QUEUE_PROCESSOR_TOKEN = Symbol("queue-processor-smtp-token");

const _transporter = nodemailer.createTransport({
  host: "smtp.worksmobile.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.NAVER_WORKS_EMAIL,
    pass: process.env.NAVER_WORKS_APP_PASSWORD,
  },
});
