import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/payments";
import {
  claimEvent,
  completeEvent,
  releaseEvent,
} from "@/lib/idempotency";

export async function POST(request: Request) {
  const event = await verifyWebhook(request);
  const claimed = await claimEvent(event.id);

  if (!claimed) {
    console.info("webhook.duplicate", { eventId: event.id });
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await event.dispatch();
    await completeEvent(event.id);
    console.info("webhook.processed", { eventId: event.id });
    return NextResponse.json({ received: true });
  } catch (error) {
    await releaseEvent(event.id);
    throw error;
  }
}
