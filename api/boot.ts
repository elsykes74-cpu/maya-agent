process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
  process.exit(1);
});

import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { rateLimiter } from "hono-rate-limiter";
import type { HttpBindings } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appRouter } from "./router";
import { createContext } from "./context";
import { env, validateEnv } from "./lib/env";
import { leads } from "../db/schema";
import { notify, sendAlert } from "./lib/telegram";
import { createMayaWebhookRouter } from "./routers/maya-webhook";
import { getDb } from "./queries/connection";
import { telegramApp, registerAllWebhooks } from "./telegram-webhook";
import { startDailyDigestScheduler } from "./lib/telegram-scheduler";
import { startCallWorker } from "./lib/call-worker";
import { runCraigslistScrape, formatScrapeAlert, recordScrapeRun, startScrapeScheduler, getLatestScrapeRun } from "./lib/craigslist-scraper";
import {
  runRegistryScrape,
  formatRegistryAlert,
  recordRegistryRun,
  startRegistryScheduler,
} from "./lib/registry-scraper";
// RentCast registry source (licensed property data — no Imperva block).
// Aliased: registry-scraper.ts owns the un-aliased Hampden-portal names.
import {
  runRegistryScrape as runRentcastScrape,
  formatRegistryAlert as formatRentcastAlert,
} from "./lib/registry-source";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { handleTelegramWebhook } from "./lib/telegram-webhook";
import { Session, Paths } from "../contracts/constants";
import {
	getGoogleAuthUrl,
	exchangeGoogleCode,
	getGoogleUserInfo,
} from "./lib/google";
import { signSessionToken } from "./kimi/session";
import { upsertGoogleUser } from "./queries/users";
import type { Context } from "hono";

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = new Hono<{ Bindings: HttpBindings }>();

const getClientIp = (c: Context): string => {
	const xff = c.req.header("x-forwarded-for");
	if (xff) return xff.split(",")[0].trim();
	return c.req.header("x-real-ip") ?? "anon";
};

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------
const apiLimiter = rateLimiter({
	windowMs: 60 * 1000,
	limit: 120,
	standardHeaders: "draft-6",
	keyGenerator: getClientIp,
});

const oauthLimiter = rateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: "draft-6",
	keyGenerator: getClientIp,
});

// ---------------------------------------------------------------------------
// Google OAuth - start
// ---------------------------------------------------------------------------
const OAUTH_STATE_COOKIE = "g_oauth_state";
const OAUTH_REDIRECT_COOKIE = "g_oauth_redirect";

const requireGoogleConfigured = (c: Context) => {
	if (!env.googleClientId || !env.googleClientSecret) {
		return c.json({ error: "Google OAuth not configured" }, 500);
	}
	return null;
};

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
// Models that require paid usage credits (1M context tier) — block these by default
const BLOCKED_MODELS = new Set([
	"claude-sonnet-4-5-20250929",
	"claude-opus-4-8",
	"claude-opus-4-5-20250929",
]);

type ClaudeMessage = {
	role: "user" | "assistant";
	content: string | Array<Record<string, unknown>>;
};

type ClaudeRequestBody = {
	model?: string;
	maxTokens?: number;
	temperature?: number;
	system?: string;
	prompt?: string;
	messages?: ClaudeMessage[];
};

const getBearerToken = (c: Context): string => {
	const auth = c.req.header("authorization") ?? "";
	const match = auth.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() ?? "";
};

const requireClaudeEndpointAuth = (c: Context) => {
	const expected = env.claudeEndpointSecret || env.appSecret;
	if (!expected) {
		return c.json({ error: "Claude endpoint secret not configured" }, 503);
	}

	const provided = getBearerToken(c) || c.req.header("x-maya-agent-secret") || "";
	if (provided !== expected) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	return null;
};

app.use("/api/*", apiLimiter);

app.get("/api/oauth/google", oauthLimiter, async (c) => {
	const guard = requireGoogleConfigured(c);
	if (guard) return guard;

	const state = randomBytes(32).toString("hex");
	const redirectTo = c.req.query("redirectTo") ?? "/";

	const cookieOpts = {
		httpOnly: true,
		secure: env.isProduction,
		sameSite: "Lax" as const,
		path: "/",
		maxAge: 60 * 10,
	};
	setCookie(c, OAUTH_STATE_COOKIE, state, cookieOpts);
	setCookie(c, OAUTH_REDIRECT_COOKIE, redirectTo, cookieOpts);

	return c.redirect(getGoogleAuthUrl({ state }));
});

