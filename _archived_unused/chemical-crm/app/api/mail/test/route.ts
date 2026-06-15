import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processQueueBatch } from "@/lib/queue-processor";

// [DIRECT_SEND_BLOCKED] nodemailer/sendMail 직접 호출 금지.
// 테스트 발송도 processQueueBatch() 를 통해 1건 처리합니다.

export async function POST(req: Request) {
  const body = await req.json();
  const subject: string   = body.subject;
  const text: string      = body.text;
  const contactId: string = body.contactId;

  if (!contactId || !subject || !text) {
    return NextResponse.json(
      {
        success: false,
        error: "contactId, subject, text 는 필수입니다. (테스트 발송은 실제 Contact 기준으로만 가능합니다.)",
      },
      { status: 400 },
    );
  }

  // contact 존재 여부 확인
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) {
    return NextResponse.json({ success: false, error: "Contact를 찾을 수 없습니다." }, { status: 404 });
  }

  // 진행 중인 큐 가드 — 테스트 큐는 다른 활성 큐와 충돌하지 않도록 별도 레이블 사용
  // (테스트용이므로 기존 활성 큐와 무관하게 즉시 실행)
  const now = new Date();

  const queue = await prisma.mailQueue.create({
    data: {
      status:        "pending",
      label:         "_test:single",
      subject,
      body:          text,
      contactIds:    JSON.stringify([contactId]),
      totalCount:    1,
      batchSize:     1,
      batchDelayMin: 1,
      nextBatchAt:   now,
    },
  });

  console.log(`[QUEUE_ENQUEUED] mail/test → queueId=${queue.id}, contactId=${contactId}`);

  // 즉시 1건 처리 (테스트 발송은 큐 등록 후 바로 실행)
  const result = await processQueueBatch(queue.id);

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  if (result.sent > 0) {
    return NextResponse.json({ success: true, to: contact.email, queueId: queue.id });
  } else {
    return NextResponse.json(
      { success: false, error: "발송 실패", queueId: queue.id, failed: result.failed },
      { status: 500 },
    );
  }
}
