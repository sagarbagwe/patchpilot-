import type {
  FileChange,
  PlanStep,
  RepositoryResult,
  ReviewFinding,
  RunRequest,
  TestCheck,
  TriageResult,
} from "./types";

export const DEFAULT_REQUEST: RunRequest = {
  repository: "acme/payments-api",
  issueTitle: "Prevent duplicate webhook processing after network retries",
  issueBody:
    "A payment provider can retry the same webhook several times. Add idempotency handling so a repeated event returns 200 without running the business logic twice. Include tests and keep the handler observable.",
  mode: "demo",
};

export function demoTriage(): TriageResult {
  return {
    category: "Reliability",
    risk: "medium",
    acceptanceCriteria: [
      "Repeated event IDs execute business logic exactly once",
      "Duplicate deliveries still receive a successful response",
      "The claim expires safely if processing fails",
      "Logs distinguish processed and duplicate events",
    ],
  };
}

export function demoRepository(): RepositoryResult {
  return {
    defaultBranch: "main",
    language: "TypeScript",
    filesScanned: 146,
    relevantFiles: [
      {
        path: "src/app/api/webhooks/route.ts",
        reason: "Owns payment webhook validation and dispatch.",
      },
      {
        path: "src/lib/idempotency.ts",
        reason: "Natural boundary for atomic event claims.",
      },
      {
        path: "src/app/api/webhooks/route.test.ts",
        reason: "Existing route-level test suite.",
      },
      {
        path: "src/lib/redis.ts",
        reason: "Shared Redis client and connection lifecycle.",
      },
    ],
  };
}

export function demoPlan(): PlanStep[] {
  return [
    {
      id: 1,
      title: "Add an atomic event claim",
      description:
        "Use Redis SET NX with an expiry so only one worker owns an event.",
      files: ["src/lib/idempotency.ts"],
    },
    {
      id: 2,
      title: "Guard the webhook handler",
      description:
        "Return a successful duplicate response before business logic runs.",
      files: ["src/app/api/webhooks/route.ts"],
    },
    {
      id: 3,
      title: "Cover success and recovery paths",
      description:
        "Test first delivery, duplicate delivery, and claim release on failure.",
      files: ["src/app/api/webhooks/route.test.ts"],
    },
  ];
}

const idempotencyContent = `import { redis } from "@/lib/redis";

const CLAIM_TTL_SECONDS = 60 * 60 * 24;

export async function claimEvent(eventId: string): Promise<boolean> {
  const result = await redis.set(
    \`webhook:event:\${eventId}\`,
    "processing",
    { nx: true, ex: CLAIM_TTL_SECONDS },
  );

  return result === "OK";
}

export async function completeEvent(eventId: string): Promise<void> {
  await redis.set(
    \`webhook:event:\${eventId}\`,
    "completed",
    { xx: true, ex: CLAIM_TTL_SECONDS },
  );
}

export async function releaseEvent(eventId: string): Promise<void> {
  await redis.del(\`webhook:event:\${eventId}\`);
}
`;

const routeContent = `import { NextResponse } from "next/server";
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
`;

const testsContent = `import { POST } from "./route";
import { claimEvent, releaseEvent } from "@/lib/idempotency";

vi.mock("@/lib/idempotency");

describe("payment webhook", () => {
  it("acknowledges a duplicate without dispatching twice", async () => {
    vi.mocked(claimEvent).mockResolvedValue(false);
    const response = await POST(makeWebhookRequest("evt_123"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      duplicate: true,
    });
    expect(dispatchPaymentEvent).not.toHaveBeenCalled();
  });

  it("releases the claim when processing fails", async () => {
    vi.mocked(claimEvent).mockResolvedValue(true);
    dispatchPaymentEvent.mockRejectedValue(new Error("database offline"));
    await expect(POST(makeWebhookRequest("evt_456"))).rejects.toThrow();
    expect(releaseEvent).toHaveBeenCalledWith("evt_456");
  });
});
`;

