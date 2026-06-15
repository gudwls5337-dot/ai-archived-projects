import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/sequences/[id]/stats
// Returns per-step open stats and per-enrollment contact details.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sequenceId } = await params;

  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" },
        include: {
          mailLogs: {
            where: { status: "SUCCESS" },
            select: { openedAt: true, contactId: true },
          },
        },
      },
    },
  });

  if (!sequence) {
    return NextResponse.json({ error: "시퀀스를 찾을 수 없습니다." }, { status: 404 });
  }

  // ── step별 발송/오픈 집계 ────────────────────────────────────────────────────
  const stepStats = sequence.steps.map(step => {
    const totalSent   = step.mailLogs.length;
    const totalOpened = step.mailLogs.filter(l => l.openedAt).length;
    return {
      stepId:      step.id,
      stepOrder:   step.stepOrder,
      subject:     step.subject,
      totalSent,
      totalOpened,
      notOpened:   totalSent - totalOpened,
      openRate:    totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
    };
  });

  // stepId → stepOrder 매핑
  const stepIdToOrder = new Map(sequence.steps.map(s => [s.id, s.stepOrder]));

  // ── enrollment별 연락처 + 오픈 상세 ─────────────────────────────────────────
  const enrollments = await prisma.contactSequenceEnrollment.findMany({
    where: { sequenceId },
    include: {
      contact: {
        include: {
          company: { select: { id: true, name: true } },
          mailLogs: {
            where: { sequenceId },
            select: {
              id:            true,
              sequenceStepId: true,
              sentAt:        true,
              createdAt:     true,
              openedAt:      true,
              lastOpenedAt:  true,
              openCount:     true,
              status:        true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
    orderBy: { enrolledAt: "asc" },
  });

  const enrollmentData = enrollments.map(e => {
    // logs 를 stepOrder 기준 맵으로 변환
    const logs: Record<number, {
      sentAt: Date | null;
      openedAt: Date | null;
      lastOpenedAt: Date | null;
      openCount: number;
    }> = {};

    for (const log of e.contact.mailLogs) {
      const order = stepIdToOrder.get(log.sequenceStepId ?? "") ?? 0;
      if (order > 0) {
        logs[order] = {
          sentAt:       log.sentAt ?? log.createdAt,
          openedAt:     log.openedAt,
          lastOpenedAt: log.lastOpenedAt,
          openCount:    log.openCount,
        };
      }
    }

    return {
      enrollmentId:  e.id,
      contactId:     e.contactId,
      contactName:   e.contact.name,
      contactEmail:  e.contact.email,
      companyId:     e.contact.company.id,
      companyName:   e.contact.company.name,
      currentStep:   e.currentStep,
      status:        e.status,
      lastSentAt:    e.lastSentAt,
      logs,
    };
  });

  return NextResponse.json({ stepStats, enrollments: enrollmentData });
}
