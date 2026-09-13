// Hampden County Registry of Deeds — per-address deed lookup via Playwright.
//
// Why this exists: RentCast property records have NO sale history for Hampden
// County, so last-purchase dates come from the registry itself (the actual
// public record). This script drives the registry's public address index:
//
//   For each hot lead address: address search (W9PADR = street, W9TOWN = town)
//   → walk result pages → collect deed-type documents (book/page, recording
//   date, grantor/grantee) → POST to the Vercel registry-deed-ingest endpoint.
//
// The registry index carries NO consideration (sale price shows only on the
// scanned document image), so this fills lastSaleDate + deed chain only.
//
// Discovered 2026-09-13 via live mapping:
//   Address search: /ALIS/WW400R.HTM?WSIQTP=SY14D&WSKYCD=T  (form WW414R00)
//   Results (GET):  W9PADR=<addr>&W9ABR=*ALL&W9TOWN=<code>&W9FDTA=&W9TDTA=
//                   &WSHTNM=WW414R00&WSIQTP=SY14AP&WSKYCD=T&WSWVER=2
//   - Results are DOCUMENTS (3/page, chronological oldest→newest), "Next"
//     carries state in query params — follow the link, don't build page URLs.
//   - Each row: "View Abstract" link, Bk-Pg, Recorded MM-DD-YYYY, Inst #,
//     Type (Deed / Trustees Deed / Mortgage / ...), Desc, Town/Addr,
//     Gtor/Gtee party names. Mortgages show "Doc$" (loan amount, NOT price).
//   - Prefix matching on the address key: "37 SPRUCE ST" narrows to that
//     property; bare "SPRUCE" also matches SPRUCELAND AVE etc.
//
// Env: DEED_QUEUE_URL (default production queue endpoint),
//      DEED_INGEST_URL (default production ingest endpoint),
//      CRON_SECRET, PROXY_URL (http://user:pass@host:port), DEED_LIMIT (default 10)

import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

chromium.use(stealth());

const BASE = "https://search.hampdendeeds.com";
const HOME = `${BASE}/`;
const ADDR_SEARCH = `${BASE}/ALIS/WW400R.HTM?WSIQTP=SY14D&WSKYCD=T`;
const QUEUE_URL = process.env.DEED_QUEUE_URL || "https://maya-agent-rho.vercel.app/api/cron/deed-lookup-queue";
const INGEST_URL = process.env.DEED_INGEST_URL || "https://maya-agent-rho.vercel.app/api/cron/registry-deed-ingest";
const CRON_SECRET = process.env.CRON_SECRET;
const PROXY_URL = process.env.PROXY_URL;
const DEED_LIMIT = parseInt(process.env.DEED_LIMIT || "10", 10);

if (!CRON_SECRET) {
  console.error("CRON_SECRET is required");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Street suffixes to drop for the fallback (broader) query.
const SUFFIX_RE = /\s+(ST|STREET|AVE|AVENUE|RD|ROAD|LN|LANE|DR|DRIVE|CT|COURT|PL|PLACE|TER|TERRACE|SQ|SQUARE|BLVD|BOULEVARD|WAY|CIR|CIRCLE|PKWY|PARKWAY|EXT|EXTENSION)\.?$/i;

function resultsUrl(padr, town) {
  return (
    `${BASE}/ALIS/WW400R.HTM?W9PADR=${encodeURIComponent(padr)}` +
    `&W9ABR=*ALL&W9TOWN=${encodeURIComponent(town)}&W9FDTA=&W9TDTA=` +
    `&WSHTNM=WW414R00&WSIQTP=SY14AP&WSKYCD=T&WSWVER=2`
  );
}

function normTown(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z]/g, "");
}

async function authedGet(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  if (!res.ok) throw new Error(`queue fetch failed: ${res.status}`);
  return res.json();
}

async function authedPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Extract document rows + next-page href from a results page.
async function extractPage(page) {
  return page.evaluate(() => {
    const rows = [];
    const anchors = Array.from(document.querySelectorAll("a"));
    const viewLinks = anchors.filter((a) => /view abstract/i.test((a.textContent || "").trim()));
    for (const a of viewLinks) {
      let el = a.parentElement;
      let text = "";
      for (let i = 0; i < 8 && el; i++) {
        text = el.innerText || "";
        if (/Bk-Pg:/i.test(text) && /Recorded:/i.test(text)) break;
        el = el.parentElement;
      }
      const href = a.getAttribute("href") || "";
      rows.push({ text, href });
    }
    const next = anchors.find((a) => /^\s*next\s*$/i.test(a.textContent || ""));
    return {
      rows,
      // a.href is fully resolved by the DOM — the Next form carries its
      // continuation state (WSGKEY/W9RRN/...) in the query string.
      nextHref: next ? next.href : null,
      title: document.title,
      bodyStart: (document.body?.innerText || "").slice(0, 300),
    };
  });
}

