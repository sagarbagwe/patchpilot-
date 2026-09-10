"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Github,
  KeyRound,
  LockKeyhole,
  Server,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SectionPageShell } from "./section-page-shell";
import {
  DEFAULT_MODE_STORAGE_KEY,
} from "@/lib/history";
import type { RunMode } from "@/lib/agent/types";

type Health = {
  status: string;
  provider: string;
  model: string;
  liveMode: boolean;
  githubAuthenticated: boolean;
  githubWrites: boolean;
};

const ENVIRONMENT_VARIABLES = [
  {
    name: "GOOGLE_GENERATIVE_AI_API_KEY",
    description: "Variable name only — the secret value stays inside Vercel",
    secret: true,
  },
  {
    name: "GEMINI_MODEL",
    description: "gemini-3.6-flash",
    secret: false,
  },
  {
    name: "PATCHPILOT_ENABLE_WRITES",
    description: "Keep false until draft PR creation is required",
    secret: false,
  },
];

export function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [defaultMode, setDefaultMode] = useState<RunMode>("demo");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(DEFAULT_MODE_STORAGE_KEY);
    if (stored === "demo" || stored === "live") setDefaultMode(stored);

    void fetch("/api/health")
      .then((response) => response.json())
      .then((value: Health) => setHealth(value))
      .catch(() => setHealth(null));
  }, []);

  function chooseMode(mode: RunMode) {
    setDefaultMode(mode);
    window.localStorage.setItem(DEFAULT_MODE_STORAGE_KEY, mode);
  }

  async function copyVariable(name: string) {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(name);
      window.setTimeout(() => setCopied(""), 1200);
    } catch {
      setCopied("");
    }
  }

  return (
    <SectionPageShell active="settings" eyebrow="Workspace" title="Settings">
      <main className="sectionWorkspace">
        <header className="pageIntro">
          <div>
            <span className="pageKicker">RUNTIME CONFIGURATION</span>
            <h1>Safe defaults, visible configuration.</h1>
            <p>
              Browser preferences are stored locally. Secrets and repository
              write access remain controlled by Vercel environment variables.
            </p>
          </div>
          <a
            className="button buttonSecondary"
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            Open Vercel
            <ExternalLink size={15} />
          </a>
        </header>

        <div className="settingsGrid">
          <section className="panel settingsCard providerCard">
            <div className="settingsCardHeader">
              <span className="summaryIcon blue">
                <Sparkles size={17} />
              </span>
              <div>
                <small>AI PROVIDER</small>
                <h2>Google Gemini</h2>
              </div>
              <span
                className={
                  health?.liveMode
                    ? "configStatus configured"
                    : "configStatus missing"
                }
              >
                <i />
                {health?.liveMode ? "Configured" : "Key missing"}
              </span>
            </div>
            <div className="settingsRows">
              <div className="settingRow">
                <span>Provider</span>
                <strong>{health?.provider || "google-gemini"}</strong>
              </div>
              <div className="settingRow">
                <span>Model</span>
                <strong>{health?.model || "gemini-3.6-flash"}</strong>
              </div>
              <div className="settingRow">
                <span>API key</span>
                <strong>
                  {health?.liveMode ? "Present on server" : "Not configured"}
                </strong>
              </div>
            </div>
            {!health?.liveMode && (
              <div className="settingsNotice">
                <KeyRound size={16} />
                Add `GOOGLE_GENERATIVE_AI_API_KEY` in Vercel, then redeploy.
              </div>
            )}
          </section>

          <section className="panel settingsCard">
            <div className="settingsCardHeader">
              <span className="summaryIcon violet">
                <Server size={17} />
              </span>
              <div>
                <small>WORKSPACE PREFERENCE</small>
                <h2>Default run mode</h2>
              </div>
            </div>
            <p className="settingsDescription">
              Choose which mode is selected when this browser opens the
              workspace.
            </p>
            <div className="largeModeSwitch">
              <button
                className={defaultMode === "demo" ? "active" : ""}
                onClick={() => chooseMode("demo")}
                type="button"
              >
                <ShieldCheck size={17} />
                <span>
                  <strong>Demo</strong>
                  <small>No external API usage</small>
                </span>
                {defaultMode === "demo" && <Check size={16} />}
              </button>
              <button
                className={defaultMode === "live" ? "active" : ""}
                onClick={() => chooseMode("live")}
                type="button"
              >
                <Sparkles size={17} />
                <span>
                  <strong>Gemini</strong>
                  <small>Use deployed Gemini key</small>
                </span>
                {defaultMode === "live" && <Check size={16} />}
              </button>
            </div>
          </section>

          <section className="panel settingsCard">
            <div className="settingsCardHeader">
              <span className="summaryIcon green">
                <Github size={17} />
              </span>
              <div>
                <small>GITHUB ACCESS</small>
                <h2>Repository permissions</h2>
              </div>
            </div>
            <div className="permissionState">
              <div>
                <CheckCircle2 size={17} />
                <span>
                  <strong>Public repository reads</strong>
                  <small>Available without a GitHub token</small>
                </span>
              </div>
              <div className={health?.githubAuthenticated ? "" : "muted"}>
                <KeyRound size={17} />
                <span>
                  <strong>Authenticated reads</strong>
                  <small>
                    {health?.githubAuthenticated
                      ? "GitHub token configured"
                      : "Optional GITHUB_TOKEN missing"}
                  </small>
                </span>
              </div>
              <div className={health?.githubWrites ? "riskEnabled" : ""}>
                <LockKeyhole size={17} />
                <span>
                  <strong>Repository writes</strong>
                  <small>
                    {health?.githubWrites
                      ? "Enabled — approvals create draft PRs"
                      : "Disabled — approval remains a dry run"}
                  </small>
                </span>
              </div>
            </div>
          </section>

          <section className="panel settingsCard envCard">
            <div className="settingsCardHeader">
              <span className="summaryIcon orange">
                <LockKeyhole size={17} />
              </span>
              <div>
                <small>VERCEL</small>
                <h2>Environment variables</h2>
              </div>
            </div>
            <div className="environmentList">
              {ENVIRONMENT_VARIABLES.map((variable) => (
                <div key={variable.name}>
                  <span>
                    <code>{variable.name}</code>
                    {variable.secret && <small>SECRET</small>}
                  </span>
                  <p>{variable.description}</p>
                  <button
                    onClick={() => void copyVariable(variable.name)}
                    type="button"
                    aria-label={`Copy variable name ${variable.name}`}
                    title="Copies the variable name, never its secret value"
                  >
                    {copied === variable.name ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                    <span>
                      {copied === variable.name ? "Copied" : "Copy name"}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </SectionPageShell>
  );
}
