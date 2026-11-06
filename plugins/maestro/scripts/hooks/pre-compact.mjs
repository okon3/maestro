// PreCompact: plain-text preservation instructions for the summary.
import { appendEvent } from "../lib/events.mjs";
import { runHook } from "./_run.mjs";

await runHook("pre-compact", ({ input, root }) => {
  appendEvent(root, "session.compact", { actor: "hook", data: { trigger: input.trigger, phase: "pre" } });
  return [
    "Maestro compaction rules: project state lives in the tracker (Backlog.md) and in .maestro/handoff.md, not in this conversation.",
    "Preserve in the summary: ids of running agents, open owner decisions, the current GOAL and the next action.",
    "Drop file contents and tool output.",
  ].join("\n");
});
