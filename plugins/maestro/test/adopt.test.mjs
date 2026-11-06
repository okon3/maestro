import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectChecks, flagConflicts, githubRunCommands, gitlabScriptCommands } from "../scripts/lib/adopt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, "fixtures", "adopt");
const INIT = join(here, "..", "scripts", "init.mjs");

function repo(files = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "maestro-adopt-")));
  execFileSync("git", ["init", "-q", "-b", "master"], { cwd: dir, stdio: "ignore" });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
const runInit = (dir, ...args) =>
  spawnSync(process.execPath, [INIT, "--skip-backlog", ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) } });

const PKG = JSON.stringify({ scripts: { dev: "vite", build: "tsc -b && vite build", lint: "oxlint", test: "vitest run", "test:watch": "vitest", deploy: "node scripts/deploy.mjs" } });

test("adopt_detects_checks", () => {
  const dir = repo({
    "package.json": PKG,
    "pnpm-lock.yaml": "",
    ".github/workflows/ci.yml": [
      "jobs:",
      "  build:",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - run: pnpm install --frozen-lockfile",
      "      - run: pnpm test # unit",
      "      - name: Many",
      "        run: |",
      "          pnpm run lint",
      "          pnpm run build",
      "      - run: npx playwright test",
      "",
    ].join("\n"),
    ".gitlab-ci.yml": "test:\n  script:\n    - npm ci\n    - make smoke\n  only: [main]\n",
    Makefile: "test:\n\techo hi\nsmoke:\n\techo\n",
  });
  const { runner, checks } = detectChecks(dir);
  assert.equal(runner, "pnpm");
  const commands = checks.map((c) => c.command);
  assert.deepEqual(commands, ["pnpm test", "pnpm run lint", "pnpm run build", "make test", "npx playwright test", "make smoke"]);
  assert.equal(checks[0].source, 'package.json script "test"');
  assert.ok(!commands.some((c) => /deploy|dev|watch|install/.test(c)), "no dev/deploy/watch/install commands");
  assert.equal(checks.find((c) => c.command === "npx playwright test").source, ".github/workflows/ci.yml");

  assert.deepEqual(githubRunCommands("steps:\n  - run: |\n      a b\n      npm ci\n  - run: c"), ["a b", "c"]);
  assert.deepEqual(gitlabScriptCommands("job:\n  script:\n    - x\n    - y\n  other: 1\n"), ["x", "y"]);

  for (const [lock, expected] of [["yarn.lock", "yarn test"], ["bun.lockb", "bun run test"], ["package-lock.json", "npm test"]]) {
    const d = repo({ "package.json": PKG, [lock]: "" });
    assert.equal(detectChecks(d).checks[0].command, expected);
  }
  assert.deepEqual(detectChecks(repo()).checks, []);

  // init pre-fills the template TODOs once, and does not touch a Checks section the owner already edited.
  const first = runInit(dir);
  assert.equal(first.status, 0, first.stderr);
  const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.match(agents, /^- `pnpm test` \(from package\.json script "test"\)$/m);
  assert.match(agents, /owner to confirm/);
  assert.doesNotMatch(agents, /TODO: test command/);
  assert.match(agents, /- \*\*Local commits:\*\* TODO/, "Authority TODOs stay");
  assert.match(first.stdout, /Checks pre-filled/);
  const second = runInit(dir);
  assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), agents);
  assert.doesNotMatch(second.stdout, /would|update\s+AGENTS/);

  const edited = repo({ "package.json": PKG, "AGENTS.md": "# X\n\n## Checks\n\n- my own check\n" });
  runInit(edited);
  assert.doesNotMatch(readFileSync(join(edited, "AGENTS.md"), "utf8"), /pre-filled|vitest|npm test/i);
});

test("adopt_flags_conflicts", () => {
  const dir = repo();
  copyFileSync(join(FIX, "AGENTS.md"), join(dir, "AGENTS.md"));
  copyFileSync(join(FIX, "gitignore"), join(dir, ".gitignore"));
  const flags = flagConflicts(dir);
  const at = (file, line) => flags.find((f) => f.file === file && f.line === line);
  assert.match(at("AGENTS.md", 6)?.reason ?? "", /mandatory QA/);
  assert.match(at("AGENTS.md", 7)?.reason ?? "", /update PLAN\.md/);
  assert.match(at("AGENTS.md", 9)?.reason ?? "", /multi-agent or delegation strategy/);
  assert.equal(at("AGENTS.md", 11), undefined, "body lines under a flagged heading are not repeated");
  assert.equal(at("AGENTS.md", 5), undefined, "the checks line is not a conflict");
  assert.equal(at("AGENTS.md", 14), undefined, "normal rules are not flagged");
  assert.match(at(".gitignore", 5)?.reason ?? "", /hides all of \.claude/);
  assert.equal(flags.length, 4, JSON.stringify(flags));

  for (const line of [".claude", "/.claude/", ".claude/*"]) {
    assert.equal(flagConflicts(repo({ ".gitignore": `${line}\n` })).length, 1, line);
  }
  assert.equal(flagConflicts(repo({ ".gitignore": ".claude/worktrees/\n.claude/settings.local.json\n" })).length, 0);

  // Text inside the Maestro markers is never flagged.
  const inside = "# A\n<!-- MAESTRO START -->\n- Implementers are subagents; delegate via the architect.\n<!-- MAESTRO END -->\n";
  assert.equal(flagConflicts(repo({ "AGENTS.md": inside })).length, 0);

  // init prints the flags as review lines and edits nothing outside the markers.
  const r = runInit(dir);
  assert.match(r.stdout, /^review\s+AGENTS\.md:9 /m);
  assert.match(r.stdout, /^review\s+\.gitignore:5 /m);
  const after = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.ok(after.startsWith(readFileSync(join(FIX, "AGENTS.md"), "utf8")), "existing AGENTS.md text preserved");
  assert.ok(readFileSync(join(dir, ".gitignore"), "utf8").includes("\n.claude/\n"), ".claude/ line left for the owner to decide");
});
