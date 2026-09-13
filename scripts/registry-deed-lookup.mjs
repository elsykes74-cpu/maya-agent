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
// Search strategy (verified 2026-09-13 against the live site):
//   Phase 1 — number-keyed query, e.g. W9PADR="382 HANCOCK ST". The index key
//     includes house numbers (rows show "Addr: 382 HANCOCK ST"; the Desc field
//     is street-name-only, so match on Addr). Finds deeds recorded ~1990+.
//   Phase 2 — fallback when phase 1 finds no deed: street-wide query
//     (W9PADR="HANCOCK ST") in newest-first 10-year windows via W9FDTA/W9TDTA
//     (MMDDYYYY). Older docs were indexed WITHOUT house numbers
//     ("Addr: HANCOCK ST"), so each deed-type candidate's abstract is opened
//     and checked for the house number ("Notes: 382 HANCOCK ST / ...").
//     Stops at the first window yielding a verified deed (the most recent
//     purchase). Bounded: 6 windows (60 yrs), 25 pages + 30 abstracts/window.
//
// DOM notes (verified 2026-09-13):
//   - "View Abstract" anchors have EMPTY textContent — the words live only in
//     the nested <img alt="View Abstract">. Match the img alt, not link text.
//   - Abstract hrefs ARE real URLs (WSIQTP=LR09A...) — plain goto works.
//   - "Next" is javascript:doVarButton2('search','SY14N') form post — click it,
//     don't navigate to an href. Stop when a page yields zero new docs.
//
// Env: DEED_QUEUE_URL (default production queue endpoint),
//      DEED_INGEST_URL (default production ingest endpoint),
//      CRON_SECRET, PROXY_URL (http://user:pass@host:port),
//      DEED_LIMIT (default 10), DEED_RETRY (set "1" to re-check addresses)

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
const DEED_ABSTRACT_CAP = parseInt(process.env.DEED_ABSTRACT_CAP || "30", 10);
const DEED_RETRY = process.env.DEED_RETRY === "1";

if (!CRON_SECRET) {
  console.error("CRON_SECRET is required");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Street suffixes to drop for the street-wide fallback query.
const SUFFIX_RE = /\s+(ST|STREET|AVE|AVENUE|RD|ROAD|LN|LANE|DR|DRIVE|CT|COURT|PL|PLACE|TER|TERRACE|SQ|SQUARE|BLVD|BOULEVARD|WAY|CIR|CIRCLE|PKWY|PARKWAY|EXT|EXTENSION)\.?$/i;

function resultsUrl(padr, town, fdta = "", tdta = "") {
  return (
    `${BASE}/ALIS/WW400R.HTM?W9PADR=${encodeURIComponent(padr)}` +
    `&W9ABR=*ALL&W9TOWN=${encodeURIComponent(town)}&W9FDTA=${fdta}&W9TDTA=${tdta}` +
    `&WSHTNM=WW414R00&WSIQTP=SY14AP&WSKYCD=T&WSWVER=2`
  );
}

function normTown(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z]/g, "");
}

function splitStreet(street) {
  // "382 HANCOCK ST" -> { number: "382", name: "HANCOCK", streetPart: "HANCOCK ST", full: "382 HANCOCK ST" }
  const s = String(street || "").trim().toUpperCase();
  const m = s.match(/^(\d+[A-Z]?)\s+(.+)$/);
  if (!m) return { number: null, name: s, streetPart: s, full: s };
  const rest = m[2].trim();
  return { number: m[1], name: rest.replace(SUFFIX_RE, "").trim(), streetPart: rest, full: s };
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

// Extract document rows from the current results page.
// NOTE: the "View Abstract" anchors carry NO text — the words live only in
// the nested <img alt="View Abstract"> (and the anchor's title). Filtering
// anchors by textContent finds nothing; match the img alt instead. The
// abstract hrefs ARE real URLs (not javascript:), so abstracts can be fetched
// with a plain goto. Per-document text comes from splitting the body on the
// "Bk-Pg:" marker; hrefs pair with chunks in document order.
async function extractPage(page) {
  return page.evaluate(() => {
    const hrefs = Array.from(document.querySelectorAll("a"))
      .filter((a) => a.querySelector('img[alt="View Abstract"]'))
      .map((a) => a.getAttribute("href") || "");
    const bodyText = document.body.innerText || "";
    const parts = bodyText.split(/(?=Bk-Pg:\s*\d+\s*-\s*\d+)/i);
    const chunks = parts.filter((p) => /^\s*Bk-Pg:/i.test(p));
    return { hrefs, chunks, title: document.title };
  });
}

// Pagination is a javascript: form post (doVarButton2), not a real link —
// click it and wait for the reload instead of navigating to an href.
async function clickNext(page) {
  const clicked = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll("a")).find((x) =>
      /^\s*next\s*$/i.test(x.textContent || "")
    );
    if (!a) return false;
    a.click();
    return true;
  });
  if (!clicked) return false;
  await page.waitForLoadState("domcontentloaded", { timeout: 60000 }).catch(() => {});
  await sleep(2500);
  return /rec land address search results/i.test(await page.title().catch(() => ""));
}

