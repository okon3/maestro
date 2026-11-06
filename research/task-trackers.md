# Agent-oriented task trackers vs. a custom `.team/` queue

Research date: 2026-11-06. Sources are official sites, READMEs, repo files and the GitHub/npm APIs. Items marked (unverified) were not confirmed in docs or source.

## Requirements recap

Offline and local; versioned in git and resumable after a clone on another PC; safe with several agents and worktrees writing at once; dependencies, statuses, claims, and milestone -> GOAL -> task hierarchy; a CLI for agents, ideally MCP or a skill; readable by a custom dashboard; low overhead.

## 1. dex

Sources: https://dex.rip/ , https://github.com/dcramer/dex , docs https://dcramer.github.io/dex/ , `llms.txt` and `plugins/dex/skills/dex/cli-reference.md` in the repo.

**What it is.** A small TypeScript CLI (`@zeeg/dex`) plus a Claude Code skill and plugin. Its pitch is "persistent memory for complex, multi-session work". It does not include a board.

**Storage.**
- One JSON file per task at `<git-root>/.dex/tasks/{id}.json`. If not in a git repo it falls back to `~/.dex/tasks/`. Override with `--storage-path` or `DEX_STORAGE_PATH`.
- The README still says "JSONL, one task per line". The CLI reference and `dex.toml.example` (`engine = "file"`) show per-task files, so the README looks stale.
- Optional sync with GitHub Issues or Shortcut, configured in `.dex/config.toml`.
- Compaction and auto-archive code exists (`src/core/archive-compactor.ts`, `auto-archive.ts`).
- There is a Beads JSONL importer.

**Data model.** The task file holds:
- `id` (8 random characters)
- `parent_id`
- `name`
- `description`, which dex treats as the context
- `priority` (an integer, lower is more urgent)
- `completed` (a boolean)
- `result`
- `blocked_by` (an array)
- `created_at`, `updated_at`, `completed_at`
- commit metadata, captured by `dex complete --commit <sha>`

Details that matter for us:
- **No status field.** There is no in-progress state, assignee or claim. "Ready" is computed, as "pending with no open blockers".
- **No labels, acceptance-criteria structure or notes field.** Free text only.
- **Hierarchy** is `--parent`. Deleting a parent deletes its subtasks. The skill documents epic and subtask hierarchies; I did not check the nesting limit.
- **Dependencies** are soft: a blocked task can still be completed, with a warning.

**Concurrency.**
- Random IDs mean no allocation collisions.
- Separate files mean two agents rarely touch the same file, and git merges cleanly across branches and worktrees. In a worktree, "git-root" is the worktree, so each worktree has its own copy that merges back through git.
- No locking. Concurrent edits of the same task are a whole-file last-writer-wins.
- No atomic claim operation.

**Multi-PC.** Good, since `.dex/` is committed.

**Agent integration.**
- Skills installed with `npx skills add dcramer/dex`, or the Claude Code plugin in `plugins/dex`.
- Commands `/dex` and `/dex-plan`. The latter turns a plan or spec markdown file into a parent task with subtasks.
- A line to add to AGENTS.md or CLAUDE.md.
- Commands: `create`, `list --ready|--blocked|--all|--query`, `show`, `edit --add-blocker`, `complete --result --commit`, `delete`, `sync`, `import`.
- No MCP server found.
- Whether `--json` output exists was not confirmed. Reading `.dex/tasks/*.json` directly is trivial, so it matters little.

**Dashboard.** No UI. The flat JSON files are the easiest possible input for a custom dashboard.

**Maturity.** MIT. About 405 stars. Latest tag and npm version v0.16.0 (npm modified 2026-02-04). Last push 2026-03-02, so quiet for about 8 months. Pre-1.0 with a single main author (David Cramer).

**Windows and install.** npm, pnpm or bun global install. Windows is not mentioned in the docs; it is a pure Node CLI, so it is probably fine (unverified).

**Limitations.**
- No assignee, claim or status.
- Not enough structure for our GOAL and milestone model without conventions.
- Pre-1.0 and slowing down.
- There is a Result field on completion, which is useful, but no acceptance-criteria checklist.

## 2. Backlog.md

Sources: https://github.com/MrLesk/Backlog.md , `ADVANCED-CONFIG.md`, `CLI-INSTRUCTIONS.md`, repo `backlog/` folder (the project dogfoods itself).

**What it is.** A markdown-native task manager and Kanban visualizer for any git repo. Tasks are plain `.md` files. It ships a CLI, TUI board, local web UI and MCP server.

