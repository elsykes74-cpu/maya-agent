
// Fail-fast health check - runs before serve()
(async () => {
  try {
    // Quick env check
    ["APP_ID","APP_SECRET","DATABASE_URL","KIMI_AUTH_URL","NODE_ENV"].forEach(v => {
      if (!process.env[v]) throw new Error(`[healthcheck] MISSING: ${v}`);
    });
    console.log("[healthcheck] OK");
    process.exit(0);
  } catch(e) {
    console.error(e.message);
    process.exit(1);
  }
})();