// ---------------------------------------------------------------------------
// Google OAuth - callback
// ---------------------------------------------------------------------------
app.get("/api/oauth/google/callback", oauthLimiter, async (c) => {
	const guard = requireGoogleConfigured(c);
	if (guard) return guard;

	const code = c.req.query("code");
	const returnedState = c.req.query("state");
	const expectedState = getCookie(c, OAUTH_STATE_COOKIE);
	const redirectTo = getCookie(c, OAUTH_REDIRECT_COOKIE) ?? "/";

	deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });
	deleteCookie(c, OAUTH_REDIRECT_COOKIE, { path: "/" });

	if (!code) {
		const oauthError = c.req.query("error");
		return c.json({ error: oauthError ?? "Missing authorization code" }, 400);
	}
	if (!returnedState || !expectedState || returnedState !== expectedState) {
		return c.json({ error: "Invalid OAuth state" }, 400);
	}

	try {
		const { accessToken } = await exchangeGoogleCode(code);
		const googleUser = await getGoogleUserInfo(accessToken);

		if (!googleUser.email_verified) {
			return c.json({ error: "Google email not verified" }, 400);
		}

		await upsertGoogleUser({
			googleId: googleUser.sub,
			name: googleUser.name ?? null,
			email: googleUser.email ?? null,
			avatar: googleUser.picture ?? null,
		});

		const unionId = `google_${googleUser.sub}`;
		const token = await signSessionToken({
			unionId,
			clientId: env.googleClientId!,
		});

		setCookie(c, Session.cookieName, token, {
			httpOnly: true,
			secure: env.isProduction,
			sameSite: "Lax",
			path: "/",
			maxAge: 60 * 60 * 24 * 30,
		});

		const safeRedirect =
			redirectTo.startsWith("/") && !redirectTo.startsWith("//")
				? redirectTo
				: "/";
		return c.redirect(safeRedirect);
	} catch (err) {
		console.error("[oauth/google/callback]", err);
		return c.json({ error: "Authentication failed" }, 500);
	}
});

// Frontend helper
app.get("/api/auth/google/url", oauthLimiter, async (c) => {
	const guard = requireGoogleConfigured(c);
	if (guard) return guard;
	const redirectTo = c.req.query("redirectTo") ?? "/";
	const url = `/api/oauth/google?redirectTo=${encodeURIComponent(redirectTo)}`;
	return c.json({ authUrl: url });
});

// Claude health and proxy endpoints
app.get("/api/claude/health", (c) =>
	c.json(
		{
			ok: true,
			configured: Boolean(env.anthropicApiKey),
			protected: Boolean(env.claudeEndpointSecret || env.appSecret),
			model: BLOCKED_MODELS.has(process.env.CLAUDE_MODEL ?? "") ? DEFAULT_CLAUDE_MODEL : (process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL),
		},
		200,
		{ "Cache-Control": "no-store" },
	),
);

app.post("/api/claude/messages", async (c) => {
	const authError = requireClaudeEndpointAuth(c);
	if (authError) return authError;

	if (!env.anthropicApiKey) {
		return c.json({ error: "Anthropic API key not configured" }, 503);
	}

	let body: ClaudeRequestBody;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const messages = body.messages ?? (body.prompt ? [{ role: "user" as const, content: body.prompt }] : undefined);
	if (!messages?.length) {
		return c.json({ error: "Provide prompt or messages" }, 400);
	}

	const maxTokens = Math.min(Math.max(Number(body.maxTokens ?? 1024), 1), 4096);
	const requestedModel = body.model || process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL;
	const resolvedModel = BLOCKED_MODELS.has(requestedModel) ? DEFAULT_CLAUDE_MODEL : requestedModel;
	const payload = {
		model: resolvedModel,
		max_tokens: maxTokens,
		temperature: typeof body.temperature === "number" ? body.temperature : undefined,
		system: body.system || undefined,
		messages,
	};

	const response = await fetch(CLAUDE_API_URL, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": env.anthropicApiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify(payload),
	});

	const data = await response.json().catch(() => null);
	if (!response.ok) {
		console.error("[claude/messages]", response.status, data);
		return c.json({ error: "Claude request failed", status: response.status, details: data }, 502);
	}

	return c.json(data, 200, { "Cache-Control": "no-store" });
});

