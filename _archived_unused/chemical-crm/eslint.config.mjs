import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ── [DIRECT_SEND_BLOCKED] 전역 금지 규칙 ──────────────────────────────────────
  // nodemailer 직접 import 및 sendMail() 직접 호출은 프로젝트 전체에서 금지됩니다.
  // 모든 SMTP 발송은 lib/queue-processor.ts → processQueueBatch() 한 곳에서만 가능합니다.
  {
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "nodemailer",
            message:
              "[DIRECT_SEND_BLOCKED] nodemailer 직접 import 금지. " +
              "발송은 lib/queue-processor.ts 의 processQueueBatch() 만 사용하세요.",
          },
        ],
        patterns: [
          {
            group: ["**/smtp-transport*", "@/lib/smtp-transport*"],
            message:
              "[DIRECT_SEND_BLOCKED] smtp-transport 직접 import 금지. " +
              "이 모듈은 lib/queue-processor.ts 에서만 사용 가능합니다.",
          },
        ],
      }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='sendMail']",
          message:
            "[DIRECT_SEND_BLOCKED] sendMail() 직접 호출 금지. " +
            "모든 발송은 processQueueBatch() 를 통해야 합니다. " +
            "허용 파일: lib/queue-processor.ts, lib/imap-archive.ts",
        },
      ],
    },
  },

  // ── 허용 예외: smtp-transport (nodemailer 래퍼, 토큰 없이는 transporter 반환 안 함) ──
  {
    files: ["lib/smtp-transport.ts"],
    rules: {
      "no-restricted-imports": "off",   // nodemailer import 허용
      "no-restricted-syntax": "off",    // createTransport 허용
    },
  },

  // ── 허용 예외: queue-processor (실제 SMTP 발송 — smtp-transport 통해서만) ──────
  {
    files: ["lib/queue-processor.ts"],
    rules: {
      "no-restricted-imports": "off",   // smtp-transport import 허용
      "no-restricted-syntax": "off",    // sendMail 허용
    },
  },

  // ── 허용 예외: imap-archive (streamTransport로 RFC 2822 바이트 생성만, 실제 SMTP 아님) ──
  {
    files: ["lib/imap-archive.ts"],
    rules: {
      "no-restricted-imports": "off",   // nodemailer streamTransport 허용
      "no-restricted-syntax": "off",    // t.sendMail (streamTransport용) 허용
    },
  },
]);

export default eslintConfig;