**Storage.**
- `backlog/` (or `.backlog/`, or a path set by `backlog_directory` in `backlog.config.yml`).
- Tasks are `backlog/tasks/back-208 - Title-slug.md`.
- Sibling folders: `drafts/`, `completed/` (the Backlog.md repo has 585 files there), `archive/` (tasks, drafts, milestones), `milestones/`, `decisions/`, `docs/`.
- Config is `backlog/config.yml`.
- `--no-git` gives a filesystem-only mode.

**Data model.** YAML frontmatter plus a markdown body:
- Frontmatter: `id`, `title`, `status`, `assignee[]`, `created_date`, `updated_date`, `labels[]`, `dependencies[]`, `priority`. Optional: parent, milestone, project, `onStatusChange`.
- Body sections:
  - Description
  - Acceptance Criteria, a numbered checklist (`- [ ] #1 ...`) with `--check-ac` and `--uncheck-ac`
  - Implementation Plan
  - Implementation Notes (`--notes` and `--append-notes`)
  - Final Summary (unverified)
  - Definition of Done checklist from config
- Section markers like `<!-- AC:BEGIN -->` make machine edits safe.
- Statuses are configurable; the default is `[To Do, In Progress, Done]`, and we can add Review or Blocked.
- Hierarchy:
  - Subtasks: `task create -p 14` and `task list --parent 42` (single level). Subtask IDs are of the form `BACK-14.1` (unverified).
  - Milestones: first-class files, with `backlog milestone` commands.
  - So milestone -> GOAL (task) -> task (subtask) maps well, though the milestone is a grouping rather than a parent in the tree.
- Dependencies: `--dep task-1,task-5`. The detail view shows both "waits on" and "waited on by". Whether it enforces them is unclear.
- `backlog/decisions/` holds ADR-style decision records. There is `backlog doc` for docs.

**Concurrency.**
- IDs are sequential with a prefix (`task_prefix`, for example `back-`).
- To avoid collisions across worktrees, it checks other active branches (`checkActiveBranches: true`, `activeBranchDays: 30`) and does git fetch (`remoteOperations`). Source: `src/core/task-identity-index.ts`.
- Because IDs are sequential, two worktrees creating tasks at the same moment can still pick the same number until they see each other's branches (unverified in source). It is mitigated if only the architect or PM creates tasks, and implementers only edit.
- No file locking; one file per task, so edits to different tasks merge cleanly. Edits to the same task are a normal git text merge.
- The docs recommend one task per session and one PR per task.
- The MCP server re-resolves the project when the worktree changes.
- `--no-git` forces cross-branch checks off.

**Git and multi-PC.** Excellent. Everything is markdown in the repo. `autoCommit` (default off) can commit changes automatically. `remoteOperations: false` works fully offline.

**Agent integration.**
- `backlog mcp start` (stdio), with setup for Claude Code, Codex, Gemini CLI and Kiro. `BACKLOG_CWD` pins a project.
- MCP resources `backlog://workflow/overview|task-creation|task-execution|task-finalization`.
- `backlog init` can write CLAUDE.md or AGENTS.md instructions and Claude Code commands.
- `backlog instructions overview` prints guidance for agents.
- Versioned `--json` envelopes on `task list|view`, `search`, `draft list` and `decision list` (`{schemaVersion:1, kind:"task-list", tasks:[...]}`), plus `task list --json --watch`, which streams snapshots. This is ideal for a live dashboard.
- The CLI has no explicit `claim` command; claiming is `edit -a @name -s "In Progress"`. That is not atomic.

**UI.** `backlog board` (TUI) and `backlog browser` (web, 127.0.0.1:6420, drag-and-drop, live updates). The web UI is desktop-first.

**Maturity.** MIT. About 7.3k stars, 479 forks, 77 open issues. Latest release v1.55.3 (2026-10-23). Last push 2026-11-04. Very active.

**Windows and install.** Windows is supported. `npm i -g backlog.md`, `bun add -g backlog.md`, `brew install backlog-md`, or Nix. It is a Bun project distributed through npm.

**Limitations.**
- One-level subtasks.
- Config keys such as statuses and labels must be edited by hand in the config file.
- Numeric IDs and the cross-branch scan can be slow in big repos.
- Task files are verbose (the slug is in the filename; renames move the file).
- The tool wants to own the file format, so hand-editing is discouraged.
- Heavier than dex.
- There is no per-event audit log; history is git history.

## 3. Others, for comparison