export function demoChanges(): FileChange[] {
  return [
    {
      path: "src/lib/idempotency.ts",
      status: "added",
      additions: 27,
      deletions: 0,
      content: idempotencyContent,
      patch: `@@ -0,0 +1,27 @@
+import { redis } from "@/lib/redis";
+
+const CLAIM_TTL_SECONDS = 60 * 60 * 24;
+
+export async function claimEvent(eventId: string): Promise<boolean> {
+  const result = await redis.set(
+    \`webhook:event:\${eventId}\`,
+    "processing",
+    { nx: true, ex: CLAIM_TTL_SECONDS },
+  );
+
+  return result === "OK";
+}
+
+export async function completeEvent(eventId: string): Promise<void> {
+  await redis.set(
+    \`webhook:event:\${eventId}\`,
+    "completed",
+    { xx: true, ex: CLAIM_TTL_SECONDS },
+  );
+}
+
+export async function releaseEvent(eventId: string): Promise<void> {
+  await redis.del(\`webhook:event:\${eventId}\`);
+}`,
    },
    {
      path: "src/app/api/webhooks/route.ts",
      status: "modified",
      additions: 20,
      deletions: 3,
      content: routeContent,
      patch: `@@ -1,13 +1,30 @@
 import { NextResponse } from "next/server";
 import { verifyWebhook } from "@/lib/payments";
+import {
+  claimEvent,
+  completeEvent,
+  releaseEvent,
+} from "@/lib/idempotency";
 
 export async function POST(request: Request) {
   const event = await verifyWebhook(request);
-  await event.dispatch();
-  return NextResponse.json({ received: true });
+  const claimed = await claimEvent(event.id);
+
+  if (!claimed) {
+    console.info("webhook.duplicate", { eventId: event.id });
+    return NextResponse.json({ received: true, duplicate: true });
+  }
+
+  try {
+    await event.dispatch();
+    await completeEvent(event.id);
+    console.info("webhook.processed", { eventId: event.id });
+    return NextResponse.json({ received: true });
+  } catch (error) {
+    await releaseEvent(event.id);
+    throw error;
+  }
 }`,
    },
    {
      path: "src/app/api/webhooks/route.test.ts",
      status: "modified",
      additions: 24,
      deletions: 0,
      content: testsContent,
      patch: `@@ -18,6 +18,30 @@ describe("payment webhook", () => {
+  it("acknowledges a duplicate without dispatching twice", async () => {
+    vi.mocked(claimEvent).mockResolvedValue(false);
+    const response = await POST(makeWebhookRequest("evt_123"));
+    expect(response.status).toBe(200);
+    await expect(response.json()).resolves.toMatchObject({
+      received: true,
+      duplicate: true,
+    });
+    expect(dispatchPaymentEvent).not.toHaveBeenCalled();
+  });
+
+  it("releases the claim when processing fails", async () => {
+    vi.mocked(claimEvent).mockResolvedValue(true);
+    dispatchPaymentEvent.mockRejectedValue(
+      new Error("database offline"),
+    );
+    await expect(
+      POST(makeWebhookRequest("evt_456")),
+    ).rejects.toThrow();
+    expect(releaseEvent).toHaveBeenCalledWith("evt_456");
+  });
 });`,
    },
  ];
}

export function demoChecks(passed: boolean): TestCheck[] {
  if (!passed) {
    return [
      { name: "TypeScript", status: "passed", durationMs: 821 },
      { name: "Unit tests", status: "failed", durationMs: 1142 },
      { name: "Lint", status: "passed", durationMs: 603 },
      { name: "Secret scan", status: "passed", durationMs: 191 },
    ];
  }

  return [
    { name: "TypeScript", status: "passed", durationMs: 821 },
    { name: "18 unit tests", status: "passed", durationMs: 1384 },
    { name: "Lint", status: "passed", durationMs: 603 },
    { name: "Secret scan", status: "passed", durationMs: 191 },
    { name: "Path safety", status: "passed", durationMs: 84 },
    { name: "Patch size", status: "passed", durationMs: 42 },
  ];
}

export function demoFindings(): ReviewFinding[] {
  return [
    {
      severity: "info",
      title: "Atomic claim prevents duplicate work",
      detail:
        "SET NX makes the idempotency decision atomic across concurrent workers.",
      file: "src/lib/idempotency.ts",
      line: 6,
    },
    {
      severity: "info",
      title: "Failure path is recoverable",
      detail:
        "The event claim is released when dispatch throws, allowing a provider retry.",
      file: "src/app/api/webhooks/route.ts",
      line: 24,
    },
    {
      severity: "warning",
      title: "Monitor 24-hour key volume",
      detail:
        "The TTL is safe for common providers; production should alert on unexpected key growth.",
      file: "src/lib/idempotency.ts",
      line: 3,
    },
  ];
}
