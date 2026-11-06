// Shared builders for the dashboard tests: a realistic temp project (git repo + Backlog.md files + events + reports).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// The owner's home is a git repository: never let git walk up out of the temp dirs (also for loadState in-process).
process.env.GIT_CEILING_DIRECTORIES = tmpdir();

export const T0 = "2026-11-06T14:00:00Z"; // commit and tag date

export function write(dir, rel, text) {
  const file = join(dir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

export const ceiling = () => ({ ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() });

export function task(fields, body = "") {
  const lines = Object.entries(fields).map(([k, v]) => {
    if (Array.isArray(v)) return v.length ? `${k}:\n${v.map((i) => `  - ${i}`).join("\n")}` : `${k}: []`;
    return `${k}: ${v}`;
  });
  return `---\n${lines.join("\n")}\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nx\n<!-- SECTION:DESCRIPTION:END -->\n\n${body}`;
}

const ac = (...marks) => `## Acceptance Criteria\n<!-- AC:BEGIN -->\n${marks.map((m, i) => `- [${m}] #${i + 1} item`).join("\n")}\n<!-- AC:END -->\n`;

export function tempProject({ withTag = true } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "maestro-dash-")));
  const env = { ...ceiling(), GIT_COMMITTER_DATE: T0, GIT_AUTHOR_DATE: T0 };
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore", env });
  git("init", "-q", "-b", "master");
  write(dir, ".maestro/config.json", JSON.stringify({ mainBranch: "master", language: "en", reviewEveryTasks: 15 }));
  write(dir, "backlog/milestones/m-0 - v1.md", `---\nid: m-0\ntitle: "v1 plugin"\n---\n\n## Description\n\nFirst release.\n`);
  write(dir, "backlog/archive/milestones/m-9 - old.md", `---\nid: m-9\ntitle: Old\n---\n\n## Description\n\nArchived.\n`);
  write(
    dir,
    "backlog/tasks/task-1 - Goal.md",
    task({ id: "TASK-1", title: "The goal", status: "In Progress", assignee: [], created_date: "'2026-11-06 13:55'", updated_date: "'2026-11-06 15:03'", labels: ["goal"], milestone: "m-0", dependencies: ["TASK-0"] }, ac(" ", " ")),
  );
  write(
    dir,
    "backlog/tasks/task-1.1 - First.md",
    task({ id: "TASK-1.1", title: "First task", status: "Integrated", assignee: ["'@impl-1'"], created_date: "'2026-11-06T14:07:00Z'", labels: [], dependencies: [], references: ["scope:src/a/**"], parent_task_id: "TASK-1" }, ac("x", "x")),
  );
  write(
    dir,
    "backlog/tasks/task-1.2 - Second.md",
    task({ id: "TASK-1.2", title: 'Second: "quoted" task', status: "In Progress", assignee: ["'@impl-2'"], created_date: "'2026-11-06T14:10:00Z'", updated_date: "'2026-11-06T14:20:00Z'", labels: [], dependencies: ["TASK-1.1"], references: ["docs/x.md", "scope:src/b/**", "scope:test/b*"], parent_task_id: "TASK-1" }, ac("x", " ", " ")),
  );
  // camelCase keys and inline lists, as Backlog.md can write them.
  write(
    dir,
    "backlog/tasks/task-1.3 - Third.md",
    `---\nid: task-1.3\ntitle: Third\nstatus: Blocked\nassignee: []\nlabels: [a, "b c"]\ndependencies: [TASK-1.1, TASK-1.2]\nparentTaskId: TASK-1\ncreatedDate: '2026-11-06 14:30'\n---\n\n${ac(" ")}`,
  );
  write(
    dir,
    "backlog/archive/tasks/task-0 - Old goal.md",
    task({ id: "TASK-0", title: "Old goal", status: "Done", assignee: [], created_date: "'2026-11-05T10:00:00Z'", labels: ["goal"], milestone: "m-0", dependencies: [] }),
  );
  write(
    dir,
    "backlog/archive/tasks/task-0.1 - Old child.md",
    task({ id: "TASK-0.1", title: "Old child", status: "Done", assignee: [], created_date: "'2026-11-05T10:00:00Z'", labels: [], dependencies: [], parent_task_id: "TASK-0" }),
  );
  write(dir, "backlog/drafts/draft-1 - Idea.md", task({ id: "DRAFT-1", title: "An idea", status: "Draft", assignee: [], created_date: "'2026-11-06T14:32:00Z'", labels: [], milestone: "m-0", dependencies: [] }));
  write(dir, "backlog/decisions/decision-1 - Open.md", `---\nid: decision-1\ntitle: Open question\ndate: '2026-11-06T14:32:00Z'\nstatus: open\n---\n## Context\n\nx\n`);
  write(dir, "backlog/decisions/decision-2 - Done.md", `---\nid: decision-2\ntitle: Settled\ndate: '2026-11-05'\nstatus: accepted\n---\n## Context\n\nx\n`);
  write(dir, "backlog/tasks/broken.md", "no frontmatter at all\n");
  write(dir, ".maestro/reports/qa/QA-1.md", "# QA 1: exploratory\n\nAll fine.\n");
  write(dir, ".maestro/reports/task/TASK-1.1.md", "Plain first line report\n");
  const ev = (ts, type, extra = {}) => JSON.stringify({ ts, type, ...extra });
  write(
    dir,
    ".maestro/events.jsonl",
    [
      ev("2026-11-06T13:00:00Z", "task.status", { task: "TASK-0.1", data: { from: "In Review", to: "Integrated" } }),
      ev("2026-11-06T15:00:00Z", "task.status", { task: "TASK-1.1", data: { from: "In Review", to: "Integrated" } }),
      ev("2026-11-06T15:01:00Z", "agent.start", { actor: "hook", agentId: "a1", data: { agentType: "maestro:implementer" } }),
      ev("2026-11-06T15:01:03Z", "task.claim", { actor: "impl-2", task: "TASK-1.2", data: {} }),
      ev("2026-11-06T15:05:00Z", "agent.stop", { actor: "hook", agentId: "a1", data: { agentType: "maestro:implementer" } }),
      ev("2026-11-06T15:06:00Z", "task.measure", {
        actor: "architect",
        task: "TASK-1.2",
        data: { usage: { models: { "claude-sonnet-5-5": { input: 1000000, output: 100000, cacheRead: 2000000, cacheWrite: 400000 } }, wallMs: 1000 }, wallMs: 1000, ownerInterventions: 1, reworkCycles: 2 },
      }),
    ].join("\n") + "\n",
  );
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "Initial commit");
  if (withTag) git("tag", "cr/CR-1");
  return { dir, git, env };
}