**beads (`bd`)** - https://github.com/gastownhall/beads (formerly steveyegge/beads), docs https://beads.gascity.com/
- A Go CLI, "distributed graph issue tracker for AI agents, powered by Dolt".
- Storage is a Dolt (version-controlled SQL) database in `.beads/`, synced with Dolt remotes (`bd dolt push/pull`), not plain git text.
- Hash-based IDs such as `bd-a3f8`, with hierarchical IDs for epics (`bd-a3f8.1.1`). They are collision-free.
- Atomic claim: `bd update --claim`. `bd ready` lists unblocked work. Dependency types: blocks, related, parent-child, supersedes and others.
- JSON output; `bd setup claude` installs hooks; `bd prime` injects workflow context; an MCP server (`beads-mcp` on PyPI); memory compaction of old closed issues.
- MIT, about 28.5k stars, v1.3.4 (2026-11-04), very active. Windows supported. Installed with brew, npm, an install script, or `go install`.
- Strongest on the concurrency requirements. The cost is a binary database: it is not directly diffable or hand-readable. Multi-PC resume needs a Dolt remote or export, not only `git clone`. Upgrades involve schema migrations. High complexity. A custom dashboard has to go through the `bd` CLI or an export rather than reading files.

**Taskmaster (claude-task-master)** - https://github.com/eyaltoledano/claude-task-master
- About 28.3k stars, `task-master-ai` 0.43.1 (2026-03-31), last push 2026-04-28. License reported by GitHub as NOASSERTION (a custom license); check before depending on it.
- Stores `.taskmaster/tasks/tasks.json`, a single file (from my knowledge of the project, not re-verified), so it is merge-conflict-prone with parallel writers. It has an MCP server, PRD parsing and AI-generated tasks, and needs an LLM API key for those features.
- It is a task generator more than a multi-agent queue. A poor fit for our concurrency requirement.

**GitHub Issues + `gh` CLI** - https://cli.github.com/
- Hierarchy through sub-issues, labels, assignees and Projects. Dependencies are only "blocked by" relationships. IDs are server-allocated, so there are no collisions and claiming is easy.
- Needs network and auth, so it fails the offline requirement. It does not travel with a clone. It is not readable by a local dashboard without API calls. Good as a mirror for the public side (dex can sync to it), not as the primary store.

## 4. Comparison

| Criterion | Our `.team/tasks/T-*.md` + `events.jsonl` | dex | Backlog.md | beads |
|---|---|---|---|---|
| Storage | md + YAML frontmatter, one file per task; append-only jsonl | JSON file per task in `.dex/tasks` | md + YAML frontmatter, one file per task in `backlog/` | Dolt SQL DB in `.beads/` |
| Resume after clone | Yes | Yes | Yes | Needs Dolt remote or export |
| ID allocation | We choose (random or hash would be collision-free) | Random 8 chars, collision-free | Sequential prefix + number; cross-branch scan, collisions possible | Hash-based, collision-free |
| Merge conflicts | Low (per-file); events.jsonl needs `merge=union` | Low | Low (per-file) | Cell-level Dolt merge |
| Atomic claim / lock | We can build it (exclusive lock file) | No | No (not atomic) | Yes (`--claim`) |
| Dependencies | Whatever we define | `blocked_by`, soft, `--ready` | `dependencies`, shown both ways | Typed graph, `bd ready` |
| Hierarchy | Free design: milestone -> GOAL -> task | parent/child, depth unchecked | Milestones + 1-level subtasks | Dotted hierarchical IDs |
| Status set | Free | None (done boolean) | Configurable | Open, in progress, blocked, closed... |
| Assignee, labels | Free | None | Yes | Yes |
| Acceptance criteria | Free | None | Native checklist, check/uncheck | Fields vary (unverified) |
| File scopes | Free (our own frontmatter key) | None | Not native (would live in body or label) | Not native |
| Agent interface | We write it | Skill + plugin, CLI | CLI, MCP, instructions | CLI, hooks, MCP, `bd prime` |
| Dashboard | Own (reads files and jsonl) | None, but JSON is trivial to read | Built-in board plus `--json --watch` | Via CLI/export only |
| Event log | Yes, built-in | No | No (git history) | Audit trail inside the DB |
| Maturity | Zero, we maintain it | 405 stars, quiet since Mar 2026 | 7.3k stars, very active | 28.5k stars, very active |
| Windows | Ours to test | Probably OK | Supported | Supported |
| Overhead | Highest (we build and maintain) | Low | Medium | Medium-high |

## 5. Recommendation

**Adopt Backlog.md as the task store and board; do not build the `.team/` queue ourselves.** It already provides most of what we sketched, in the same format (md + YAML frontmatter in git), plus an MCP server, JSON output for the dashboard, a built-in board, acceptance-criteria checklists, milestones and archiving. It is also the best-maintained of the file-based options, and it works offline and across worktrees.

