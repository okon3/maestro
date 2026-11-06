#!/usr/bin/env node
// `maestro` command dispatcher (contract: docs/plugin-contracts.md section 6).
// Exit codes: 0 success, 1 error, 2 refused operation (claim denied, failed check).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gitCommonDir, loadConfig } from "./lib/config.mjs";
import { KNOWN_EVENT_TYPES, appendEvent, readEvents } from "./lib/events.mjs";
import { backlogVersion, editTask, listTasks, viewTask } from "./lib/backlog.mjs";
import { DEFAULT_PORT, runtimeFile, startServer } from "./dashboard/server.mjs";
import { finalReport, writeTaskReport } from "./lib/report.mjs";
import { pluginVersionCheck } from "./lib/plugin.mjs";
import { branchExists, findWorktree, git, refExists, worktreeBranch, worktreePath } from "./lib/git.mjs";
import { applySetup, explainRemoveFailure, isInside, normalizeSetup, removeLinks, restoreLinks, worktreeBusy } from "./lib/worktree.mjs";
import {
  clearInterrupted,
  clearPause,
  formatReset,
  interruptedNotice,
  probeUsage,
  readInterrupted,
  readPause,
  readUsageSample,
  recordUsageSample,
  setPause,
  usageBands,
  usageGate,
} from "./lib/usage.mjs";

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const BOOLEAN_FLAGS = new Set(["json", "probe", "check", "reuse", "no-open", "stop", "foreground", "remove", "force", "on", "off", "no-report"]);
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (BOOLEAN_FLAGS.has(key)) flags[key] = true;
      else if (i + 1 >= argv.length) throw new CliError(`missing value for ${a}`);
      else flags[key] = argv[++i];
    } else positional.push(a);
  }
  return { positional, flags };
}

function requireName(value, what) {
  if (!value || !NAME.test(value)) throw new CliError(`invalid or missing ${what}: ${value ?? ""}`);
  return value;
}

function context() {
  let loaded;
  try {
    loaded = loadConfig(process.cwd());
  } catch (e) {
    throw new CliError(`invalid .maestro/config.json: ${e.message}`);
  }
  if (!loaded.root) throw new CliError("not inside a git repository");
  return loaded;
}

const out = (flags, obj, text) => console.log(flags.json ? JSON.stringify(obj) : text);

// Lazy import so the CLI works before/without lib/context.mjs; tests inject a stub through the env var.
async function loadContextModule() {
  const target = process.env.MAESTRO_TEST_CONTEXT_MODULE;
  const href = target ? pathToFileURL(target).href : new URL("./lib/context.mjs", import.meta.url).href;
  try {
    return await import(href);
  } catch (e) {
    throw new CliError(`cannot load lib/context.mjs: ${e.message}`);
  }
}

// Plugin root of the running CLI (the session's plugin version); tests point it elsewhere.
const pluginRoot = () => process.env.MAESTRO_TEST_PLUGIN_ROOT || fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]+$/, "");

// Newest transcript of the current project under ~/.claude/projects (best effort).
function discoverTranscript() {
  const dir = join(homedir(), ".claude", "projects", process.cwd().replace(/[^A-Za-z0-9]/g, "-"));
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => join(dir, f));
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

function readOwner(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "owner.json"), "utf8"));
  } catch {
    return {};
  }
}

const formatUsage = (s) =>
  `five-hour ${s.fiveHour ?? "?"}%, seven-day ${s.sevenDay ?? "?"}%, resets ${s.resetsAt == null ? "?" : formatReset(s.resetsAt)} (sampled ${s.ts})`;

