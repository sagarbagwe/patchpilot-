import { google } from "@ai-sdk/google";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { generateObject } from "ai";
import { z } from "zod";
import {
  demoChanges,
  demoChecks,
  demoFindings,
  demoPlan,
  demoRepository,
  demoTriage,
} from "./demo-data";
import { checksPassed, runStaticChecks } from "./static-checks";
import type {
  AgentNodeEvent,
  FileChange,
  NodeId,
  PlanStep,
  RepositoryResult,
  ReviewFinding,
  RunRequest,
  RunResult,
  TestCheck,
  TriageResult,
} from "./types";
import { loadRepositorySnapshot } from "@/lib/github";
import { sleep } from "@/lib/utils";

type RepoFile = { path: string; content: string };

const WorkflowState = Annotation.Root({
  runId: Annotation<string>(),
  request: Annotation<RunRequest>(),
  startedAt: Annotation<number>(),
  triage: Annotation<TriageResult | undefined>(),
  repository: Annotation<RepositoryResult | undefined>(),
  repoFiles: Annotation<RepoFile[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  plan: Annotation<PlanStep[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  changes: Annotation<FileChange[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  checks: Annotation<TestCheck[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  findings: Annotation<ReviewFinding[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  testAttempt: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  repairLoops: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  tokens: Annotation<number>({
    reducer: (left, right) => left + right,
    default: () => 0,
  }),
  lastEvent: Annotation<AgentNodeEvent | undefined>(),
});

type GraphState = typeof WorkflowState.State;

const planStepsSchema = z
  .array(
    z.object({
      id: z.number().int().positive(),
      title: z.string().min(3).max(90),
      description: z.string().min(8).max(240),
      files: z.array(z.string()).max(5),
    }),
  )
  .min(1)
  .max(5);

const generatedChangesSchema = z
  .array(
    z.object({
      path: z.string().min(1).max(220),
      status: z.enum(["added", "modified", "deleted"]),
      content: z.string().max(80_000),
    }),
  )
  .min(1)
  .max(5);

const liveImplementationSchema = z.object({
  steps: planStepsSchema,
  changes: z
    .array(generatedChangesSchema.element)
    .min(1)
    .max(5),
});

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 240_000;

function model() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "Gemini mode needs GOOGLE_GENERATIVE_AI_API_KEY. Configure it in Vercel Environment Variables or use Demo mode.",
    );
  }
  return google(GEMINI_MODEL);
}

function usageTotal(usage: unknown): number {
  const typed = usage as {
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
  return (
    typed.totalTokens ??
    (typed.inputTokens ?? 0) + (typed.outputTokens ?? 0)
  );
}

function repoContext(files: RepoFile[]): string {
  return files
    .map(
      (file) =>
        `\n--- ${file.path} ---\n${file.content.slice(0, 6_000)}`,
    )
    .join("\n")
    .slice(0, 32_000);
}

function issueContext(state: GraphState): string {
  return `Repository: ${state.request.repository}
Issue: ${state.request.issueTitle}
Description: ${state.request.issueBody}`;
}

function triageFromIssue(request: RunRequest): TriageResult {
  const issue = `${request.issueTitle} ${request.issueBody}`.toLowerCase();
  const category = /security|auth|permission|secret|vulnerab/.test(issue)
    ? "Security"
    : /bug|fix|error|crash|incorrect|broken/.test(issue)
      ? "Bug Fix"
      : /test|coverage|spec/.test(issue)
        ? "Testing"
        : /docs|readme|documentation/.test(issue)
          ? "Documentation"
          : /add|create|implement|feature|option|support/.test(issue)
            ? "Feature"
            : "Code Quality";
  const risk: TriageResult["risk"] =
    /security|auth|permission|payment|migration|schema|delete|credential/.test(
      issue,
    )
      ? "high"
      : /api|database|storage|concurr|webhook|production/.test(issue)
        ? "medium"
        : "low";

  return {
    category,
    risk,
    acceptanceCriteria: [
      `The requested behavior is implemented: ${request.issueTitle}`.slice(
        0,
        180,
      ),
      "The change is scoped to relevant files and passes the configured safety checks.",
    ],
  };
}

function diffForChange(
  path: string,
  previousContent: string,
  nextContent: string,
): { patch: string; additions: number; deletions: number } {
  const previous = previousContent ? previousContent.split("\n") : [];
  const next = nextContent ? nextContent.split("\n") : [];
  let prefix = 0;
  while (
    prefix < previous.length &&
    prefix < next.length &&
    previous[prefix] === next[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] ===
      next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const previousChanged = previous.slice(
    prefix,
    previous.length - suffix,
  );
  const nextChanged = next.slice(prefix, next.length - suffix);
  const before = previous.slice(Math.max(0, prefix - 3), prefix);
  const after = previous.slice(
    previous.length - suffix,
    Math.min(previous.length, previous.length - suffix + 3),
  );
  const oldStart = Math.max(0, prefix - 3) + 1;
  const newStart = oldStart;
  const oldCount = before.length + previousChanged.length + after.length;
  const newCount = before.length + nextChanged.length + after.length;
  const patch = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    ...before.map((line) => ` ${line}`),
    ...previousChanged.map((line) => `-${line}`),
    ...nextChanged.map((line) => `+${line}`),
    ...after.map((line) => ` ${line}`),
  ].join("\n");

  return {
    patch,
    additions: nextChanged.length,
    deletions: previousChanged.length,
  };
}

function materializeChanges(
  generated: z.infer<typeof generatedChangesSchema>,
  files: RepoFile[],
): FileChange[] {
  return generated.map((change) => {
    const existing = files.find((file) => file.path === change.path);
    if (change.status !== "added" && !existing) {
      throw new Error(
        `Gemini referenced "${change.path}", but that file was not loaded from the repository. Try a more specific issue description.`,
      );
    }
    const content = change.status === "deleted" ? "" : change.content;
    const diff = diffForChange(change.path, existing?.content ?? "", content);
    return {
      path: change.path,
      status: change.status,
      content,
      ...diff,
    };
  });
}

function reviewGeneratedPatch(state: GraphState): ReviewFinding[] {
  const failedChecks = state.checks.filter(
    (check) => check.status === "failed",
  );
  if (failedChecks.length > 0) {
    return failedChecks.map((check) => ({
      severity: "critical",
      title: `${check.name} failed`,
      detail:
        "The generated patch did not pass deterministic verification and must not be approved.",
    }));
  }

  const findings: ReviewFinding[] = [];
  if (state.changes.length > 3) {
    findings.push({
      severity: "warning",
      title: "Broad change scope",
      detail:
        "The patch touches more than three files. Review each replacement carefully before approval.",
    });
  }
  findings.push({
    severity: "info",
    title: "Automated safety review passed",
    detail:
      "Paths, secrets, delimiters, JSON content, and patch size passed deterministic checks. Human review is still required.",
  });
  return findings;
}

function geminiError(error: unknown): Error {
  const message =
    error instanceof Error ? error.message : "Unknown Gemini error.";
  if (
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")) ||
    /abort|timed? ?out|timeout/i.test(message)
  ) {
    return new Error(
      "Gemini 3.6 did not finish within four minutes, so PatchPilot stopped the run safely. Retry once with a smaller, more focused issue.",
    );
  }
  if (/429|quota|rate.?limit|resource_exhausted/i.test(message)) {
    return new Error(
      "Gemini free-tier quota or rate limit was reached. Wait about one minute, then retry.",
    );
  }
  if (/404|model.*not found|not supported/i.test(message)) {
    return new Error(
      "Gemini 3.6 Flash is unavailable for this API key or region. Confirm the key can use gemini-3.6-flash in Google AI Studio.",
    );
  }
  if (/network error|failed to fetch|fetch failed|econnreset|socket/i.test(message)) {
    return new Error(
      "The Gemini 3.6 connection ended unexpectedly. PatchPilot stopped safely before any repository write; retry once.",
    );
  }
  if (
    /no object generated|could not parse|did not match|incomplete|max.?output/i.test(
      message,
    )
  ) {
    return new Error(
      "Gemini 3.6 could not return a complete structured patch. Reduce the issue scope or target fewer files, then retry.",
    );
  }
  return new Error(`Gemini could not generate the patch: ${message}`);
}

async function triageNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  const started = Date.now();
  if (state.request.mode === "demo") {
    await sleep(520);
    const triage = demoTriage();
    return {
      triage,
      tokens: 624,
      lastEvent: {
        nodeId: "triage",
        status: "completed",
        title: "Issue triaged",
        message: `${triage.category} task · ${triage.risk} risk · ${triage.acceptanceCriteria.length} acceptance criteria`,
        durationMs: Date.now() - started,
        payload: { triage },
      },
    };
  }

  const triage = triageFromIssue(state.request);
  return {
    triage,
    tokens: 0,
    lastEvent: {
      nodeId: "triage",
      status: "completed",
      title: "Issue triaged",
      message: `${triage.category} task · ${triage.risk} risk · ${triage.acceptanceCriteria.length} acceptance criteria`,
      durationMs: Date.now() - started,
      payload: { triage },
    },
  };
}

async function repositoryNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  const started = Date.now();
  if (state.request.mode === "demo") {
    await sleep(680);
    const repository = demoRepository();
    return {
      repository,
      repoFiles: [],
      tokens: 188,
      lastEvent: {
        nodeId: "repository",
        status: "completed",
        title: "Repository mapped",
        message: `${repository.filesScanned} files scanned · ${repository.relevantFiles.length} relevant paths`,
        durationMs: Date.now() - started,
        payload: { repository },
      },
    };
  }

  const snapshot = await loadRepositorySnapshot(
    state.request.repository,
    `${state.request.issueTitle} ${state.request.issueBody}`,
  );
  const repository: RepositoryResult = {
    defaultBranch: snapshot.defaultBranch,
    language: snapshot.language,
    filesScanned: snapshot.filesScanned,
    relevantFiles: snapshot.files.map((file) => ({
      path: file.path,
      reason: "Ranked by path relevance and repository structure.",
    })),
  };
  return {
    repository,
    repoFiles: snapshot.files,
    tokens: 0,
    lastEvent: {
      nodeId: "repository",
      status: "completed",
      title: "Repository mapped",
      message: `${repository.filesScanned} files scanned · ${repository.relevantFiles.length} files loaded`,
      durationMs: Date.now() - started,
      payload: { repository },
    },
  };
}

async function plannerNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  const started = Date.now();
  if (state.request.mode === "demo") {
    await sleep(610);
    const plan = demoPlan();
    return {
      plan,
      tokens: 978,
      lastEvent: {
        nodeId: "planner",
        status: "completed",
        title: "Implementation planned",
        message: `${plan.length} ordered changes with file-level scope`,
        durationMs: Date.now() - started,
        payload: { plan },
      },
    };
  }

  try {
    const generated = await generateObject({
      model: model(),
      schema: liveImplementationSchema,
      system: `You are PatchPilot's implementation agent.
Create the smallest safe patch grounded only in the supplied repository files.
Return an ordered plan and complete replacement content for each changed file.
For modified or deleted files, use an exact supplied path. Use "added" only for a genuinely new file.
Do not edit lockfiles, generated files, CI secrets, or dependency manifests unless the issue explicitly requires it.
Do not include credentials. Touch at most five files.`,
      prompt: `${issueContext(state)}
Acceptance criteria:
${state.triage?.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}

Repository context:
${repoContext(state.repoFiles)}`,
      temperature: 0.1,
      maxOutputTokens: 12_000,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: "low",
            includeThoughts: false,
          },
        },
      },
    });
    const changes = materializeChanges(
      generated.object.changes,
      state.repoFiles,
    );
    return {
      plan: generated.object.steps,
      changes,
      tokens: usageTotal(generated.usage),
      lastEvent: {
        nodeId: "planner",
        status: "completed",
        title: "Implementation planned",
        message: `${generated.object.steps.length} ordered changes with file-level scope`,
        durationMs: Date.now() - started,
        payload: { plan: generated.object.steps },
      },
    };
  } catch (error) {
    throw geminiError(error);
  }
}

