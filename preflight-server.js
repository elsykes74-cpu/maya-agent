"use strict";
import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

// ─── Always-available diagnostic endpoints ───────────────────────────────────
app.get("/__env-debug", (c) => {
  const required = ["APP_ID", "APP_SECRET", "DATABASE_URL", "KIMI_AUTH_URL", "KIMI_OPEN_URL", "NODE_ENV"];
  const missing = required.filter((k) => !process.env[k]);
  return c.json({
    phase: "preflight",
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    requiredMissing: missing,
    envPresence: Object.fromEntries(required.map((k) => [k, !!process.env[k]])),
    message: missing.length ? `Missing: ${missing.join(", ")}` : "All required vars present",
  });
});

app.get("/__health", (c) => c.json({ status: "preflight", uptime: process.uptime() }));

// ─── Try real app boot ───────────────────────────────────────────────────────
import("./dist/boot.js")
  .then((mod) => {
    console.log("[preflight] dist/boot.js loaded OK — switching to real app");
    // Serve only the real app from now on
    const realApp = mod.default ?? mod;
    const port = Number.parseInt(process.env.PORT ?? "3000", 10);
    serve({ fetch: realApp.fetch, port }, () => {
      console.log(`[server] real app listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("[preflight] dist/boot.js FAILED:", err.message);
    console.error("[preflight] serving rescue page until fix is deployed");

    app.all("*", (c) =>
      c.html(
        `<!DOCTYPE html><html><head><title>Maya AI — Start-up Error</title>
         <meta name="viewport" content="width=device-width,initial-scale=1"/>
         <style>
           *{box-sizing:border-box;margin:0;padding:0}
           body{background:#0f0f1a;color:#e0e0e0;font-family:system-ui,sans-serif;padding:1.5rem;line-height:1.6}
           .err{color:#ff6b6b;font-weight:700}
           code{background:#1e1e2e;padding:.1em .4em;border-radius:3px;color:#ff9f43;font-size:.9em}
           a{color:#6bcfff}
           .box{background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:1.25rem;margin-top:1rem}
         </style></head><body>
         <h1 class="err">🚨 Maya AI — Start-up Failed</h1>
         <p>The application crashed during boot.</p>
         <div class="box"><strong>Error:</strong><br/><code>${err.message}</code></div>
         <p>Next step: visit <a href="/__env-debug">/__env-debug</a> to check environment variables.</p>
         <p style="margin-top:1rem;color:#888">This rescue page is served by <code>preflight-server.js</code>.
            Replace this file with a production build once the underlying issue is fixed.</p>
         </body></html>`,
      ),
    );

    const port = Number.parseInt(process.env.PORT ?? "3000", 10);
    serve({ fetch: app.fetch, port }, () => {
      console.log(`[rescue] listening on port ${port}`);
    });
  });
