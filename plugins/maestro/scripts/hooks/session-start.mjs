// SessionStart (startup|resume|clear|compact): re-inject the PM handoff.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appendEvent } from "../lib/events.mjs";
import { additionalContext, runHook } from "./_run.mjs";

const CAP = 9000;
const PREFIX =
  "You are the Maestro PM of this project. If the maestro:pm skill is not loaded, re-read it before acting.";

await runHook("session-start", ({ input, root }) => {
  const source = input.source || "startup";
  const handoffFile = join(root, ".maestro", "handoff.md");
  const hasHandoff = existsSync(handoffFile);
  if (source === "startup") {
    const pointer = hasHandoff ? " A handoff exists at .maestro/handoff.md: read it before acting." : "";
    return additionalContext("SessionStart", PREFIX + pointer);
  }
  if (source === "compact") {
    appendEvent(root, "session.compact", { actor: "hook", data: { trigger: source, phase: "reinject" } });
  }
  if (!hasHandoff) return additionalContext("SessionStart", PREFIX);
  let text = readFileSync(handoffFile, "utf8");
  if (text.length > CAP) {
    text = text.slice(0, CAP) + `\n[handoff truncated at ${CAP} characters; read .maestro/handoff.md for the rest]`;
  }
  return additionalContext("SessionStart", `${PREFIX}\n\n--- .maestro/handoff.md ---\n${text}`);
});
