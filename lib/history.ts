import type { RunMode, RunResult } from "./agent/types";

export const HISTORY_STORAGE_KEY = "patchpilot:runs";
export const DEFAULT_MODE_STORAGE_KEY = "patchpilot:default-mode";

export type HistoryStatus = "approved" | "awaiting_approval" | "failed";

export interface HistoryRecord {
  runId: string;
  repository: string;
  issueTitle: string;
  mode: RunMode;
  status: HistoryStatus;
  createdAt: string;
  durationMs: number;
  filesChanged: number;
  checksPassed: number;
  checksTotal: number;
  repairLoops: number;
}

export const SAMPLE_HISTORY: HistoryRecord[] = [
  {
    runId: "run_demo_184",
    repository: "acme/payments-api",
    issueTitle: "Prevent duplicate webhook processing after network retries",
    mode: "demo",
    status: "approved",
    createdAt: "2026-09-10T03:42:09.000Z",
    durationMs: 5120,
    filesChanged: 3,
    checksPassed: 6,
    checksTotal: 6,
    repairLoops: 1,
  },
  {
    runId: "run_demo_183",
    repository: "northstar/next-dashboard",
    issueTitle: "Add an accessible empty state to the activity feed",
    mode: "demo",
    status: "approved",
    createdAt: "2026-09-09T15:18:24.000Z",
    durationMs: 4170,
    filesChanged: 2,
    checksPassed: 6,
    checksTotal: 6,
    repairLoops: 0,
  },
  {
    runId: "run_demo_182",
    repository: "acme/payments-api",
    issueTitle: "Redact customer identifiers from structured logs",
    mode: "demo",
    status: "awaiting_approval",
    createdAt: "2026-09-09T09:05:11.000Z",
    durationMs: 5440,
    filesChanged: 4,
    checksPassed: 6,
    checksTotal: 6,
    repairLoops: 0,
  },
];

export function historyRecordFromResult(result: RunResult): HistoryRecord {
  return {
    runId: result.runId,
    repository: result.request.repository,
    issueTitle: result.request.issueTitle,
    mode: result.request.mode,
    status: "awaiting_approval",
    createdAt: new Date().toISOString(),
    durationMs: result.metrics.durationMs,
    filesChanged: result.metrics.filesChanged,
    checksPassed: result.metrics.checksPassed,
    checksTotal: result.metrics.checksTotal,
    repairLoops: result.metrics.repairLoops,
  };
}

export function readStoredHistory(): HistoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as HistoryRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveHistoryRecord(record: HistoryRecord): void {
  try {
    const current = readStoredHistory().filter(
      (item) => item.runId !== record.runId,
    );
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([record, ...current].slice(0, 25)),
    );
  } catch {
    // A completed workflow should not fail when browser storage is unavailable.
  }
}

export function updateHistoryStatus(
  runId: string,
  status: HistoryStatus,
): void {
  try {
    const current = readStoredHistory();
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(
        current.map((item) =>
          item.runId === runId ? { ...item, status } : item,
        ),
      ),
    );
  } catch {
    // Approval remains successful even if local history cannot be updated.
  }
}