// Fetch an abstract page directly (its href is a real URL) and return the
// upper-cased body text for the house-number check.
async function readAbstractText(page, href) {
  const url = new URL(href, page.url()).href;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1500);
  return (await page.evaluate(() => document.body?.innerText || "")).toUpperCase();
}

function parseRow(text) {
  const book = text.match(/Bk-Pg:\s*(\d+)\s*-\s*(\d+)/i);
  const rec = text.match(/Recorded:\s*(\d{2})-(\d{2})-(\d{4})/);
  const typeRaw = (text.match(/^\s*Type:\s*([^\n\r]+)/im) || [])[1];
  // The index sometimes renders "Type: Deed  Doc$: 67,100.00" on one line.
  // Keep docType clean; capture the Doc$ figure separately. NOTE: on mortgage
  // rows Doc$ is the LOAN amount; on deed rows its meaning (consideration?)
  // is still being verified — never treat it as sale price yet.
  const cleanType = typeRaw ? typeRaw.replace(/\s*Doc\$:\s*[\d,]+\.\d{2}/i, "").trim() : null;
  const amt = text.match(/Doc\$:\s*([\d,]+\.\d{2})/i);
  const addr = text.match(/Addr:\s*([^\n\r]+)/i);
  const gtor = text.match(/Gtor:\s*([^\n\r]{1,200})/i);
  const gtee = text.match(/Gtee:\s*([^\n\r]{1,200})/i);
  return {
    book: book ? book[1] : null,
    page: book ? book[2] : null,
    recordedDate: rec ? `${rec[3]}-${rec[1]}-${rec[2]}` : null,
    docType: cleanType,
    docAmount: amt ? amt[1] : null,
    addr: addr ? addr[1].trim().toUpperCase() : null,
    grantor: gtor ? gtor[1].trim() : null,
    grantee: gtee ? gtee[1].trim() : null,
  };
}

const isDeed = (d) => /deed/i.test(d.docType || "");

