#!/usr/bin/env node
// `maestro` command dispatcher (contract: docs/plugin-contracts.md section 6).
// Exit codes: 0 success, 1 error, 2 refused operation (claim denied, failed check).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gitCommonDir, loadConfig } from "./lib/config.mjs";
import { appendEvent, readEvents } from "./lib/events.mjs";
import { backlogVersion, editTask, listTasks, runTool, viewTask } from "./lib/backlog.mjs";
import { branchExists, git, refExists, worktreeBranch, worktreePath } from "./lib/git.mjs";

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const BOOLEAN_FLAGS = new Set(["json", "probe", "reuse"]);
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

const formatUsage = (s) => `five-hour ${s.fiveHour ?? "?"}%, seven-day ${s.sevenDay ?? "?"}%, resets ${s.resetsAt ?? "?"} (sampled ${s.ts})`;

// Runs a tiny `claude -p` call (stdin ignored) and reads the rate_limit_event lines. Percentages are 0-100.
function probeUsage(root) {
  const args = ["-p", "Reply OK", "--output-format", "stream-json", "--verbose", "--model", "haiku", "--no-session-persistence"];
  const r = runTool("claude", args, { cwd: root, timeout: 120000 });
  if (r.error) throw new CliError(`cannot run claude: ${r.error.message}`);
  const windows = {};
  for (const line of r.stdout.split("\n")) {
    if (!line.includes("rate_limit_event")) continue;
    try {
      Object.assign(windows, JSON.parse(line).rate_limit_info?.unifiedWindows ?? {});
    } catch {
      // not a JSON line
    }
  }
  const pct = (w) => (typeof w?.utilization === "number" ? Math.round(w.utilization * 1000) / 10 : null);
  const five = windows.five_hour;
  if (!five && !windows.seven_day) throw new CliError("probe returned no rate_limit_event");
  return {
    ts: new Date().toISOString(),
    fiveHour: pct(five),
    sevenDay: pct(windows.seven_day),
    resetsAt: five?.resetsAt ?? five?.resets_at ?? null,
  };
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
    const sh = spawnSync("sh", ["-c", "exit 0"], { stdio: "ignore" });
    add("sh", sh.status === 0, sh.status === 0 ? "available" : "not on PATH", "run Claude Code from Git Bash or add Git's usr\\bin to PATH (task.status events need it)", true);
    add("config", !!config, config ? "valid" : "invalid or not in a git repository", "fix .maestro/config.json");
    add("maestro-init", initialized, initialized ? "initialized" : ".maestro/config.json not found", "run the init skill", true);
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
    const event = appendEvent(root, type, { goal: flags.goal, task: flags.task, actor: flags.actor, data });
    out(flags, event, `logged ${type}`);
    return 0;
  },

  claim([task], flags) {
    const id = requireName(task, "task id").toUpperCase();
    const actor = requireName(flags.actor, "--actor");
    const { root } = context();
    const deny = (reason) => {
      appendEvent(root, "task.claim_denied", { actor, task: id, data: { reason } });
      out(flags, { claimed: false, task: id, reason }, `claim denied for ${id}: ${reason}`);
      return 2;
    };
    const locks = join(gitCommonDir(root), "maestro-locks");
    const lock = join(locks, id);
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
    const goal = requireName(flags.goal, "--goal");
    const { root, config } = context();
    const goalBranch = `${config.goalBranchPrefix}${goal}`;
    const path = worktreePath(root, name);
    const existingBranch = worktreeBranch(root, path);
    if (existsSync(path) || branchExists(root, name) || existingBranch) {
      if (flags.reuse && existingBranch === name) {
        out(flags, { path, branch: name, reused: true }, path);
        return 0;
      }
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
    out(flags, { path, branch: name, base: goalBranch }, path);
    return 0;
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
    const { root } = context();
    const file = join(root, ".maestro", "runtime", "usage.json");
    if (flags.probe) {
      const sample = probeUsage(root);
      mkdirSync(join(root, ".maestro", "runtime"), { recursive: true });
      writeFileSync(file, JSON.stringify(sample, null, 2));
      appendEvent(root, "usage.sample", { actor: "usage", data: { fiveHour: sample.fiveHour, sevenDay: sample.sevenDay, resetsAt: sample.resetsAt } });
      out(flags, sample, formatUsage(sample));
      return 0;
    }
    if (!existsSync(file)) {
      out(flags, { sample: null }, "no usage sample yet (run `maestro usage --probe`)");
      return 0;
    }
    const sample = JSON.parse(readFileSync(file, "utf8"));
    out(flags, sample, formatUsage(sample));
    return 0;
  },

  async measure([task], flags) {
    const id = requireName(task, "task id").toUpperCase();
    const agentIds = (flags["agent-id"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!agentIds.length) throw new CliError("usage: maestro measure <task> --agent-id <id>[,<id>]");
    const { root } = context();
    const session = flags.transcript ?? discoverTranscript();
    if (!session) throw new CliError("no session transcript given and none discoverable (use --transcript)");
    const mod = await loadContextModule();
    const models = {};
    let wallMs = 0;
    for (const agentId of agentIds) {
      const path = mod.subagentTranscriptPath(session, agentId);
      if (!existsSync(path)) throw new CliError(`subagent transcript not found: ${path}`);
      const u = mod.usageSummary(path);
      wallMs += u.wallMs ?? 0;
      for (const [model, t] of Object.entries(u.models ?? {})) {
        const sum = (models[model] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
        for (const k of Object.keys(sum)) sum[k] += t[k] ?? 0;
      }
    }
    const data = {
      agentIds,
      usage: { models, wallMs },
      wallMs,
      ownerInterventions: Number(flags.interventions ?? 0),
      reworkCycles: Number(flags.rework ?? 0),
    };
    const event = appendEvent(root, "task.measure", { actor: flags.actor, goal: flags.goal, task: id, data });
    out(flags, event, `measured ${id}: ${Object.keys(models).length} model(s), ${wallMs} ms`);
    return 0;
  },

  status(args, flags) {
    const { root } = context();
    const byStatus = {};
    let tasksError = null;
    try {
      for (const t of listTasks(root)) {
        (byStatus[t.status ?? "?"] ??= []).push({ id: t.id, title: t.title, assignees: t.assignees ?? [] });
      }
    } catch (e) {
      tasksError = e.message;
    }
    const locks = join(gitCommonDir(root), "maestro-locks");
    const claims = existsSync(locks) ? readdirSync(locks).map((id) => ({ task: id, ...readOwner(join(locks, id)) })) : [];
    const events = readEvents(root);
    const last = (type) => [...events].reverse().find((e) => e.type === type) ?? null;
    const goal = [...events].reverse().find((e) => e.goal)?.goal ?? null;
    const result = { goal, tasks: byStatus, tasksError, claims, lastUsage: last("usage.sample"), lastContext: last("context.band") };
    if (flags.json) console.log(JSON.stringify(result));
    else {
      console.log(`goal: ${goal ?? "-"}`);
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
};

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
