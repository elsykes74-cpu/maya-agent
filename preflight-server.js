"use strict";
// Bare-min rescue server — pure Node.js built-in http module, ESM-safe.
// No external deps. Survives any import/crash by catching at top level.
process.on("uncaughtException", (e) => console.error("[preflight] uncaught:", e?.message || e));
process.on("unhandledRejection", (e) => console.error("[preflight] unhandled:", e?.message || e));

import http from "http";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const VERSION = (() => { try { return readFileSync(join(__dirname, ".git/HEAD"), "utf8").trim().slice(0, 12); } catch { return "unknown"; } })();

function envCheck() {
  const required = ["APP_ID","APP_SECRET","DATABASE_URL","KIMI_AUTH_URL","KIMI_OPEN_URL","OWNER_UNION_ID"];
  const missing = required.filter(k => !process.env[k]);
  return { present: required.filter(k => !!process.env[k]), missing, total: required.length };
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  if (req.url === "/__health" || req.url === "/__health/") {
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify({ status: "preflight-ok", uptime: process.uptime(), port: PORT, version: VERSION }, null, 2));
    return;
  }
  if (req.url === "/__env-debug" || req.url === "/__env-debug/") {
    res.writeHead(200, {"Content-Type":"application/json"});
    const env = envCheck();
    res.end(JSON.stringify({ phase:"preflight", NODE_ENV: process.env.NODE_ENV, port: PORT, version: VERSION, ...env, message: env.missing.length ? `Missing: ${env.missing.join(", ")}` : "All required vars present" }, null, 2));
    return;
  }

  // Try to load the real app
  const bootPath = join(__dirname, "dist", "boot.js");
  if (existsSync(bootPath)) {
    import(bootPath)
      .then(mod => {
        const realApp = mod.default ?? mod;
        console.log(`[preflight] dist/boot.js loaded — handing off to real app on port ${PORT}`);
        server.removeAllListeners("request");
        server.on("request", (rq, rs) => realApp.fetch(rq, rs));
      })
      .catch(err => {
        console.error("[preflight] dist/boot.js import FAILED:", err.message);
        serveBootError(res, err);
      });
    return; // boot.js handler will take over
  }

  serveRescue(res, null);
});

function serveRescue(res, bootErr) {
  res.writeHead(503, {"Content-Type":"text/html;charset=utf-8"});
  const env = envCheck();
  res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Maya AI — Start-up Error</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f0f1a;color:#e0e0e0;font-family:system-ui,-apple-system,sans-serif;padding:2rem;line-height:1.6}
h1{font-size:1.6rem;margin-bottom:.5rem}
.err{color:#ff6b6b}.ok{color:#6bffb8}
code{background:#1e1e2e;padding:.15em .5em;border-radius:4px;color:#ff9f43}
pre{background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:1rem;overflow-x:auto;margin:.75rem 0;color:#e0e0e0;font-size:.85rem}
a{color:#6bcfff;text-decoration:none}
a:hover{text-decoration:underline}
small{color:#555;font-size:.8rem}
</style></head><body>
<h1 class="err">🚨 Maya AI — Start-up Failed</h1>
<p>The application crashed during boot. This rescue page is served by <code>preflight-server.js</code>.</p>
${bootErr ? `<div class="box"><strong>Boot error:</strong><br/><code>${bootErr.message}</code></div>` : ''}
<div><strong>Environment check (${env.missing.length}/${env.total} missing):</strong>
<pre>${JSON.stringify(env, null, 2)}</pre></div>
<div><a href="/__env-debug">/__env-debug</a> · <a href="/__health">/__health</a> · 
<a href="https://docs.railway.com/observability/logs">Railway logs</a>
<p style="margin-top:1.5rem"><small>preflight v${VERSION} · port ${PORT}</small></p>
</div></body></html>`);
}

function serveBootError(res, err) {
  serveRescue(res, err);
}

server.listen(PORT, () => console.log(`[preflight] listening → port ${PORT}`));
server.on("error", (e) => { console.error("[preflight] server error:", e.message); process.exit(1); });
