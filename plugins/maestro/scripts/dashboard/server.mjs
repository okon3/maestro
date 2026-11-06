// Dashboard HTTP server (contract: docs/dashboard-contract.md). Binds 127.0.0.1 only.
// Read-only on project files: it writes .maestro/runtime/dashboard.json (when run as a script) and, through
// `maestro usage --probe`, the usage sample (runtime/usage.json plus a usage.sample event).
//   node server.mjs --root <project root> [--port N] [--public <dir>]
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadState } from "./state.mjs";

export const DEFAULT_PORT = 4517;
const HOST = "127.0.0.1";
const DEBOUNCE_MS = 500;
const HEARTBEAT_MS = 25000;
// Usage is refreshed by the dashboard itself while a page is open, so it stays current when the PM is busy.
// Each probe is one minimal `claude -p` call on the cheapest model (`maestro usage --probe`).
const USAGE_REFRESH_MS = 10 * 60 * 1000;
const USAGE_CHECK_MS = 60 * 1000;
const PORT_ATTEMPTS = 20;
const DEFAULT_PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

export const runtimeFile = (root) => join(root, ".maestro", "runtime", "dashboard.json");

const inside = (base, target) => target === base || target.startsWith(base.endsWith(sep) ? base : base + sep);

/** Resolve an `/api/report?path=` value to an absolute file, or null when it is not allowed. */
export function resolveReportPath(root, requested) {
  if (typeof requested !== "string" || requested === "" || requested.includes("\0")) return null;
  const parts = requested.split(/[\\/]+/);
  if (parts.includes("..") || /^[A-Za-z]:/.test(requested) || requested.startsWith("/") || requested.startsWith("\\")) return null;
  const abs = resolve(root, ...parts);
  const allowed = [join(root, ".maestro", "reports"), join(root, "backlog", "decisions")];
  if (!allowed.some((dir) => inside(dir, abs) && abs !== dir)) return null;
  // Resolve symlinks too, so a link inside an allowed directory cannot leave it.
  try {
    const real = realpathSync(abs);
    const okReal = allowed.some((dir) => {
      try {
        return inside(realpathSync(dir), real);
      } catch {
        return false;
      }
    });
    return okReal ? abs : null;
  } catch {
    return abs; // missing file: the caller answers 404
  }
}