function parseRow(text) {
  const book = text.match(/Bk-Pg:\s*(\d+)\s*-\s*(\d+)/i);
  const rec = text.match(/Recorded:\s*(\d{2})-(\d{2})-(\d{4})/);
  const type = text.match(/^\s*Type:\s*([^\n\r]+)/im);
  const desc = text.match(/^\s*Desc:\s*([^\n\r]+)/im);
  const town = text.match(/^\s*Town:\s*([^\n\r]+)/im);
  const gtor = text.match(/Gtor:\s*([^\n\r]{1,200})/i);
  const gtee = text.match(/Gtee:\s*([^\n\r]{1,200})/i);
  return {
    book: book ? book[1] : null,
    page: book ? book[2] : null,
    recordedDate: rec ? `${rec[3]}-${rec[1]}-${rec[2]}` : null,
    docType: type ? type[1].trim() : null,
    desc: desc ? desc[1].trim() : null,
    townAddr: town ? town[1].trim() : null,
    grantor: gtor ? gtor[1].trim() : null,
    grantee: gtee ? gtee[1].trim() : null,
  };
}

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

// 1. Queue of hot-lead addresses to check.
const queue = await authedGet(`${QUEUE_URL}?limit=${DEED_LIMIT}`);
const leads = Array.isArray(queue?.leads) ? queue.leads : [];
console.log(`queue: ${queue?.count ?? leads.length} addresses`);
if (leads.length === 0) {
  await browser.close();
  console.log("done: nothing to check");
  process.exit(0);
}

// 2. Establish session (Imperva interstitial clears on its own in a real browser).
await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: 60000 });
for (let i = 0; i < 12; i++) {
  const title = await page.title().catch(() => "");
  if (/hampden/i.test(title)) break;
  await sleep(5000);
}
console.log("home title:", await page.title());

// 3. Town code map from the address-search form's W9TOWN select.
await page.goto(ADDR_SEARCH, { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2000);
const townMap = await page.evaluate(() => {
  const sel = document.querySelector('select[name="W9TOWN"]');
  const map = {};
  if (sel) {
    for (const o of sel.options) {
      const label = (o.textContent || "").toUpperCase().replace(/[^A-Z]/g, "");
      if (label && o.value) map[label] = o.value;
    }
  }
  return map;
});
console.log(`town options mapped: ${Object.keys(townMap).length}`);

let done = 0;
let withDeeds = 0;

for (const lead of leads) {
  const street = String(lead.street || "").toUpperCase().trim();
  const townCode = townMap[normTown(lead.city)] || "*ALL";
  console.log(`\n── lead ${lead.id}: ${street} (${lead.city || "?"}) town=${townCode} ──`);
  if (!street) {
    console.log("no street — skipping");
    continue;
  }

  // Try full street first, then with the suffix dropped (site hint).
  const queries = [street];
  const noSuffix = street.replace(SUFFIX_RE, "").trim();
  if (noSuffix && noSuffix !== street) queries.push(noSuffix);

  const docs = [];
  const seenKeys = new Set();
  let searched = false;

  for (const q of queries) {
    await page.goto(resultsUrl(q, townCode), { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(2500);

    let pages = 0;
    let bounced = false;
    for (;;) {
      const { rows, nextHref, title, bodyStart } = await extractPage(page);
      const t = title || "";
      // Results page title is "Rec Land Address Search Results"; the bare
      // search form is titled "Address Search". Don't confuse the two.
      if (/^\s*address search\s*$/i.test(t)) {
        console.log(`query "${q}": REALLY bounced to form (title="${t}")`);
        bounced = true;
        break;
      }
      if (!/rec land address search results/i.test(t)) {
        console.log(`query "${q}": unexpected page (title="${t}") body=${JSON.stringify(bodyStart.slice(0, 160))}`);
        bounced = true;
        break;
      }
      for (const r of rows) {
        const d = parseRow(r.text);
        if (!d.book || !d.page || !d.recordedDate) continue;
        const key = `${d.book}-${d.page}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        docs.push(d);
      }
      pages++;
      if (bounced || !nextHref || pages >= 40) break;
      await page.goto(nextHref, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(2000);
    }
    searched = true;
    console.log(`query "${q}": ${docs.length} docs over ${pages} page(s)`);
    if (docs.length > 0) break; // full-street query hit; no need for the broader one
  }

  if (!searched) console.log("no search completed for this address");

  const deeds = docs
    .filter((d) => /deed/i.test(d.docType || ""))
    .sort((a, b) => b.recordedDate.localeCompare(a.recordedDate));
  console.log(`deed-type docs: ${deeds.length}`);
  if (deeds[0]) {
    console.log(
      `latest: ${deeds[0].recordedDate} ${deeds[0].docType} Bk ${deeds[0].book}-${deeds[0].page} ` +
        `gtor=${(deeds[0].grantor || "").slice(0, 60)} gtee=${(deeds[0].grantee || "").slice(0, 60)}`
    );
  }

  const res = await authedPost(INGEST_URL, { leadId: lead.id, deeds });
  console.log("ingest:", res.status, JSON.stringify(res.data).slice(0, 160));
  done++;
  if (deeds.length > 0) withDeeds++;
  await sleep(2500); // politeness between addresses
}

await browser.close();
console.log(`\ndone: checked=${done} withDeeds=${withDeeds}`);