Reasons against the alternatives:
- dex has no status, assignee or acceptance criteria, and its maintenance is slowing.
- beads is the best at concurrency, but its Dolt storage breaks the "plain text in git, clone and go" property and adds migration risk.
- Taskmaster and GitHub Issues fail on offline or concurrency grounds.

How to cover Backlog.md's gaps:
1. **IDs.** Have only the architect and PM create tasks, on the main worktree, and have implementers only edit existing tasks. This removes the sequential-ID collision risk.
2. **Claims.** Add a thin wrapper script, `maestro claim <id>`, that takes an exclusive lock file (for example `.team/locks/<id>.lock`, git-ignored), then runs `backlog task edit <id> -a @implementer-1 -s "In Progress"`. Done on the main worktree, this is serialised.
3. **File scopes and dependencies.** Keep file scopes as a fenced block or a label in the task body (for example `scope: src/map/**`), and have the architect's scheduler read it from `backlog task list --json`. Use `--dep` for ordering.
4. **Event log.** Use the `onStatusChange` shell hook (or a wrapper) to append a line to `.team/events.jsonl` with `merge=union` in `.gitattributes`. The dashboard can then read both `backlog task list --json --watch` and the events file. This is optional, because git history plus `updated_date` already covers most needs.
5. **Statuses.** Configure `To Do, In Progress, In Review, QA, Done` (and Blocked if wanted) in `backlog/config.yml`.

Fallback if Backlog.md's constraints bite (one-level subtasks, non-atomic claims): keep the same markdown-frontmatter layout so we can switch to our own `.team/` queue or to dex later. The migration is a script over frontmatter files.

### Hierarchy mapping

| Level | Where it lives |
|---|---|
| Vision, principles, roadmap narrative | PLAN.md |
| Milestone | A Backlog milestone file (id, name, one-line goal); the narrative stays in PLAN.md |
| GOAL | A Backlog task labelled `goal` with its milestone set; acceptance criteria are the native checklist |
| Task | A subtask (`-p <GOAL id>`) carrying scope, dependencies, assignee, status |
| Decisions | `backlog/decisions/` for dated ADR-style records; PLAN.md keeps a short index or link |
| Evidence and QA results | The task's Implementation Notes or Final Summary, with links to commits or screenshots |

### What stays in PLAN.md and what moves

Stays (stable, narrative, rarely edited, so no merge churn):
- Product vision and scope.
- Constraints and principles.
- Roadmap: one paragraph per milestone with its goal and exit criterion.
- Index of GOALs and decisions, linking to task IDs, ideally as a short table that the PM updates at milestone boundaries.

Moves to the tool (volatile, high-frequency, concurrently edited):
- GOAL and task status, assignees and claims.
- Acceptance criteria and their checkoffs.
- Dependencies and file scopes.
- Per-task evidence and notes.

Agents never write PLAN.md except through the PM. A short PM-run script can render a "current status" section from `backlog task list --json` if we want one view.

### Long-term history without clutter

- Done work does not get deleted. Backlog's `task archive` moves a task out of `tasks/` and keeps its ID reserved, so references stay valid. Its own repo keeps a `completed/` folder as well.
- Policy: when a GOAL is accepted and its milestone closed, the PM archives the GOAL and its subtasks in one commit, with a one-line outcome written into the PLAN.md roadmap entry.
- The board and `task list` only show active work, so the active set stays small.
- Full history stays in git (`git log -- backlog/`) and in the archive folder.
- If the archive grows large, set `activeBranchDays` low and tag the repo at each milestone (`m7b-done`) so old states are recoverable without keeping them in the working view.
- Events log (if used): rotate per milestone, for example `.team/events/2026-11.jsonl`. Old files are kept but ignored by the live dashboard.

### Open points to test before committing

1. Parallel `task create` from two worktrees: does the ID collide or not?
2. Whether `onStatusChange` fires for MCP- and CLI-driven edits equally.
3. Windows behaviour of the CLI, MCP stdio and `--watch` in Git Bash and PowerShell.
4. Whether `backlog init` overwrites our existing CLAUDE.md and AGENTS.md, or appends.

## Sources

- https://dex.rip/
- https://github.com/dcramer/dex (README, `dex.toml.example`, `docs/public/llms.txt`, `plugins/dex/skills/dex/cli-reference.md`, `specs/sync.md`)
- https://dcramer.github.io/dex/
- https://registry.npmjs.org/@zeeg/dex
- https://github.com/MrLesk/Backlog.md (README, `ADVANCED-CONFIG.md`, `CLI-INSTRUCTIONS.md`, `backlog/` folder, `package.json`)
- https://github.com/gastownhall/beads and https://beads.gascity.com/
- https://github.com/eyaltoledano/claude-task-master
- GitHub REST API (stars, releases, push dates), queried 2026-11-06
