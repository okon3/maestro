---
name: dashboard
description: Open the Maestro dashboard for this project (roadmap, board, agents, decisions, reports, costs) in the browser and give the owner its local URL. Use when the owner asks to see the dashboard, the plan, the board or the costs; pass --stop to shut it down.
argument-hint: "[--stop] [--port N] [--no-open]"
disable-model-invocation: false
---

# Maestro dashboard

Arguments: `$ARGUMENTS`

The dashboard is a read-only local page (127.0.0.1 only) that shows the tracker, the agents, the decisions, the reports and the costs of this project. It never changes project files.

1. **Start or reuse it:** run `maestro dashboard $ARGUMENTS`. If `maestro` is not on the PATH, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" dashboard $ARGUMENTS`. The command returns at once: the server keeps running in the background. A server that is already running is reused, so running it again is safe.
2. **Report the URL** that the command prints (for example `http://127.0.0.1:4517/`) and say whether it was started now or was already running. The browser opens by itself unless `--no-open` was given.
3. **Stop it** when the owner asks (or with `--stop` in the arguments): `maestro dashboard --stop`.
4. If the command fails with "dashboard server did not start", run it once with `--foreground --no-open` to see the error and report that error to the owner.

Costs on the page are list-price estimates; tokens and wall time are measured.