async function coderNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  const started = Date.now();
  if (state.request.mode === "demo") {
    await sleep(820);
    const changes = demoChanges();
    return {
      changes,
      tokens: 2874,
      lastEvent: {
        nodeId: "coder",
        status: "completed",
        title: "Patch generated",
        message: `${changes.length} files · 71 additions · 3 deletions`,
        durationMs: Date.now() - started,
        payload: { changes },
      },
    };
  }

  const changes = state.changes;
  if (changes.length === 0) {
    throw new Error("Gemini completed without producing any file changes.");
  }
  const additions = changes.reduce((total, file) => total + file.additions, 0);
  const deletions = changes.reduce((total, file) => total + file.deletions, 0);
  return {
    changes,
    tokens: 0,
    lastEvent: {
      nodeId: "coder",
      status: "completed",
      title: "Patch generated",
      message: `${changes.length} files · ${additions} additions · ${deletions} deletions`,
      durationMs: Date.now() - started,
      payload: { changes },
    },
  };
}

async function testerNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  const started = Date.now();
  await sleep(state.request.mode === "demo" ? 560 : 120);
  const testAttempt = state.testAttempt + 1;
  const checks =
    state.request.mode === "demo"
      ? demoChecks(testAttempt > 1)
      : runStaticChecks(state.changes);
  const passed = checksPassed(checks);
  const failedCount = checks.filter((check) => check.status === "failed").length;

  return {
    checks,
    testAttempt,
    tokens: 0,
    lastEvent: {
      nodeId: "tester",
      status: passed ? "completed" : "retrying",
      title: passed ? "Verification passed" : "Verification found issues",
      message: passed
        ? `${checks.length}/${checks.length} checks passed`
        : `${failedCount} checks failed · repair loop requested`,
      durationMs: Date.now() - started,
      testAttempt,
      payload: { checks, passed },
    },
  };
}

