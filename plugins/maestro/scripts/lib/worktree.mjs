// Worktree setup and safe removal (contract: docs/plugin-contracts.md sections 3 and 6).
// Setup links folders of the main checkout (usually node_modules) into a new worktree: a directory
// junction on Windows (no admin rights needed), a symlink elsewhere. Removal unlinks them first and never
// deletes recursively through a link, so the main checkout's folders always survive.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { git } from "./git.mjs";

export const LINK_TYPE = process.platform === "win32" ? "junction" : "dir";
export const LINKS_RECORD = "maestro-links.json";
const RUN_TIMEOUT_MS = 30 * 60 * 1000;

const lstatOrNull = (p) => {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
};
const statOrNull = (p) => {
  try {
    return statSync(p);
  } catch {
    return null;
  }
};
const samePath = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Validate `config.worktreeSetup` and return `{ link: [relative folder], run: string|null }`. Throws on bad shapes. */
export function normalizeSetup(value) {
  if (value === undefined || value === null) return { link: [], run: null };
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("worktreeSetup must be an object { link, run }");
  const link = value.link ?? [];
  if (!Array.isArray(link)) throw new Error("worktreeSetup.link must be an array of folder paths");
  const entries = link.map((e) => {
    if (typeof e !== "string") throw new Error("worktreeSetup.link entries must be strings");
    const clean = e.trim().replaceAll("\\", "/").replace(/^(\.\/)+/, "").replace(/\/+$/, "");
    const parts = clean.split("/");
    if (!clean || isAbsolute(e.trim()) || /^[A-Za-z]:/.test(clean) || parts.includes("..") || parts.includes(".") || parts[0] === ".git") {
      throw new Error(`worktreeSetup.link entry must be a relative folder inside the project: ${JSON.stringify(e)}`);
    }
    return clean;
  });
  const run = value.run ?? null;
  if (run !== null && (typeof run !== "string" || !run.trim())) throw new Error("worktreeSetup.run must be a command string or null");
  return { link: [...new Set(entries)], run };
}

/** Git admin dir of a linked worktree (`<common>/worktrees/<name>`), read from its `.git` file; null if absent. */
export function worktreeGitDir(path) {
  try {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(join(path, ".git"), "utf8"));
    return m ? resolve(path, m[1]) : null;
  } catch {
    return null;
  }
}

