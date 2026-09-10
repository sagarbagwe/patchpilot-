import { redis } from "@/lib/redis";

const CLAIM_TTL_SECONDS = 60 * 60 * 24;

export async function claimEvent(eventId: string): Promise<boolean> {
  const result = await redis.set(
    `webhook:event:${eventId}`,
    "processing",
    { nx: true, ex: CLAIM_TTL_SECONDS },
  );

  return result === "OK";
}

export async function completeEvent(eventId: string): Promise<void> {
  await redis.set(
    `webhook:event:${eventId}`,
    "completed",
    { xx: true, ex: CLAIM_TTL_SECONDS },
  );
}

export async function releaseEvent(eventId: string): Promise<void> {
  await redis.del(`webhook:event:${eventId}`);
}