async function repairNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  const started = Date.now();
  if (state.request.mode === "demo") {
    await sleep(650);
    return {
      repairLoops: state.repairLoops + 1,
      tokens: 812,
      lastEvent: {
        nodeId: "repair",
        status: "completed",
        title: "Patch repaired",
        message: "Added claim release on failure and updated the recovery test",
        durationMs: Date.now() - started,
      },
    };
  }

  const failed = state.checks
    .filter((check) => check.status === "failed")
    .map((check) => check.name)
    .join(", ");
  throw new Error(
    `Patch generation stopped because verification failed: ${failed}. Adjust the issue description and retry; no repository write occurred.`,
  );
}

async function reviewerNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  const started = Date.now();
  if (state.request.mode === "demo") {
    await sleep(690);
    const findings = demoFindings();
    return {
      findings,
      tokens: 1098,
      lastEvent: {
        nodeId: "reviewer",
        status: "completed",
        title: "Review complete",
        message: "0 blockers · 1 observation · confidence 92%",
        durationMs: Date.now() - started,
        payload: { findings },
      },
    };
  }

  const findings = reviewGeneratedPatch(state);
  const blockers = findings.filter(
    (finding) => finding.severity === "critical",
  ).length;
  return {
    findings,
    tokens: 0,
    lastEvent: {
      nodeId: "reviewer",
      status: blockers ? "failed" : "completed",
      title: "Review complete",
      message: `${blockers} blockers · ${findings.length} total findings`,
      durationMs: Date.now() - started,
      payload: { findings },
    },
  };
}

