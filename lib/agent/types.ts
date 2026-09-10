export const NODE_IDS = [
  "triage",
  "repository",
  "planner",
  "coder",
  "tester",
  "repair",
  "reviewer",
  "approval",
] as const;

export type NodeId = (typeof NODE_IDS)[number];
export type RunMode = "demo" | "live";
export type NodeStatus =
  | "idle"
  | "running"
  | "completed"
  | "retrying"
  | "waiting"
  | "failed";

export interface RunRequest {
  repository: string;
  issueTitle: string;
  issueBody: string;
  mode: RunMode;
}

export interface TriageResult {
  category: string;
  risk: "low" | "medium" | "high";
  acceptanceCriteria: string[];
}

export interface RepositoryResult {
  defaultBranch: string;
  language: string;
  filesScanned: number;
  relevantFiles: Array<{ path: string; reason: string }>;
}

export interface PlanStep {
  id: number;
  title: string;
  description: string;
  files: string[];
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  content: string;
  patch: string;
}

export interface TestCheck {
  name: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
}

export interface ReviewFinding {
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  file?: string;
  line?: number;
}

export interface RunMetrics {
  durationMs: number;
  tokens: number;
  estimatedCost: number;
  filesChanged: number;
  checksPassed: number;
  checksTotal: number;
  repairLoops: number;
}

export interface RunResult {
  runId: string;
  request: RunRequest;
  triage: TriageResult;
  repository: RepositoryResult;
  plan: PlanStep[];
  changes: FileChange[];
  checks: TestCheck[];
  findings: ReviewFinding[];
  summary: string;
  metrics: RunMetrics;
  branchName: string;
}

export interface AgentNodeEvent {
  nodeId: NodeId;
  status: Exclude<NodeStatus, "idle">;
  title: string;
  message: string;
  durationMs?: number;
  testAttempt?: number;
  payload?: Record<string, unknown>;
}

export type WorkflowEvent =
  | {
      type: "run.started";
      runId: string;
      timestamp: string;
      request: RunRequest;
    }
  | {
      type: "run.heartbeat";
      runId: string;
      timestamp: string;
    }
  | {
      type: "node.started" | "node.completed" | "node.retry";
      runId: string;
      timestamp: string;
      node: AgentNodeEvent;
    }
  | {
      type: "run.completed";
      runId: string;
      timestamp: string;
      result: RunResult;
    }
  | {
      type: "run.failed";
      runId: string;
      timestamp: string;
      error: string;
    };
