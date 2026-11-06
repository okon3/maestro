// Git helpers (contract: docs/plugin-contracts.md section 6, worktree command).
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** Run git with an argument array; returns trimmed stdout, throws with git's stderr on failure. */
export function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    throw new Error(`git ${args.join(" ")} failed: ${String(e.stderr ?? e.message).trim()}`);
  }
}

export function branchExists(cwd, branch) {
  return refExists(cwd, `refs/heads/${branch}`);
}

/** True when a full ref (e.g. refs/remotes/origin/goal/TASK-3) exists. */
export function refExists(cwd, ref) {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", ref], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Branch checked out in the worktree at `path`, or null if no such worktree is registered. */
export function worktreeBranch(cwd, path) {
  const want = norm(path);
  let current = null;
  for (const line of git(cwd, ["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree ")) current = { path: line.slice(9), branch: null };
    else if (line.startsWith("branch ") && current) current.branch = line.slice(7).replace(/^refs\/heads\//, "");
    else if (line === "" && current) {
      if (norm(current.path) === want) return current.branch;
      current = null;
    }
  }
  if (current && norm(current.path) === want) return current.branch;
  return null;
}

export const worktreePath = (root, name) => join(root, ".claude", "worktrees", name);

const norm = (p) => p.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
