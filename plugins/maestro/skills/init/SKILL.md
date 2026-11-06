---
name: init
description: Install Maestro in the current project - .maestro/ config and handoff, PLAN.md, ignore and attributes lines, the AGENTS.md block, and Backlog.md with Maestro's statuses and event hook. Idempotent; asks the owner before touching existing files. Use when a project has no .maestro/config.json or to refresh the AGENTS.md block after a plugin update.
argument-hint: "[project name]"
---

# Install Maestro in a project

Project name (optional): `$ARGUMENTS`

The installer is `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs"`. It only creates missing files, appends missing lines, and inserts or refreshes the block between `<!-- MAESTRO START -->` and `<!-- MAESTRO END -->` in `AGENTS.md`. It never changes text outside those markers, never overwrites an existing file, and a second run changes nothing.

1. **Check the place.** Run from the project's main checkout, at the git top level. If it is not a git repository, ask the owner whether to run `git init`; do not do it on your own.
2. **Check prerequisites.** Run `maestro doctor`. Backlog.md must be installed at the pinned version; if not, give the owner the install command it prints and stop.
3. **Agree the settings** with the owner, proposing defaults: project name (default: `$ARGUMENTS` or the folder name), main branch (detected: `main`, else `master`, else the current branch), language for talking to the owner (default `it`).
4. **Dry run.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" --dry-run --project "<name>" --main-branch <branch> --language <code>`. Show the owner the plan. Ask for approval of every line that touches an **existing** file (`append`, `insert`, `refresh`, `update`). New files need no separate approval. Lines starting with `manual` need the owner: explain each one.
5. **Install.** Run the same command without `--dry-run`. Exit code 2 means some `manual` items remain: resolve them with the owner (for example Backlog statuses that differ from Maestro's: To Do, Ready, In Progress, Blocked, In Review, Integrated, Done).
6. **Fill the project sections** of `AGENTS.md`, outside the markers, with the owner:
   - `## Authority`: local commits, push, deploy, publication, messages, spending, destructive actions. Deploy stays "only on explicit owner request" unless the owner says otherwise.
   - `## Checks`: the test, lint and build commands every task must pass, and how to start the app for QA.
   Replace every `TODO`. Then fill `PLAN.md` (vision, constraints, roadmap) only as far as the owner already knows it.
7. **Status hook.** Backlog.md now runs `maestro event task.status ...` on every status change through `sh -c`. It works where `sh` and `maestro` are on PATH (Claude Code's Bash tool with the plugin enabled); elsewhere it does nothing. After the first real status change, check that `.maestro/events.jsonl` has a `task.status` line; if not, check that `sh` (Git Bash on Windows) and `maestro` are on PATH in that shell.
8. **Plugin for other PCs.** If `.claude/settings.json` does not enable Maestro yet, propose to the owner: `claude plugin marketplace add okon3/maestro --scope project` and `claude plugin install maestro@okon3 --scope project`, so a fresh clone gets the plugin after the workspace trust prompt.
9. **Log and commit.** `maestro event maestro.init --actor pm`. Then commit, if the authority you just recorded allows local commits (otherwise ask): the created files, `backlog/`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `.gitattributes`, `.maestro/`.
10. **Next:** run `maestro doctor` again, then continue with the `maestro:pm` skill: agree the first GOAL with the owner.

To refresh the `AGENTS.md` block after a plugin update, run steps 4, 5 and 9 only.
