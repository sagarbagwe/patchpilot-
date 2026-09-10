"use client";

import {
  Activity,
  AlertCircle,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDotDashed,
  Clock3,
  Code2,
  Copy,
  FileCode2,
  Files,
  Gauge,
  GitBranch,
  Github,
  GitPullRequestArrow,
  Home,
  Info,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Network,
  PanelLeftClose,
  Play,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  TestTube2,
  UserRoundCheck,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { DEFAULT_REQUEST } from "@/lib/agent/demo-data";
import {
  NODE_IDS,
  type AgentNodeEvent,
  type FileChange,
  type NodeId,
  type NodeStatus,
  type RunMode,
  type RunResult,
  type WorkflowEvent,
} from "@/lib/agent/types";
import {
  DEFAULT_MODE_STORAGE_KEY,
  historyRecordFromResult,
  saveHistoryRecord,
  updateHistoryStatus,
} from "@/lib/history";
import { cn, formatDuration } from "@/lib/utils";

const NODE_META: Record<
  NodeId,
  { label: string; description: string; icon: typeof Bot }
> = {
  triage: {
    label: "Triage",
    description: "Risk & acceptance",
    icon: ListChecks,
  },
  repository: {
    label: "Map repository",
    description: "Relevant code paths",
    icon: Search,
  },
  planner: {
    label: "Plan",
    description: "Scoped implementation",
    icon: Network,
  },
  coder: {
    label: "Implement",
    description: "Generate patch",
    icon: Code2,
  },
  tester: {
    label: "Verify",
    description: "Checks & tests",
    icon: TestTube2,
  },
  repair: {
    label: "Repair",
    description: "Failure recovery",
    icon: RotateCcw,
  },
  reviewer: {
    label: "Review",
    description: "Quality & security",
    icon: ShieldCheck,
  },
  approval: {
    label: "Approve",
    description: "Human checkpoint",
    icon: UserRoundCheck,
  },
};

type ActivityItem = {
  id: string;
  timestamp: string;
  status: NodeStatus;
  title: string;
  message: string;
  nodeId?: NodeId;
};

type ResultTab = "changes" | "review" | "plan" | "metrics";
const CLIENT_RUN_TIMEOUT_MS = 280_000;

const emptyStatuses = (): Record<NodeId, NodeStatus> =>
  Object.fromEntries(NODE_IDS.map((id) => [id, "idle"])) as Record<
    NodeId,
    NodeStatus
  >;

function statusIcon(status: NodeStatus) {
  if (status === "running") {
    return <LoaderCircle size={15} className="spin" />;
  }
  if (status === "completed") return <Check size={15} strokeWidth={3} />;
  if (status === "retrying") return <RotateCcw size={14} />;
  if (status === "waiting") return <LockKeyhole size={14} />;
  if (status === "failed") return <X size={14} />;
  return <Circle size={10} />;
}

function formatClock(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DiffLines({ patch }: { patch: string }) {
  return (
    <div
      className="diffCode"
      role="region"
      aria-label="Code diff"
      tabIndex={0}
    >
      {patch.split("\n").map((line, index) => {
        const type = line.startsWith("+")
          ? "addition"
          : line.startsWith("-")
            ? "deletion"
            : line.startsWith("@@")
              ? "hunk"
              : "context";
        return (
          <div className={`diffLine ${type}`} key={`${index}-${line}`}>
            <span className="diffNumber">{index + 1}</span>
            <code>{line || " "}</code>
          </div>
        );
      })}
    </div>
  );
}

function NodeCard({
  nodeId,
  status,
  index,
}: {
  nodeId: NodeId;
  status: NodeStatus;
  index: number;
}) {
  const meta = NODE_META[nodeId];
  const Icon = meta.icon;
  return (
    <div className={cn("agentNode", `status-${status}`)}>
      <div className="agentNodeIcon">
        <Icon size={17} />
      </div>
      <div className="agentNodeCopy">
        <strong>{meta.label}</strong>
        <span>{meta.description}</span>
      </div>
      <span className="agentNodeStatus" role="img" aria-label={status}>
        {status === "idle" ? index + 1 : statusIcon(status)}
      </span>
    </div>
  );
}

export function WorkflowStudio({ autoRun = false }: { autoRun?: boolean }) {
  const [repository, setRepository] = useState(DEFAULT_REQUEST.repository);
  const [issueTitle, setIssueTitle] = useState(DEFAULT_REQUEST.issueTitle);
  const [issueBody, setIssueBody] = useState(DEFAULT_REQUEST.issueBody);
  const [mode, setMode] = useState<RunMode>("demo");
  const [statuses, setStatuses] = useState(emptyStatuses);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("changes");
  const [activeFile, setActiveFile] = useState(0);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalState, setApprovalState] = useState<
    "idle" | "loading" | "done"
  >("idle");
  const [approvalMessage, setApprovalMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const autoStarted = useRef(false);

  const progress = useMemo(() => {
    const finished = Object.values(statuses).filter(
      (status) => status === "completed",
    ).length;
    return Math.round((finished / NODE_IDS.length) * 100);
  }, [statuses]);

  function addActivity(event: AgentNodeEvent, timestamp: string) {
    setActivities((current) => [
      {
        id: `${timestamp}-${event.nodeId}-${Math.random()}`,
        timestamp,
        status: event.status,
        title: event.title,
        message: event.message,
        nodeId: event.nodeId,
      },
      ...current,
    ]);
  }

  function handleEvent(event: WorkflowEvent) {
    if (event.type === "run.started") {
      setActivities([
        {
          id: `${event.timestamp}-start`,
          timestamp: event.timestamp,
          status: "running",
          title: "Run started",
          message: `${event.request.repository} · ${event.request.mode} mode`,
        },
      ]);
      return;
    }

    if (
      event.type === "node.started" ||
      event.type === "node.completed" ||
      event.type === "node.retry"
    ) {
      setStatuses((current) => ({
        ...current,
        [event.node.nodeId]: event.node.status,
      }));
      if (event.type !== "node.started") {
        addActivity(event.node, event.timestamp);
      }
      return;
    }

    if (event.type === "run.completed") {
      setResult(event.result);
      saveHistoryRecord(historyRecordFromResult(event.result));
      setActiveFile(0);
      setRunning(false);
      return;
    }

    if (event.type === "run.failed") {
      setError(event.error);
      setStatuses((current) =>
        Object.fromEntries(
          Object.entries(current).map(([nodeId, status]) => [
            nodeId,
            status === "running" || status === "retrying"
              ? "failed"
              : status,
          ]),
        ) as Record<NodeId, NodeStatus>,
      );
      setRunning(false);
    }
  }

  async function startRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    setActivities([]);
    setStatuses(emptyStatuses());
    setApprovalState("idle");
    setApprovalMessage("");
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(
      () => abortController.abort(),
      CLIENT_RUN_TIMEOUT_MS,
    );
    let receivedTerminalEvent = false;

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, issueTitle, issueBody, mode }),
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Could not start the workflow.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) {
            const event = JSON.parse(line) as WorkflowEvent;
            if (event.type === "run.completed" || event.type === "run.failed") {
              receivedTerminalEvent = true;
            }
            handleEvent(event);
          }
        }
      }
      if (buffer.trim()) {
        const event = JSON.parse(buffer) as WorkflowEvent;
        if (event.type === "run.completed" || event.type === "run.failed") {
          receivedTerminalEvent = true;
        }
        handleEvent(event);
      }
      if (!receivedTerminalEvent) {
        throw new Error(
          "The deployment ended the run before Gemini 3.6 returned a patch. Retry once; no repository write occurred.",
        );
      }
    } catch (runError) {
      setError(
        runError instanceof DOMException && runError.name === "AbortError"
          ? "The run exceeded four minutes and was stopped safely. Retry with a smaller issue; no repository write occurred."
          : runError instanceof Error
            ? runError.message
            : "The workflow failed.",
      );
      setStatuses((current) =>
        Object.fromEntries(
          Object.entries(current).map(([nodeId, status]) => [
            nodeId,
            status === "running" || status === "retrying"
              ? "failed"
              : status,
          ]),
        ) as Record<NodeId, NodeStatus>,
      );
      setRunning(false);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  useEffect(() => {
    if (!autoStarted.current && autoRun) {
      autoStarted.current = true;
      window.setTimeout(() => {
        void startRun();
      }, 350);
    }
  }, [autoRun]);

  useEffect(() => {
    const savedMode = window.localStorage.getItem(DEFAULT_MODE_STORAGE_KEY);
    if (savedMode === "demo" || savedMode === "live") {
      setMode(savedMode);
    }
  }, []);

  async function approvePatch() {
    if (!result) return;
    setApprovalState("loading");
    try {
      const response = await fetch("/api/pull-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: result.request.repository,
          baseBranch: result.repository.defaultBranch,
          branchName: result.branchName,
          title: result.request.issueTitle,
          body: `${result.summary}\n\nGenerated by PatchPilot run ${result.runId}.`,
          changes: result.changes,
          confirmation: "APPROVE",
        }),
      });
      const payload = (await response.json()) as {
        dryRun?: boolean;
        message?: string;
        url?: string;
        number?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Approval failed.");
      setStatuses((current) => ({ ...current, approval: "completed" }));
      updateHistoryStatus(result.runId, "approved");
      setApprovalState("done");
      setApprovalMessage(
        payload.dryRun
          ? payload.message || "Patch approved in dry-run mode."
          : `Draft PR #${payload.number} created: ${payload.url}`,
      );
      setTimeout(() => setApprovalOpen(false), 1100);
    } catch (approvalError) {
      setApprovalState("idle");
      setApprovalMessage(
        approvalError instanceof Error
          ? approvalError.message
          : "Approval failed.",
      );
    }
  }

  const selectedFile: FileChange | undefined = result?.changes[activeFile];

  return (
    <div className="appShell">
      <aside className={cn("appSidebar", sidebarOpen && "sidebarOpen")}>
        <div className="sidebarBrand">
          <Logo href="/dashboard" />
          <button
            className="iconButton mobileOnly"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <nav className="sidebarNav" aria-label="Workspace">
          <Link className="sidebarLink active" href="/dashboard">
            <LayoutDashboard size={17} />
            Workspace
          </Link>
          <Link className="sidebarLink" href="/history">
            <Activity size={17} />
            Run history
            <span className="navCount">Local</span>
          </Link>
          <Link className="sidebarLink" href="/evaluations">
            <BookOpen size={17} />
            Evaluations
          </Link>
          <Link className="sidebarLink" href="/settings">
            <Settings size={17} />
            Settings
          </Link>
        </nav>
        <div className="sidebarSection">
          <span>RECENT REPOSITORIES</span>
          <Link className="sidebarRepoLink" href="/dashboard">
            <span className="repoAvatar">A</span>
            <div>
              <strong>payments-api</strong>
              <small>acme</small>
            </div>
          </Link>
          <Link className="sidebarRepoLink" href="/dashboard">
            <span className="repoAvatar violet">N</span>
            <div>
              <strong>next-dashboard</strong>
              <small>northstar</small>
            </div>
          </Link>
        </div>
        <div className="sidebarBottom">
          <div className="safetyCard">
            <ShieldCheck size={17} />
            <div>
              <strong>Write guard active</strong>
              <span>Approval required</span>
            </div>
          </div>
          <div className="userCard">
            <span>SB</span>
            <div>
              <strong>Sagar Bagwe</strong>
              <small>Personal workspace</small>
            </div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebarScrim"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="appMain">
        <header className="appTopbar">
          <div className="topbarTitle">
            <button
              className="iconButton mobileOnly"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            <div>
              <span>Workspace</span>
              <strong>Issue resolution</strong>
            </div>
          </div>
          <div className="topbarActions">
            <div className="runtimeStatus">
              <i />
              Runtime healthy
            </div>
            <a
              className="iconButton"
              href="https://github.com/sagarbagwe/patchpilot-"
              target="_blank"
              rel="noreferrer"
              aria-label="Open GitHub"
            >
              <Github size={18} />
            </a>
            <Link className="iconButton" href="/" aria-label="Home">
              <Home size={18} />
            </Link>
          </div>
        </header>

        <main className="workspace">
          <section className="runComposer">
            <div className="composerRepository">
              <label htmlFor="repository">Repository</label>
              <div className="inputWithIcon">
                <Github size={16} />
                <input
                  id="repository"
                  value={repository}
                  onChange={(event) => setRepository(event.target.value)}
                  disabled={running}
                  placeholder="owner/repository"
                />
              </div>
            </div>
            <div className="composerIssue">
              <label htmlFor="issueTitle">Issue</label>
              <input
                id="issueTitle"
                value={issueTitle}
                onChange={(event) => setIssueTitle(event.target.value)}
                disabled={running}
              />
              <textarea
                aria-label="Issue description"
                value={issueBody}
                onChange={(event) => setIssueBody(event.target.value)}
                disabled={running}
                rows={2}
              />
            </div>
            <div className="composerActions">
              <div className="modeSwitch" aria-label="Execution mode">
                <button
                  className={mode === "demo" ? "active" : ""}
                  onClick={() => setMode("demo")}
                  disabled={running}
                  type="button"
                >
                  Demo
                </button>
                <button
                  className={mode === "live" ? "active" : ""}
                  onClick={() => setMode("live")}
                  disabled={running}
                  type="button"
                >
                  Gemini
                </button>
              </div>
              <button
                className="button buttonPrimary runButton"
                onClick={startRun}
                disabled={running}
                type="button"
              >
                {running ? (
                  <>
                    <LoaderCircle className="spin" size={17} />
                    Agents working
                  </>
                ) : (
                  <>
                    <Play size={16} fill="currentColor" />
                    Start run
                  </>
                )}
              </button>
            </div>
          </section>

          {error && (
            <div className="errorBanner" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}

          <div className="workspaceGrid">
            <section className="panel workflowPanel">
              <div className="panelHeader">
                <div>
                  <span className="panelEyebrow">AGENT GRAPH</span>
                  <h2>Execution workflow</h2>
                </div>
                <div className="progressMeta">
                  <span>{progress}%</span>
                  <div>
                    <i style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>
              <div className="agentGrid">
                {NODE_IDS.map((nodeId, index) => (
                  <NodeCard
                    nodeId={nodeId}
                    status={statuses[nodeId]}
                    index={index}
                    key={nodeId}
                  />
                ))}
                <span className="repairLoopLabel">
                  <RotateCcw size={11} />
                  conditional retry
                </span>
              </div>
            </section>

            <section className="panel activityPanel">
              <div className="panelHeader">
                <div>
                  <span className="panelEyebrow">LIVE TRACE</span>
                  <h2>Agent activity</h2>
                </div>
                <span className={cn("traceBadge", running && "active")}>
                  <i />
                  {running ? "Streaming" : "Ready"}
                </span>
              </div>
              <div
                className="activityList"
                role="region"
                aria-label="Agent activity"
                aria-live="polite"
                tabIndex={0}
              >
                {activities.length === 0 ? (
                  <div className="emptyActivity">
                    <CircleDotDashed size={24} />
                    <strong>Ready for a new run</strong>
                    <span>Agent events will stream here.</span>
                  </div>
                ) : (
                  activities.slice(0, 7).map((item) => (
                    <div className="activityItem" key={item.id}>
                      <span className={`activityIcon status-${item.status}`}>
                        {statusIcon(item.status)}
                      </span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.message}</p>
                      </div>
                      <time>{formatClock(item.timestamp)}</time>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <section className="panel resultPanel">
            <div className="resultHeader">
              <div className="resultTitle">
                <span
                  className={cn(
                    "resultStatusIcon",
                    result && "resultAvailable",
                  )}
                >
                  {result ? (
                    <CheckCircle2 size={19} />
                  ) : (
                    <FileCode2 size={18} />
                  )}
                </span>
                <div>
                  <h2>{result ? "Patch ready for review" : "Run output"}</h2>
                  <p>
                    {result
                      ? result.summary
                      : "Start a run to inspect changes, checks, and review findings."}
                  </p>
                </div>
              </div>
              {result && (
                <div className="resultActions">
                  <button className="button buttonSecondary" type="button">
                    <Copy size={15} />
                    Copy patch
                  </button>
                  <button
                    className="button buttonPrimary"
                    onClick={() => setApprovalOpen(true)}
                    disabled={approvalState === "done"}
                    type="button"
                  >
                    {approvalState === "done" ? (
                      <Check size={16} />
                    ) : (
                      <GitPullRequestArrow size={16} />
                    )}
                    {approvalState === "done"
                      ? "Approved"
                      : "Approve patch"}
                  </button>
                </div>
              )}
            </div>

            {result ? (
              <>
                <div className="resultTabs" role="tablist">
                  {(
                    [
                      ["changes", `Changes ${result.changes.length}`],
                      ["review", `Review ${result.findings.length}`],
                      ["plan", `Plan ${result.plan.length}`],
                      ["metrics", "Run details"],
                    ] as Array<[ResultTab, string]>
                  ).map(([tab, label]) => (
                    <button
                      className={activeTab === tab ? "active" : ""}
                      onClick={() => setActiveTab(tab)}
                      role="tab"
                      aria-selected={activeTab === tab}
                      key={tab}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="resultBody">
                  {activeTab === "changes" && selectedFile && (
                    <div className="changesView">
                      <div className="fileList">
                        <div className="fileListHeader">
                          <Files size={15} />
                          Files changed
                        </div>
                        {result.changes.map((file, index) => (
                          <button
                            className={activeFile === index ? "active" : ""}
                            onClick={() => setActiveFile(index)}
                            key={file.path}
                            type="button"
                          >
                            <FileCode2 size={15} />
                            <span>{file.path}</span>
                            <small>
                              <b>+{file.additions}</b>
                              <em>−{file.deletions}</em>
                            </small>
                          </button>
                        ))}
                      </div>
                      <div className="diffViewer">
                        <div className="diffHeader">
                          <span>{selectedFile.path}</span>
                          <div>
                            <b>+{selectedFile.additions}</b>
                            <em>−{selectedFile.deletions}</em>
                          </div>
                        </div>
                        <DiffLines patch={selectedFile.patch} />
                      </div>
                    </div>
                  )}

                  {activeTab === "review" && (
                    <div className="reviewView">
                      <div className="reviewScore">
                        <div>
                          <strong>92</strong>
                          <span>/100</span>
                        </div>
                        <h3>Ready with observations</h3>
                        <p>
                          No blocking correctness or security findings were
                          detected.
                        </p>
                      </div>
                      <div className="findingsList">
                        {result.findings.map((finding) => (
                          <div
                            className={`finding ${finding.severity}`}
                            key={`${finding.title}-${finding.file}`}
                          >
                            <span>
                              {finding.severity === "warning" ? (
                                <AlertCircle size={16} />
                              ) : (
                                <Info size={16} />
                              )}
                            </span>
                            <div>
                              <strong>{finding.title}</strong>
                              <p>{finding.detail}</p>
                              {finding.file && (
                                <code>
                                  {finding.file}
                                  {finding.line ? `:${finding.line}` : ""}
                                </code>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === "plan" && (
                    <div className="planView">
                      {result.plan.map((step) => (
                        <div className="planStep" key={step.id}>
                          <span>{step.id}</span>
                          <div>
                            <strong>{step.title}</strong>
                            <p>{step.description}</p>
                            <small>{step.files.join(" · ")}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === "metrics" && (
                    <div className="metricsView">
                      <div className="metricCard">
                        <Clock3 size={18} />
                        <span>Duration</span>
                        <strong>{formatDuration(result.metrics.durationMs)}</strong>
                      </div>
                      <div className="metricCard">
                        <Zap size={18} />
                        <span>Tokens</span>
                        <strong>{result.metrics.tokens.toLocaleString()}</strong>
                      </div>
                      <div className="metricCard">
                        <Gauge size={18} />
                        <span>Est. cost</span>
                        <strong>${result.metrics.estimatedCost.toFixed(4)}</strong>
                      </div>
                      <div className="metricCard">
                        <TestTube2 size={18} />
                        <span>Checks</span>
                        <strong>
                          {result.metrics.checksPassed}/{result.metrics.checksTotal}
                        </strong>
                      </div>
                      <div className="metricCard">
                        <RotateCcw size={18} />
                        <span>Repair loops</span>
                        <strong>{result.metrics.repairLoops}</strong>
                      </div>
                      <div className="metricCard">
                        <FileCode2 size={18} />
                        <span>Files changed</span>
                        <strong>{result.metrics.filesChanged}</strong>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="emptyResult">
                <div>
                  <WandSparkles size={23} />
                </div>
                <strong>Your reviewed patch will appear here</strong>
                <span>
                  The demo includes a failed check, an automatic repair, and a
                  human approval boundary.
                </span>
              </div>
            )}
          </section>
        </main>
      </div>

      {approvalOpen && result && (
        <div className="modalBackdrop" role="presentation">
          <div
            className="approvalModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
          >
            <button
              className="modalClose"
              onClick={() => setApprovalOpen(false)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="modalIcon">
              <GitPullRequestArrow size={22} />
            </div>
            <h2 id="approval-title">Approve this patch?</h2>
            <p>
              PatchPilot will prepare <strong>{result.branchName}</strong> from{" "}
              <strong>{result.repository.defaultBranch}</strong>.
            </p>
            <div className="approvalSummary">
              <span>
                <Files size={15} />
                {result.changes.length} changed files
              </span>
              <span>
                <CheckCircle2 size={15} />
                {result.metrics.checksPassed}/{result.metrics.checksTotal} checks
                passed
              </span>
              <span>
                <ShieldCheck size={15} />0 blocking findings
              </span>
            </div>
            <div className="modalNotice">
              <LockKeyhole size={16} />
              Demo deployments use dry-run mode. No GitHub write occurs unless
              the server owner explicitly enables it.
            </div>
            {approvalMessage && (
              <div className="approvalMessage">{approvalMessage}</div>
            )}
            <div className="modalActions">
              <button
                className="button buttonSecondary"
                onClick={() => setApprovalOpen(false)}
                disabled={approvalState === "loading"}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button buttonPrimary"
                onClick={approvePatch}
                disabled={approvalState !== "idle"}
                type="button"
              >
                {approvalState === "loading" ? (
                  <LoaderCircle className="spin" size={16} />
                ) : approvalState === "done" ? (
                  <Check size={16} />
                ) : (
                  <GitBranch size={16} />
                )}
                {approvalState === "loading"
                  ? "Preparing"
                  : approvalState === "done"
                    ? "Approved"
                    : "Approve & continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