async function approvalNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  const checksPassedCount = state.checks.filter(
    (check) => check.status === "passed",
  ).length;
  const result: RunResult = {
    runId: state.runId,
    request: state.request,
    triage: state.triage ?? demoTriage(),
    repository: state.repository ?? demoRepository(),
    plan: state.plan,
    changes: state.changes,
    checks: state.checks,
    findings: state.findings,
    summary:
      state.request.mode === "demo"
        ? "Added atomic webhook idempotency, duplicate acknowledgements, failure recovery, and route-level coverage."
        : `Prepared a scoped implementation for “${state.request.issueTitle}” with static verification and review.`,
    metrics: {
      durationMs: Date.now() - state.startedAt,
      tokens: state.tokens,
      estimatedCost: Number((state.tokens * 0.00000032).toFixed(4)),
      filesChanged: state.changes.length,
      checksPassed: checksPassedCount,
      checksTotal: state.checks.length,
      repairLoops: state.repairLoops,
    },
    branchName: `patchpilot/${state.request.issueTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42)}`,
  };

  return {
    lastEvent: {
      nodeId: "approval",
      status: "waiting",
      title: "Human approval required",
      message: "Review the diff before PatchPilot can prepare a draft pull request",
      durationMs: 18,
      payload: { result },
    },
  };
}

const workflow = new StateGraph(WorkflowState)
  .addNode("triage_agent", triageNode)
  .addNode("repository_agent", repositoryNode)
  .addNode("planner_agent", plannerNode)
  .addNode("coder_agent", coderNode)
  .addNode("tester_agent", testerNode)
  .addNode("repair_agent", repairNode)
  .addNode("reviewer_agent", reviewerNode)
  .addNode("approval_gate", approvalNode)
  .addEdge(START, "triage_agent")
  .addEdge("triage_agent", "repository_agent")
  .addEdge("repository_agent", "planner_agent")
  .addEdge("planner_agent", "coder_agent")
  .addEdge("coder_agent", "tester_agent")
  .addConditionalEdges(
    "tester_agent",
    (state) =>
      checksPassed(state.checks) || state.testAttempt >= 2
        ? "reviewer_agent"
        : "repair_agent",
    ["reviewer_agent", "repair_agent"],
  )
  .addEdge("repair_agent", "tester_agent")
  .addEdge("reviewer_agent", "approval_gate")
  .addEdge("approval_gate", END)
  .compile();

export async function workflowStream(request: RunRequest, runId: string) {
  return workflow.stream(
    {
      runId,
      request,
      startedAt: Date.now(),
    },
    { streamMode: "updates", recursionLimit: 20 },
  );
}

export function nextNodeFor(event: AgentNodeEvent): NodeId | null {
  const next: Record<NodeId, NodeId | null> = {
    triage: "repository",
    repository: "planner",
    planner: "coder",
    coder: "tester",
    tester: event.status === "retrying" ? "repair" : "reviewer",
    repair: "tester",
    reviewer: "approval",
    approval: null,
  };
  return next[event.nodeId];
}

export const NODE_START_COPY: Record<NodeId, string> = {
  triage: "Classifying risk and defining acceptance criteria",
  repository: "Scanning the repository for relevant code paths",
  planner: "Designing the smallest safe implementation",
  coder: "Generating a scoped patch with file-level changes",
  tester: "Running deterministic verification checks",
  repair: "Diagnosing failures and repairing the patch",
  reviewer: "Reviewing correctness, security, and maintainability",
  approval: "Preparing the patch for your decision",
};