app.get("/api/db/health", async (c) => {
	try {
		const db = getDb();
		await db.execute(sql`select 1 as ok`);
		return c.json(
			{
				ok: true,
				configured: Boolean(env.databaseUrl),
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	} catch (err) {
		console.error("[db/health]", err);
		const message = err instanceof Error ? err.message : "Database health check failed";
		return c.json(
			{
				ok: false,
				configured: Boolean(env.databaseUrl),
				error: message,
			},
			503,
			{ "Cache-Control": "no-store" },
		);
	}
});

// ── One-tap bot setup (migration + webhook registration) ──────────────────
// Visit: GET /api/admin/setup?secret=<APP_SECRET>
app.get("/api/admin/setup", async (c) => {
	const provided = c.req.query("secret") ?? "";
	const expected = env.appSecret || env.claudeEndpointSecret;
	if (!expected || provided !== expected) {
		return c.json({ error: "Unauthorized — add ?secret=YOUR_APP_SECRET to the URL" }, 401);
	}

	const results: Record<string, string> = {};

	// 1. Run DB migration
	try {
		const db = getDb();
		await db.execute(sql`
			ALTER TABLE leads
			  ADD COLUMN IF NOT EXISTS research_summary  TEXT,
			  ADD COLUMN IF NOT EXISTS call_briefing     TEXT,
			  ADD COLUMN IF NOT EXISTS distress_signals  TEXT,
			  ADD COLUMN IF NOT EXISTS web_mentions      TEXT,
			  ADD COLUMN IF NOT EXISTS created_by        BIGINT
		`);
		await db.execute(sql`
			CREATE TABLE IF NOT EXISTS follow_up_messages (
			  id           BIGSERIAL PRIMARY KEY,
			  lead_id      BIGINT       NOT NULL,
			  message_type VARCHAR(50)  NOT NULL,
			  tone         VARCHAR(50)  DEFAULT 'friendly',
			  content      TEXT         NOT NULL,
			  created_by   VARCHAR(50)  DEFAULT 'ladyjaye',
			  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
			)
		`);
		await db.execute(sql`
			ALTER TABLE ai_config
			  ADD COLUMN IF NOT EXISTS elevenlabs_api_key   TEXT,
			  ADD COLUMN IF NOT EXISTS elevenlabs_voice_id  TEXT,
			  ADD COLUMN IF NOT EXISTS elevenlabs_voice_name TEXT,
			  ADD COLUMN IF NOT EXISTS twilio_account_sid   TEXT,
			  ADD COLUMN IF NOT EXISTS twilio_auth_token    TEXT,
			  ADD COLUMN IF NOT EXISTS twilio_from_number   TEXT
		`);
		results.migration = "✅ DB migration applied";
	} catch (err: any) {
		results.migration = `❌ Migration failed: ${err?.message ?? err}`;
	}

	// 2. Register Telegram webhooks
	const appUrl = (env.appUrl || "").replace(/\/$/, "");
	if (!appUrl || appUrl.includes("localhost")) {
		results.webhooks = "⚠️ APP_URL not set — set it to your Vercel domain and re-run";
	} else {
		await registerAllWebhooks(appUrl);
		results.webhooks = `✅ Webhooks registered to ${appUrl}`;
	}

	// 3. API key status
	results.braveApiKey     = env.braveApiKey      ? "✅ set" : "❌ missing — set BRAVE_API_KEY";
	results.anthropicApiKey = env.anthropicApiKey  ? "✅ set" : "❌ missing — set ANTHROPIC_API_KEY";
	results.quickkickToken  = process.env.TELEGRAM_BOT_TOKEN         ? "✅ set" : "❌ missing";
	results.ladyjayeToken   = process.env.TELEGRAM_BOT_TOKEN_LADYJAYE ? "✅ set" : "❌ missing";

	return c.json({ ok: true, ...results }, 200, { "Cache-Control": "no-store" });
});

// Env-dump endpoint — dev only, blocked in production
app.get("/__env-debug", async (c) => {
  if (env.isProduction) return c.json({ error: "Not Found" }, 404);
  const issues = validateEnv();
  return c.json(
    {
      NODE_ENV: process.env.NODE_ENV,
      validateEnvMissing: issues,
      envProblems: (issues.length ? "MISSING: " + issues.join(", ") : "OK"),
      keys: {
        APP_ID: !!process.env.APP_ID,
        DATABASE_URL: !!process.env.DATABASE_URL,
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
        TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: !!process.env.TWILIO_AUTH_TOKEN,
        APP_URL: process.env.APP_URL || "(not set)",
        VERCEL_URL: process.env.VERCEL_URL || "(not set)",
      },
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

// Maya webhook smoke-test — dev only, blocked in production
app.all("/__maya-test", async (c) => {
  if (env.isProduction) return c.json({ error: "Not Found" }, 404);
  const proto = c.req.header("x-forwarded-proto") ?? "https";
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "unknown";
  const appUrl = `${proto}://${host}`;
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>Maya webhook is reachable. Anthropic key is ${hasAnthropicKey ? "present" : "missing"}. App URL is ${appUrl}.</Say><Hangup/></Response>`;
  return c.body(xml, 200, { "Content-Type": "text/xml; charset=utf-8" });
});

// Kimi OAuth callback
app.get(Paths.oauthCallback, createOAuthCallbackHandler());

// ---------------------------------------------------------------------------
// Maya Twilio webhook - mount before tRPC so /api/maya/* is handled here
// ---------------------------------------------------------------------------
app.route("/api/maya", createMayaWebhookRouter());

// ---------------------------------------------------------------------------
// Twilio inbound call webhook — connects to VAPI assistant
// ---------------------------------------------------------------------------
app.post("/api/twilio/voice", async (c) => {
	const { getCallingConfig } = await import("./lib/vapi");
	const config = await getCallingConfig().catch(() => null);
	const assistantId = config?.assistantId || process.env.VAPI_ASSISTANT_ID || "8f0c5749-74f5-4757-8377-10e10f47dd25";

	const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Sip>sip:${assistantId}@sip.vapi.ai</Sip>
  </Connect>
</Response>`;

	return c.text(twiml, 200, { "Content-Type": "text/xml" });
});

app.post("/api/twilio/status", async (c) => {
	const body = await c.req.parseBody().catch(() => ({}));
	console.log("[twilio/status]", body);
	return c.text("ok");
});

// ---------------------------------------------------------------------------
// Scheduled cron endpoints (secret-gated).
// Auth: Authorization: Bearer <CRON_SECRET>. Query-string ?secret= is NOT
// accepted — secrets in URLs leak into logs, history, and referers.
// ---------------------------------------------------------------------------
// Shared cron auth — Bearer token only.
const checkCronAuth = (c: any): boolean => {
  if (!env.cronSecret) return false;
  return c.req.header("authorization") === `Bearer ${env.cronSecret}`;
};

// Craigslist lead scan, every 30 min (see vercel.json "crons").
// Runs OUTSIDE the bot webhook flow because a full scrape (20 detail pages)
// exceeds Vercel's 30s serverless limit. Results are recorded in scrape_runs;
// /findleads reports the latest cached run instead of scraping live.
app.get("/api/cron/scrape", async (c) => {
  if (!checkCronAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const db = getDb();
  const t0 = new Date();
  try {
    const result = await runCraigslistScrape(db);
    if (result.blocked) {
      await recordScrapeRun(db, {
        status: "blocked",
        found: 0,
        added: 0,
        error: "Craigslist blocked the request (HTTP 403/429/503) via proxy.",
        startedAt: t0,
      }).catch(() => {});
      return c.json({ ok: false, blocked: true, found: 0, added: 0 });
    }
    await recordScrapeRun(db, {
      status: "ok",
      found: result.found,
      added: result.added,
      newLeads: result.newLeads,
      startedAt: t0,
    });
    if (result.added > 0) {
      const msg = formatScrapeAlert(result);
      await sendAlert(msg, "quickkick");
      await sendAlert(msg, "ladyjaye");
    }
    return c.json({ ok: true, found: result.found, added: result.added });
  } catch (err: any) {
    const message = String(err?.message ?? err);
    const causes: string[] = [];
    let cause: any = err?.cause;
    for (let i = 0; i < 5 && cause; i++) {
      causes.push(`${cause?.code ?? "?"}: ${cause?.message ?? String(cause)}`);
      cause = cause?.cause;
    }
    const detail = causes.length ? `${message} | cause: ${causes.join(" <- ")}` : message;
    await recordScrapeRun(db, { status: "error", found: 0, added: 0, error: detail, startedAt: t0 }).catch(() => {});
    console.error("[cron/scrape] failed:", detail);
    return c.json({ ok: false, error: detail }, 500);
  }
});

// Hampden County Registry of Deeds — distressed-filing scan, weekly.
// Same secret-gated cron pattern as /api/cron/scrape. Registry filings carry
// no phone numbers, so results land in the unrouted lead pool for skip tracing.

app.get("/api/cron/registry", async (c) => {
  if (!checkCronAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const db = getDb();
  try {
    const result = await runRegistryScrape(db);
    if (result.blocked) {
      await recordRegistryRun(db, {
        status: "blocked",
        found: 0,
        added: 0,
        error: "Registry bot challenge fired (Imperva). Set REGISTRY_PROXY_URL (or CL_PROXY_URL) to a residential proxy.",
      });
      return c.json({ ok: true, blocked: true, found: 0, added: 0 });
    }
    await recordRegistryRun(db, { status: "ok", found: result.found, added: result.added });
    if (result.added > 0) {
      await sendAlert(formatRegistryAlert(result), "quickkick");
    }
    return c.json({ ok: true, found: result.found, added: result.added });
  } catch (err: any) {
    const message = String(err?.message ?? err);
    await recordRegistryRun(db, { status: "error", found: 0, added: 0, error: message }).catch(() => {});
    console.error("[cron/registry] failed:", message);
    return c.json({ ok: false, error: "registry scrape failed" }, 500);
  }
});

// Hampden Registry — browser-fed ingest. GitHub Actions runs a real Playwright
// browser (which solves the Imperva JS challenge that blocks Vercel's direct
// fetch), then POSTs the rendered results HTML here. Secret-gated like the
// other cron endpoints. Body: { html: string }.
app.post("/api/cron/registry-ingest", async (c) => {
  if (!checkCronAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const html = typeof body?.html === "string" ? body.html : "";
  if (html.length < 1000) {
    return c.json({ error: "html too short — expected rendered ALIS results page" }, 400);
  }
  const db = getDb();
  try {
    const { ingestRegistryHtml, recordRegistryRun, formatRegistryAlert } = await import("./lib/registry-scraper");
    const result = await ingestRegistryHtml(db, html);
    await recordRegistryRun(db, { status: "ok", found: result.found, added: result.added });
    if (result.added > 0) {
      await sendAlert(formatRegistryAlert(result), "quickkick");
    }
    return c.json({ ok: true, found: result.found, added: result.added });
  } catch (err: any) {
    const message = String(err?.message ?? err);
    const { recordRegistryRun } = await import("./lib/registry-scraper");
    await recordRegistryRun(db, { status: "error", found: 0, added: 0, error: message }).catch(() => {});
    console.error("[cron/registry-ingest] failed:", message);
    return c.json({ ok: false, error: "registry ingest failed" }, 500);
  }
});

// ---------------------------------------------------------------------------
// RentCast registry source — licensed property data (no Imperva block).
// Replaces the hard-blocked Hampden portal scrape as the automated distressed
// lead source. Same Bearer-gated cron pattern as the other endpoints.
// ---------------------------------------------------------------------------
const handleCronRentcast = async (c: any) => {
  if (!checkCronAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const db = getDb();
  const result = await runRentcastScrape(db);
  // Best-effort phone enrichment on the fresh batch (and backlog) — free
  // Tavily tier; never fails the scan if the key/quota is missing. Capped at
  // 8 searches so the pass fits inside the 30s serverless limit (~3.5s per
  // lead); deeper backfill goes through /api/cron/enrich.
  let enriched: { checked: number; found: number } | null = null;
  try {
    const { enrichPhones } = await import("./lib/phone-enrich");
    const r = await enrichPhones(db, 8);
    if (r.ok) enriched = { checked: r.checked, found: r.found };
  } catch (err) {
    console.error("[cron/registry-rentcast] enrich failed:", err);
  }
  if (result.added > 0 || !result.ok) {
    await sendAlert(formatRentcastAlert(result), "quickkick").catch((err) =>
      console.error("[cron/registry-rentcast] alert failed:", err)
    );
  }
  return c.json({
    ok: result.ok,
    found: result.found,
    added: result.added,
    enriched,
    error: result.error ?? null,
  });
};

app.get("/api/cron/registry-rentcast", handleCronRentcast);
app.post("/api/cron/registry-rentcast", handleCronRentcast);

// ---------------------------------------------------------------------------
// Phone enrichment backfill — secret-gated. Runs the free Tavily web-search
// phone finder over phoneless leads (hot first). ?limit=N caps searches per
// invocation (default 40) to stay inside the 1,000/mo free tier.
// ---------------------------------------------------------------------------
app.get("/api/cron/enrich", async (c: any) => {
  if (!checkCronAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const limit = Math.max(1, Math.min(200, parseInt(c.req.query("limit") || "40", 10) || 40));
  const db = getDb();
  const { enrichPhones } = await import("./lib/phone-enrich");
  const result = await enrichPhones(db, limit);
  return c.json(result);
});
app.post("/api/cron/enrich", async (c: any) => {
  if (!checkCronAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const limit = Math.max(1, Math.min(200, parseInt(c.req.query("limit") || "40", 10) || 40));
  const db = getDb();
  const { enrichPhones } = await import("./lib/phone-enrich");
  const result = await enrichPhones(db, limit);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Public-record enrichment backfill — secret-gated. Looks up hot leads'
// addresses on RentCast property records (public county records / tax
// assessor aggregation): last purchase date + price, full sale history,
// ownership tenure, assessed value, structural details.
//
// Quota-guarded by design: every lookup counts against RENTCAST_MONTHLY_CAP
// (default 45, shared with the weekly registry scan). ?limit=N caps records
// per invocation (default 10); the run stops quietly when the budget is
// exhausted and resumes next month. The free tier is never exceeded by code.
// ---------------------------------------------------------------------------
const handleCronEnrichRecords = async (c: any) => {
  if (!checkCronAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const limit = Math.max(1, Math.min(100, parseInt(c.req.query("limit") || "10", 10) || 10));
  const retryEmpty = c.req.query("retryEmpty") === "1";
  const db = getDb();
  try {
    const { enrichHotLeadRecords } = await import("./lib/record-enrich");
    const result = await enrichHotLeadRecords(db, limit, retryEmpty);
    return c.json(result);
  } catch (err: any) {
    console.error("[cron/enrich-records] failed:", err?.message ?? err);
    return c.json({ ok: false, error: err?.message ?? String(err) }, 500);
  }
};
app.get("/api/cron/enrich-records", handleCronEnrichRecords);
app.post("/api/cron/enrich-records", handleCronEnrichRecords);

// ---------------------------------------------------------------------------
// Registry deed lookup — secret-gated. RentCast property records have NO sale
// history for Hampden County, so last-purchase dates come from the Hampden
// County Registry of Deeds itself (the actual public record).
//
// GET  /api/cron/deed-lookup-queue?limit=N — hot leads (pipelineStage =
//      hot_routing) whose address was never checked for recorded deeds.
//      Consumed by the GitHub Actions Playwright automation.
// POST /api/cron/registry-deed-ingest — body { leadId, deeds: [{recordedDate,
//      book, page, docType, grantor, grantee}] }. Stores the deed chain and
//      sets lastSaleDate from the most recent recording. The registry index
//      carries no consideration, so lastSalePrice is never set from here.
// ---------------------------------------------------------------------------
app.get("/api/cron/deed-lookup-queue", async (c: any) => {
  if (!checkCronAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const limit = Math.max(1, Math.min(100, parseInt(c.req.query("limit") || "25", 10) || 25));
  const retry = c.req.query("retry") === "1";
  const db = getDb();
  try {
    const { getDeedLookupQueue } = await import("./lib/registry-deed");
    const queue = await getDeedLookupQueue(db, limit, retry);
    return c.json({ ok: true, count: queue.length, leads: queue });
  } catch (err: any) {
    console.error("[cron/deed-lookup-queue] failed:", err?.message ?? err);
    return c.json({ ok: false, error: err?.message ?? String(err) }, 500);
  }
});
app.post("/api/cron/registry-deed-ingest", async (c: any) => {
  if (!checkCronAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const leadId = Number(body?.leadId);
  if (!Number.isFinite(leadId) || leadId <= 0) {
    return c.json({ error: "leadId is required" }, 400);
  }
  const db = getDb();
  try {
    const { ingestDeedLookup } = await import("./lib/registry-deed");
    const result = await ingestDeedLookup(db, leadId, body?.deeds);
    return c.json(result);
  } catch (err: any) {
    console.error("[cron/registry-deed-ingest] failed:", err?.message ?? err);
    return c.json({ ok: false, error: err?.message ?? String(err) }, 500);
  }
});

// ---------------------------------------------------------------------------
// One-shot schema repair — secret-gated. The production DB never had migration
// 0003 (tasks/activities/offers/buyers/follow-ups/attributions/duplicate_flags)
// applied, so every activities/tasks query 500s and the lead-detail timeline
// stays broken. Every statement below is idempotent (DO-guard for enums,
// IF NOT EXISTS for tables/indexes) — safe to run repeatedly.
// ---------------------------------------------------------------------------
const MIGRATE_STATEMENTS: string[] = [
  `DO $$ BEGIN CREATE TYPE "task_type" AS ENUM ('call_back','send_sms','send_email','follow_up','visit','contract','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "task_status" AS ENUM ('pending','in_progress','completed','cancelled','snoozed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "activity_type" AS ENUM ('call','sms','email','note','visit','offer','appointment','status_change','system'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "offer_status" AS ENUM ('draft','submitted','countered','accepted','rejected','expired','withdrawn'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "buyer_status" AS ENUM ('active','inactive','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "analysis_type" AS ENUM ('stack_score','comps','flip','brrrr','buy_hold','rental','custom'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "follow_up_enrollment_status" AS ENUM ('active','paused','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "duplicate_flag_status" AS ENUM ('pending','confirmed','dismissed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "attribution_channel" AS ENUM ('direct_mail','cold_call','sms','facebook','google','referral','list_import','driving_for_dollars','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "tasks" ("id" bigserial PRIMARY KEY, "lead_id" bigint NOT NULL, "type" "task_type" NOT NULL DEFAULT 'other', "title" varchar(255) NOT NULL, "notes" text, "due_at" timestamp, "status" "task_status" NOT NULL DEFAULT 'pending', "snoozed_until" timestamp, "completed_at" timestamp, "created_by" bigint, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "tasks_lead_id_idx" ON "tasks" ("lead_id")`,
  `CREATE INDEX IF NOT EXISTS "tasks_due_at_idx" ON "tasks" ("due_at") WHERE "status" = 'pending'`,
  `CREATE TABLE IF NOT EXISTS "activities" ("id" bigserial PRIMARY KEY, "lead_id" bigint NOT NULL, "type" "activity_type" NOT NULL DEFAULT 'note', "body" text NOT NULL, "linked_table" varchar(50), "linked_id" bigint, "metadata" text, "created_by" bigint, "created_at" timestamp NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "activities_lead_id_idx" ON "activities" ("lead_id")`,
  `CREATE INDEX IF NOT EXISTS "activities_created_at_idx" ON "activities" ("lead_id", "created_at" DESC)`,
  `CREATE TABLE IF NOT EXISTS "offers" ("id" bigserial PRIMARY KEY, "lead_id" bigint NOT NULL, "offer_amount" numeric(12,2) NOT NULL, "status" "offer_status" NOT NULL DEFAULT 'draft', "counter_amount" numeric(12,2), "assignment_fee" numeric(12,2), "arv_used" numeric(12,2), "repair_estimate" numeric(12,2), "notes" text, "submitted_at" timestamp, "responded_at" timestamp, "expires_at" timestamp, "created_by" bigint, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "offers_lead_id_idx" ON "offers" ("lead_id")`,
  `CREATE TABLE IF NOT EXISTS "property_analyses" ("id" bigserial PRIMARY KEY, "lead_id" bigint NOT NULL, "analysis_type" "analysis_type" NOT NULL DEFAULT 'custom', "title" varchar(255), "content" text NOT NULL, "created_by" varchar(50) DEFAULT 'quickkick', "created_at" timestamp NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "property_analyses_lead_id_idx" ON "property_analyses" ("lead_id")`,
  `CREATE TABLE IF NOT EXISTS "buyers" ("id" bigserial PRIMARY KEY, "name" varchar(255) NOT NULL, "company" varchar(255), "phone" varchar(20), "email" varchar(320), "status" "buyer_status" NOT NULL DEFAULT 'active', "notes" text, "last_purchase_date" timestamp, "total_purchases" integer DEFAULT 0, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS "buyer_criteria" ("id" bigserial PRIMARY KEY, "buyer_id" bigint NOT NULL, "zip_codes" text, "cities" text, "min_price" numeric(12,2), "max_price" numeric(12,2), "min_beds" integer, "max_beds" integer, "min_baths" numeric(3,1), "max_baths" numeric(3,1), "min_sqft" integer, "max_sqft" integer, "property_types" text, "min_arv" numeric(12,2), "max_arv" numeric(12,2), "prefers_vacant" boolean DEFAULT false, "prefers_off_market" boolean DEFAULT true, "notes" text, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "buyer_criteria_buyer_id_idx" ON "buyer_criteria" ("buyer_id")`,
  `CREATE TABLE IF NOT EXISTS "follow_up_sequences" ("id" bigserial PRIMARY KEY, "name" varchar(255) NOT NULL, "description" text, "steps" text NOT NULL, "is_active" boolean DEFAULT true, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS "follow_up_enrollments" ("id" bigserial PRIMARY KEY, "lead_id" bigint NOT NULL, "sequence_id" bigint NOT NULL, "current_step" integer DEFAULT 0, "status" "follow_up_enrollment_status" NOT NULL DEFAULT 'active', "next_run_at" timestamp, "started_at" timestamp NOT NULL DEFAULT now(), "completed_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "follow_up_enrollments_lead_id_idx" ON "follow_up_enrollments" ("lead_id")`,
  `CREATE INDEX IF NOT EXISTS "follow_up_enrollments_next_run_at_idx" ON "follow_up_enrollments" ("next_run_at") WHERE "status" = 'active'`,
  `CREATE TABLE IF NOT EXISTS "lead_attributions" ("id" bigserial PRIMARY KEY, "lead_id" bigint NOT NULL, "source_id" bigint, "channel" "attribution_channel" DEFAULT 'other', "campaign" varchar(255), "list_name" varchar(255), "import_date" timestamp, "estimated_cost" numeric(10,2), "notes" text, "created_at" timestamp NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "lead_attributions_lead_id_idx" ON "lead_attributions" ("lead_id")`,
  `CREATE TABLE IF NOT EXISTS "duplicate_flags" ("id" bigserial PRIMARY KEY, "lead_id" bigint NOT NULL, "duplicate_lead_id" bigint NOT NULL, "match_score" integer DEFAULT 0, "match_fields" text, "status" "duplicate_flag_status" NOT NULL DEFAULT 'pending', "resolved_by" bigint, "resolved_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "duplicate_flags_lead_id_idx" ON "duplicate_flags" ("lead_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "duplicate_flags_pair_idx" ON "duplicate_flags" (LEAST("lead_id", "duplicate_lead_id"), GREATEST("lead_id", "duplicate_lead_id"))`,
  // 0005 — public-record enrichment: sale_history on leads + rentcast_usage ledger.
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "sale_history" jsonb`,
  `CREATE TABLE IF NOT EXISTS "rentcast_usage" ("id" bigserial PRIMARY KEY, "endpoint" varchar(120) NOT NULL, "created_at" timestamp NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "rentcast_usage_created_at_idx" ON "rentcast_usage" ("created_at" DESC)`,
  // 0006 — registry deed lookup: when a lead's address was checked for deeds.
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "registry_deed_checked_at" timestamptz`,
];

async function handleCronMigrate(c: any) {
  if (!checkCronAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const db = getDb();
  const applied: string[] = [];
  const failed: { statement: string; error: string }[] = [];
  for (const stmt of MIGRATE_STATEMENTS) {
    try {
      await db.execute(sql.raw(stmt));
      applied.push(stmt.slice(0, 60));
    } catch (e: any) {
      failed.push({ statement: stmt.slice(0, 80), error: e?.message ?? String(e) });
    }
  }
  return c.json({ ok: failed.length === 0, applied: applied.length, failed });
}
app.get("/api/cron/migrate", handleCronMigrate);
app.post("/api/cron/migrate", handleCronMigrate);

// ---------------------------------------------------------------------------
// Craigslist health — Bearer-gated status for monitors/dashboards.
// Reports proxy config and the latest scrape run (no lead PII).
// ---------------------------------------------------------------------------
app.get("/api/health/craigslist", async (c) => {
  if (!checkCronAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const db = getDb();
  const latest = await getLatestScrapeRun(db).catch(() => null);
  return c.json({
    ok: latest?.status === "ok",
    proxy_configured: !!process.env.CL_PROXY_URL,
    latest_run: latest
      ? {
          id: latest.id,
          status: latest.status,
          started_at: latest.startedAt,
          finished_at: latest.finishedAt,
          found: latest.found,
          added: latest.added,
          error: latest.error,
        }
      : null,
  });
});

// ---------------------------------------------------------------------------
// Telegram multi-bot webhook
// ---------------------------------------------------------------------------
app.route("/api/telegram", telegramApp);

// ---------------------------------------------------------------------------
// tRPC
// ---------------------------------------------------------------------------
app.all("/api/trpc/*", async (c) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req: c.req.raw,
		router: appRouter,
		createContext,
	}),
);

// ---------------------------------------------------------------------------
// Telegram webhook + setup
// ---------------------------------------------------------------------------
app.post("/api/telegram/webhook", handleTelegramWebhook);

app.get("/api/telegram/setup", async (c) => {
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "";
  const proto = c.req.header("x-forwarded-proto") ?? "https";
  const appUrl = `${proto}://${host}`;
  try {
    await registerAllWebhooks(appUrl);
    return c.json({ ok: true, appUrl });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message ?? String(err) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Lead intake — accepts form submissions from meridianhomesma.com
// ---------------------------------------------------------------------------
const INTAKE_ORIGIN = "https://meridianhomesma.com";
const INTAKE_CORS = {
  "Access-Control-Allow-Origin": INTAKE_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-intake-secret",
};

app.options("/api/lead-intake", (c) => c.body(null, 204, INTAKE_CORS));

app.post("/api/lead-intake", async (c) => {
  // Validate shared secret
  const secret = process.env.LEAD_INTAKE_SECRET || env.appSecret;
  const provided = c.req.header("x-intake-secret") ?? c.req.query("secret") ?? "";
  if (secret && provided !== secret) {
    return c.json({ error: "Unauthorized" }, 401, INTAKE_CORS);
  }

  let body: Record<string, string | undefined>;
  const ct = c.req.header("content-type") ?? "";
  if (ct.includes("application/json")) {
    body = await c.req.json().catch(() => ({}));
  } else {
    const raw = await c.req.parseBody().catch(() => ({}));
    body = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
  }

  const sellerName = (body.name ?? body.sellerName ?? body.full_name ?? "").trim();
  const phone = (body.phone ?? body.tel ?? "").trim();
  const email = (body.email ?? "").trim();
  const propertyAddress = (body.address ?? body.propertyAddress ?? body.property_address ?? "").trim();
  const city = (body.city ?? "").trim();
  const state = (body.state ?? "MA").trim();
  const zipCode = (body.zip ?? body.zipCode ?? body.zip_code ?? "").trim();
  const timeline = (body.timeline ?? "").trim();
  const askingPriceRaw = body.asking_price ?? body.askingPrice ?? body.price ?? "";
  const bedsRaw = body.beds ?? body.bedrooms ?? "";
  const bathsRaw = body.baths ?? body.bathrooms ?? "";
  const conditionRaw = body.condition ?? "";

  if (!sellerName || !propertyAddress) {
    return c.json({ error: "name and address are required" }, 400, INTAKE_CORS);
  }

  const noteParts: string[] = ["Source: meridianhomesma.com"];
  if (body.message ?? body.notes) noteParts.push(String(body.message ?? body.notes ?? "").trim());
  if (body.reason ?? body.motivation) noteParts.push(`Reason: ${body.reason ?? body.motivation}`);
  const notes = noteParts.filter(Boolean).join("\n");

  const conditionMap: Record<string, string> = {
    excellent: "move_in_ready", good: "move_in_ready", fair: "light_rehab",
    poor: "medium_rehab", bad: "heavy_rehab",
  };
  const condition = (conditionMap[conditionRaw.toLowerCase()] ?? conditionRaw) || undefined;

  try {
    const db = getDb();
    const result = await db.insert(leads).values({
      sellerName,
      phone: phone || null,
      email: email || null,
      propertyAddress,
      city: city || null,
      state: state || "MA",
      zipCode: zipCode || null,
      timeline: timeline || null,
      askingPrice: askingPriceRaw ? String(parseFloat(askingPriceRaw.replace(/[^0-9.]/g, ""))) : null,
      beds: bedsRaw ? parseInt(bedsRaw, 10) || null : null,
      baths: bathsRaw ? String(parseFloat(bathsRaw)) : null,
      condition: (condition as any) || null,
      notes: notes || null,
      pipelineStage: "lead",
      motivationLevel: "cold",
    });

    const leadId = Number((result as any)[0]?.insertId ?? 0);

    await notify(
      `🌐 <b>New Website Lead</b>\n` +
      `<b>${sellerName}</b> — ${propertyAddress}${city ? `, ${city}` : ""}${state ? ` ${state}` : ""}\n` +
      `${phone ? `📞 ${phone}` : "No phone"}${email ? `  📧 ${email}` : ""}\n` +
      `${timeline ? `⏰ Timeline: ${timeline}` : ""}` +
      `${askingPriceRaw ? `\n💰 Asking: ${askingPriceRaw}` : ""}` +
      `\n🆔 Lead #${leadId} — queued for review`
    ).catch(() => null);

    return c.json({ ok: true, leadId }, 201, INTAKE_CORS);
  } catch (err) {
    console.error("[lead-intake]", err);
    return c.json({ error: "Failed to save lead" }, 500, INTAKE_CORS);
  }
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// ---------------------------------------------------------------------------
// SPA fallback - no external static files, just serve index.html
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, "./public");

const loadIndex = (): string | null => {
	try {
		return readFileSync(path.join(CLIENT_DIST, "index.html"), "utf-8");
	} catch {
		return null;
	}
};

app.notFound((c) => {
	const url = c.req.path;
	if (url.startsWith("/api/")) {
		return c.json({ error: "Not Found" }, 404);
	}
	const html = loadIndex();
	if (!html) return c.json({ error: "Client build missing" }, 500);
	return c.html(html);
});

// ---------------------------------------------------------------------------
// Production bootstrap
// ---------------------------------------------------------------------------
// On Vercel (serverless), skip TCP server — requests come via app.fetch exported below.
// On Railway/VPS, start the persistent Node.js HTTP server.
if (env.isProduction && !process.env.VERCEL) {
  if (!loadIndex()) {
    throw new Error(
      `Client build not found at ${CLIENT_DIST}. Run the client build before starting the server.`,
    );
  }

  try {
    const port = Number.parseInt(process.env.PORT ?? "3000", 10);
    serve({ fetch: app.fetch, port }, () => {
      console.log(`[server] listening on port ${port}`);
      startDailyDigestScheduler();
      // Background call worker — drains queued campaign calls off the request path.
      startCallWorker();
      // Craigslist lead scan every 30 min (results cached in scrape_runs for /findleads).
      startScrapeScheduler();
      // Hampden County registry distressed-filing scan, weekly.
      startRegistryScheduler();
      // Auto-register Telegram webhooks so bots don't go silent after redeploys
      if (env.appUrl && !env.appUrl.includes("localhost")) {
        registerAllWebhooks(env.appUrl).catch((err) =>
          console.error("[boot] webhook registration error:", err)
        );
      }
    });
  } catch (err) {
    console.error("[boot] FATAL:", err);
    throw err;
  }
}

export default app;
