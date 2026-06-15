import { NextRequest, NextResponse } from "next/server";
import { processQueueBatch } from "@/lib/queue-processor";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await processQueueBatch(params.id);
  if (result.error === "not found") {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  if (result.error) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
