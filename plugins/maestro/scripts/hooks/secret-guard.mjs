// PreToolUse in subagents: deny access to secret files (.env, keys, config secretPaths), and bind the agent id
// to the actor and task of a `maestro claim` it runs (the dashboard needs it: parallel agents start in the same
// millisecond, so time order cannot tell them apart). The main session is never blocked.
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { appendEvent } from "../lib/events.mjs";
import { runHook } from "./_run.mjs";

// `maestro claim <task> --actor <name>`, also through `node .../cli.mjs claim`.
const CLAIM = /(?:\bmaestro(?:\.cmd)?|cli\.mjs["']?)\s+claim\s+([A-Za-z0-9][\w.-]*)\s+--actor\s+["']?([A-Za-z0-9][\w.-]*)/;

// Built-in rules, tested on the file name (last path segment), case-insensitive.
const BUILTIN = [/^\.env$/i, /^\.env\..+$/i, /^.+\.pem$/i, /^.+\.key$/i, /^id_rsa/i, /^id_ed25519/i];
const EXEMPT = /^\.env\.example$/i; // templates without values
// Command text is split into words on whitespace, quotes and shell punctuation.
const WORD_SEPARATORS = /[\s"'`;|&<>(){}=,:@$]+/;

const normalize = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "");

/**
 * A config glob as a regex on a normalized path. `**` spans directories, `*` and `?` stay inside one segment.
 * The glob may match any trailing part of the path, and a matched directory covers its contents,
 * so `secrets/**`, `secrets` and `config/prod.yml` work for relative, absolute and worktree paths alike.
 */
function globRegex(glob) {
  const g = normalize(glob).replace(/^(\.\/|\/)+/, "");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") {
      i++;
      if (g[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`(?:^|/)${re}(?:/.*)?$`, "i");
}

function isSecret(path, globs) {
  const p = normalize(path);
  if (!p) return false;
  const name = p.slice(p.lastIndexOf("/") + 1);
  if (!EXEMPT.test(name) && BUILTIN.some((r) => r.test(name))) return true;
  return globs.some((r) => r.test(p));
}

/** Paths a tool call targets. Grep's `pattern` is a content regex, not a path, so only Glob's is checked. */
function targets(toolName, toolInput = {}) {
  const out = [];
  for (const key of ["file_path", "notebook_path", "path", "glob"]) {
    if (typeof toolInput[key] === "string") out.push(toolInput[key]);
  }
  if (toolName === "Glob" && typeof toolInput.pattern === "string") out.push(toolInput.pattern);
  if (typeof toolInput.command === "string") out.push(...toolInput.command.split(WORD_SEPARATORS));
  return out;
}

/**
 * The model the subagent runs on: `message.model` of the last assistant line in the tail (64 KB) of its transcript
 * `<session dir>/<sessionId>/subagents/agent-<agentId>.jsonl`. Null when it cannot be read: this is best effort.
 */
export function agentModel(input) {
  try {
    const tp = String(input.transcript_path ?? "");
    const file = /[\\/]subagents[\\/]agent-/.test(tp)
      ? tp
      : join(dirname(tp), tp.replace(/^.*[\\/]/, "").replace(/\.jsonl$/, ""), "subagents", `agent-${input.agent_id}.jsonl`);
    const size = statSync(file).size;
    const len = Math.min(size, 65536);
    const buf = Buffer.alloc(len);
    const fd = openSync(file, "r");
    try {
      readSync(fd, buf, 0, len, size - len);
    } finally {
      closeSync(fd);
    }
    const found = [...buf.toString("utf8").matchAll(/"model":"([^"]+)"/g)].map((m) => m[1]).filter((m) => m.startsWith("claude-"));
    return found.at(-1) ?? null;
  } catch {
    return null;
  }
}

await runHook(
  "secret-guard",
  ({ input, root, config }) => {
    const claim = typeof input.tool_input?.command === "string" ? CLAIM.exec(input.tool_input.command) : null;
    if (claim) {
      const model = agentModel(input);
      appendEvent(root, "agent.bind", { agentId: input.agent_id, actor: claim[2], task: claim[1].toUpperCase(), data: model ? { model } : {} });
    }
    const globs = (Array.isArray(config.secretPaths) ? config.secretPaths : [])
      .filter((g) => typeof g === "string" && g.trim())
      .map(globRegex);
    const hit = targets(input.tool_name, input.tool_input).find((t) => isSecret(t, globs));
    if (!hit) return;
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `Maestro secret guard: subagents may not access "${hit}" (.env files, keys and the project's secretPaths). ` +
          "Work without it; if the task needs it, say so in your report. " +
          "If the name is only text (a commit message, a search term), rephrase the command without it.",
      },
    };
  },
  { when: (input) => Boolean(input.agent_id) }, // main session: never blocked
);
