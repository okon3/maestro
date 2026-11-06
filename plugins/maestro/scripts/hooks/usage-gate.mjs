// PreToolUse (Agent|Task): deny launching a Maestro agent (`maestro:*` subagent type) at or above the top usage
// band or while a pause is active. Uses the runtime usage sample when fresh; probes only when it is stale, with a
// short timeout. No git. Unknown usage fails open.
import { appendEvent } from "../lib/events.mjs";
import { usageGate } from "../lib/usage.mjs";
import { runHook } from "./_run.mjs";

const PROBE_TIMEOUT_MS = 20000; // the hook timeout in hooks.json is 30 s

await runHook(
  "usage-gate",
  ({ input, root, config }) => {
    const agentType = input.tool_input.subagent_type;
    const gate = usageGate(root, config, { timeout: PROBE_TIMEOUT_MS });
    if (gate.allow) return;
    appendEvent(root, "agent.launch_denied", { actor: "hook", agentId: input.agent_id, data: { agentType, gate: gate.level, reason: gate.reason } });
    const action = input.agent_id
      ? "Launch nothing more. Let agents already running finish, then stop and report to the PM (STATE: blocked, usage limit or pause), listing what is in flight and what did not start."
      : "Do not launch Maestro agents now. Use the maestro:pause skill if it is not already running, and tell the owner.";
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Maestro usage gate: cannot launch ${agentType}: ${gate.reason}. ${action}`,
      },
    };
  },
  { when: (input) => typeof input.tool_input?.subagent_type === "string" && input.tool_input.subagent_type.startsWith("maestro:") },
);