function readRecordedDashboard(file) {
  try {
    const r = JSON.parse(readFileSync(file, "utf8"));
    return Number.isInteger(r.pid) && Number.isInteger(r.port) && typeof r.url === "string" ? r : null;
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

// The recorded server must answer on its port and belong to this project (guards against pid reuse).
async function dashboardAnswers(info, root) {
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/api/health`, { signal: AbortSignal.timeout(1500) });
    const body = await res.json();
    return body.ok === true && resolve(body.root) === resolve(root);
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The URL is printed anyway.
  }
}

// `maestro worktree <name> --remove [--force]`: unlink the setup links without following them, then
// `git worktree remove`. On Windows a busy folder is refused before anything is deleted.
function removeWorktree(root, name, path, setup, flags) {
  const registered = findWorktree(root, path);
  if (!registered) {
    if (existsSync(path)) throw new CliError(`${path} is not a registered worktree; check it holds no links (junctions) before deleting it by hand`);
    out(flags, { path, removed: false, reason: "not found" }, `no worktree "${name}"`);
    return 0;
  }
  if (!existsSync(path)) {
    git(root, ["worktree", "prune"]);
    out(flags, { path, removed: true, unlinked: [] }, `removed ${path} (folder was already gone)`);
    return 0;
  }
  if (isInside(process.cwd(), path)) throw new CliError(`run this from the main checkout, not from inside ${path}`);
  const busy = worktreeBusy(path);
  if (busy) {
    console.error(`refused: ${path} is in use (${busy}); nothing was removed.\nLikely cause: ${explainRemoveFailure("busy", name)}`);
    return 2;
  }
  const links = removeLinks(path, setup.link);
  const unlinked = links.map((l) => l.entry);
  try {
    git(root, ["worktree", "remove", ...(flags.force ? ["--force"] : []), path]);
  } catch (e) {
    if (existsSync(path)) restoreLinks(path, links);
    const reason = e.message.replace(/^git [\s\S]*? failed: /, "");
    throw new CliError(`cannot remove worktree ${path}: ${reason}\nLikely cause: ${explainRemoveFailure(reason, name)}`);
  }
  out(flags, { path, removed: true, unlinked }, `removed ${path}${unlinked.length ? ` (unlinked ${unlinked.join(", ")} first)` : ""}`);
  return 0;
}

const COMMANDS = {
  doctor(args, flags) {
    let loaded = { root: null, config: null, initialized: false };
    try {
      loaded = context();
    } catch {
      // reported by the config check below
    }
    const { root, config, initialized } = loaded;
    const checks = [];
    const add = (name, ok, detail, fix, warn = false) => checks.push({ name, ok, detail, fix, warn });
    let gitVer = null;
    try {
      gitVer = git(process.cwd(), ["--version"]);
    } catch {
      // missing git
    }
    add("git", !!gitVer, gitVer ?? "git not found", "install git");
    const major = Number(process.versions.node.split(".")[0]);
    add("node", major >= 20, `v${process.versions.node}`, "install Node.js >= 20");
    const wanted = config?.backlogVersion ?? "1.55.3";
    const have = backlogVersion(root ?? process.cwd());
    add("backlog", have === wanted, have ? `${have} (wanted ${wanted})` : `missing (wanted ${wanted})`, `npm i -g backlog.md@${wanted}`);
    // Backlog.md runs its on_status_change hook with `sh -c`; without sh, task.status events are lost.
    const sh = spawnSync("sh", ["-c", "exit 0"], { stdio: "ignore", windowsHide: true });
    add("sh", sh.status === 0, sh.status === 0 ? "available" : "not on PATH", "run Claude Code from Git Bash or add Git's usr\\bin to PATH (task.status events need it)", true);
    add("config", !!config, config ? "valid" : "invalid or not in a git repository", "fix .maestro/config.json");
    add("maestro-init", initialized, initialized ? "initialized" : ".maestro/config.json not found", "run the init skill", true);
    const plugin = pluginVersionCheck({ runningRoot: pluginRoot(), projectRoot: root ?? process.cwd() });
    const pluginDetail = {
      same: `this session runs the installed version ${plugin.runningVersion}`,
      dev: `running from ${plugin.running} (a checkout, not the plugin cache)`,
      "not-installed": `${plugin.runningVersion} (no maestro@okon3 install recorded for this project)`,
      unknown: plugin.note ?? "installed version unknown",
      differs: `this session runs ${plugin.runningVersion}, installed is ${plugin.installedVersion}; ${
        plugin.note ?? (plugin.changes.length ? `skills/agents changed: ${plugin.changes.map((c) => `${c.file} (${c.change})`).join(", ")}` : "no skills or agents file changed")
      }`,
    }[plugin.status];
    checks.push({
      name: "plugin-version",
      ok: plugin.status !== "differs" && plugin.status !== "unknown",
      warn: true,
      detail: pluginDetail,
      fix:
        plugin.status === "differs"
          ? "/reload-plugins is the owner's command (agents cannot run it): ask the owner to run it or restart the session; until then this session uses the old skills and agents"
          : "check ~/.claude/plugins/installed_plugins.json",
      plugin,
    });
    const failed = checks.filter((c) => !c.ok && !c.warn);
    if (flags.json) console.log(JSON.stringify({ ok: failed.length === 0, checks }));
    else {
      for (const c of checks) {
        console.log(`${c.ok ? "OK  " : c.warn ? "WARN" : "FAIL"} ${c.name}: ${c.detail}${c.ok ? "" : `  -> ${c.fix}`}`);
      }
    }
    return failed.length ? 2 : 0;
  },

  event([type], flags) {
    if (!type) throw new CliError("usage: maestro event <type> [--goal G] [--task T] [--actor A] [--data JSON]");
    const { root } = context();
    let data;
    if (flags.data !== undefined) {
      try {
        data = JSON.parse(flags.data);
      } catch {
        throw new CliError("--data must be valid JSON");
      }
    }
    // An unknown type is logged anyway (a new skill may add one): the warning catches typos.
    if (!KNOWN_EVENT_TYPES.has(type)) console.error(`maestro: warning: unknown event type "${type}", logged anyway (known types: docs/plugin-contracts.md section 4)`);
    const event = appendEvent(root, type, { goal: flags.goal, task: flags.task, actor: flags.actor, data });
    out(flags, event, `logged ${type}`);
    return 0;
  },

  claim([task], flags) {
    const id = requireName(task, "task id").toUpperCase();
    const actor = requireName(flags.actor, "--actor");
    const { root, config } = context();
    const deny = (reason) => {
      appendEvent(root, "task.claim_denied", { actor, task: id, data: { reason } });
      out(flags, { claimed: false, task: id, reason }, `claim denied for ${id}: ${reason}`);
      return 2;
    };
    const locks = join(gitCommonDir(root), "maestro-locks");
    const lock = join(locks, id);
    // The actor already holds this claim (resumed after needs_context): nothing new starts, so no gate.
    if (existsSync(lock) && readOwner(lock).actor === actor) {
      out(flags, { claimed: true, task: id, actor, held: true }, `${id} is already claimed by ${actor}`);
      return 0;
    }
    // Usage gate: no new work at or above the top usage band, or while a pause is active.
    const gate = usageGate(root, config, { timeout: 60000 });
    if (!gate.allow) {
      appendEvent(root, "task.claim_denied", { actor, task: id, data: { reason: gate.reason, gate: gate.level } });
      const advice = "Do not retry: stop, commit work in progress and report to whoever launched you.";
      out(flags, { claimed: false, task: id, reason: gate.reason, gate: gate.level }, `claim denied for ${id}: ${gate.reason}. ${advice}`);
      return 2;
    }
    if (gate.level === "unknown") console.error(`maestro: ${gate.note}`);
    mkdirSync(locks, { recursive: true });
    try {
      mkdirSync(lock); // atomic: fails with EEXIST when another claim holds the lock
    } catch (e) {
      if (e.code === "EEXIST") return deny("locked by another claim");
      throw e;
    }
    try {
      const t = viewTask(id, root);
      const free = t.assignees.every((a) => a.replace(/^@/, "") === actor);
      if (!["Ready", "To Do"].includes(t.status)) throw Object.assign(new Error("denied"), { reason: `status is "${t.status}"` });
      if (!free) throw Object.assign(new Error("denied"), { reason: `assigned to ${t.assignees.join(", ")}` });
      editTask(id, { assignee: `@${actor}`, status: "In Progress" }, root);
      writeFileSync(join(lock, "owner.json"), JSON.stringify({ actor, ts: new Date().toISOString() }));
    } catch (e) {
      rmSync(lock, { recursive: true, force: true });
      if (e.reason) return deny(e.reason);
      throw e;
    }
    appendEvent(root, "task.claim", { actor, task: id, data: {} });
    out(flags, { claimed: true, task: id, actor }, `claimed ${id} for ${actor}`);
    return 0;
  },

  release([task], flags) {
    const id = requireName(task, "task id").toUpperCase();
    const actor = requireName(flags.actor, "--actor");
    const { root } = context();
    if (flags.status) editTask(id, { status: flags.status }, root);
    rmSync(join(gitCommonDir(root), "maestro-locks", id), { recursive: true, force: true });
    appendEvent(root, "task.release", { actor, task: id, data: flags.status ? { status: flags.status } : {} });
    out(flags, { released: true, task: id }, `released ${id}`);
    return 0;
  },

  worktree([name], flags) {
    requireName(name, "worktree name");
    const { root, config } = context();
    let setup;
    try {
      setup = normalizeSetup(config.worktreeSetup);
    } catch (e) {
      throw new CliError(`invalid .maestro/config.json: ${e.message}`);
    }
    const path = worktreePath(root, name);
    if (flags.remove) return removeWorktree(root, name, path, setup, flags);
    const detach = flags.detach;
    const goal = detach === undefined ? requireName(flags.goal, "--goal") : null;
    const existing = findWorktree(root, path);
    const finish = (result, created) => {
      const { linked, warnings, run } = applySetup(root, path, setup, { runCommand: created });
      if (!flags.json) for (const w of warnings) console.error(`warning: ${w}`);
      if (run && run.status !== 0) {
        throw new CliError(`worktree ready at ${path}, but the setup command failed (${run.error ?? `exit ${run.status}`}): ${run.command}`);
      }
      out(flags, { ...result, setup: { linked, warnings, run } }, path);
      return 0;
    };
    if (detach !== undefined) {
      // Detached snapshot (QA, code review) at a tag or commit: no branch.
      if (existsSync(path) || existing) {
        if (flags.reuse && existing?.detached) return finish({ path, detached: true, reused: true }, false);
        console.error(`refused: worktree path "${name}" already exists (use --reuse to reuse a detached snapshot)`);
        return 2;
      }
      try {
        if (detach.startsWith("-")) throw new Error("not a ref");
        git(root, ["rev-parse", "--verify", "--quiet", `${detach}^{commit}`]);
      } catch {
        throw new CliError(`unknown ref for --detach: ${detach}`);
      }
      git(root, ["worktree", "add", "-q", "--detach", path, detach]);
      return finish({ path, detached: true, ref: detach }, true);
    }
    const goalBranch = `${config.goalBranchPrefix}${goal}`;
    const existingBranch = existing?.branch ?? null;
    if (existsSync(path) || branchExists(root, name) || existingBranch) {
      if (flags.reuse && existingBranch === name) return finish({ path, branch: name, reused: true }, false);
      console.error(`refused: worktree path or branch "${name}" already exists (use --reuse to reuse it)`);
      return 2;
    }
    if (!branchExists(root, goalBranch)) {
      // After a fresh clone the goal branch may exist only on the remote: track it instead of restarting from main.
      const remote = `origin/${goalBranch}`;
      if (refExists(root, `refs/remotes/${remote}`)) git(root, ["branch", goalBranch, remote]);
      else if (!branchExists(root, config.mainBranch)) throw new CliError(`main branch "${config.mainBranch}" not found`);
      else git(root, ["branch", goalBranch, config.mainBranch]);
    }
    git(root, ["worktree", "add", "-q", "-b", name, path, goalBranch]);
    return finish({ path, branch: name, base: goalBranch }, true);
  },

  async context(args, flags) {
    const { config } = context();
    const transcript = flags.transcript ?? discoverTranscript();
    if (!transcript) throw new CliError("no transcript given and none discoverable (use --transcript)");
    const mod = await loadContextModule();
    const usage = mod.contextUsage(transcript, { window: config.contextWindow });
    out(flags, usage, `context ${usage.percent}% (${usage.contextTokens}/${usage.window} tokens, ${usage.model ?? "unknown model"})`);
    return 0;
  },

  usage(args, flags) {
    const { root, config } = context();
    if (flags.check) {
      // The gate used by claims and the agent-launch hook, with the action for each level.
      const gate = usageGate(root, config);
      const { lower, top } = usageBands(config);
      const actions = {
        ok: "go ahead",
        unknown: `${gate.note}; go ahead with care`,
        lower: `at or above the lower band ${lower}%: start no long agents and no new wave; only finish work in flight`,
        top: `${gate.reason}: launch nothing, claim nothing; finish or stop work in flight and report (PM: use the maestro:pause skill)`,
        paused: `${gate.reason}: launch nothing, claim nothing (\`maestro pause --off\` ends it)`,
      };
      const usage = gate.sample ? `${formatUsage(gate.sample)}; ` : "";
      out(flags, { level: gate.level, allow: gate.allow, lower, top, sample: gate.sample, source: gate.source, reason: gate.reason ?? gate.note }, `${gate.level.toUpperCase()}: ${usage}${actions[gate.level]}`);
      return gate.allow ? 0 : 2;
    }
    if (flags.probe) {
      let sample;
      try {
        sample = probeUsage(root);
      } catch (e) {
        throw new CliError(e.message);
      }
      recordUsageSample(root, sample);
      out(flags, sample, formatUsage(sample));
      return 0;
    }
    const sample = readUsageSample(root);
    if (!sample) {
      out(flags, { sample: null }, "no usage sample yet (run `maestro usage --probe`)");
      return 0;
    }
    out(flags, sample, formatUsage(sample));
    return 0;
  },

  pause(args, flags) {
    const { root } = context();
    if (flags.on && flags.off) throw new CliError("use either --on or --off");
    if (flags.on) {
      const flag = setPause(root, { reason: flags.reason ?? null, actor: flags.actor ?? null });
      appendEvent(root, "session.pause", { actor: flags.actor, data: { phase: "start", reason: flag.reason } });
      out(flags, { paused: true, ...flag }, `pause on since ${flag.since}: new claims and Maestro agent launches are refused`);
      return 0;
    }
    if (flags.off) {
      const was = clearPause(root);
      appendEvent(root, "session.pause", { actor: flags.actor, data: { phase: "off" } });
      out(flags, { paused: false, was }, was ? `pause off (was on since ${was.since})` : "pause off (was not on)");
      return 0;
    }
    const flag = readPause(root);
    out(flags, { paused: !!flag, ...(flag ?? {}) }, flag ? `paused since ${flag.since}${flag.reason ? ` (${flag.reason})` : ""}` : "not paused");
    return 0;
  },

  // Measures one task, or a batch of tasks done by the same agents, and saves the implementer's final report
  // (from its subagent transcript) as .maestro/reports/task/<id>.md for each task.
  async measure([tasks], flags) {
    const usage = "usage: maestro measure <task>[,<task>...] --agent-id <id>[,<id>] [--force] [--no-report]";
    const ids = [...new Set((tasks ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((t) => requireName(t, "task id").toUpperCase()))];
    const agentIds = (flags["agent-id"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length || !agentIds.length) throw new CliError(usage);
    const { root } = context();
    const session = flags.transcript ?? discoverTranscript();
    if (!session) throw new CliError("no session transcript given and none discoverable (use --transcript)");
    const mod = await loadContextModule();
    const models = {};
    let wallMs = 0;
    const paths = [];
    for (const agentId of agentIds) {
      const path = mod.subagentTranscriptPath(session, agentId);
      if (!existsSync(path)) throw new CliError(`subagent transcript not found: ${path}`);
      paths.push({ agentId, path });
      const u = mod.usageSummary(path);
      wallMs += u.wallMs ?? 0;
      for (const [model, t] of Object.entries(u.models ?? {})) {
        const sum = (models[model] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
        for (const k of Object.keys(sum)) sum[k] += t[k] ?? 0;
      }
    }
    // A batch: every task gets the same agents and usage; the dashboard splits a shared agent evenly among them.
    const batch = ids.length > 1 ? ids : undefined;
    const data = {
      agentIds,
      usage: { models, wallMs },
      wallMs,
      ownerInterventions: Number(flags.interventions ?? 0),
      reworkCycles: Number(flags.rework ?? 0),
      ...(batch ? { batch } : {}),
    };
    const events = ids.map((id) => appendEvent(root, "task.measure", { actor: flags.actor, goal: flags.goal, task: id, data }));
    const reports = [];
    if (!flags["no-report"]) {
      const found = paths.map(({ agentId, path }) => ({ agentId, report: finalReport(path) })).filter((r) => r.report);
      if (!found.length) console.error(`maestro: warning: no final report found in the transcript(s) of ${agentIds.join(", ")}; no report written`);
      else {
        for (const r of found) if (!r.report.hasState) console.error(`maestro: warning: agent ${r.agentId}'s last message has no STATE line; saved as it is`);
        const bodies = found.map((r) => ({ agentId: r.agentId, text: r.report.text }));
        for (const id of ids) {
          let title = null;
          try {
            title = viewTask(id, root).title ?? null;
          } catch {
            // tracker unavailable: the heading falls back to "implementer report"
          }
          const w = writeTaskReport(root, { task: id, title, batch, agentIds, models: Object.keys(models), wallMs, reports: bodies, force: !!flags.force });
          reports.push({ task: id, path: w.path, action: w.action });
        }
      }
    }
    const lines = ids.map((id) => {
      const r = reports.find((x) => x.task === id);
      return `measured ${id}: ${Object.keys(models).length} model(s), ${wallMs} ms${batch ? ` (batch of ${ids.length})` : ""}${r ? `; report ${r.action}: ${r.path}` : ""}`;
    });
    out(flags, { events, reports }, lines.join("\n"));
    return 0;
  },

  async dashboard(args, flags) {
    const { root } = context();
    const file = runtimeFile(root);
    const recorded = readRecordedDashboard(file);
    if (flags.stop) {
      if (!recorded) {
        out(flags, { stopped: false }, "no dashboard recorded");
        return 0;
      }
      let killed = false;
      if (pidAlive(recorded.pid)) {
        try {
          process.kill(recorded.pid);
          killed = true;
        } catch {
          // already gone
        }
      }
      rmSync(file, { force: true });
      out(flags, { stopped: killed, pid: recorded.pid }, killed ? `dashboard stopped (pid ${recorded.pid})` : "dashboard was not running (stale record removed)");
      return 0;
    }
    const port = flags.port === undefined ? DEFAULT_PORT : Number(flags.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new CliError(`invalid --port: ${flags.port}`);
    if (flags.foreground) {
      const srv = await startServer({ root, port });
      out(flags, { url: srv.url, port: srv.port, pid: process.pid, foreground: true }, `dashboard at ${srv.url} (foreground, Ctrl+C to stop)`);
      if (!flags["no-open"]) openBrowser(srv.url);
      return await new Promise(() => {}); // runs until the process is killed
    }
    let info = recorded && pidAlive(recorded.pid) && (await dashboardAnswers(recorded, root)) ? recorded : null;
    let reused = !!info;
    if (!info) {
      rmSync(file, { force: true });
      const serverPath = fileURLToPath(new URL("./dashboard/server.mjs", import.meta.url));
      const child = spawn(process.execPath, [serverPath, "--root", root, "--port", String(port)], { detached: true, stdio: "ignore", windowsHide: true });
      child.on("error", () => {});
      child.unref();
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const r = readRecordedDashboard(file);
        if (r && r.pid === child.pid) {
          info = r;
          break;
        }
        await new Promise((res) => setTimeout(res, 100));
      }
      if (!info) throw new CliError("dashboard server did not start (try `maestro dashboard --foreground` to see the error)");
    }
    if (!flags["no-open"]) openBrowser(info.url);
    out(flags, { url: info.url, port: info.port, pid: info.pid, reused }, `dashboard at ${info.url}${reused ? " (already running)" : ""}`);
    return 0;
  },

  status(args, flags) {
    const { root } = context();
    const byStatus = {};
    const goals = []; // GOALs In Progress: the active ones
    const proposed = []; // GOALs awaiting the owner's approval, listed apart from the tasks
    let tasksError = null;
    try {
      for (const t of listTasks(root)) {
        const labels = Array.isArray(t.labels) ? t.labels : [];
        const row = { id: t.id, title: t.title, assignees: t.assignees ?? [] };
        if (labels.includes("goal") && labels.includes("proposed")) {
          proposed.push({ id: t.id, title: t.title, status: t.status ?? null });
          continue;
        }
        if (labels.includes("goal") && t.status === "In Progress") goals.push(t.id);
        (byStatus[t.status ?? "?"] ??= []).push(row);
      }
    } catch (e) {
      tasksError = e.message;
    }
    const claims = activeClaims(root);
    const events = readEvents(root);
    const last = (type) => [...events].reverse().find((e) => e.type === type) ?? null;
    // The tracker says which GOAL is active; an old event carrying a goal field does not.
    const goal = goals[0] ?? null;
    const pause = readPause(root);
    const interrupted = readInterrupted(root);
    const result = { goal, goals, proposed, tasks: byStatus, tasksError, claims, lastUsage: last("usage.sample"), lastContext: last("context.band"), pause, interrupted };
    if (flags.json) console.log(JSON.stringify(result));
    else {
      if (interrupted) console.log(interruptedNotice(interrupted));
      if (pause) console.log(`PAUSED since ${pause.since}${pause.reason ? ` (${pause.reason})` : ""}: new claims and Maestro agent launches are refused`);
      console.log(`${goals.length > 1 ? "goals" : "goal"}: ${goals.length ? goals.join(", ") : "-"}`);
      if (proposed.length) {
        console.log(`awaiting approval (${proposed.length})`);
        for (const g of proposed) console.log(`  ${g.id} ${g.title}`);
      }
      if (tasksError) console.log(`tasks unavailable: ${tasksError}`);
      for (const [s, list] of Object.entries(byStatus)) {
        console.log(`${s} (${list.length})`);
        for (const t of list) console.log(`  ${t.id} ${t.title}${t.assignees.length ? ` [${t.assignees.join(", ")}]` : ""}`);
      }
      console.log(`claims: ${claims.length ? claims.map((c) => `${c.task}=${c.actor ?? "?"}`).join(", ") : "none"}`);
      const show = (e) => (e ? `${JSON.stringify(e.data)} at ${e.ts}` : "none");
      console.log(`last usage: ${show(result.lastUsage)}`);
      console.log(`last context: ${show(result.lastContext)}`);
    }
    return 0;
  },

  // Saves uncommitted work of implementer worktrees (after a usage-limit stop or before a pause) on wip/<task>.
  // Runs git only inside .claude/worktrees/impl-*: the main checkout is never touched.
  salvage(args, flags) {
    const { root } = context();
    const dir = join(root, ".claude", "worktrees");
    const claims = activeClaims(root);
    const results = [];
    const names = existsSync(dir) ? readdirSync(dir).filter((n) => /^impl-/.test(n) && existsSync(join(dir, n, ".git"))) : [];
    for (const name of names) {
      const wt = join(dir, name);
      try {
        const changes = git(wt, ["status", "--porcelain"]).split("\n").filter(Boolean);
        if (!changes.length) {
          results.push({ worktree: name, salvaged: false, reason: "clean" });
          continue;
        }
        // The task of the worktree's active claim (its actor is the worktree name); else the worktree name.
        const claim = claims.filter((c) => c.actor === name).sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
        const task = claim?.task ?? name;
        git(wt, ["add", "-A"]);
        // --no-verify: work in progress may not pass the project's commit hooks, and it must be saved anyway.
        git(wt, ["commit", "-q", "--no-verify", "-m", `WIP ${task}: salvaged by maestro salvage${flags.reason ? ` (${flags.reason})` : ""}`]);
        const commit = git(wt, ["rev-parse", "HEAD"]);
        let branch = `wip/${task}`;
        // Never move an existing wip branch off commits it holds: use a distinct name instead.
        if (branchExists(wt, branch) && !isAncestor(wt, branch, commit)) branch = `wip/${task}-${commit.slice(0, 7)}`;
        git(wt, ["branch", "-f", branch, commit]);
        appendEvent(root, "work.salvaged", { actor: flags.actor ?? "pm", task: claim?.task, data: { worktree: name, branch, commit, files: changes.length } });
        results.push({ worktree: name, salvaged: true, task, branch, commit, files: changes.length });
      } catch (e) {
        results.push({ worktree: name, salvaged: false, error: e.message });
      }
    }
    const failed = results.filter((r) => r.error);
    if (!failed.length) clearInterrupted(root);
    if (flags.json) console.log(JSON.stringify({ results }));
    else if (!results.length) console.log("no implementer worktrees under .claude/worktrees");
    else {
      for (const r of results) {
        if (r.salvaged) console.log(`${r.worktree}: ${r.files} file(s) committed on ${r.branch} at ${r.commit.slice(0, 7)} (task ${r.task})`);
        else console.log(`${r.worktree}: ${r.error ? `FAILED ${r.error}` : "clean, nothing to save"}`);
      }
    }
    return failed.length ? 1 : 0;
  },
};

/** Active claims: one lock directory per task, with `owner.json` once the claim succeeded. */
function activeClaims(root) {
  const locks = join(gitCommonDir(root), "maestro-locks");
  return existsSync(locks) ? readdirSync(locks).map((id) => ({ task: id, ...readOwner(join(locks, id)) })) : [];
}

function isAncestor(cwd, a, b) {
  try {
    git(cwd, ["merge-base", "--is-ancestor", a, b]);
    return true;
  } catch {
    return false;
  }
}

export async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(`usage: maestro <${Object.keys(COMMANDS).join("|")}> [options]`);
    return cmd ? 0 : 1;
  }
  const handler = COMMANDS[cmd];
  if (!handler) throw new CliError(`unknown command: ${cmd}`);
  const { positional, flags } = parseArgs(rest);
  return await handler(positional, flags);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`maestro: ${e.message}`);
      process.exit(e.code ?? 1);
    },
  );
}
