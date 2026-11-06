// Fake `backlog` for init tests: `--version` and `init <name> ...` (writes Backlog.md 1.55.3's default config.yml).
// Each call is appended to $FAKE_BACKLOG_LOG as a JSON line.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const log = process.env.FAKE_BACKLOG_LOG;
if (!log) process.exit(0); // collected by `node --test` as a file: do nothing
const args = process.argv.slice(2);
appendFileSync(log, JSON.stringify(args) + "\n");

if (args[0] === "--version") {
  console.log("1.55.3");
} else if (args[0] === "init") {
  for (const d of ["tasks", "decisions", "drafts", "docs", "archive", "milestones"]) mkdirSync(join("backlog", d), { recursive: true });
  writeFileSync(
    join("backlog", "config.yml"),
    [
      `project_name: "${args[1]}"`,
      'default_status: "To Do"',
      'statuses: ["To Do", "In Progress", "Done"]',
      "labels: []",
      "date_format: yyyy-mm-dd",
      "max_column_width: 20",
      "auto_open_browser: false",
      "default_port: 6420",
      "remote_operations: true",
      "auto_commit: false",
      'task_prefix: "task"',
      "",
    ].join("\n"),
  );
} else {
  console.error("fake backlog: unsupported " + args.join(" "));
  process.exit(1);
}
