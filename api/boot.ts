process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
  process.exit(1);
});

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
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
import { getDb } from "./queries/connection";
import { telegramApp } from "./telegram-webhook";
import { startDailyDigestScheduler } from "./lib/telegram-scheduler";
import { registerAllWebhooks } from "./telegram-webhook";
import { createOAuthCallbackHandler } from "./kimi/auth";
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
// Body limits
// ---------------------------------------------------------------------------
const trpcBodyLimit = bodyLimit({
	maxSize: 1 * 1024 * 1024,
	onError: (c) => c.json({ error: "Payload too large" }, 413),
});

// ---------------------------------------------------------------------------
// Google OAuth — start
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
const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";
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
// Google OAuth — callback
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

// Env-dump endpoint (development / diagnostic only)
app.get("/__env-debug", async (c) => {
  // Called AFTER module loads so env is populated
  const issues = validateEnv();
  const allKeys = Object.keys(process.env).sort();
  const snapshot: Record<string, string | undefined> = {};
  for (const k of allKeys) snapshot[k] = process.env[k];
  return c.json(
    {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      validateEnvMissing: issues,
      envProblems: (issues.length ? "MISSING: " + issues.join(", ") : "OK"),
      required: {
        APP_ID: !!process.env.APP_ID,
        APP_SECRET: !!process.env.APP_SECRET,
        DATABASE_URL: !!process.env.DATABASE_URL,
        KIMI_AUTH_URL: !!process.env.KIMI_AUTH_URL,
        KIMI_OPEN_URL: !!process.env.KIMI_OPEN_URL,
        VAPI_API_KEY: !!process.env.VAPI_API_KEY,
        ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
        NODE_ENV: !!process.env.NODE_ENV,
      },
      totalKeys: allKeys.length,
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

// Kimi OAuth callback
app.get(Paths.oauthCallback, createOAuthCallbackHandler());

// ---------------------------------------------------------------------------
// Telegram webhook
// ---------------------------------------------------------------------------
app.route("/api/telegram", telegramApp);

// ---------------------------------------------------------------------------
// tRPC
// ---------------------------------------------------------------------------
app.all("/api/trpc/*", trpcBodyLimit, async (c) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req: c.req.raw,
		router: appRouter,
		createContext,
	}),
);

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// ---------------------------------------------------------------------------
// SPA fallback — no external static files, just serve index.html
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