function listen(server, port) {
  return new Promise((resolveP, reject) => {
    const onError = (e) => {
      server.off("listening", onListening);
      reject(e);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveP(server.address().port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

/**
 * Start the server. Options: root (required), port (default 4517, falls back to the next free ports; 0 = any),
 * publicDir (static files), debounceMs, heartbeatMs. Resolves to {server, port, url, close()}.
 */
export async function startServer({ root, port = DEFAULT_PORT, publicDir = DEFAULT_PUBLIC, debounceMs = DEBOUNCE_MS, heartbeatMs = HEARTBEAT_MS, usageProbe = true } = {}) {
  if (!root) throw new Error("root is required");
  root = resolve(root);
  const clients = new Set();
  let actualPort = 0;

  const hostOk = (host) => {
    if (!host) return true;
    const h = host.toLowerCase();
    return h === `127.0.0.1:${actualPort}` || h === `localhost:${actualPort}` || h === "127.0.0.1" || h === "localhost";
  };

  const send = (res, status, body, type = "text/plain; charset=utf-8") => {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(body);
  };

  const serveStatic = (res, pathname) => {
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return send(res, 400, "bad request");
    }
    if (rel === "/") rel = "/index.html";
    if (rel.includes("\0") || rel.split(/[\\/]+/).includes("..")) return send(res, 400, "bad request");
    const base = resolve(publicDir);
    const file = resolve(base, "." + rel);
    if (!inside(base, file) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, "not found");
    send(res, 200, readFileSync(file), MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
  };

  const handler = (req, res) => {
    try {
      if (!hostOk(req.headers.host)) return send(res, 400, "bad host");
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed");
      const url = new URL(req.url, `http://${HOST}`);
      switch (url.pathname) {
        case "/api/health":
          return send(res, 200, JSON.stringify({ ok: true, root, pid: process.pid }), "application/json; charset=utf-8");
        case "/api/state":
          return send(res, 200, JSON.stringify(loadState(root)), "application/json; charset=utf-8");
        case "/api/stream": {
          res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-content-type-options": "nosniff" });
          res.write("retry: 2000\n\n: connected\n\n");
          clients.add(res);
          req.on("close", () => clients.delete(res));
          return;
        }
        case "/api/report": {
          const file = resolveReportPath(root, url.searchParams.get("path"));
          if (!file) return send(res, 400, "path must be under .maestro/reports/ or backlog/decisions/");
          if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, "not found");
          return send(res, 200, readFileSync(file, "utf8"));
        }
        default:
          if (url.pathname.startsWith("/api/")) return send(res, 404, "not found");
          return serveStatic(res, url.pathname);
      }
    } catch (e) {
      send(res, 500, `error: ${e.message}`);
    }
  };

  const server = createServer(handler);
  const first = port === 0 ? 0 : port;
  let lastError;
  for (let i = 0; i < (port === 0 ? 1 : PORT_ATTEMPTS); i++) {
    try {
      actualPort = await listen(server, first + i);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      if (e.code !== "EADDRINUSE" && e.code !== "EACCES") throw e;
    }
  }
  if (lastError) throw lastError;

  // fs.watch notifications, debounced into one `changed` event.
  let timer = null;
  const notify = (_type, filename) => {
    if (filename && String(filename).endsWith("dashboard.json")) return; // our own runtime file
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      for (const c of clients) c.write("event: changed\ndata: {}\n\n");
    }, debounceMs);
  };
  const watchers = [];
  for (const dir of [join(root, "backlog"), join(root, ".maestro")]) {
    if (!existsSync(dir)) continue;
    try {
      const w = watch(dir, { recursive: true }, notify);
      w.on("error", () => {});
      watchers.push(w);
    } catch {
      // The watcher is best effort: the page still works with manual reloads.
    }
  }
  const heartbeat = setInterval(() => {
    for (const c of clients) c.write(": ping\n\n");
  }, heartbeatMs);
  heartbeat.unref();

  // Usage probe: only while at least one page is connected and the last sample is older than 10 minutes.
  let probing = false;
  const usageAge = () => {
    try {
      const u = JSON.parse(readFileSync(join(root, ".maestro", "runtime", "usage.json"), "utf8"));
      return Date.now() - Date.parse(u.ts);
    } catch {
      return Infinity;
    }
  };
  const probeUsage = () => {
    if (!usageProbe || probing || !clients.size || usageAge() < USAGE_REFRESH_MS) return;
    probing = true;
    const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));
    const child = spawn(process.execPath, [cli, "usage", "--probe"], { cwd: root, stdio: "ignore", windowsHide: true });
    child.on("error", () => (probing = false));
    child.on("exit", () => (probing = false)); // the new sample changes .maestro/, which triggers a page refresh
  };
  const usageTimer = setInterval(probeUsage, USAGE_CHECK_MS);
  usageTimer.unref();

  const close = () =>
    new Promise((done) => {
      clearInterval(heartbeat);
      clearInterval(usageTimer);
      if (timer) clearTimeout(timer);
      for (const w of watchers) w.close();
      for (const c of clients) c.end();
      clients.clear();
      server.close(() => done());
      server.closeAllConnections?.();
    });

  return { server, port: actualPort, url: `http://${HOST}:${actualPort}/`, close };
}

// ---------------------------------------------------------------------------------------------
// Script entry: used by `maestro dashboard` (detached) and for debugging.

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function runAsScript(argv) {
  const root = argValue(argv, "--root");
  if (!root) throw new Error("usage: node server.mjs --root <project root> [--port N] [--public <dir>]");
  const portArg = argValue(argv, "--port");
  const srv = await startServer({
    root,
    port: portArg === undefined ? DEFAULT_PORT : Number(portArg),
    publicDir: argValue(argv, "--public") ?? DEFAULT_PUBLIC,
  });
  const file = runtimeFile(resolve(root));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ pid: process.pid, port: srv.port, url: srv.url, startedAt: new Date().toISOString() }, null, 2));
  const cleanup = () => {
    try {
      if (JSON.parse(readFileSync(file, "utf8")).pid === process.pid) rmSync(file, { force: true });
    } catch {
      // already gone
    }
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  console.log(srv.url);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAsScript(process.argv.slice(2)).catch((e) => {
    console.error(`maestro dashboard server: ${e.message}`);
    process.exit(1);
  });
}
