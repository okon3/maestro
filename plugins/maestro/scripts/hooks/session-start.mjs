// SessionStart (startup|resume|clear|compact): re-inject the PM handoff, and say when work was interrupted by a
// usage limit (runtime marker) or a pause is active.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appendEvent } from "../lib/events.mjs";
import { interruptedNotice, readInterrupted, readPause } from "../lib/usage.mjs";
import { additionalContext, runHook } from "./_run.mjs";

const CAP = 9000;
const PREFIX =
  "You are the Maestro PM of this project. If the maestro:pm skill is not loaded, re-read it before acting.";

function notices(root) {
  const lines = [];
  const interrupted = interruptedNotice(readInterrupted(root));
  if (interrupted) lines.push(interrupted);
  const pause = readPause(root);
  if (pause) {
    lines.push(
      `MAESTRO: a pause is active since ${pause.since}${pause.reason ? ` (${pause.reason})` : ""}: new claims and Maestro agent launches are refused. ` +
        "The maestro:resume skill ends it (`maestro pause --off`).",
    );
  }
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}

await runHook("session-start", ({ input, root }) => {
  const source = input.source || "startup";
  const handoffFile = join(root, ".maestro", "handoff.md");
  const hasHandoff = existsSync(handoffFile);
  const extra = notices(root);
  if (source === "startup") {
    const pointer = hasHandoff ? " A handoff exists at .maestro/handoff.md: read it before acting." : "";
    return additionalContext("SessionStart", PREFIX + pointer + extra);
  }
  if (source === "compact") {
    appendEvent(root, "session.compact", { actor: "hook", data: { trigger: source, phase: "reinject" } });
  }
  if (!hasHandoff) return additionalContext("SessionStart", PREFIX + extra);
  let text = readFileSync(handoffFile, "utf8");
  if (text.length > CAP) {
    text = text.slice(0, CAP) + `\n[handoff truncated at ${CAP} characters; read .maestro/handoff.md for the rest]`;
  }
  return additionalContext("SessionStart", `${PREFIX}${extra}\n\n--- .maestro/handoff.md ---\n${text}`);
});
