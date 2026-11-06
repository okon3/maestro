// Fake `backlog` for tests. State file: $FAKE_BACKLOG_STATE = {"version","tasks":{ID:{title,status,assignees}},"edits":[]}
import { readFileSync, writeFileSync } from "node:fs";

const file = process.env.FAKE_BACKLOG_STATE;
if (!file) process.exit(0); // collected by `node --test` as a file: do nothing
const state = JSON.parse(readFileSync(file, "utf8"));
const [a, b, c, ...rest] = process.argv.slice(2);
const find = (id) => Object.entries(state.tasks).find(([k]) => k.toLowerCase() === String(id).toLowerCase());

if (a === "--version") {
  if (state.version === null) process.exit(127);
  console.log(state.version);
} else if (a === "task" && b === "view") {
  const t = find(c);
  if (!t) {
    console.error("not found");
    process.exit(1);
  }
  console.log(JSON.stringify({ schemaVersion: 1, kind: "task-view", task: { id: t[0], ...t[1] } }));
} else if (a === "task" && b === "list") {
  console.log(JSON.stringify({ schemaVersion: 1, kind: "task-list", tasks: Object.entries(state.tasks).map(([id, t]) => ({ id, ...t })) }));
} else if (a === "task" && b === "edit") {
  const t = find(c);
  if (!t) {
    console.error("not found");
    process.exit(1);
  }
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] === "-a") t[1].assignees = [rest[i + 1]];
    if (rest[i] === "-s") t[1].status = rest[i + 1];
  }
  state.edits.push({ id: t[0], args: rest });
  writeFileSync(file, JSON.stringify(state));
} else {
  console.error("fake backlog: unsupported " + process.argv.slice(2).join(" "));
  process.exit(1);
}
