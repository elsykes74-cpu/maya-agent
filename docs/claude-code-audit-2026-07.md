# Claude Code Session Audit — July 2026

An audit of past Claude Code sessions on this repo, clustering recurring friction and proposing fixes. Evidence sources: 118 commits across all branches (2026-05-14 → 2026-06-04), 9 GitHub PRs (6 distinct sessions identifiable from PR footers), repo configuration, and the debug scaffolding those sessions left behind.

## TL;DR

Roughly **30+ commits were pure retry/rediscovery waste** — the same four facts (env-var source of truth, Vercel cold-start budget, webhook URL resolution, "no module-level throws") were re-learned across multiple sessions because nothing wrote them down. There was **no CLAUDE.md, no CI, no tests, and typecheck is red on main**, so sessions verified work by merging and watching the production deploy. This PR ships the highest-leverage fixes (CLAUDE.md, two engineering skills, a build-gate CI); the rest are proposals below, plus **two security actions that need you personally** (§6).

---

## 1. Session timeline

| Dates | Commits | Theme |
|---|---|---|
| 05-14/15 | 17 | Initial import, then Railway/Docker/Nixpacks boot fight |
| 05-17 | 8 | Railway 502 diagnosis — rescue entry points (`start-debug.mjs`, `preflight-server.js`) |
| 05-25 | 1 | MySQL → Supabase Postgres migration (PR #1) |
| 05-30 | 19 | Vercel serverless entry, Twilio outbound, Telegram, env-var fights (PR #2, #3 branches) |
| 06-01 | 16 | Claude "1M context" error fixed twice (PRs #4 **and** #5), Telegram bots |
| 06-02 | 24 | Twilio webhook URLs, SPA routing, voice, Vercel timeouts |
| 06-03 | 19 | Env-var redeploy spam, cold-start timeouts, retroactive security (PR #6) |
| 06-04 | 14 | Logo/tile style churn, campaigns rewrite (PR #7); PR #8 opened (still draft) |

## 2. Friction clusters, ranked by wasted effort

### #1 — Deploy/boot fights (~20 commits)
Railway saga: Dockerfile → "remove Dockerfile to force Nixpacks" (`1ab8565`) → Procfile → back to Dockerfile (`3ffff4d`), while the real cause was **import-time crashes** (`86d17da` JWK, `922b1f2` `@contracts` alias). Left behind: `start.mjs`, `start-debug.mjs`, `diag.mjs`, `preflight-server.js`, `_check_contracts.mjs`, `_trace_resolve.mjs`, `_resolve_mod.mjs` — seven rescue scripts at repo root.
**Root cause:** builder-blaming instead of diagnosing module init; nothing recorded the boot architecture.

### #2 — Env vars & secrets chaos (~10 commits + a token rotation)
Five zero-code "chore: redeploy to pick up env vars" commits (`9c052cd`, `6823755`, `24074e3`, `305328d`, `3eb76d0`). Two competing secret stores — Vercel env vars vs the Supabase `ai_config` table — with the table going stale (`bce74c2` fixed a 502 from a stale ElevenLabs key). Worst instance: **a live Telegram bot token is hardcoded as a fallback at `api/lib/env.ts:100` on `main`** — PR #9 "fixed" a revoked token by committing the *new* secret.

### #3 — Serverless correctness re-learned (~8 commits)
Module-level throws crashing functions before any handler ran (`86d17da`, `c09045f`, `fa6d2b8` — three separate incidents, three files). Vercel's 10s budget including 3–6s cold start was re-derived across four commits (`6d39ce7` → `02b67dc` → `ac5954f` → `e1aa65d`).

### #4 — Webhook URL resolution (~6 commits)
`APP_URL` (production domain) vs `VERCEL_URL` (current deployment) relearned per call site: `789cf1e`, `06237e4`, `f8965c8`, `d99dfcf`. Callbacks kept hitting deployments that didn't have the new code.

### #5 — Broken verification loop (systemic, enables everything above)
`npm run check` fails on main (≈15 errors — `.insertId` MySQL ghosts in four routers, i.e. **real dead code paths**, not just noise). Lint: ~180 errors. Tests: zero files (`vitest` runs nothing). CI: none. So every session's only verification was "merge → watch the Vercel deploy," which is exactly why clusters #1–#4 played out in production.

### #6 — Duplicate and conflicting work across sessions
PRs #4 and #5 fixed the **same** "1M context" error on the same morning in two sessions, choosing two different models (haiku-4-5 vs sonnet-4-6); the merge conflict (`99a9630`) then had to reconcile them. `.claude/settings.json` pins `claude-sonnet-4-6` for Claude Code sessions themselves — likely an accidental leftover from the app-model confusion.

### #7 — Style/UX churn (10 commits in one day)
Logo/branding: 6 iterations (`e70bf32`…`fb09da6`); KPI/hub tiles: 4 (`8d9e9f9`, `70fd1f4`, `4586f6c`, `39b4285`). No reference image, so each commit chased a moving target.

### #8 — Process friction
- Branch `claude/app-setup-frontend-4AooX` reused across PRs #2, #6, #7, #8 → three merge-conflict rounds (`d186578`, `13bfb2d`, `99a9630`).
- PR bodies #2, #3, #6 contain literal `$(cat <<'EOF'` — shell heredoc leaked into descriptions.
- PRs #8 and #9 sit open as drafts (since 06-04 and 06-08).
- PR #3's migration SQL was applied to Supabase but never committed — the session claimed migrations were "gitignored per repo convention" while `.gitignore:35` says the opposite. **Live schema and repo have drifted.**
- Build break from renaming exports without grepping call sites (`7a5ca39`).

## 3. Shipped in this PR

| Fix | Addresses |
|---|---|
| **`CLAUDE.md`** — deploy model, env-var canon, timeout budget, webhook rule, no-module-throw rule, Postgres-not-MySQL, migration tracking, branch/PR conventions | #1 #2 #3 #4 #6 #8 |
| **`.claude/skills/deploy-debug/SKILL.md`** — symptom→cause runbook for Vercel/Railway failures with commit citations | #1 #2 #3 #4 |
| **`.claude/skills/db-migrations/SKILL.md`** — migration workflow + Postgres idioms (`.returning()` not `.insertId`) | #5 #8 |
| **`.github/workflows/ci.yml`** — `npm run build` required; typecheck/lint advisory until baselines are fixed | #5 |

**Update (same PR, phase 2 — reliability floor executed):** all typecheck errors on main are now fixed — including the `.insertId` sites, which were returning `NaN` ids at runtime, a campaign-activation loop whose queue-status updates matched no rows, and an SMS STOP handler whose MySQL-syntax upsert meant **opt-outs were never recorded** (compliance bug). The repo's first test suite was added (21 tests: lead scoring, phone normalization, call-window/timezone logic), 12 dead MySQL/debug scripts were deleted, and CI now requires **build + typecheck + test** (lint remains advisory). Item 6 of §5 below is done.

## 4. Proposed skills (not shipped)

1. **`ui-iteration`** — require a reference screenshot before any style work; verify on the Vercel preview URL with a browser screenshot each iteration; cap exploration at 2 attempts before asking. Would have collapsed cluster #7. (Kept as proposal since it's as much your workflow as Claude's.)
2. **Relocate `skills/real-estate-acquisitions/` → `.claude/skills/`** — project skills are auto-discovered from `.claude/skills/`; in its current location the domain skill likely never loads. One `git mv`.
3. **`telephony-testing`** — how to place a safe test call / send a test SMS and read Twilio + Vercel logs, so call-path changes get verified without dialing real leads. Needs your input on a test number.

## 5. Proposed automations

1. **SessionStart hook for web sessions** (`.claude/settings.json`) running `npm ci` so every session can build/typecheck immediately — there's a `session-start-hook` skill in Claude Code that sets this up.
2. **Permissions allowlist** in `.claude/settings.json` (e.g. `npm run build/check/lint/test`, `git status/diff/log`) to cut permission prompts; the `/fewer-permission-prompts` skill generates this from your transcript history.
3. **Secret scanning**: enable GitHub secret scanning + push protection on the repo (Settings → Code security), and/or add a `gitleaks` job to CI. Would have blocked the `env.ts:100` token commit.
4. **PR babysitting**: after a session opens a PR, have it subscribe to PR activity (CI + reviews) so fix-up rounds happen without you relaying errors — and drafts like #8/#9 don't linger.
5. **Reconsider `.claude/settings.json` model pin** — it forces every Claude Code session onto `claude-sonnet-4-6`; if that was meant for the *app* (it's also set in `api/boot.ts`), delete it from settings.
6. **Baseline cleanup task** (one session, well-scoped): fix the ~15 `.insertId`/`config` typecheck errors (real bugs), delete the 7 root debug scripts + MySQL ghost scripts, then flip CI typecheck to required.

## 6. Security actions — need you personally

1. **Rotate the Telegram bot token now**: `api/lib/env.ts:100` contains the *current live* token for @Quickkickbot on `main`. Revoke via BotFather, put the new token in Vercel env vars only, delete the hardcoded fallback, re-register the webhook. (History rewrite optional; rotation is what matters.)
2. **Decide PR #8 and #9**: merge or close. #9 exists only because of the token-in-source pattern; fixing (1) properly supersedes it.
