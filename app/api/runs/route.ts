import { z } from "zod";
import {
  nextNodeFor,
  NODE_START_COPY,
  workflowStream,
} from "@/lib/agent/workflow";
import type {
  AgentNodeEvent,
  NodeId,
  RunResult,
  WorkflowEvent,
} from "@/lib/agent/types";
import { makeId, parseRepository } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  repository: z.string().min(3).max(180),
  issueTitle: z.string().min(6).max(180),
  issueBody: z.string().min(12).max(3000),
  mode: z.enum(["demo", "live"]).default("demo"),
});

function now(): string {
  return new Date().toISOString();
}

export async function POST(request: Request): Promise<Response> {
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
    parseRepository(input.repository);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid workflow request.";
    return Response.json({ error: message }, { status: 400 });
  }

  const runId = makeId();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: WorkflowEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const sendStarted = (nodeId: NodeId) => {
        send({
          type: "node.started",
          runId,
          timestamp: now(),
          node: {
            nodeId,
            status: "running",
            title: `${nodeId[0].toUpperCase()}${nodeId.slice(1)} agent`,
            message: NODE_START_COPY[nodeId],
          },
        });
      };

      try {
        send({
          type: "run.started",
          runId,
          timestamp: now(),
          request: input,
        });
        sendStarted("triage");

        const updates = await workflowStream(input, runId);
        for await (const rawUpdate of updates) {
          const update = rawUpdate as Record<
            string,
            { lastEvent?: AgentNodeEvent }
          >;
          const nodeState = Object.values(update)[0];
          const event = nodeState?.lastEvent;
          if (!event) continue;

          send({
            type:
              event.status === "retrying"
                ? "node.retry"
                : "node.completed",
            runId,
            timestamp: now(),
            node: event,
          });

          if (event.nodeId === "approval") {
            const result = event.payload?.result as RunResult | undefined;
            if (!result) throw new Error("Workflow completed without a result.");
            send({
              type: "run.completed",
              runId,
              timestamp: now(),
              result,
            });
            continue;
          }

          const next = nextNodeFor(event);
          if (next) sendStarted(next);
        }
      } catch (error) {
        send({
          type: "run.failed",
          runId,
          timestamp: now(),
          error:
            error instanceof Error ? error.message : "The workflow failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
