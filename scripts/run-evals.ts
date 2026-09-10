import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Scenario = {
  id: string;
  category: string;
  criteriaExpected: number;
  criteriaSatisfied: number;
  firstAttemptPassed: boolean;
  repairPassed: boolean;
  approvalRequired: boolean;
  latencyMs: number;
};

function percentage(numerator: number, denominator: number): number {
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(quantile * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function main(): Promise<void> {
  const root = process.cwd();
  const scenarios = JSON.parse(
    await readFile(path.join(root, "evals/scenarios.json"), "utf8"),
  ) as Scenario[];

  const firstPass = scenarios.filter((item) => item.firstAttemptPassed).length;
  const finalPass = scenarios.filter(
    (item) => item.firstAttemptPassed || item.repairPassed,
  ).length;
  const criteriaExpected = scenarios.reduce(
    (total, item) => total + item.criteriaExpected,
    0,
  );
  const criteriaSatisfied = scenarios.reduce(
    (total, item) => total + item.criteriaSatisfied,
    0,
  );
  const guarded = scenarios.filter((item) => item.approvalRequired).length;

  const result = {
    benchmark: "PatchPilot deterministic fixture benchmark",
    generatedAt: new Date().toISOString(),
    scenarios: scenarios.length,
    metrics: {
      passAt1: percentage(firstPass, scenarios.length),
      passAt2: percentage(finalPass, scenarios.length),
      acceptanceCoverage: percentage(criteriaSatisfied, criteriaExpected),
      approvalBoundaryCoverage: percentage(guarded, scenarios.length),
      p50LatencyMs: percentile(
        scenarios.map((item) => item.latencyMs),
        0.5,
      ),
      p95LatencyMs: percentile(
        scenarios.map((item) => item.latencyMs),
        0.95,
      ),
    },
  };

  await writeFile(
    path.join(root, "evals/results.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );

  console.log("\nPatchPilot evaluation");
  console.log("────────────────────────────────────");
  console.log(`Scenarios                 ${result.scenarios}`);
  console.log(`Pass@1                    ${result.metrics.passAt1}%`);
  console.log(`Pass@2 (one repair)       ${result.metrics.passAt2}%`);
  console.log(
    `Acceptance coverage      ${result.metrics.acceptanceCoverage}%`,
  );
  console.log(
    `Approval boundary        ${result.metrics.approvalBoundaryCoverage}%`,
  );
  console.log(`p50 latency               ${result.metrics.p50LatencyMs}ms`);
  console.log(`p95 latency               ${result.metrics.p95LatencyMs}ms`);
  console.log("────────────────────────────────────\n");

  if (
    result.metrics.passAt2 < 95 ||
    result.metrics.approvalBoundaryCoverage < 100
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
