# Maestro

A Claude Code plugin that runs an autonomous software team on your project:

- **PM**: your main session. It plans GOALs with you, keeps the plan, the decisions and the handoff, and asks you only for material decisions.
- **Architect**: leads one GOAL at a time. It plans in waves, launches two implementers in git worktrees, reviews tests first, and integrates.
- **Implementers**: each owns one task in its own worktree and file scope, with one named test per acceptance criterion.
- **QA explorer**: black-box missions on a tagged snapshot.
- **Code reviewer**: fresh periodic review every N integrated tasks or at GOAL end.

State lives in git: Backlog.md tasks, decisions, ADRs, an append-only event log with per-task cost and time, and a PM handoff that hooks re-inject after compaction.

## Requirements

- Claude Code, Git (on Windows: Git Bash), Node.js 20 or later.
- Backlog.md 1.55.3: `npm i -g backlog.md@1.55.3`.

## Install in a project

Add this to the project's `.claude/settings.json` and commit it:

```json
{
  "extraKnownMarketplaces": {
    "okon3": { "source": { "source": "github", "repo": "okon3/maestro" }, "autoUpdate": true }
  },
  "enabledPlugins": { "maestro@okon3": true }
}
```

Open the project in Claude Code, accept the workspace trust prompt, and run `/reload-plugins` if the plugin does not appear yet. Then run `/maestro:init` once. After that, start each session with `/maestro:pm`.

## Develop

- Design spec (source of truth, Italian): `team-workflow/flusso-team-agenti.html`.
- Technical contracts: `docs/plugin-contracts.md`. ADRs: `docs/adr/`.
- Tests: `cd plugins/maestro && node --test`.
- Validate: `claude plugin validate plugins/maestro`.
- Try local changes without publishing: `claude --plugin-dir plugins/maestro`.

Every commit pushed to `main` is a release (see `docs/adr/0001-plugin-versioning-by-commit.md`).
