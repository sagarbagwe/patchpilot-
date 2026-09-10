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

const triageSchema = z.object({
  category: z.string().min(2).max(40),
  risk: z.enum(["low", "medium", "high"]),
  acceptanceCriteria: z.array(z.string().min(8).max(180)).min(2).max(6),
});

const planSchema = z.object({
  steps: z
    .array(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(3).max(90),
        description: z.string().min(8).max(240),
        files: z.array(z.string()).max(5),
      }),
    )
    .min(2)
    .max(6),
});

const changesSchema = z.object({
  changes: z
    .array(
      z.object({
        path: z.string().min(1).max(220),
        status: z.enum(["added", "modified", "deleted"]),
        additions: z.number().int().nonnegative(),
        deletions: z.number().int().nonnegative(),
        content: z.string().max(80_000),
        patch: z.string().max(40_000),
      }),
    )
    .min(1)
    .max(5),
});

const reviewSchema = z.object({
  findings: z
    .array(
      z.object({
        severity: z.enum(["info", "warning", "critical"]),
        title: z.string().min(3).max(100),
        detail: z.string().min(8).max(280),
        file: z.string().optional(),
        line: z.number().int().positive().optional(),
      }),
    )
    .max(8),
});

function model() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "Gemini mode needs GOOGLE_GENERATIVE_AI_API_KEY. Configure it in Vercel Environment Variables or use Demo mode.",
    );
  }
  return google(process.env.GEMINI_MODEL || "gemini-2.5-flash");
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
        `\n--- ${file.path} ---\n${file.content.slice(0, 8_000)}`,
    )
    .join("\n")
    .slice(0, 48_000);
}

function issueContext(state: GraphState): string {
  return `Repository: ${state.request.repository}
Issue: ${state.request.issueTitle}
Description: ${state.request.issueBody}`;
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

  const generated = await generateObject({
    model: model(),
    schema: triageSchema,
    system:
      "You are a senior engineering triage agent. Produce testable acceptance criteria. Do not propose implementation yet.",
    prompt: issueContext(state),
    temperature: 0.1,
  });
  const triage = generated.object;
  return {
    triage,
    tokens: usageTotal(generated.usage),
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

  const generated = await generateObject({
    model: model(),
    schema: planSchema,
    system:
      "You are a staff software engineer. Make the smallest safe implementation plan grounded only in the supplied files. Include validation and tests.",
    prompt: `${issueContext(state)}
Acceptance criteria:
${state.triage?.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}

Repository context:
${repoContext(state.repoFiles)}`,
    temperature: 0.1,
  });
  return {
    plan: generated.object.steps,
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

  const generated = await generateObject({
    model: model(),
    schema: changesSchema,
    system: `You are a careful coding agent.
Return complete replacement content for every added or modified file and a unified diff hunk in patch.
Keep changes minimal. Never edit lockfiles, CI secrets, generated files, or dependency manifests unless the issue explicitly requires it.
Never include credentials. Maximum five files.`,
    prompt: `${issueContext(state)}

Plan:
${state.plan
  .map(
    (step) =>
      `${step.id}. ${step.title}: ${step.description} [${step.files.join(", ")}]`,
  )
  .join("\n")}

Repository context:
${repoContext(state.repoFiles)}`,
    temperature: 0.1,
    maxOutputTokens: 7000,
  });
  const changes = generated.object.changes;
  const additions = changes.reduce((total, file) => total + file.additions, 0);
  const deletions = changes.reduce((total, file) => total + file.deletions, 0);
  return {
    changes,
    tokens: usageTotal(generated.usage),
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

  const generated = await generateObject({
    model: model(),
    schema: changesSchema,
    system:
      "You are a repair agent. Fix only the reported verification failures. Preserve correct behavior and return complete file contents.",
    prompt: `${issueContext(state)}
Failed checks:
${state.checks
  .filter((check) => check.status === "failed")
  .map((check) => `- ${check.name}`)
  .join("\n")}

Current changes:
${state.changes
  .map((change) => `--- ${change.path} ---\n${change.content}`)
  .join("\n")
  .slice(0, 48_000)}`,
    temperature: 0,
    maxOutputTokens: 7000,
  });
  return {
    changes: generated.object.changes,
    repairLoops: state.repairLoops + 1,
    tokens: usageTotal(generated.usage),
    lastEvent: {
      nodeId: "repair",
      status: "completed",
      title: "Patch repaired",
      message: "Regenerated the affected files from structured check failures",
      durationMs: Date.now() - started,
      payload: { changes: generated.object.changes },
    },
  };
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

  const generated = await generateObject({
    model: model(),
    schema: reviewSchema,
    system:
      "You are a skeptical code reviewer. Check correctness, security, failure recovery, tests, and scope. Report only concrete findings. Critical means the patch must not be approved.",
    prompt: `${issueContext(state)}
Acceptance criteria:
${state.triage?.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}

Changes:
${state.changes
  .map((change) => `--- ${change.path} ---\n${change.patch}`)
  .join("\n")
  .slice(0, 48_000)}`,
    temperature: 0.1,
  });
  const blockers = generated.object.findings.filter(
    (finding) => finding.severity === "critical",
  ).length;
  return {
    findings: generated.object.findings,
    tokens: usageTotal(generated.usage),
    lastEvent: {
      nodeId: "reviewer",
      status: blockers ? "failed" : "completed",
      title: "Review complete",
      message: `${blockers} blockers · ${generated.object.findings.length} total findings`,
      durationMs: Date.now() - started,
      payload: { findings: generated.object.findings },
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
