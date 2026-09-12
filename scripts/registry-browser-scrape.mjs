// Hampden County Registry of Deeds — browser scrape via Playwright.
// Runs in GitHub Actions (weekly). A real Chromium solves the Imperva JS
// challenge that blocks Vercel's serverless fetch, then POSTs the rendered
// ALIS results HTML to /api/cron/registry-ingest for parsing + lead insert.
//
// Env: REGISTRY_INGEST_URL (full URL incl ?secret=...), LOOKBACK_DAYS (default 9)

import { chromium } from "playwright";

const ALIS_BASE = "https://search.hampdendeeds.com/ALIS/WW400R.HTM";
const INGEST_URL = process.env.REGISTRY_INGEST_URL;
const LOOKBACK_DAYS = parseInt(process.env.LOOKBACK_DAYS || "9", 10);

if (!INGEST_URL) {
  console.error("REGISTRY_INGEST_URL is required");
  process.exit(1);
}

function alisDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}${dd}${d.getFullYear()}`;
}

function buildAlisUrl() {
  const to = new Date();
  const from = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const params = [
    "W9ABR=*ALL",
    "W9TOWN=*ALL",
    `W9FDTA=${alisDate(from)}`,
    `W9TDTA=${alisDate(to)}`,
    "WSHTNM=WW414R00",
    "WSIQTP=SY14AP",
    "WSKYCD=T",
    "WSWVER=2",
  ];
  return `${ALIS_BASE}?${params.join("&")}`;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  locale: "en-US",
  timezoneId: "America/New_York",
});
const page = await context.newPage();

const url = buildAlisUrl();
console.log("navigating to ALIS:", url);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

// Imperva JS challenge: wait for it to resolve (up to 60s), then wait for
// the results table or the "no matching names" message.
try {
  await page.waitForFunction(
    () => {
      const t = document.body ? document.body.innerText : "";
      return (
        t.includes("View Document Image") ||
        /no \(more\) matching names found/i.test(t) ||
        t.includes("Instrument #")
      );
    },
    { timeout: 90000, polling: 2000 },
  );
} catch {
  console.error("timed out waiting for ALIS results (Imperva may have hard-blocked)");
}

const html = await page.content();
console.log("html length:", html.length);
console.log("has results:", html.includes("View Document Image"));
console.log("has no-results msg:", /no \(more\) matching names found/i.test(html));
console.log("has incapsula:", html.includes("_Incapsula_") || html.includes("incapsula"));

await browser.close();

if (html.length < 1000) {
  console.error("page content too short — aborting");
  process.exit(1);
}

// POST rendered HTML to Vercel for parsing + insert.
const res = await fetch(INGEST_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ html }),
});
const data = await res.json().catch(() => ({}));
console.log("ingest status:", res.status, JSON.stringify(data).slice(0, 300));
if (!res.ok || !data.ok) {
  console.error("ingest failed");
  process.exit(1);
}
console.log(`done: found=${data.found} added=${data.added}`);
