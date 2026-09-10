"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCode2,
  Filter,
  GitBranch,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { SectionPageShell } from "./section-page-shell";
import {
  HISTORY_STORAGE_KEY,
  readStoredHistory,
  SAMPLE_HISTORY,
  type HistoryRecord,
  type HistoryStatus,
} from "@/lib/history";
import { cn, formatDuration } from "@/lib/utils";

type StatusFilter = "all" | HistoryStatus;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} · ${iso.slice(11, 16)} UTC`;
}

const STATUS_LABEL: Record<HistoryStatus, string> = {
  approved: "Approved",
  awaiting_approval: "Awaiting approval",
  failed: "Failed",
};

export function HistoryPage() {
  const [records, setRecords] = useState<HistoryRecord[]>(SAMPLE_HISTORY);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  useEffect(() => {
    const stored = readStoredHistory();
    if (stored.length) {
      const sampleIds = new Set(stored.map((item) => item.runId));
      setRecords([
        ...stored,
        ...SAMPLE_HISTORY.filter((item) => !sampleIds.has(item.runId)),
      ]);
    }
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter(
      (record) =>
        (status === "all" || record.status === status) &&
        (!needle ||
          record.repository.toLowerCase().includes(needle) ||
          record.issueTitle.toLowerCase().includes(needle) ||
          record.runId.toLowerCase().includes(needle)),
    );
  }, [query, records, status]);

  const approved = records.filter(
    (record) => record.status === "approved",
  ).length;
  const averageDuration =
    records.reduce((total, record) => total + record.durationMs, 0) /
    Math.max(records.length, 1);
  const repairRate =
    (records.filter((record) => record.repairLoops > 0).length /
      Math.max(records.length, 1)) *
    100;

  function clearLocalHistory() {
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    setRecords(SAMPLE_HISTORY);
  }

  return (
    <SectionPageShell
      active="history"
      eyebrow="Workspace"
      title="Run history"
    >
      <main className="sectionWorkspace">
        <header className="pageIntro">
          <div>
            <span className="pageKicker">RUN OBSERVABILITY</span>
            <h1>Every agent run, in one place.</h1>
            <p>
              Review outcomes, repair attempts, verification results, and
              approval state. Completed browser runs are saved locally.
            </p>
          </div>
          <Link className="button buttonPrimary" href="/dashboard">
            <Plus size={16} />
            New run
          </Link>
        </header>

        <section className="summaryGrid" aria-label="Run summary">
          <article className="summaryCard">
            <span className="summaryIcon blue">
              <GitBranch size={17} />
            </span>
            <div>
              <small>Total runs</small>
              <strong>{records.length}</strong>
            </div>
            <em>Local + demo fixtures</em>
          </article>
          <article className="summaryCard">
            <span className="summaryIcon green">
              <CheckCircle2 size={17} />
            </span>
            <div>
              <small>Approved</small>
              <strong>{approved}</strong>
            </div>
            <em>{Math.round((approved / records.length) * 100)}% of runs</em>
          </article>
          <article className="summaryCard">
            <span className="summaryIcon violet">
              <Clock3 size={17} />
            </span>
            <div>
              <small>Average duration</small>
              <strong>{formatDuration(averageDuration)}</strong>
            </div>
            <em>End-to-end</em>
          </article>
          <article className="summaryCard">
            <span className="summaryIcon orange">
              <RotateCcw size={17} />
            </span>
            <div>
              <small>Repair rate</small>
              <strong>{Math.round(repairRate)}%</strong>
            </div>
            <em>Recovered automatically</em>
          </article>
        </section>

        <section className="panel historyPanel">
          <div className="historyToolbar">
            <div className="historySearch">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search repository, issue, or run ID"
                aria-label="Search run history"
              />
            </div>
            <div className="historyFilters">
              <Filter size={14} />
              {(
                [
                  ["all", "All"],
                  ["approved", "Approved"],
                  ["awaiting_approval", "Waiting"],
                  ["failed", "Failed"],
                ] as Array<[StatusFilter, string]>
              ).map(([value, label]) => (
                <button
                  className={status === value ? "active" : ""}
                  onClick={() => setStatus(value)}
                  type="button"
                  key={value}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="clearHistory"
              onClick={clearLocalHistory}
              type="button"
            >
              <Trash2 size={14} />
              Clear local
            </button>
          </div>

          <div className="historyTableWrap">
            <table className="historyTable">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Status</th>
                  <th>Mode</th>
                  <th>Verification</th>
                  <th>Duration</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr key={record.runId}>
                    <td>
                      <div className="runIdentity">
                        <span>
                          <FileCode2 size={16} />
                        </span>
                        <div>
                          <strong>{record.issueTitle}</strong>
                          <small>
                            {record.repository} ·{" "}
                            {formatTimestamp(record.createdAt)}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={cn(
                          "statusPill",
                          `status-${record.status}`,
                        )}
                      >
                        <i />
                        {STATUS_LABEL[record.status]}
                      </span>
                    </td>
                    <td>
                      <span className="modePill">
                        {record.mode === "live" ? "Gemini" : "Demo"}
                      </span>
                    </td>
                    <td>
                      <div className="verificationCell">
                        <ShieldCheck size={14} />
                        <span>
                          {record.checksPassed}/{record.checksTotal} passed
                        </span>
                        {record.repairLoops > 0 && (
                          <small>{record.repairLoops} repair</small>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="durationCell">
                        {formatDuration(record.durationMs)}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="tableOpen"
                        href="/dashboard"
                        aria-label={`Open ${record.issueTitle}`}
                      >
                        <ArrowRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="tableEmpty">
                <Search size={22} />
                <strong>No matching runs</strong>
                <span>Try another search or status filter.</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </SectionPageShell>
  );
}
