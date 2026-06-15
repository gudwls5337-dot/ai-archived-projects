import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, dedupeContactsByEmail, isValidEmail, filterInvalidMxEmails } from "@/lib/email-utils";
import { Segment, PipelineStage } from "@prisma/client";
import { Prisma } from "@prisma/client";

// ── GET: 필터 기반 발송 대상 미리보기 ───────────────────────────────────────────
// 메일 반응 기준 where 조건 생성
type MailEngagement = "열람" | "미열람" | "2회이상열람" | "답장옴" | "미응답" | "";
function mailEngagementWhere(eng: MailEngagement) {
  switch (eng) {
    case "열람":
      return { mailLogs: { some: { openCount: { gt: 0 } } } };
    case "미열람":
      return {
        AND: [
          { mailLogs: { some: { status: "SUCCESS" as const } } },
          { NOT: { mailLogs: { some: { openCount: { gt: 0 } } } } },
        ],
      };
    case "2회이상열람":
      return { mailLogs: { some: { openCount: { gte: 2 } } } };
    case "답장옴":
      return { hasReplied: true };
    case "미응답":
      return {
        AND: [
          { mailLogs: { some: { status: "SUCCESS" as const } } },
          { hasReplied: false },
        ],
      };
    default:
      return {};
  }
}

function getDailyLimit() {
  return process.env.DAILY_SEND_LIMIT ? Math.max(1, parseInt(process.env.DAILY_SEND_LIMIT)) : 100;
}

async function getTodaySentCount() {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return prisma.mailLog.count({
    where: { sentAt: { gte: dayStart }, status: { in: ["SUCCESS", "FAILED"] } },
  });
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const segment        = p.get("segment")        as Segment | null;
  const pipelineStage  = p.get("pipelineStage")  as PipelineStage | null;
  const country        = (p.get("country")       ?? "").trim();
  const sequenceId     = (p.get("sequenceId")    ?? "").trim();
  const salesStatus    = (p.get("salesStatus")   ?? "").trim();
  const mailEngagement = (p.get("mailEngagement") ?? "").trim() as MailEngagement;
  const mailSentMin    = p.get("mailSentMin") !== null ? parseInt(p.get("mailSentMin")!) : null;
  const mailSentMax    = p.get("mailSentMax") !== null ? parseInt(p.get("mailSentMax")!) : null;

  console.log("[bulk-send/GET] 필터:", { segment, pipelineStage, country, sequenceId, salesStatus, mailEngagement, mailSentMin, mailSentMax });

  // 수신 거부 이메일 목록
  const unsubscribed = await prisma.unsubscribe.findMany({ select: { email: true } });
  const unsubscribedNorms = new Set(unsubscribed.map(u => normalizeEmail(u.email)));

  const engWhere = mailEngagementWhere(mailEngagement);

  const raw = await prisma.contact.findMany({
    where: {
      // 발송 제외 표시된 contact 제외
      excludedFromSending: false,
      // 수신 거부 제외
      NOT: unsubscribedNorms.size > 0
        ? { email: { in: [...unsubscribedNorms], mode: "insensitive" } }
        : undefined,
      // 회사 조건
      company: {
        ...(segment        ? { segment }        : {}),
        ...(pipelineStage  ? { pipelineStage }  : {}),
        ...(country        ? { country: { contains: country, mode: "insensitive" } } : {}),
        ...(salesStatus    ? { salesStatus }    : {}),
      },
      // 시퀀스 진행중 대상 (선택 시에만 적용)
      ...(sequenceId
        ? { enrollments: { some: { sequenceId, status: "ACTIVE" } } }
        : {}),
      // 메일 반응 기준 필터
      ...engWhere,
    },
    include: {
      company: {
        select: { id: true, name: true, country: true, segment: true, pipelineStage: true },
      },
      mailLogs: { select: { openCount: true, status: true } },
    },
    orderBy: [{ company: { name: "asc" } }, { createdAt: "asc" }],
  });

  const rawContactCount = raw.length;

  // normalized email 기준 중복 제거
  const { kept, duplicateGroups } = dedupeContactsByEmail(raw);

  const duplicateExcludedCount = rawContactCount - kept.length;

  // ── 누적 발송수 필터 (contact 기준 SUCCESS mailLog 수) ────────────────────────
  const filtered = (mailSentMin !== null || mailSentMax !== null)
    ? kept.filter(c => {
        const cnt = (c.mailLogs as { status: string }[]).filter(m => m.status === "SUCCESS").length;
        if (mailSentMin !== null && cnt < mailSentMin) return false;
        if (mailSentMax !== null && cnt > mailSentMax) return false;
        return true;
      })
    : kept;

  // 고유 회사 수
  const companyIds = new Set(filtered.map(c => c.companyId));

  console.log(
    `[bulk-send/GET] raw=${rawContactCount}, deduped=${kept.length}, mailSentFiltered=${filtered.length}, duplicates=${duplicateExcludedCount}`,
  );

  // 오늘 남은 발송 가능 수
  const DAILY_LIMIT = getDailyLimit();
  const todaySent = await getTodaySentCount();
  const remainingToday = Math.max(0, DAILY_LIMIT - todaySent);

  return NextResponse.json({
    contacts: filtered,
    summary: {
      rawContactCount,
      dedupedContactCount: kept.length,
      mailSentFilteredCount: filtered.length,
      duplicateExcludedCount,
      unsubscribedCount: unsubscribedNorms.size,
      totalCompanies: companyIds.size,
      dailyLimit: DAILY_LIMIT,
      todaySent,
      remainingToday,
    },
    duplicateGroups,
  });
}

