// Project root discovery and configuration loading (contract: docs/plugin-contracts.md sections 2-3).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";

export const DEFAULTS = Object.freeze({
  schemaVersion: 1,
  mainBranch: "master",
  goalBranchPrefix: "goal/",
  contextWindow: 1000000,
  contextBands: [50, 65, 80],
  usageBands: [85, 95],
  backlogVersion: "1.55.3",
  reviewEveryTasks: 15,
  language: "it",
  secretPaths: [],
  // Opt-in for Maestro's own pilots: the PM collects friction with the plugin in .maestro/reports/maestro-friction.md.
  // Never written into a project's config by `maestro init`.
  frameworkFeedback: false,
  // Post-create step of `maestro worktree` (section 3 of docs/plugin-contracts.md): folders of the main
  // checkout linked into each new worktree, and an optional command run there.
  worktreeSetup: Object.freeze({ link: Object.freeze([]), run: null }),
});

export const CONFIG_PATH = join(".maestro", "config.json");

/**
 * Root of the main checkout, also when called from a linked worktree.
 * Returns null outside a git repository.
 */
export function findProjectRoot(cwd = process.cwd()) {
  const commonDir = gitCommonDir(cwd);
  return commonDir ? dirname(commonDir) : null;
}

/**
 * Absolute git common dir (shared by all worktrees), or null outside a repository.
 * Resolved by reading `.git` entries on disk, without starting git: hooks call this on every
 * prompt and tool call, and on Windows each child process can flash a console window.
 * Honours GIT_CEILING_DIRECTORIES like git does. Falls back to git only for unusual layouts.
 */
export function gitCommonDir(cwd = process.cwd()) {
  const ceilings = (process.env.GIT_CEILING_DIRECTORIES ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((d) => normalizeForCompare(resolve(d)));
  let dir = resolve(cwd);
  for (;;) {
    if (ceilings.includes(normalizeForCompare(dir))) return null;
    const entry = join(dir, ".git");
    let st = null;
    try {
      st = statSync(entry);
    } catch {
      // no .git here
    }
    if (st?.isDirectory()) return entry;
    if (st?.isFile()) return commonDirFromGitFile(dir, entry);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function normalizeForCompare(p) {
  const s = p.replace(/[\\/]+$/, "");
  return process.platform === "win32" ? s.toLowerCase().replace(/\\/g, "/") : s;
}

/** A linked worktree has a `.git` file "gitdir: <common>/worktrees/<name>" whose `commondir` points back. */
function commonDirFromGitFile(dir, file) {
  try {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(file, "utf8"));
    if (m) {
      const gitdir = resolve(dir, m[1]);
      const commondirFile = join(gitdir, "commondir");
      if (existsSync(commondirFile)) return resolve(gitdir, readFileSync(commondirFile, "utf8").trim());
      return gitdir;
    }
  } catch {
    // fall through to git
  }
  try {
    const out = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
    return resolve(out);
  } catch {
    return null;
  }
}

/**
 * Load `.maestro/config.json` merged over DEFAULTS.
 * Returns { root, config, initialized } where initialized is false when the file is missing.
 * Throws on invalid JSON so callers can report it.
 */
export function loadConfig(cwd = process.cwd()) {
  const root = findProjectRoot(cwd);
  if (!root) return { root: null, config: { ...DEFAULTS }, initialized: false };
  const file = join(root, CONFIG_PATH);
  if (!existsSync(file)) return { root, config: { ...DEFAULTS }, initialized: false };
  const raw = readFileSync(file, "utf8").replace(/^﻿/, "");
  const parsed = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${CONFIG_PATH} must contain a JSON object`);
  }
  return { root, config: { ...DEFAULTS, ...parsed }, initialized: true };
}
