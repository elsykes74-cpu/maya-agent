// Hampden County Registry of Deeds — distressed-filing scan via Playwright.
//
// Why this exists: the registry's Imperva bot management blocks datacenter
// fetches (Vercel serverless) and silently bounces automated browsers off the
// results page. This script runs a real Chromium (stealth-patched, headed
// under xvfb) through the residential proxy and drives the registry's actual
// search UI: Research Home → Search Registry Records → Entry Date tab →
// per-document-type searches for distress filings.
//
// Env: REGISTRY_INGEST_URL, CRON_SECRET, PROXY_URL (http://user:pass@host:port),
//      LOOKBACK_DAYS (default 9)

import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

chromium.use(stealth());

const HOME = "https://search.hampdendeeds.com/";
const ENTRY_DATE_TAB =
  "https://search.hampdendeeds.com/ALIS/WW400R.HTM?WSIQTP=LR09D&WSKYCD=E";
const INGEST_URL = process.env.REGISTRY_INGEST_URL;
const CRON_SECRET = process.env.CRON_SECRET;
const PROXY_URL = process.env.PROXY_URL;
const LOOKBACK_DAYS = parseInt(process.env.LOOKBACK_DAYS || "9", 10);

// Distress document-type codes observed in the registry's W9ABR dropdown.
const DOC_TYPES = ["LP", "ON", "FDD", "FDTRD", "FDAFT"];

if (!INGEST_URL || !CRON_SECRET) {
  console.error("REGISTRY_INGEST_URL and CRON_SECRET are required");
  process.exit(1);
}

function alisDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}${dd}${d.getFullYear()}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const launchOpts = {
  headless: false, // headed under xvfb: much harder to fingerprint than headless
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
};
if (PROXY_URL) {
  const u = new URL(PROXY_URL);
  launchOpts.proxy = {
    server: `${u.protocol}//${u.host}`,
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
  console.log("using proxy:", `${u.protocol}//${u.host}`);
}

const browser = await chromium.launch(launchOpts);
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  locale: "en-US",
  timezoneId: "America/New_York",
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();

const to = new Date();
const from = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
const fromStr = alisDate(from);
const toStr = alisDate(to);
console.log(`date window: ${fromStr} → ${toStr}`);

// Establish a normal session via the home page first (cold deep-links bounce).
await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(3000);
console.log("home title:", await page.title());

let totalFound = 0;
let totalAdded = 0;

for (const docType of DOC_TYPES) {
  console.log(`\n── doc type ${docType} ──`);
  await page.goto(ENTRY_DATE_TAB, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2000);

  const formPresent = await page.$('form[name="WW413R00"]');
  if (!formPresent) {
    console.error(`search form not present for ${docType} — page may have bounced`);
    console.log("url:", page.url(), "| title:", await page.title());
    continue;
  }

  await page.fill('input[name="W9FDTA"]', fromStr);
  await page.fill('input[name="W9TDTA"]', toStr);

  // Select the document type if the option exists; fall back to *ALL.
  const optionValues = await page.$$eval(
    'select[name="W9ABR"] option',
    (opts) => opts.map((o) => o.value)
  );
  const want = optionValues.includes(docType) ? docType : "*ALL";
  await page.selectOption('select[name="W9ABR"]', want);
  console.log(`W9ABR set to: ${want} (options seen: ${optionValues.length})`);

  // Submit and wait for the results page (LR13AP) or a no-results message.
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {}),
    page.click('input[type="submit"], button[type="submit"]'),
  ]);
  await sleep(4000);

  // Poll for results content (the form's spinner can delay rendering).
  let settled = false;
  for (let i = 0; i < 12 && !settled; i++) {
    const bodyText = (await page.textContent("body").catch(() => "")) || "";
    if (
      /view document image/i.test(bodyText) ||
      /no \(more\) matching/i.test(bodyText) ||
      page.url().includes("LR13AP")
    ) {
      settled = true;
    } else {
      await sleep(5000);
    }
  }

  const url = page.url();
  const bodyText = ((await page.textContent("body").catch(() => "")) || "").slice(0, 1200);
  console.log("results url:", url);
  console.log("body preview:", JSON.stringify(bodyText.slice(0, 400)));

  if (!url.includes("LR13AP") && !/view document image/i.test(bodyText)) {
    console.error(`results did not render for ${docType} (bounced or blocked)`);
    continue;
  }

  const html = await page.content();
  console.log(`html length: ${html.length}, has rows: ${html.includes("View Document Image")}`);

  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}` },
    body: JSON.stringify({ html }),
  });
  const data = await res.json().catch(() => ({}));
  console.log("ingest:", res.status, JSON.stringify(data).slice(0, 200));
  if (res.ok && data.ok) {
    totalFound += data.found || 0;
    totalAdded += data.added || 0;
  }
  await sleep(2500); // politeness between searches
}

await browser.close();
console.log(`\ndone: totalFound=${totalFound} totalAdded=${totalAdded}`);
