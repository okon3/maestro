// StopFailure: record a rate-limit (or other API) stop. On a rate limit, also leave the interruption marker
// (.maestro/runtime/interrupted.json) so session start and `maestro status` tell the PM to run `maestro salvage`.
import { appendEvent } from "../lib/events.mjs";
import { isRateLimitError, markInterrupted } from "../lib/usage.mjs";
import { runHook } from "./_run.mjs";

await runHook("stop-failure", ({ input, root }) => {
  const error = input.error ?? null;
  appendEvent(root, "limit.hit", { actor: "hook", data: { error } }); // no agentId: the dashboard reads limit.hit as session-wide
  if (isRateLimitError(error)) markInterrupted(root, { error, agentId: input.agent_id ?? null, agentType: input.agent_type ?? null });
});
