import { z } from "zod";
import { createDraftPullRequest } from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 60;

const fileSchema = z.object({
  path: z.string(),
  status: z.enum(["added", "modified", "deleted"]),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  content: z.string(),
  patch: z.string(),
});

const inputSchema = z.object({
  repository: z.string(),
  baseBranch: z.string(),
  branchName: z.string(),
  title: z.string().min(6).max(180),
  body: z.string().max(4000),
  changes: z.array(fileSchema).min(1).max(10),
  confirmation: z.literal("APPROVE"),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const input = inputSchema.parse(await request.json());

    if (
      process.env.PATCHPILOT_ENABLE_WRITES !== "true" ||
      !process.env.GITHUB_TOKEN
    ) {
      return Response.json({
        dryRun: true,
        message:
          "Patch approved. GitHub writes are disabled, so no external change was made.",
        branch: input.branchName,
      });
    }

    const pullRequest = await createDraftPullRequest(input);
    return Response.json({ dryRun: false, ...pullRequest });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create pull request.";
    return Response.json({ error: message }, { status: 400 });
  }
}
