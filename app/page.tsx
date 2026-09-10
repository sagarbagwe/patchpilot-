import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleDot,
  Code2,
  Eye,
  GitBranch,
  Github,
  Layers3,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
} from "lucide-react";
import { Logo } from "@/components/logo";

const workflowSteps = [
  ["01", "Triage", "Define risk and done"],
  ["02", "Map", "Find relevant code"],
  ["03", "Plan", "Scope the change"],
  ["04", "Build", "Generate the patch"],
  ["05", "Verify", "Test and repair"],
  ["06", "Review", "Check quality"],
];

export default function HomePage() {
  return (
    <main className="landing">
      <header className="siteNav">
        <Logo />
        <nav className="navLinks" aria-label="Main navigation">
          <a href="#workflow">Workflow</a>
          <a href="#architecture">Architecture</a>
          <a
            href="https://github.com/sagarbagwe/patchpilot-"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
        <Link className="button buttonDark buttonSmall" href="/dashboard">
          Open workspace
          <ArrowRight size={15} />
        </Link>
      </header>

      <section className="hero">
        <div className="heroCopy">
          <div className="eyebrow">
            <span className="eyebrowDot" />
            Observable agentic software engineering
          </div>
          <h1>
            From issue to
            <br />
            <span>reviewed patch.</span>
          </h1>
          <p>
            PatchPilot maps your repository, plans the smallest safe change,
            writes the patch, verifies it, and pauses for your approval.
          </p>
          <div className="heroActions">
            <Link className="button buttonPrimary" href="/dashboard">
              <Play size={16} fill="currentColor" />
              Run the live demo
            </Link>
            <a
              className="button buttonSecondary"
              href="https://github.com/sagarbagwe/patchpilot-"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={17} />
              View source
            </a>
          </div>
          <div className="heroProof">
            <span>
              <Check size={14} /> No key needed for demo
            </span>
            <span>
              <Check size={14} /> Human approval by default
            </span>
          </div>
        </div>

        <div className="heroProduct" aria-label="PatchPilot product preview">
          <div className="productChrome">
            <div className="chromeDots" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <span>Run #PP-184</span>
            <span className="liveIndicator">
              <i /> Live
            </span>
          </div>
          <div className="productBody">
            <div className="previewHeader">
              <div>
                <span className="previewLabel">ACME / PAYMENTS-API</span>
                <strong>Prevent duplicate webhook processing</strong>
              </div>
              <span className="riskTag">Medium risk</span>
            </div>
            <div className="previewFlow">
              {[
                ["Triage", "done"],
                ["Map repo", "done"],
                ["Plan", "done"],
                ["Implement", "active"],
                ["Verify", "idle"],
              ].map(([label, state], index) => (
                <div className={`previewNode ${state}`} key={label}>
                  <span>
                    {state === "done" ? (
                      <Check size={11} strokeWidth={3} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {label}
                </div>
              ))}
            </div>
            <div className="previewSplit">
              <div className="previewTerminal">
                <div className="previewPanelTitle">
                  <TerminalSquare size={14} />
                  Agent activity
                </div>
                <p>
                  <i className="successDot" />
                  Repository mapped
                  <span>146 files</span>
                </p>
                <p>
                  <i className="successDot" />
                  Plan approved by verifier
                  <span>3 steps</span>
                </p>
                <p className="activeLog">
                  <i />
                  Writing idempotency guard…
                </p>
              </div>
              <div className="previewDiff">
                <div className="previewPanelTitle">
                  <Code2 size={14} />
                  route.ts
                  <span>+20 −3</span>
                </div>
                <code>
                  <b>+ const claimed = await</b>
                  <b>+ claimEvent(event.id);</b>
                  <em> </em>
                  <b>+ if (!claimed) &#123;</b>
                  <b>+ &nbsp;return duplicate();</b>
                  <b>+ &#125;</b>
                </code>
              </div>
            </div>
          </div>
          <div className="productFooter">
            <span>
              <CircleDot size={13} /> 4 of 8 agents complete
            </span>
            <span>2.4s elapsed</span>
          </div>
        </div>
      </section>

      <section className="proofStrip" aria-label="Product highlights">
        <div>
          <strong>8</strong>
          <span>specialized nodes</span>
        </div>
        <div>
          <strong>1</strong>
          <span>repair loop</span>
        </div>
        <div>
          <strong>100%</strong>
          <span>visible decisions</span>
        </div>
        <div>
          <strong>0</strong>
          <span>writes before approval</span>
        </div>
      </section>

      <section className="workflowSection" id="workflow">
        <div className="sectionHeading">
          <span>THE WORKFLOW</span>
          <h2>Agency with a clear control plane.</h2>
          <p>
            Each agent has one job, a typed output, and a visible place in the
            execution graph.
          </p>
        </div>
        <div className="stepGrid">
          {workflowSteps.map(([number, title, description], index) => (
            <article className="stepCard" key={number}>
              <div className="stepTop">
                <span>{number}</span>
                {index === 4 ? (
                  <RotateCcw size={18} />
                ) : index === 5 ? (
                  <ShieldCheck size={18} />
                ) : (
                  <ArrowRight size={18} />
                )}
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="architectureSection" id="architecture">
        <div className="architectureCopy">
          <span className="sectionKicker">BUILT FOR THE REAL WORLD</span>
          <h2>More than a prompt wrapped in a dashboard.</h2>
          <p>
            A typed state graph coordinates tool use, recovery, review, and the
            approval boundary. Every run produces an inspectable artifact.
          </p>
          <ul>
            <li>
              <Workflow size={17} />
              Stateful LangGraph orchestration
            </li>
            <li>
              <Eye size={17} />
              Streaming events and run observability
            </li>
            <li>
              <ShieldCheck size={17} />
              Path validation, secret scans, and write guardrails
            </li>
            <li>
              <GitBranch size={17} />
              Draft pull request integration
            </li>
          </ul>
        </div>
        <div className="architectureDiagram">
          <div className="diagramLabel">PATCHPILOT RUNTIME</div>
          <div className="diagramRow">
            <span>
              <Layers3 size={18} /> Next.js UI
            </span>
            <ArrowRight size={16} />
            <span>
              <Workflow size={18} /> Agent graph
            </span>
          </div>
          <div className="diagramTools">
            <span>GitHub API</span>
            <span>Google Gemini</span>
            <span>Static checks</span>
          </div>
          <div className="diagramDivider">
            <i />
            <b>Human approval boundary</b>
            <i />
          </div>
          <div className="diagramOutput">
            <ShieldCheck size={24} />
            <div>
              <strong>Reviewed draft PR</strong>
              <small>No repository write occurs before approval.</small>
            </div>
          </div>
        </div>
      </section>

      <section className="finalCta">
        <div>
          <Sparkles size={20} />
          <span>Try the complete repair loop</span>
        </div>
        <h2>Watch the agents do the work. Keep the final say.</h2>
        <Link className="button buttonLight" href="/dashboard">
          Launch PatchPilot
          <ArrowRight size={17} />
        </Link>
      </section>

      <footer className="siteFooter">
        <Logo />
        <p>Built as a production-minded agent engineering portfolio project.</p>
        <span>MIT · 2026</span>
      </footer>
    </main>
  );
}
