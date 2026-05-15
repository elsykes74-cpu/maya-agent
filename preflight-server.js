"use strict";
// Rescues the dashboard when dist/boot.js is missing or crashes.
// Zero runtime deps — only Node.js built-in http module.
const http = require("http");

const required = ["APP_ID", "APP_SECRET", "DATABASE_URL", "KIMI_AUTH_URL", "KIMI_OPEN_URL", "OWNER_UNION_ID"];
const missing = required.filter((k) => !process.env[k]);

const ENV_JSON = JSON.stringify({
  phase: "preflight",
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  requiredMissing: missing,
  envPresence: Object.fromEntries(required.map((k) => [k, !!process.env[k]])),
  message: missing.length ? `Missing: ${missing.join(", ")}` : "All required vars present",
}, null, 2);

const HEALTH_JSON = JSON.stringify({
  status: missing.length ? "degraded" : "preflight-ok",
  uptime: process.uptime(),
  envOk: missing.length === 0,
});

const server = http.createServer((req, res) => {
  // CORS for browser-based probes
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  if (req.url === "/__env-debug" || req.url === "/__env-debug/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(ENV_JSON);
    return;
  }
  if (req.url === "/__health" || req.url === "/__health/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(HEALTH_JSON);
    return;
  }

  // Rescue page
  res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html><html><head><title>Maya AI — Start-up Error</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f0f1a;color:#e0e0e0;font-family:system-ui,sans-serif;padding:1.5rem;line-height:1.6}
.err{color:#ff6b6b;font-weight:700}
code{background:#1e1e2e;padding:.1em .4em;border-radius:3px;color:#ff9f43;font-size:.9em}
a{color:#6bcfff}
.box{background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:1.25rem;margin:1rem 0}
small{color:#666}
</style></head><body>
<h1 class="err">🚨 Maya AI — Start-up Failed</h1>
<p>The app crashed before it could start. This rescue page is served by <code>preflight-server.js</code>.</p>
<div class="box"><strong>Boot error:</strong><br/><code>dist/boot.js not found or crashed</code></div>
<div class="box"><strong>Environment (${missing.length} missing):</strong><br/><pre>${ENV_JSON}</pre></div>
<p>Next step: check <a href="https://docs.railway.com/observability/logs">Railway deploy logs</a> or fix the build and redeploy.</p>
<p style="margin-top:1rem;color:#666;font-size:.85em">
  Required vars missing: ${missing.join(", ") || "none"} — 
  visit <a href="/__env-debug">/__env-debug</a> anytime.
</p>
</body></html>`);
});

const port = Number.parseInt(process.env.PORT || "3000", 10);
server.listen(port, () => console.log(`[preflight] listening on port ${port}`));
