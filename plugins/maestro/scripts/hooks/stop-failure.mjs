// StopFailure: record a rate-limit (or other API) stop.
import { appendEvent } from "../lib/events.mjs";
import { runHook } from "./_run.mjs";

await runHook("stop-failure", ({ input, root }) => {
  appendEvent(root, "limit.hit", { actor: "hook", data: { error: input.error ?? null } });
});
