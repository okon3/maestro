import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "../scripts/lib/config.mjs";
import { LINK_TYPE, normalizeSetup } from "../scripts/lib/worktree.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "..", "scripts", "cli.mjs");

/** A main checkout with a committed .gitignore, a node_modules folder with one package, and a config. */
function setup({ worktreeSetup = { link: ["node_modules"], run: null }, gitignore = "node_modules\n" } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "maestro-wt-")));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git("init", "-q", "-b", "master");
  writeFileSync(join(dir, "app.js"), "console.log(1);\n");
  if (gitignore !== null) writeFileSync(join(dir, ".gitignore"), gitignore);
  git("add", ".");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "pkg", "index.js"), "module.exports = 42;\n");
  mkdirSync(join(dir, ".maestro"));
  writeFileSync(join(dir, ".maestro", "config.json"), JSON.stringify({ mainBranch: "master", worktreeSetup }));
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) };
  const run = (args, cwd = dir) => spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8" });
  return { dir, git, run };
}

const pkgFile = (dir) => join(dir, "node_modules", "pkg", "index.js");
const wtPath = (dir, name) => join(dir, ".claude", "worktrees", name);

test("worktree_setup_links_node_modules", () => {
  const { dir, git, run } = setup();
  const r = run(["worktree", "impl-1", "--goal", "TASK-3", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  const wt = wtPath(dir, "impl-1");
  assert.deepEqual(result.setup.linked, ["node_modules"]);
  assert.deepEqual(result.setup.warnings, []);
  assert.ok(lstatSync(join(wt, "node_modules")).isSymbolicLink(), `${LINK_TYPE} created`);
  assert.equal(readFileSync(pkgFile(wt), "utf8"), "module.exports = 42;\n", "packages visible through the link");
  assert.equal(git("-C", wt, "status", "--porcelain"), "", "the link is ignored, the worktree is clean");
  // --reuse keeps (or restores) the link without running anything
  assert.equal(run(["worktree", "impl-1", "--goal", "TASK-3", "--reuse"]).status, 0);
  assert.ok(lstatSync(join(wt, "node_modules")).isSymbolicLink());
});

test("worktree_setup_warns_when_link_not_ignored", () => {
  const { dir, run } = setup({ gitignore: null });
  const r = run(["worktree", "impl-1", "--goal", "TASK-3"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), wtPath(dir, "impl-1"), "stdout is only the path");
  assert.match(r.stderr, /warning: node_modules: linked but not ignored by git/);
});

test("worktree_setup_skips_missing_source_and_runs_command", () => {
  const cmd = `${JSON.stringify(process.execPath)} -e "require('fs').writeFileSync('setup-ran.txt', process.env.MAESTRO_MAIN_CHECKOUT)"`;
  const { dir, run } = setup({ worktreeSetup: { link: ["vendor/cache"], run: cmd } });
  const r = run(["worktree", "impl-2", "--goal", "TASK-3", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.deepEqual(result.setup.linked, []);
  assert.match(result.setup.warnings[0], /vendor\/cache: missing in the main checkout/);
  assert.equal(result.setup.run.status, 0);
  assert.equal(readFileSync(join(wtPath(dir, "impl-2"), "setup-ran.txt"), "utf8"), dir);

  const failing = setup({ worktreeSetup: { link: [], run: `${JSON.stringify(process.execPath)} -e "process.exit(3)"` } });
  const f = failing.run(["worktree", "impl-1", "--goal", "TASK-3"]);
  assert.equal(f.status, 1);
  assert.match(f.stderr, /setup command failed \(exit 3\)/);
});

test("worktree_remove_leaves_link_target_intact", () => {
  const { dir, git, run } = setup();
  assert.equal(run(["worktree", "impl-1", "--goal", "TASK-3"]).status, 0);
  const wt = wtPath(dir, "impl-1");
  // A folder linked by hand (pilot friction #23), outside the configured links.
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "maestro-wt-target-")));
  writeFileSync(join(outside, "keep.txt"), "keep\n");
  symlinkSync(outside, join(wt, "cache"), LINK_TYPE);

  const r = run(["worktree", "impl-1", "--remove", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.removed, true);
  assert.deepEqual([...result.unlinked].sort(), ["cache", "node_modules"]);
  assert.equal(existsSync(wt), false, "worktree folder removed");
  assert.equal(readFileSync(pkgFile(dir), "utf8"), "module.exports = 42;\n", "main node_modules still has its files");
  assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "keep\n", "hand-made link target still has its files");
  assert.ok(!git("worktree", "list").includes("impl-1"));
  // removing again is a no-op
  assert.equal(run(["worktree", "impl-1", "--remove"]).status, 0);
});

test("worktree_remove_explains_failure", async () => {
  const { dir, run } = setup();
  assert.equal(run(["worktree", "impl-1", "--goal", "TASK-3"]).status, 0);
  const wt = wtPath(dir, "impl-1");

  // Dirty worktree: git refuses; the message says why and how to go on.
  writeFileSync(join(wt, "notes.txt"), "draft\n");
  const dirty = run(["worktree", "impl-1", "--remove"]);
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /cannot remove worktree/);
  assert.match(dirty.stderr, /Likely cause: the worktree has uncommitted changes or untracked files/);
  assert.match(dirty.stderr, /--remove --force/);
  assert.ok(existsSync(pkgFile(dir)), "link target intact after a failed removal");
  assert.ok(lstatSync(join(wt, "node_modules")).isSymbolicLink(), "link restored after a failed removal");

  if (process.platform === "win32") {
    // A process whose current folder is in the worktree (a preview server): refused before deleting anything.
    const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: wt, stdio: "ignore" });
    await new Promise((res) => setTimeout(res, 400));
    try {
      const busy = run(["worktree", "impl-1", "--remove", "--force"]);
      assert.equal(busy.status, 2, busy.stderr);
      assert.match(busy.stderr, /is in use .*nothing was removed/);
      assert.match(busy.stderr, /Likely cause: a process still holds files in the worktree: a dev or preview server/);
      assert.ok(existsSync(join(wt, "app.js")), "tracked files untouched");
      assert.ok(lstatSync(join(wt, "node_modules")).isSymbolicLink(), "link kept when refused");
    } finally {
      holder.kill();
      await new Promise((res) => holder.once("exit", res));
    }
  }

  const forced = run(["worktree", "impl-1", "--remove", "--force"]);
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(existsSync(wt), false);
  assert.equal(readFileSync(pkgFile(dir), "utf8"), "module.exports = 42;\n", "--force never reaches the main checkout");
});

