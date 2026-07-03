---
name: db-migrations
description: How to change the maya-agent database schema safely — Drizzle + Supabase Postgres, numbered SQL migrations tracked in git. Use when adding tables/columns/enums, applying migrations, or writing insert/update queries.
---

# DB Migrations — maya-agent

## Facts first

- The database is **Supabase PostgreSQL** (migrated from MySQL/PlanetScale in PR #1). Drizzle dialect is `postgresql`, driver is `postgres-js` with `prepare: false` (required by the Supabase transaction pooler).
- Migrations live in `db/migrations/` as numbered files (`0001_bot_upgrades.sql`, `0002_ai_config_columns.sql`) and **are tracked in git** — `.gitignore:35` says so explicitly. A past session assumed the opposite and its migration SQL (PR #3's lead-finder columns) was applied to Supabase but never committed; the repo and the live schema have drifted.
- `DATABASE_URL` also accepted as `POSTGRES_URL` / `SUPABASE_DB_URL` etc. (`api/lib/env.ts:3-9`). `drizzle.config.ts` throws without it.

## Workflow for a schema change

1. Edit `db/schema.ts` (pg-core: enums, tables, `bigserial` PKs).
2. Write the migration as `db/migrations/000N_short_name.sql` (next number in sequence).
3. Apply it to Supabase — via the Supabase MCP `apply_migration`, or `npm run db:push` for dev.
4. **Commit the SQL file in the same PR as the schema change.** Applying via MCP without committing is how drift happens.
5. If the app needs the new columns at runtime, remember Vercel deployments don't restart on DB changes — but they do need a redeploy if you also changed env vars.

## Postgres idioms (MySQL ghosts to avoid)

- Inserts return rows via `.returning()` — there is **no `.insertId`**. About a dozen `.insertId` usages in `api/routers/{campaigns,dnc,sms,webhooks}-router.ts` are broken leftovers and the reason `npm run check` is red on main. Don't copy them; fixing them is welcome.
- Upserts: `onConflictDoUpdate`, not `onDuplicateKeyUpdate`.
- Ignore/never extend the abandoned MySQL debris: `db/fix-appt*.{mjs,cjs}`, `db/check-appt.cjs`, `db/recreate-appt.cjs`, `scripts/_diag*.js` (they use `mysql2` and `SHOW COLUMNS` against a Postgres database).
