// SubagentStart / SubagentStop: log agent.start and agent.stop (with usage).
import { existsSync } from "node:fs";
import { usageSummary } from "../lib/context.mjs";
import { appendEvent } from "../lib/events.mjs";
import { runHook } from "./_run.mjs";

await runHook("agent-events", ({ input, root }) => {
  const agentType = input.agent_type || "";
  const base = { actor: "hook", agentId: input.agent_id };
  if (input.hook_event_name === "SubagentStart") {
    appendEvent(root, "agent.start", { ...base, data: { agentType } });
    return;
  }
  const path = input.agent_transcript_path;
  const data = { agentType };
  // The internal compaction agent has no agent_type: keep it in the log, flagged.
  if (!agentType || /compact/i.test(path || "")) data.internal = true;
  if (path && existsSync(path)) data.usage = usageSummary(path);
  appendEvent(root, "agent.stop", { ...base, data });
});
