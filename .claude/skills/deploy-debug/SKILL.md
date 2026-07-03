---
name: deploy-debug
description: Runbook for deploying and debugging maya-agent on Vercel and Railway — env-var scopes, webhook URL resolution, cold-start timeout budget, and boot failures. Use when a deploy fails, Twilio plays "application error", webhooks 404 or hit the wrong host, env vars seem missing, or the container 502s on Railway.
---

# Deploy & Debug Runbook — maya-agent

Every path in this runbook was learned the hard way (commit hashes cited). Check the symptom table before writing any fix.

## Symptom → likely cause

| Symptom | Likely cause | Fix |
|---|---|---|
| Twilio plays "application error" on every call | Module-level throw in an `api/` import crashed the function before the handler ran | Find the throwing import; make it lazy/never-throw like `api/lib/supabase.ts` (`fa6d2b8`, `c09045f`) |
| Call drops or times out on first call after idle | Cold start ate the 10s Vercel budget | Claude call ≤3s, handler deadline ≤4s in call paths (`e1aa65d`). Never raise timeouts to "fix" this |
| Webhook/callback hits 404 or old code | Callback URL built from `APP_URL`/production domain instead of the current deployment | Use `resolveAppUrl` (`api/lib/env.ts`), which prefers `VERCEL_URL` (`06237e4`, `d99dfcf`) |
| Env var "not working" after you set it | Existing deployment predates the var; Vercel bakes env at build time | Trigger a redeploy (dashboard or Vercel API). Do NOT push an empty commit (5 such commits exist: `9c052cd`, `6823755`, `24074e3`, `305328d`, `3eb76d0`) |
| Integration 401/402/502 despite env var being correct | Stale API key in the Supabase `ai_config` table shadowing the env var | Env vars are canonical; prefer them over the table (`bce74c2`) |
| "Usage credits required for 1M context" from Claude proxy | Model default drifted to a 1M-context model | Keep `claude-sonnet-4-6` + the `BLOCKED_MODELS` guard in `api/boot.ts` (PRs #4, #5) |
| Railway 502 / container won't boot | `dist/boot.js` missing, esbuild `@contracts` alias failure, or import-time crash | See "Railway boot failures" below |
| `vercel.json` rejected | `functions` and `builds` in the same file | They're mutually exclusive (`02b67dc`) |

## Which deployment am I looking at?

Two Vercel projects build this repo: **`maya-agent` is production** (`maya-agent-rho.vercel.app` — Twilio and Telegram webhooks point here) and `app` is secondary. PR comments from the Vercel bot list preview URLs for both. Always confirm which project's deployment you're testing.

## Verification probes

- `/api/db/health` — DB connectivity
- `/api/claude/health` — Claude proxy + model in use
- `/__env-debug` — dev-only env presence check
- `healthcheck.js` — fail-fast required-env checker (run locally with prod-like env)

## Railway boot failures

The Docker CMD is `node start-debug.mjs`, which logs to `/tmp/startup-debug.log` and falls back to `preflight-server.js` (a rescue HTTP server with `/__env-debug` and `/__health`) when `dist/boot.js` fails to import. Root causes seen so far:

1. Import-time crash (JWK fetch, Supabase client) — `86d17da`; fix by lazy-loading.
2. `@contracts/*` alias not resolving in the esbuild bundle — that's why the `build` script has the `createRequire` banner; `_check_contracts.mjs` / `_trace_resolve.mjs` at repo root reproduce it.
3. Builder flip-flop (Dockerfile ↔ Nixpacks) never fixed anything — the crashes were always in the code, not the builder. Diagnose the import chain first.
