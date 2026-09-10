import assert from "node:assert/strict";
import test from "node:test";
import {
  checksPassed,
  runStaticChecks,
} from "../lib/agent/static-checks";
import type { FileChange } from "../lib/agent/types";

function change(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: "src/example.ts",
    status: "modified",
    additions: 1,
    deletions: 0,
    content: "export const answer = 42;\n",
    patch: "+export const answer = 42;",
    ...overrides,
  };
}

test("safe generated changes pass deterministic checks", () => {
  const checks = runStaticChecks([change()]);
  assert.equal(checksPassed(checks), true);
  assert.equal(checks.filter((item) => item.status === "passed").length, 8);
});

test("unsafe paths are rejected", () => {
  const checks = runStaticChecks([change({ path: "../../.env" })]);
  assert.equal(
    checks.find((item) => item.name === "Path safety")?.status,
    "failed",
  );
});

test("credentials are caught before approval", () => {
  const checks = runStaticChecks([
    change({ content: 'const token = "ghp_abcdefghijklmnopqrstuvwxyz1234";' }),
  ]);
  assert.equal(
    checks.find((item) => item.name === "Secret scan")?.status,
    "failed",
  );
});

test("invalid JSON fails the JSON parser check", () => {
  const checks = runStaticChecks([
    change({ path: "config.json", content: '{"enabled": true,' }),
  ]);
  assert.equal(
    checks.find((item) => item.name === "JSON parse")?.status,
    "failed",
  );
});

test("duplicate paths and no-op patches are rejected", () => {
  const checks = runStaticChecks([
    change({ additions: 0, deletions: 0 }),
    change({ additions: 0, deletions: 0 }),
  ]);
  assert.equal(
    checks.find((item) => item.name === "Unique file paths")?.status,
    "failed",
  );
  assert.equal(
    checks.find((item) => item.name === "Material change")?.status,
    "failed",
  );
});
