---
name: init
description: Install Maestro in the current project, or adopt an existing repository with its own rules and plan - .maestro/ config and handoff, PLAN.md, ignore and attributes lines, the AGENTS.md block, and Backlog.md with Maestro's statuses and event hook. Idempotent; asks the owner before touching existing files. Use when a project has no .maestro/config.json or to refresh the AGENTS.md block after a plugin update.
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
   - The project's language for tracker, reports and decisions, if it is not English (one line, for example `Language: Italian for tracker, reports and decisions`).
   Replace every `TODO`. Then fill `PLAN.md` (vision, constraints, roadmap) only as far as the owner already knows it.
7. **Status hook.** Backlog.md now runs `maestro event task.status ...` on every status change through `sh -c`. It works where `sh` and `maestro` are on PATH (Claude Code's Bash tool with the plugin enabled); elsewhere it does nothing. After the first real status change, check that `.maestro/events.jsonl` has a `task.status` line; if not, check that `sh` (Git Bash on Windows) and `maestro` are on PATH in that shell.
8. **Plugin for other PCs.** If `.claude/settings.json` does not enable Maestro yet, propose to the owner: `claude plugin marketplace add okon3/maestro --scope project` and `claude plugin install maestro@okon3 --scope project`, then add `"autoUpdate": true` to the `okon3` entry (`marketplace add` drops it). On every other PC, after the clone and the workspace trust prompt, `claude plugin install maestro@okon3 --scope project` must be run once: the install record is per machine.
9. **Log and commit.** `maestro event maestro.init --actor pm`. Then commit, if the authority you just recorded allows local commits (otherwise ask): the created files, `backlog/`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `.gitattributes`, `.maestro/`.
10. **Next:** run `maestro doctor` again, then continue with the `maestro:pm` skill: agree the first GOAL with the owner.

If `AGENTS.md` or `CLAUDE.md` already held rules before the install, run the **rules audit** below after step 5.

To refresh the `AGENTS.md` block after a plugin update, run steps 4 and 5, the rules audit (the plugin's rules may have changed) and step 9.

## Rules audit: one source of truth

Project files hold only the project's own rules and data. A rule that Maestro already states must not be repeated there: two copies drift apart and agents follow the wrong one.

1. **Collect the project rules:** everything outside the Maestro markers in `AGENTS.md`, `CLAUDE.md` and the files they import (`@file` lines), one rule per line or bullet.
2. **Collect what Maestro states:** the block between the markers, the agents (`${CLAUDE_PLUGIN_ROOT}/agents/*.md`) and the skills (`${CLAUDE_PLUGIN_ROOT}/skills/*/SKILL.md`): roles, delegation, tracker and `PLAN.md` ownership, commits, worktrees, checks and when they run, self-smoke and QA, code review, decisions, report language, push and deploy rules.
3. **Classify each project rule.** The installer's `review` lines are hints, not the full list: read every rule.
   - **Duplicate:** Maestro already says the same thing, or the rule restates something the `## Authority` or `## Checks` sections already hold. Remove it.
   - **Conflict:** the rule and Maestro say different things (for example "every task runs a browser smoke" while Maestro asks for one only on QA criteria; "run checks from the repository root" while implementers must stay in their worktree). The owner decides which one stays.
   - **Project rule:** product facts, domain constraints, code style, module boundaries, project commands, authority, checks. Keep it. If part of a rule is a duplicate, keep only the project part.
4. **Show the owner one table:** file and line, rule, class, what Maestro says (file), proposed action.
   - Duplicates: one approval for the whole list.
   - Conflicts: ask one by one, with the options "keep Maestro's rule" (remove or rewrite the project rule), "keep the project's rule" (it stays as an explicit project override) and, where useful, an adapted wording; give a recommendation. A project override of a plugin rule is a Maestro friction point: when `.maestro/config.json` has `frameworkFeedback: true`, append it to `.maestro/reports/maestro-friction.md` (PM skill section 11).
5. **Apply** the agreed edits with Edit, outside the markers only, then commit them as one step (`AGENTS.md: remove rules Maestro already states`). In an adoption this happens on the `maestro-setup` branch with the rest.

## Adopt an existing project

Use this part when the repository already has its own way of working: an `AGENTS.md` or `CLAUDE.md` with rules, a long `PLAN.md`, a `.gitignore` that hides `.claude/`. The installer only reports; every change outside the Maestro markers is yours to make **on a branch, after the owner agrees**.

1. **Work on a branch.** From a clean main checkout: `git switch -c maestro-setup`. Do all of the steps below there. Nothing lands on the main branch before the owner approves the final diff.
2. **Run the installer** (steps 4 and 5 above). Besides the usual lines it prints:
   - `Checks pre-filled ...` on the `AGENTS.md` line: the `## Checks` section now lists the commands found in `package.json` scripts, `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Makefile`, `pyproject.toml`, with the runner (npm, pnpm, yarn, bun) taken from the lockfile. They are marked "owner to confirm". Go through them with the owner: drop what is not a gate, add what is missing, say how to start the app for QA. Fill `## Authority` from the rules the project already has (commits, push, deploy).
   - `review <file>:<line>  <reason>` lines: possible conflicts with Maestro. The installer never edits them.
3. **Run the rules audit** (see "Rules audit" above) on the project's rules. For each `review` line and each conflict, record the choice: **remove** (the rule is replaced by Maestro's), **adapt** (rewrite it so it fits, for example "update `PLAN.md` in the same commit" becomes "update `PLAN.md` when a GOAL starts or closes"; "QA with a subagent after every feature" becomes "QA missions run by the PM on a tagged snapshot"), or **keep** (say why). Typical cases:
   - another multi-agent or delegation strategy (headings or lines about subagents, delegation, orchestration): usually remove, since Maestro's roles define who delegates to whom;
   - a rule that every commit updates `PLAN.md`, or a mandatory QA or subagent step per feature;
   - a `.gitignore` entry such as `.claude/`, `.claude`, `/.claude/` that hides the whole folder: replace it with `.claude/worktrees/` and `.claude/settings.local.json` (the installer already appends those), so `.claude/settings.json` can be committed.
   Make the agreed edits with Edit, outside the Maestro markers only. Never touch text between the markers.
4. **Long or history-heavy `PLAN.md`.** If the installer printed a `review PLAN.md` line (more than 150 lines) or `PLAN.md` holds the history of past GOALs, propose this migration and apply it only after approval:
   - move the GOAL history **verbatim** to `docs/history/` (for example `docs/history/goal-completati.md`) and link it from the index;
   - keep the vision and the constraints in `PLAN.md`;
   - replace the roadmap by a short table (milestone, GOAL, tracker id, status, outcome);
   - turn every open roadmap item into a Backlog **draft** under its milestone;
   - turn the next GOAL into a task labelled `goal,proposed`;
   - turn open questions into decisions with status `open`.
   The tracker's language follows the project's language (the `language` in `.maestro/config.json` is for talking to the owner): if the project is written in Italian, so are the titles and descriptions.
   Backlog commands (run from the project root; `--plain` where the output is read by you):
   ```
   backlog milestone add "<milestone name>" -d "<one line outcome>"
   backlog task create "<title>" --draft -m "<milestone name>" -d "<description>"
   backlog task create "<next GOAL title>" -l goal,proposed -m "<milestone name>" -d "<outcome, criteria, exclusions>"
   backlog decision create "<question>" -s open --plain
   ```
   `decision create` prints the new file `backlog/decisions/decision-<n> - <title>.md`: edit that file to fill **Context**, **Decision** (leave "Open" until the owner decides) and **Consequences**. Check the result with `backlog task list --plain`, `backlog draft list --plain` and `backlog decision list --plain`. Commit in small steps (history move, new `PLAN.md`, tracker items).
5. **Definition of Done.** The installer adds "Named test per acceptance criterion passes" and "Architect review approved" to the `definition_of_done` defaults of `backlog/config.yml`, keeping any items the project already had. If it prints a `manual` line about that key, add them by hand.
6. **End with a diff for the owner.** Run `git diff <main branch>..maestro-setup --stat` and give the owner a summary: what the installer added, each reviewed conflict with the decision taken, the PLAN.md migration (what moved where, how many drafts, decisions and which GOAL is proposed), the confirmed checks. Merge `maestro-setup` into the main branch only after the owner approves; if they ask for changes, make them on the branch and show the diff again.
