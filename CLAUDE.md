# CLAUDE.md — Maya Agent

Maya is an AI real-estate cold-calling/outreach agent for off-market acquisitions in Western Massachusetts. Stack: React 19 + Vite SPA dashboard (`src/`), Hono API (`api/`), Supabase Postgres via Drizzle (`db/`), Twilio/VAPI/ElevenLabs telephony, Telegram bots, Anthropic Claude for message generation.

## Commands

- `npm run dev` — Vite dev server on :3000; `/api/*` is served by `api/boot.ts` through `@hono/vite-dev-server` (single command runs both).
- `npm run build` — `vite build` (frontend → `dist/public`) then esbuild bundles `api/boot.ts` → `dist/boot.js`. Required CI gate — keep it green.
- `npm run check` (`tsc -b`) — green and a **required CI gate**. Keep it that way.
- `npm test` — vitest; tests live in `api/**/*.test.ts` (lead-scorer, twilio helpers, call-window logic). Also a **required CI gate**. Add tests for any new pure logic.
- `npm run lint` — ~180 pre-existing errors on main; advisory in CI. Judge your change by the error *delta*.
- DB: `npm run db:generate` / `db:migrate` / `db:push` (drizzle-kit).

## Architecture

- `api/boot.ts` — single backend entry: tRPC at `/api/trpc/*`, Twilio voice webhooks, Telegram multi-bot webhooks, Google OAuth, `/api/lead-intake` (CORS for meridianhomesma.com), Claude proxy at `/api/claude/messages`. Health probes: `/api/db/health`, `/api/claude/health`, dev-only `/__env-debug`.
- `api/routers/` — tRPC + webhook routers; `api/lib/` — integrations (twilio, elevenlabs, vapi, anthropic, supabase, telegram, lead-scorer…); `api/bots/` — Telegram bots.
- **Dialer**: campaign activation only *queues* calls (`call_queue`); `api/lib/dialer.ts` drains them in batches. Ticks are concurrency-safe (`FOR UPDATE SKIP LOCKED` claim) and retry non-terminal outcomes per campaign `maxCallsPerLead`/`callIntervalHours`. Drive via `POST /api/dialer/tick` (Bearer `CRON_SECRET`) from any cron, or `DIALER_ENABLED=true` for the in-process loop on Railway. Queue depth: `GET /api/dialer/health`. Never dial an entire campaign inline in one request.
- `contracts/` — shared constants/errors/types, aliased `@contracts/*`. Fragile under esbuild — the `build` script's `createRequire` banner exists because of it.
- `maya-integration/` — NOT code: the human-authored persona/prompts (system prompts, call scripts) that seed the `ai_config` DB table.
- `skills/real-estate-acquisitions/` — domain skill for Maya's call logic, seller psychology, compliance.

## Deploy model (load-bearing)

- The repo deploys to **both Vercel (primary) and Railway**. The `VERCEL` env var flips `api/boot.ts` between serverless mode (`api/vercel.js` req/res bridge) and a long-running `serve()` server (Railway/Docker, CMD `node start-debug.mjs`).
- **Two Vercel projects build this repo**: `maya-agent` (production — `maya-agent-rho.vercel.app`; webhooks and Telegram bots point here) and `app`. When checking a deploy, make sure you're looking at the right project.
- `vercel.json`: `functions` and `builds` cannot coexist in the same file.
- **Timeout budget**: Vercel's 10s clock starts at *request arrival*, and cold starts eat 3–6s of it. In Twilio call paths keep Claude calls ≤3s and the handler deadline ≤4s (see commit `e1aa65d`). Do not "fix" a timeout by raising these.
- Changing a Vercel env var does **not** affect existing deployments — it needs a fresh build. Trigger a redeploy from the Vercel dashboard/API; do not push empty "chore: redeploy" commits.
- Webhook callback URLs must be derived from the incoming request's `x-forwarded-host`/`host` headers (see `maya-webhook.ts:46`, `campaigns-router.ts:152`) so callbacks return to the *current* deployment — never from `APP_URL`/the production domain, or callbacks hit a deployment that doesn't have your code.

## Hard rules (each cost multiple past sessions)

1. **Never throw or do fallible work at module level in `api/**`.** A module-level throw crashes the serverless function before any handler runs and Twilio plays "application error." `api/lib/env.ts` is deliberately never-throw; preserve that property in anything it imports.
2. **Secrets live in Vercel env vars only.** Never hardcode a fallback secret in source (this has already forced one token rotation). The Supabase `ai_config` table also stores API keys and goes stale — env vars are canonical (`bce74c2` fixed a 502 caused by a stale table key).
3. **The database is PostgreSQL** (Supabase). Postgres inserts have no `.insertId` — use Drizzle `.returning()`. Upserts are `onConflictDoUpdate`/`ON CONFLICT`, never `ON DUPLICATE KEY UPDATE`. (The MySQL-era `.insertId` bug silently returned `NaN` ids in production for weeks; the mysql2 debris scripts have been deleted — don't reintroduce the pattern.)
4. **Migrations in `db/migrations/` are tracked in git** (numbered `000N_name.sql`, see `.gitignore:35`). If you apply schema changes via the Supabase MCP, also commit the SQL file — one migration has already been lost by assuming migrations were gitignored.
5. **Model config is load-bearing**: default is `claude-sonnet-4-6`; `BLOCKED_MODELS` in `api/boot.ts` blocks 1M-context models that error without paid credits. Don't "upgrade" the default or remove the guard.
6. **When renaming/removing exports in `api/lib/`, grep all call sites first** — legacy webhook handlers import old symbols and have broken the build before (`7a5ca39`).

## Session conventions

- One branch per PR. Don't keep committing to a session branch after its PR merges — that pattern caused three merge-conflict rounds on `claude/app-setup-frontend-4AooX`.
- Create PRs with a plain-text body via the GitHub MCP tools. Do not wrap the body in `$(cat <<'EOF' … )` — the shell syntax leaks literally into the PR description (see PRs #2, #3, #6).
- UI/style work: ask for a reference screenshot **before** iterating and verify against the Vercel preview URL. Open-ended "make it look better" loops have taken 6+ commits on a single logo.
- Run `npm run build` before every push.