test("worktree_detached_snapshot_gets_setup", () => {
  const { dir, git, run } = setup();
  git("tag", "qa/QA-1", "master");
  const r = run(["worktree", "qa-QA-1", "--detach", "qa/QA-1", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const wt = wtPath(dir, "qa-QA-1");
  assert.equal(JSON.parse(r.stdout).detached, true);
  assert.equal(git("-C", wt, "rev-parse", "HEAD"), git("rev-parse", "qa/QA-1"));
  assert.equal(git("-C", wt, "branch", "--show-current"), "", "detached HEAD");
  assert.ok(lstatSync(join(wt, "node_modules")).isSymbolicLink());
  assert.equal(run(["worktree", "qa-QA-1", "--detach", "qa/QA-1"]).status, 2, "refused when it exists");
  assert.equal(run(["worktree", "qa-QA-1", "--detach", "qa/QA-1", "--reuse"]).status, 0);
  assert.equal(run(["worktree", "qa-QA-2", "--detach", "qa/QA-9"]).status, 1, "unknown ref");
  assert.equal(run(["worktree", "qa-QA-1", "--remove", "--force"]).status, 0);
  assert.ok(existsSync(pkgFile(dir)));
});

test("config_default_worktree_setup", () => {
  assert.deepEqual(DEFAULTS.worktreeSetup, { link: [], run: null });
  assert.deepEqual(normalizeSetup(DEFAULTS.worktreeSetup), { link: [], run: null });
  assert.deepEqual(normalizeSetup({ link: ["./node_modules/", "apps\\web\\node_modules"] }), { link: ["node_modules", "apps/web/node_modules"], run: null });
  for (const bad of [{ link: "node_modules" }, { link: ["../x"] }, { link: ["/abs"] }, { link: [".git"] }, { run: 5 }, []]) {
    assert.throws(() => normalizeSetup(bad), /worktreeSetup/, JSON.stringify(bad));
  }
  const { run } = setup({ worktreeSetup: { link: ["../outside"] } });
  const r = run(["worktree", "impl-1", "--goal", "TASK-3"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /invalid \.maestro\/config\.json: worktreeSetup/);
});