// Walk all result pages for a query (clicking Next); returns parsed docs
// deduped by book-page. Used for the number-keyed phase where the Addr line
// on each row already proves the house number.
async function searchAllPages(page, padr, town, fdta, tdta, maxPages, seenKeys) {
  const docs = [];
  await page.goto(resultsUrl(padr, town, fdta, tdta), { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  let pages = 0;
  for (;;) {
    const { hrefs, chunks, title } = await extractPage(page);
    const t = title || "";
    if (/^\s*address search\s*$/i.test(t)) {
      console.log(`  query "${padr}": bounced to form`);
      break;
    }
    if (!/rec land address search results/i.test(t)) {
      console.log(`  query "${padr}": unexpected page title="${t}"`);
      break;
    }
    if (hrefs.length !== chunks.length) {
      console.log(`  query "${padr}": href/chunk mismatch (${hrefs.length}/${chunks.length})`);
    }
    let fresh = 0;
    const n = Math.min(hrefs.length, chunks.length);
    for (let i = 0; i < n; i++) {
      const d = parseRow(chunks[i]);
      if (!d.book || !d.page || !d.recordedDate) continue;
      const key = `${d.book}-${d.page}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      d.abstractHref = hrefs[i];
      docs.push(d);
      fresh++;
    }
    pages++;
    // A page with zero NEW docs means we've hit the end (or Next wrapped
    // around to an already-seen page) — stop instead of looping forever.
    if (fresh === 0 || pages >= maxPages) break;
    if (!(await clickNext(page))) break;
  }
  return { docs, pages };
}

// Phase 2: street-wide query in newest-first 10-year windows. Older docs are
// indexed without house numbers, so each deed candidate's abstract is fetched
// directly (real URL) and checked for the house number. Returns the most
// recent verified deed, or null.
async function findDeedForNumber(page, streetQuery, town, number, streetName, seenKeys) {
  const nowYear = new Date().getFullYear();
  let abstractsUsed = 0;
  for (let w = 0; w < 6; w++) {
    const endY = nowYear - w * 10;
    const startY = endY - 10;
    const { docs } = await searchAllPages(
      page, streetQuery, town, `0101${startY}`, `1231${endY}`, 25, seenKeys
    );
    const cands = docs.filter(isDeed).sort((a, b) => b.recordedDate.localeCompare(a.recordedDate));
    console.log(`  window ${startY}-${endY}: ${docs.length} docs, ${cands.length} deed candidates`);
    for (const c of cands) {
      if (abstractsUsed >= DEED_ABSTRACT_CAP) break;
      abstractsUsed++;
      let text = "";
      try {
        text = await readAbstractText(page, c.abstractHref);
      } catch (e) {
        console.log(`  abstract ${c.book}-${c.page}: fetch failed, skipping`);
        continue;
      }
      if (new RegExp(`\\b${number}\\b`).test(text) && text.includes(streetName)) {
        console.log(`  verified via abstract: ${c.recordedDate} Bk ${c.book}-${c.page} (${c.docType})`);
        return { deed: c, abstractsUsed, window: `${startY}-${endY}` };
      }
      await sleep(1000);
    }
    if (abstractsUsed >= DEED_ABSTRACT_CAP) break;
    await sleep(1500);
  }
  return { deed: null, abstractsUsed, window: null };
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
const queue = await authedGet(`${QUEUE_URL}?limit=${DEED_LIMIT}${DEED_RETRY ? "&retry=1" : ""}`);
const leads = Array.isArray(queue?.leads) ? queue.leads : [];
console.log(`queue: ${queue?.count ?? leads.length} addresses${DEED_RETRY ? " (retry mode)" : ""}`);
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
  const { number, name, streetPart, full } = splitStreet(lead.street);
  const townCode = townMap[normTown(lead.city)] || "*ALL";
  console.log(`\n── lead ${lead.id}: ${full} (${lead.city || "?"}) town=${townCode} ──`);
  if (!full) {
    console.log("no street — skipping");
    continue;
  }
  const seenKeys = new Set();
  let deeds = [];

  // Phase 1: number-keyed query (finds deeds indexed with house numbers).
  {
    const { docs, pages } = await searchAllPages(page, full, townCode, "", "", 40, seenKeys);
    console.log(`phase 1 "${full}": ${docs.length} docs, ${pages} page(s)`);
    deeds = docs.filter(isDeed).filter((d) => !number || (d.addr && new RegExp(`\\b${number}\\b`).test(d.addr)));
    console.log(`phase 1 verified deeds: ${deeds.length}`);
  }

  // Phase 2: street-wide fallback in newest-first 10-year windows.
  // Older docs are indexed without house numbers — verify via abstract.
  if (deeds.length === 0 && number && name) {
    console.log(`phase 2 street-wide "${streetPart}" with abstract verification`);
    const found = await findDeedForNumber(page, streetPart, townCode, number, name, seenKeys);
    console.log(
      `phase 2: ${found.abstractsUsed} abstracts checked` +
        (found.window ? `, deed verified in window ${found.window}` : ", no deed verified")
    );
    if (found.deed) deeds.push(found.deed);
  }

  deeds.sort((a, b) => b.recordedDate.localeCompare(a.recordedDate));
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