/** Entries linked by an earlier setup, recorded in the worktree's git admin dir (removed with the worktree). */
export function recordedLinks(path) {
  const dir = worktreeGitDir(path);
  if (!dir) return [];
  try {
    const list = JSON.parse(readFileSync(join(dir, LINKS_RECORD), "utf8"));
    return Array.isArray(list) ? list.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function recordLinks(path, entries) {
  const dir = worktreeGitDir(path);
  if (!dir || !existsSync(dir)) return;
  const all = [...new Set([...recordedLinks(path), ...entries])];
  writeFileSync(join(dir, LINKS_RECORD), JSON.stringify(all));
}

/** True when git ignores `entry` in the worktree (an untracked, unignored link would show up in `git status`). */
function isIgnored(path, entry) {
  try {
    return git(path, ["status", "--porcelain", "--untracked-files=normal", "--", entry]) === "";
  } catch {
    return false;
  }
}

/**
 * Apply the post-create step to the worktree at `path`: link each `setup.link` folder of the main checkout
 * `root` (when it exists there), then run `setup.run` in the worktree unless `runCommand` is false.
 * Returns `{ linked, warnings, run }`; `run` is `{ command, status, error }` or null.
 */
export function applySetup(root, path, setup, { runCommand = true } = {}) {
  const linked = [];
  const warnings = [];
  for (const entry of setup.link) {
    const source = join(root, entry);
    const dest = join(path, entry);
    const src = statOrNull(source);
    if (!src) {
      warnings.push(`${entry}: missing in the main checkout, not linked (install it there first)`);
      continue;
    }
    if (!src.isDirectory()) {
      warnings.push(`${entry}: not a folder in the main checkout, not linked`);
      continue;
    }
    const existing = lstatOrNull(dest);
    if (existing) {
      if (existing.isSymbolicLink() && samePath(realpathSync(dest), realpathSync(source))) linked.push(entry);
      else warnings.push(`${entry}: already exists in the worktree, left as it is`);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    symlinkSync(source, dest, LINK_TYPE);
    linked.push(entry);
    if (!isIgnored(path, entry)) {
      warnings.push(`${entry}: linked but not ignored by git in the worktree; add "${entry}" to .gitignore (no trailing slash, so it also matches a link), or "git add -A" would commit the link`);
    }
  }
  if (linked.length) recordLinks(path, linked);
  let run = null;
  if (setup.run && runCommand) {
    const r = spawnSync(setup.run, {
      cwd: path,
      shell: true,
      stdio: ["ignore", 2, 2],
      timeout: RUN_TIMEOUT_MS,
      env: { ...process.env, MAESTRO_MAIN_CHECKOUT: root, MAESTRO_WORKTREE: path },
      windowsHide: true,
    });
    run = { command: setup.run, status: r.status, error: r.error ? r.error.message : null };
  }
  return { linked, warnings, run };
}

/** Untracked links (junctions or symlinks) at the top level of the worktree, e.g. linked by hand. */
function topLevelLinks(path) {
  let names;
  try {
    names = readdirSync(path).filter((n) => n !== ".git" && lstatOrNull(join(path, n))?.isSymbolicLink());
  } catch {
    return [];
  }
  if (!names.length) return [];
  let tracked = [];
  try {
    tracked = git(path, ["ls-files", "--", ...names]).split("\n").filter(Boolean);
  } catch {
    return [];
  }
  return names.filter((n) => !tracked.includes(n));
}

/**
 * Unlink, without following them, the links of the worktree at `path`: configured entries, entries
 * recorded by the setup and untracked top-level links. Only symbolic links and junctions are touched;
 * a real folder at a configured path is left to `git worktree remove`. Returns `[{ entry, target }]`.
 */
export function removeLinks(path, configured = []) {
  const removed = [];
  for (const entry of new Set([...configured, ...recordedLinks(path), ...topLevelLinks(path)])) {
    const p = join(path, entry);
    if (!lstatOrNull(p)?.isSymbolicLink()) continue;
    let target = null;
    try {
      target = realpathSync(p);
    } catch {
      // dangling link: nothing to restore
    }
    unlinkSync(p); // removes the link itself (a junction on Windows), never the target's contents
    removed.push({ entry, target });
  }
  return removed;
}

/** Put back links removed by `removeLinks` (after a failed `git worktree remove`), where nothing took their place. */
export function restoreLinks(path, removed) {
  for (const { entry, target } of removed) {
    const p = join(path, entry);
    if (!target || !existsSync(target) || lstatOrNull(p) || !existsSync(dirname(p))) continue;
    try {
      symlinkSync(target, p, LINK_TYPE);
    } catch {
      // best effort: `maestro worktree <name> --reuse` links the configured folders again
    }
  }
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Windows only: a running process whose current folder is inside the worktree (a dev or preview server, a
 * terminal) makes `git worktree remove` fail halfway, after deleting part of the files. Renaming the folder
 * fails in the same cases, so a rename and rename back detects it before anything is deleted.
 * Returns the error code when the folder is busy, null otherwise (always null elsewhere).
 */
export function worktreeBusy(path) {
  if (process.platform !== "win32") return null;
  const probe = `${path}.maestro-probe`;
  let code = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      renameSync(path, probe);
    } catch (e) {
      code = e.code ?? "EBUSY";
      sleepSync(300);
      continue;
    }
    for (let back = 0; ; back++) {
      try {
        renameSync(probe, path);
        return null;
      } catch (e) {
        if (back >= 9) throw new Error(`the worktree was moved to ${probe} while probing it and could not be moved back (${e.code}); rename it back to ${path}`);
        sleepSync(200);
      }
    }
  }
  return code;
}

/** True when `inner` is `outer` or inside it. */
export function isInside(inner, outer) {
  const rel = relative(resolve(outer), resolve(inner));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Human explanation of a failed `git worktree remove`. */
export function explainRemoveFailure(message, name) {
  if (/modified or untracked files/i.test(message)) {
    return `the worktree has uncommitted changes or untracked files. Commit or save what matters, then run \`maestro worktree ${name} --remove --force\` to discard the rest (links are removed first, so --force cannot reach the main checkout through them).`;
  }
  if (/is locked|locked working tree/i.test(message)) {
    return "the worktree is locked with `git worktree lock`; unlock it with `git worktree unlock` if no one uses it, then retry.";
  }
  return `a process still holds files in the worktree: a dev or preview server (vite, npm run dev or preview), a test watcher, or a terminal or editor whose current folder is inside it. Stop it, then run \`maestro worktree ${name} --remove\` again.`;
}
