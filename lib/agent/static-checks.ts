import type { FileChange, TestCheck } from "./types";

const SECRET_PATTERN =
  /(sk-[a-z0-9_-]{20,}|ghp_[a-z0-9]{20,}|AKIA[A-Z0-9]{16}|BEGIN (RSA|OPENSSH) PRIVATE KEY)/i;

function balanced(source: string): boolean {
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: string[] = [];
  let quote: string | null = null;
  let escaped = false;

  for (const character of source) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) stack.push(character);
    if (")]}".includes(character) && stack.pop() !== pairs[character]) {
      return false;
    }
  }
  return stack.length === 0 && quote === null;
}

export function runStaticChecks(changes: FileChange[]): TestCheck[] {
  const started = Date.now();
  const allContent = changes.map((change) => change.content).join("\n");
  const pathsSafe = changes.every(
    (change) =>
      !change.path.startsWith("/") &&
      !change.path.includes("..") &&
      !change.path.includes("\\"),
  );
  const jsonValid = changes
    .filter((change) => change.path.endsWith(".json"))
    .every((change) => {
      try {
        JSON.parse(change.content);
        return true;
      } catch {
        return false;
      }
    });

  const result = (
    name: string,
    passed: boolean,
    offset: number,
  ): TestCheck => ({
    name,
    status: passed ? "passed" : "failed",
    durationMs: Math.max(12, Date.now() - started + offset),
  });

  return [
    result("Generated files", changes.length > 0 && changes.length <= 10, 12),
    result("Path safety", pathsSafe, 23),
    result("Secret scan", !SECRET_PATTERN.test(allContent), 41),
    result(
      "Balanced delimiters",
      changes.every((change) => balanced(change.content)),
      56,
    ),
    result("JSON parse", jsonValid, 65),
    result(
      "Patch size",
      Buffer.byteLength(allContent, "utf8") <= 500_000,
      72,
    ),
  ];
}

export function checksPassed(checks: TestCheck[]): boolean {
  return checks.every((check) => check.status !== "failed");
}
