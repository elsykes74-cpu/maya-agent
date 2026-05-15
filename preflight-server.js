"use strict";
// Ultra-minimal rescue: zero deps, zero require() — runs on every Node version
console.log("[preflight] starting bare http server…");

const PORT = process.env.PORT || 3000;
const server = require("http").createServer((req, res) => {
  res.writeHead(200, {"Content-Type": "application/json"});
  res.end(JSON.stringify({
    phase: "preflight-bare",
    uptime: process.uptime(),
    port: PORT,
    now: new Date().toISOString(),
  }, null, 2));
});

server.listen(PORT, (err) => {
  if (err) { console.error("[preflight] listen error:", err); process.exit(1); }
  console.log(`[preflight] HTTP server listening on port ${PORT}`);
});

server.on("error", (e) => console.error("[preflight] server error:", e));
process.on("unhandledRejection", (e) => console.error("[preflight] unhandled:", e));
process.on("uncaughtException", (e) => console.error("[preflight] uncaught:", e));
