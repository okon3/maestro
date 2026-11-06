// Fake `claude` for usage probes. $FAKE_CLAUDE_USAGE = {"five":0.97,"seven":0.1,"reset":1793988600} prints a
// rate_limit_event line; unset, it prints nothing (the probe fails: usage unknown). $FAKE_CLAUDE_LOG, when set,
// gets one line per call so tests can count probes.
import { appendFileSync } from "node:fs";

if (process.env.FAKE_CLAUDE_LOG) appendFileSync(process.env.FAKE_CLAUDE_LOG, "probe\n");
const usage = process.env.FAKE_CLAUDE_USAGE ? JSON.parse(process.env.FAKE_CLAUDE_USAGE) : null;
if (usage) {
  const line = {
    type: "rate_limit_event",
    rate_limit_info: {
      unifiedWindows: {
        five_hour: { utilization: usage.five, resetsAt: usage.reset ?? null },
        seven_day: { utilization: usage.seven ?? 0 },
      },
    },
  };
  console.log(JSON.stringify({ type: "system" }));
  console.log(JSON.stringify(line));
}
