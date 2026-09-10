import { Octokit } from "@octokit/rest";
import type { FileChange } from "@/lib/agent/types";
import { parseRepository } from "@/lib/utils";

const TEXT_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|css|scss|md|json|ya?ml|toml|sql)$/i;
const IGNORED_PATH =
  /(^|\/)(node_modules|dist|build|coverage|vendor|\.next|generated)(\/|$)/i;

export interface RepositorySnapshot {
  defaultBranch: string;
  language: string;
  filesScanned: number;
  files: Array<{ path: string; content: string }>;
}

function octokit(): Octokit {
  return new Octokit({
    auth: process.env.GITHUB_TOKEN || undefined,
    userAgent: "patchpilot/1.0",
  });
}

function rankPath(path: string, issue: string): number {
  const terms = issue
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3);
  const lower = path.toLowerCase();
  return terms.reduce(
    (score, term) => score + (lower.includes(term) ? 3 : 0),
    path.includes("test") || path.includes("spec") ? 1 : 0,
  );
}

export async function loadRepositorySnapshot(
  repository: string,
  issue: string,
): Promise<RepositorySnapshot> {
  const { owner, repo } = parseRepository(repository);
  const client = octokit();
  const { data: metadata } = await client.repos.get({ owner, repo });
  const { data: branch } = await client.repos.getBranch({
    owner,
    repo,
    branch: metadata.default_branch,
  });
  const { data: tree } = await client.git.getTree({
    owner,
    repo,
    tree_sha: branch.commit.sha,
    recursive: "true",
  });

  const candidates = tree.tree
    .filter(
      (entry) =>
        entry.type === "blob" &&
        typeof entry.path === "string" &&
        TEXT_FILE.test(entry.path) &&
        !IGNORED_PATH.test(entry.path) &&
        (entry.size ?? 0) < 60_000,
    )
    .sort(
      (a, b) =>
        rankPath(b.path ?? "", issue) - rankPath(a.path ?? "", issue),
    )
    .slice(0, 10);

  const files = await Promise.all(
    candidates.map(async (entry) => {
      const { data } = await client.repos.getContent({
        owner,
        repo,
        path: entry.path ?? "",
        ref: metadata.default_branch,
      });
      if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
        return null;
      }
      return {
        path: entry.path ?? "",
        content: Buffer.from(data.content, "base64")
          .toString("utf8")
          .slice(0, 18_000),
      };
    }),
  );

  return {
    defaultBranch: metadata.default_branch,
    language: metadata.language || "Unknown",
    filesScanned: tree.tree.length,
    files: files.filter(
      (file): file is { path: string; content: string } => file !== null,
    ),
  };
}

function validateChanges(changes: FileChange[]): void {
  if (changes.length === 0 || changes.length > 10) {
    throw new Error("A pull request must contain between 1 and 10 files.");
  }

  for (const change of changes) {
    if (
      change.path.startsWith("/") ||
      change.path.includes("..") ||
      change.path.includes("\\")
    ) {
      throw new Error(`Unsafe file path: ${change.path}`);
    }
    if (Buffer.byteLength(change.content, "utf8") > 150_000) {
      throw new Error(`File is too large: ${change.path}`);
    }
  }
}

export async function createDraftPullRequest(input: {
  repository: string;
  baseBranch: string;
  branchName: string;
  title: string;
  body: string;
  changes: FileChange[];
}): Promise<{ url: string; number: number; branch: string }> {
  if (process.env.PATCHPILOT_ENABLE_WRITES !== "true") {
    throw new Error("GitHub writes are disabled by PATCHPILOT_ENABLE_WRITES.");
  }
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required to create a pull request.");
  }

  validateChanges(input.changes);
  const { owner, repo } = parseRepository(input.repository);
  const client = octokit();
  const branch = `${input.branchName}-${Date.now().toString(36)}`;
  const { data: baseRef } = await client.git.getRef({
    owner,
    repo,
    ref: `heads/${input.baseBranch}`,
  });
  const baseSha = baseRef.object.sha;
  const { data: baseCommit } = await client.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha,
  });

  const treeEntries = await Promise.all(
    input.changes.map(async (change) => {
      if (change.status === "deleted") {
        return {
          path: change.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: null,
        };
      }
      const { data: blob } = await client.git.createBlob({
        owner,
        repo,
        content: change.content,
        encoding: "utf-8",
      });
      return {
        path: change.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    }),
  );

  const { data: tree } = await client.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree: treeEntries,
  });
  const { data: commit } = await client.git.createCommit({
    owner,
    repo,
    message: input.title,
    tree: tree.sha,
    parents: [baseSha],
  });
  await client.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: commit.sha,
  });
  const { data: pull } = await client.pulls.create({
    owner,
    repo,
    head: branch,
    base: input.baseBranch,
    title: input.title,
    body: input.body,
    draft: true,
  });

  return { url: pull.html_url, number: pull.number, branch };
}