// ── POST: 발송 큐 등록 (즉시 발송 → 큐 기반으로 전환) ──────────────────────────
export async function POST(req: NextRequest) {
  try {
    return await _postHandler(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack   = err instanceof Error ? err.stack   : undefined;
    console.error("[bulk-send/POST] 처리 중 예외 발생:");
    console.error("  message:", message);
    console.error("  stack:",   stack);

    // ── 커넥션 풀 타임아웃 ──────────────────────────────────────────────────────
    if (message.includes("Timed out fetching a new connection from the connection pool")) {
      console.error("[bulk-send/POST] DB 커넥션 풀 타임아웃 — pool_timeout/connection_limit 설정 필요");
      return NextResponse.json(
        {
          error: "DB 커넥션 풀 타임아웃",
          details:
            "DATABASE_URL에 ?connection_limit=3&pool_timeout=30 파라미터가 없거나 " +
            "다른 요청이 커넥션을 점유 중입니다. 서버를 재시작한 뒤 다시 시도해주세요.\n\n" +
            message,
        },
        { status: 503 },
      );
    }

    // ── Prisma P2021: 테이블이 DB에 없음 (prisma db push 미실행) ──────────────
    if (
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") ||
      (message.includes("MailQueue") && message.includes("does not exist"))
    ) {
      return NextResponse.json(
        { error: "MailQueue 테이블이 DB에 없습니다. 터미널에서 `npx prisma db push` 실행 후 서버를 재시작하세요." },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: message, details: stack }, { status: 500 });
  }
}

async function _postHandler(req: NextRequest) {
  const { contactIds, subject, body, label } = await req.json();

  if (!contactIds?.length || !subject || !body) {
    return NextResponse.json(
      { error: "contactIds, subject, body 는 필수입니다." },
      { status: 400 },
    );
  }

  // ── 진행 중인 큐 가드 (pending/processing/deferred 모두 포함) ──────────────────
  const activeQueue = await prisma.mailQueue.findFirst({
    where: { status: { in: ["pending", "processing", "deferred_to_next_day"] } },
  });
  if (activeQueue) {
    return NextResponse.json(
      {
        error: `이미 진행 중인 발송 큐가 있습니다 (queueId: ${activeQueue.id}). 완료 또는 취소 후 다시 시도하세요.`,
        activeQueueId: activeQueue.id,
      },
      { status: 409 },
    );
  }

  // ── 오늘 남은 발송 가능 수 (표시용 — 초과분은 큐에서 자동 이월) ─────────────────
  const DAILY_LIMIT = getDailyLimit();
  const todaySent = await getTodaySentCount();
  const remainingToday = Math.max(0, DAILY_LIMIT - todaySent);

  console.log(`[bulk-send/POST] SKIP_MX_CHECK=${process.env.SKIP_MX_CHECK}, contactIds 수신=${contactIds.length}`);

  // ── STEP 1: contactIds 기반 DB 조회 ───────────────────────────────────────────
  const rawContacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, excludedFromSending: false },
    include: {
      company: { select: { id: true, name: true } },
      mailLogs: { select: { openCount: true } },
    },
  });
  console.log(`[bulk-send/POST] STEP1 DB조회: contactIds=${contactIds.length} → rawContacts=${rawContacts.length} (excludedFromSending=false 필터 후)`);

  // ── STEP 2: 수신 거부 목록 필터 ───────────────────────────────────────────────
  const unsubscribeSet = new Set(
    (await prisma.unsubscribe.findMany({ select: { email: true } }))
      .map(u => normalizeEmail(u.email)),
  );
  const afterUnsub = rawContacts.filter(
    c => !unsubscribeSet.has(normalizeEmail(c.email))
  );
  console.log(`[bulk-send/POST] STEP2 수신거부 필터: ${rawContacts.length} → ${afterUnsub.length} (제외=${rawContacts.length - afterUnsub.length}건, unsubscribeSet.size=${unsubscribeSet.size})`);

  // ── STEP 3: 이메일 기준 중복 제거 ─────────────────────────────────────────────
  const { kept: deduped } = dedupeContactsByEmail(afterUnsub);
  console.log(`[bulk-send/POST] STEP3 중복제거: ${afterUnsub.length} → ${deduped.length} (제외=${afterUnsub.length - deduped.length}건)`);

  // ── STEP 4: 이메일 형식 검증 ──────────────────────────────────────────────────
  const invalidEmails: string[] = [];
  let contacts = deduped.filter(c => {
    if (!isValidEmail(c.email)) { invalidEmails.push(c.email); return false; }
    return true;
  });
  console.log(`[bulk-send/POST] STEP4 이메일형식 검증: ${deduped.length} → ${contacts.length} (제외=${invalidEmails.length}건: ${invalidEmails.slice(0, 5).join(", ")}${invalidEmails.length > 5 ? " ..." : ""})`);

  const now = new Date();

  // ── STEP 5: MX 레코드 사전 검증 ───────────────────────────────────────────────
  let invalidDomainCount = 0;
  if (contacts.length > 0) {
    const beforeMx = contacts.length;
    const invalidMxEmails = await filterInvalidMxEmails(contacts.map(c => c.email));
    console.log(`[bulk-send/POST] STEP5 MX검증: ${beforeMx}건 중 invalidMxEmails.size=${invalidMxEmails.size} (SKIP_MX_CHECK=${process.env.SKIP_MX_CHECK ?? "unset"})`);
    if (invalidMxEmails.size > 0) {
      console.log(`[bulk-send/POST] STEP5 invalid 도메인 샘플:`, [...invalidMxEmails].slice(0, 10).join(", "));
      const invalidContacts = contacts.filter(c => invalidMxEmails.has(normalizeEmail(c.email)));

      // createMany로 한 번에 insert (커넥션 1개 사용)
      const dbWriteStart = Date.now();
      console.log(`[BULK_SEND_DB_WRITE_START] invalid_mx mailLog createMany count=${invalidContacts.length}`);
      await prisma.mailLog.createMany({
        data: invalidContacts.map(c => ({
          to: c.email, subject, text: body,
          status: "FAILED" as const, failReason: "invalid_domain_or_mx",
          sentAt: now, contactId: c.id, companyId: c.company?.id ?? null,
        })),
        skipDuplicates: true,
      });
      console.log(`[BULK_SEND_DB_WRITE_DONE] invalid_mx mailLog createMany count=${invalidContacts.length} elapsed=${Date.now() - dbWriteStart}ms`);

      invalidDomainCount = invalidMxEmails.size;
      contacts = contacts.filter(c => !invalidMxEmails.has(normalizeEmail(c.email)));
      console.warn(`[bulk-send/POST] STEP5 MX 검증 후: ${beforeMx} → ${contacts.length} (제외=${invalidDomainCount}건)`);
    }
  }

  console.log(`[bulk-send/POST] 최종 발송 대상: ${contacts.length}건 (수신=${contactIds.length} → DB조회=${rawContacts.length} → 수신거부제외=${afterUnsub.length} → 중복제거=${deduped.length} → 이메일오류제외=${deduped.length - invalidEmails.length} → MX제외=${deduped.length - invalidEmails.length - invalidDomainCount} = ${contacts.length})`);

  if (contacts.length === 0) {
    const reason = [
      rawContacts.length < contactIds.length      && `DB조회 후 ${rawContacts.length}건`,
      afterUnsub.length < rawContacts.length       && `수신거부 제외 ${rawContacts.length - afterUnsub.length}건`,
      deduped.length < afterUnsub.length           && `중복제거 제외 ${afterUnsub.length - deduped.length}건`,
      invalidEmails.length > 0                     && `이메일형식 오류 제외 ${invalidEmails.length}건`,
      invalidDomainCount > 0                       && `MX검증 제외 ${invalidDomainCount}건`,
    ].filter(Boolean).join(", ");
    return NextResponse.json({
      queued: false,
      invalidEmailCount: invalidEmails.length,
      invalidDomainCount,
      message: `발송 가능한 대상이 없습니다. (수신 ${contactIds.length}건${reason ? " → " + reason : ""} → 최종 0건)`,
    });
  }

  // ── 오늘/내일 이월 예정 수 계산 (큐 등록 후 processor가 한도에 맞게 이월) ─────────
  const todayCount    = Math.min(contacts.length, remainingToday);
  const deferredCount = Math.max(0, contacts.length - remainingToday);
  if (deferredCount > 0) {
    console.warn(`[bulk-send/POST] 오늘 ${todayCount}건 발송 예정, ${deferredCount}건 내일 이월 예정`);
  }

  // ── 큐 정책: 1건씩, SEND_INTERVAL_MIN 간격 ────────────────────────────────────
  const SEND_INTERVAL_MIN = process.env.SEND_INTERVAL_MIN ? Math.max(1, parseInt(process.env.SEND_INTERVAL_MIN)) : 1;

  // 오늘 발송 가능한 건: min(contacts.length, remainingToday)
  // 이월 건: 나머지 → 다음날 cron이 재개
  const estMinutesToday = Math.min(contacts.length, remainingToday) * SEND_INTERVAL_MIN;
  const estimatedDays   = Math.ceil(contacts.length / DAILY_LIMIT);

  // ── 발송 큐 등록 ─────────────────────────────────────────────────────────────
  const queueWriteStart = Date.now();
  console.log(`[BULK_SEND_DB_WRITE_START] mailQueue create count=${contacts.length}`);
  const queue = await prisma.mailQueue.create({
    data: {
      status:        "pending",
      label:         label ?? null,
      subject,
      body,
      contactIds:    JSON.stringify(contacts.map(c => c.id)),
      totalCount:    contacts.length,
      batchSize:     1,                  // 1건씩
      batchDelayMin: SEND_INTERVAL_MIN,  // 1분 간격
      nextBatchAt:   now,
    },
  });
  console.log(`[BULK_SEND_DB_WRITE_DONE] mailQueue create queueId=${queue.id} elapsed=${Date.now() - queueWriteStart}ms`);

  console.log(`[bulk-send/POST] 큐 등록 완료 — queueId=${queue.id}, total=${contacts.length}, today=${todayCount}, deferred=${deferredCount}, interval=${SEND_INTERVAL_MIN}min`);

  return NextResponse.json({
    queued:             true,
    queueId:            queue.id,
    totalCount:         contacts.length,
    todayCount,
    deferredCount,
    estimatedDays,
    estMinutesToday,
    sendIntervalMin:    SEND_INTERVAL_MIN,
    invalidEmailCount:  invalidEmails.length,
    invalidDomainCount,
    dailyLimit:         DAILY_LIMIT,
  });
}
