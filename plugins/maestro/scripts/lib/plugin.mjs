// Which plugin version this session runs, against the installed one (`maestro doctor`, docs/plugin-contracts.md
// section 6). Claude Code loads a plugin's skills, agents and `bin/` from its cache folder at session start; an update
// installed mid-session lands in a new folder and takes effect only after `/reload-plugins` or a restart.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

export const PLUGIN_ID = "maestro@okon3";
const COMPARED = ["skills", "agents"];

/** `CLAUDE_CONFIG_DIR` (Claude Code's own override) or `~/.claude`. */
export const claudeConfigDir = (env = process.env) => env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

const norm = (p) => {
  const r = resolve(p).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? r.toLowerCase() : r;
};
const inside = (child, parent) => {
  const rel = relative(norm(parent), norm(child));
  return !rel.startsWith("..") && !isAbsolute(rel);
};

/** The registry entry for this project: a project or local install for `projectRoot`, else the user install. */
function installedEntry(configDir, projectRoot) {
  const file = join(configDir, "plugins", "installed_plugins.json");
  if (!existsSync(file)) return null;
  const registry = JSON.parse(readFileSync(file, "utf8"));
  const entries = registry?.plugins?.[PLUGIN_ID];
  if (!Array.isArray(entries) || !entries.length) return null;
  const forProject = projectRoot && entries.find((e) => e?.projectPath && ["project", "local"].includes(e.scope) && norm(e.projectPath) === norm(projectRoot));
  return forProject ?? entries.find((e) => e?.scope === "user") ?? null;
}

/** Relative paths of all files under `dir`, with `/` separators. */
function listFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(path, base, out);
    else if (entry.isFile()) out.push(relative(base, path).replaceAll("\\", "/"));
  }
  return out;
}

/** Skills and agents files that differ between two plugin roots: `[{file, change: "added"|"removed"|"changed"}]`. */
export function changedPluginFiles(fromRoot, toRoot) {
  const files = (root) => {
    const all = new Set();
    for (const top of COMPARED) if (existsSync(join(root, top))) for (const f of listFiles(join(root, top))) all.add(`${top}/${f}`);
    return all;
  };
  const a = files(fromRoot);
  const b = files(toRoot);
  const changes = [];
  for (const f of [...new Set([...a, ...b])].sort()) {
    if (!a.has(f)) changes.push({ file: f, change: "added" });
    else if (!b.has(f)) changes.push({ file: f, change: "removed" });
    else if (!readFileSync(join(fromRoot, f)).equals(readFileSync(join(toRoot, f)))) changes.push({ file: f, change: "changed" });
  }
  return changes;
}

/**
 * Compare the plugin root of the running CLI with the installed version for this project.
 * Returns `{status, running, installed, runningVersion, installedVersion, changes, note}` where status is
 * "same" (session runs the installed version), "differs" (an update is installed but not loaded in this session),
 * "dev" (running from a checkout, not from the plugin cache), "not-installed" or "unknown" (registry unreadable).
 * Never throws.
 */
export function pluginVersionCheck({ runningRoot, projectRoot, configDir = claudeConfigDir() }) {
  const result = { status: "unknown", running: runningRoot, installed: null, runningVersion: basename(resolve(runningRoot)), installedVersion: null, changes: [], note: null };
  // Not under the plugin cache: a checkout (`--plugin-dir`, or the CLI run by path); the registry does not apply.
  if (!inside(runningRoot, join(configDir, "plugins", "cache"))) {
    result.status = "dev";
    return result;
  }
  let entry;
  try {
    entry = installedEntry(configDir, projectRoot);
  } catch (e) {
    result.note = `cannot read installed_plugins.json: ${e.message}`;
    return result;
  }
  if (!entry || !entry.installPath) {
    result.status = "not-installed";
    return result;
  }
  result.installed = entry.installPath;
  result.installedVersion = entry.version ?? basename(resolve(entry.installPath));
  if (norm(entry.installPath) === norm(runningRoot)) {
    result.status = "same";
    return result;
  }
  result.status = "differs";
  try {
    if (!existsSync(entry.installPath)) result.note = `installed folder missing: ${entry.installPath}`;
    else if (!existsSync(runningRoot)) result.note = `running folder missing: ${runningRoot}`;
    else result.changes = changedPluginFiles(runningRoot, entry.installPath);
  } catch (e) {
    result.note = `cannot compare the two versions: ${e.message}`;
  }
  return result;
}
