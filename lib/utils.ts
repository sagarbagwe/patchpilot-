export function cn(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function parseRepository(value: string): {
  owner: string;
  repo: string;
  slug: string;
} {
  const normalized = value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");

  const [owner, repo, ...rest] = normalized.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new Error("Use a GitHub URL or owner/repository.");
  }

  const validPart = /^[A-Za-z0-9_.-]+$/;
  if (!validPart.test(owner) || !validPart.test(repo)) {
    throw new Error("Repository contains unsupported characters.");
  }

  return { owner, repo, slug: `${owner}/${repo}` };
}

export function makeId(prefix = "run"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
