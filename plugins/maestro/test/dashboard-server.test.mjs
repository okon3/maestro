import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, usageRefreshMs } from "../scripts/dashboard/server.mjs";
import { tempProject, write } from "./dashboard-helpers.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "cli.mjs");

function publicDir() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "maestro-pub-")));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>test page</title>");
  writeFileSync(join(dir, "app.js"), "export {};");
  return dir;
}

// Reads SSE text until `needle` shows up, or fails after timeoutMs.
async function waitForSse(res, needle, timeoutMs) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const chunk = await Promise.race([reader.read(), new Promise((r) => setTimeout(() => r({ timeout: true }), deadline - Date.now()))]);
      if (chunk.timeout || chunk.done) break;
      seen += decoder.decode(chunk.value, { stream: true });
      if (seen.includes(needle)) return seen;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  throw new Error(`no "${needle}" in SSE within ${timeoutMs} ms; got: ${JSON.stringify(seen)}`);
}

test("server_serves_and_streams", async () => {
  const { dir } = tempProject();
  const srv = await startServer({ root: dir, port: 0, publicDir: publicDir(), usageProbe: false });
  try {
    assert.equal(srv.server.address().address, "127.0.0.1");
    const base = `http://127.0.0.1:${srv.port}`;

    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type"), /text\/html/);
    assert.match(await index.text(), /test page/);
    assert.match((await fetch(`${base}/app.js`)).headers.get("content-type"), /javascript/);
    assert.equal((await fetch(`${base}/nope.css`)).status, 404);
    assert.equal((await fetch(`${base}/..%2f..%2fpackage.json`)).status, 400);

    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.header.activeGoal.id, "TASK-1");
    assert.equal(state.tasks.length, 4);
    assert.equal((await (await fetch(`${base}/api/health`)).json()).ok, true);
    assert.equal((await fetch(`${base}/api/state`, { method: "POST" })).status, 405);

    // SSE: a file write under backlog/ produces `event: changed` within 2 s.
    const stream = await fetch(`${base}/api/stream`);
    assert.match(stream.headers.get("content-type"), /text\/event-stream/);
    const waiting = waitForSse(stream, "event: changed", 2000);
    await new Promise((r) => setTimeout(r, 200));
    write(dir, "backlog/tasks/task-1.9 - New.md", "---\nid: TASK-1.9\ntitle: New\nstatus: Ready\n---\n");
    await waiting;
    // And one under .maestro/ too.
    const stream2 = await fetch(`${base}/api/stream`);
    const waiting2 = waitForSse(stream2, "event: changed", 2000);
    await new Promise((r) => setTimeout(r, 200));
    write(dir, ".maestro/events.jsonl", "{}\n");
    await waiting2;

    // /api/report: only .maestro/reports/ and backlog/decisions/.
    const ok = await fetch(`${base}/api/report?path=${encodeURIComponent(".maestro/reports/qa/QA-1.md")}`);
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get("content-type"), /text\/plain/);
    assert.match(await ok.text(), /QA 1: exploratory/);
    assert.equal((await fetch(`${base}/api/report?path=${encodeURIComponent("backlog/decisions/decision-1 - Open.md")}`)).status, 200);
    for (const bad of [
      "../x.md",
      ".maestro/reports/../config.json",
      ".maestro/reports/..\\config.json",
      "..%2fsecret",
      "backlog/tasks/task-1 - Goal.md",
      ".maestro/config.json",
      ".maestro/events.jsonl",
      "package.json",
      "/etc/passwd",
      "C:\\Windows\\win.ini",
      join(dir, ".maestro", "reports", "qa", "QA-1.md"),
      ".maestro/reports",
      "",
    ]) {
      const r = await fetch(`${base}/api/report?path=${encodeURIComponent(bad)}`);
      assert.equal(r.status, 400, `path ${JSON.stringify(bad)} should be rejected, got ${r.status}`);
    }
    assert.equal((await fetch(`${base}/api/report`)).status, 400);
    assert.equal((await fetch(`${base}/api/report?path=${encodeURIComponent(".maestro/reports/qa/missing.md")}`)).status, 404);
  } finally {
    await srv.close();
  }
});

test("dashboard_command_reuses_server", async () => {
  const { dir, env } = tempProject();
  const run = (...args) => spawnSync(process.execPath, [CLI, "dashboard", ...args], { cwd: dir, env, encoding: "utf8", timeout: 30000 });
  const health = async (port) => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      return false;
    }
  };
  let info;
  try {
    const first = run("--no-open", "--json", "--port", "0");
    assert.equal(first.status, 0, first.stderr);
    info = JSON.parse(first.stdout);
    assert.equal(info.reused, false);
    assert.ok(info.port > 0);
    assert.equal(info.url, `http://127.0.0.1:${info.port}/`);
    assert.ok(await health(info.port));
    const recorded = JSON.parse(readFileSync(join(dir, ".maestro", "runtime", "dashboard.json"), "utf8"));
    assert.deepEqual({ pid: recorded.pid, port: recorded.port, url: recorded.url }, { pid: info.pid, port: info.port, url: info.url });
    assert.ok(recorded.startedAt);

    const second = run("--no-open", "--json");
    assert.equal(second.status, 0, second.stderr);
    const again = JSON.parse(second.stdout);
    assert.deepEqual({ reused: again.reused, pid: again.pid, port: again.port }, { reused: true, pid: info.pid, port: info.port });

    const stop = run("--stop", "--json");
    assert.equal(stop.status, 0, stop.stderr);
    assert.equal(JSON.parse(stop.stdout).stopped, true);
    assert.equal(existsSync(join(dir, ".maestro", "runtime", "dashboard.json")), false);
    for (let i = 0; i < 30 && (await health(info.port)); i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(await health(info.port), false);

    // Stopping again is harmless, and a stale record does not block a fresh start.
    assert.equal(JSON.parse(run("--stop", "--json").stdout).stopped, false);
    mkdirSync(join(dir, ".maestro", "runtime"), { recursive: true });
    writeFileSync(join(dir, ".maestro", "runtime", "dashboard.json"), JSON.stringify({ pid: 999999, port: 1, url: "http://127.0.0.1:1/" }));
    const third = run("--no-open", "--json", "--port", "0");
    assert.equal(third.status, 0, third.stderr);
    info = JSON.parse(third.stdout);
    assert.equal(info.reused, false);
    assert.ok(await health(info.port));
  } finally {
    run("--stop");
  }
});

test("dashboard_samples_usage_every_2_minutes_from_80_percent", () => {
  const min = 60 * 1000;
  assert.equal(usageRefreshMs(null), 10 * min);
  assert.equal(usageRefreshMs({ fiveHour: 79.9, sevenDay: 30 }), 10 * min);
  assert.equal(usageRefreshMs({ fiveHour: 80, sevenDay: 30 }), 2 * min);
  assert.equal(usageRefreshMs({ fiveHour: 12, sevenDay: 88 }), 2 * min);
});
