import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const queues = await prisma.mailQueue.findMany({
    where: { status: { in: ["pending", "processing", "deferred_to_next_day"] } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ queues });
}
