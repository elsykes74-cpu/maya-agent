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
import { notify } from "./lib/telegram";
import { createMayaWebhookRouter } from "./routers/maya-webhook";
import { getDb } from "./queries/connection";
import { telegramApp, registerAllWebhooks } from "./telegram-webhook";
import { startDailyDigestScheduler } from "./lib/telegram-scheduler";
import { processDialerTick, getQueueStats, startDialerScheduler } from "./lib/dialer";
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

// Dialer tick — drains a small batch of due queued calls. Drive this from
// any scheduler (Vercel cron, Supabase pg_cron, external cron). Secured with
// CRON_SECRET via the Authorization header (Vercel cron sends it natively).
app.post("/api/dialer/tick", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || c.req.header("authorization") !== `Bearer ${secret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  // Callback URLs must point at the deployment that received this request
  const proto = c.req.header("x-forwarded-proto") ?? "https";
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "";
  const appUrl = host ? `${proto}://${host}` : env.appUrl;

  const batchSize = Number(c.req.query("batch")) || undefined;
  try {
    const result = await processDialerTick({ appUrl, batchSize });
    return c.json(result);
  } catch (err) {
    console.error("[dialer] tick failed:", err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// Dialer health — queue depth by status (read-only)
app.get("/api/dialer/health", async (c) => {
  try {
    const queue = await getQueueStats();
    return c.json({ ok: true, queue }, 200, { "Cache-Control": "no-store" });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
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
      // Long-running deployment drains the call queue continuously.
      // Opt-in via DIALER_ENABLED=true; serverless uses /api/dialer/tick instead.
      startDialerScheduler(env.appUrl);
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
