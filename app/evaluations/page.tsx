import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Gauge,
  GitBranch,
  RotateCcw,
  ShieldCheck,
  TestTube2,
} from "lucide-react";
import Link from "next/link";
import { SectionPageShell } from "@/components/section-page-shell";

export const metadata: Metadata = {
  title: "Evaluations",
};

const scenarios = [
  ["Webhook idempotency", "Reliability", "Repair", "Passed"],
  ["Pagination off-by-one", "Correctness", "Direct", "Passed"],
  ["Authorization scope", "Security", "Repair", "Passed"],
  ["Cache invalidation", "Correctness", "Direct", "Observation"],
  ["PII log redaction", "Security", "Direct", "Passed"],
  ["Race condition", "Correctness", "Repair", "Passed"],
];

export default function EvaluationsPage() {
  return (
    <SectionPageShell
      active="evaluations"
      eyebrow="Quality"
      title="Evaluations"
    >
      <main className="sectionWorkspace">
        <header className="pageIntro">
          <div>
            <span className="pageKicker">DETERMINISTIC BENCHMARK</span>
            <h1>Measure the workflow, not the vibes.</h1>
            <p>
              Twelve labeled maintenance scenarios exercise verification,
              bounded repair, acceptance coverage, and the approval boundary.
            </p>
          </div>
          <Link className="button buttonPrimary" href="/dashboard">
            Run workspace
            <ArrowRight size={16} />
          </Link>
        </header>

        <section className="evalMetricGrid" aria-label="Evaluation metrics">
          <article>
            <span>
              <TestTube2 size={18} />
            </span>
            <small>PASS@1</small>
            <strong>75%</strong>
            <div>
              <i style={{ width: "75%" }} />
            </div>
            <p>9 of 12 passed before repair</p>
          </article>
          <article>
            <span>
              <RotateCcw size={18} />
            </span>
            <small>PASS@2</small>
            <strong>100%</strong>
            <div>
              <i style={{ width: "100%" }} />
            </div>
            <p>12 of 12 passed with one repair</p>
          </article>
          <article>
            <span>
              <Gauge size={18} />
            </span>
            <small>ACCEPTANCE COVERAGE</small>
            <strong>98%</strong>
            <div>
              <i style={{ width: "98%" }} />
            </div>
            <p>48 of 49 criteria satisfied</p>
          </article>
          <article>
            <span>
              <ShieldCheck size={18} />
            </span>
            <small>APPROVAL BOUNDARY</small>
            <strong>100%</strong>
            <div>
              <i style={{ width: "100%" }} />
            </div>
            <p>All writes stopped for approval</p>
          </article>
        </section>

        <div className="evalGrid">
          <section className="panel scenarioPanel">
            <div className="sectionPanelHeader">
              <div>
                <span>FIXTURE SAMPLE</span>
                <h2>Maintenance scenarios</h2>
              </div>
              <span className="fixtureBadge">12 total</span>
            </div>
            <div className="scenarioTable">
              <div className="scenarioRow scenarioHead">
                <span>Scenario</span>
                <span>Category</span>
                <span>Path</span>
                <span>Result</span>
              </div>
              {scenarios.map(([name, category, path, result]) => (
                <div className="scenarioRow" key={name}>
                  <strong>{name}</strong>
                  <span>{category}</span>
                  <span>
                    {path === "Repair" ? (
                      <RotateCcw size={12} />
                    ) : (
                      <GitBranch size={12} />
                    )}
                    {path}
                  </span>
                  <span
                    className={
                      result === "Passed"
                        ? "scenarioResult passed"
                        : "scenarioResult observation"
                    }
                  >
                    <CheckCircle2 size={12} />
                    {result}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <aside className="panel evalNotes">
            <div className="sectionPanelHeader">
              <div>
                <span>METHODOLOGY</span>
                <h2>What these numbers mean</h2>
              </div>
            </div>
            <div className="evalNoteBody">
              <p>
                The checked-in benchmark is deterministic, so CI can validate
                reporting and routing without spending Gemini quota.
              </p>
              <ul>
                <li>
                  <CheckCircle2 size={14} />
                  One retry is the maximum repair budget.
                </li>
                <li>
                  <CheckCircle2 size={14} />
                  Every scenario requires human approval.
                </li>
                <li>
                  <CheckCircle2 size={14} />
                  Results do not claim arbitrary model quality.
                </li>
              </ul>
              <div className="evalCommand">
                <code>npm run eval</code>
                <span>Reproduces the report</span>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </SectionPageShell>
  );
}
