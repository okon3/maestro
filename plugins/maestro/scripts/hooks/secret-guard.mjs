// PreToolUse: deny subagents access to secret files (.env, keys, config secretPaths). The main session is never blocked.
import { runHook } from "./_run.mjs";

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

await runHook(
  "secret-guard",
  ({ input, config }) => {
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
