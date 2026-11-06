// Project root discovery and configuration loading (contract: docs/plugin-contracts.md sections 2-3).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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

/** Absolute git common dir (shared by all worktrees), or null outside a repository. */
export function gitCommonDir(cwd = process.cwd()) {
  try {
    const out = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
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
