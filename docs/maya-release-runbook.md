# Maya voice release and rollback runbook

Last audited: 2026-07-29

## Safety invariant

Outbound calling must remain disabled unless all release gates below pass. Both Twilio and Vapi call creation enforce the same provider-boundary checks:

- `MAYA_OUTBOUND_CALLS_ENABLED=true`;
- valid US destination normalized to E.164;
- Preview destination present in `MAYA_PREVIEW_CALL_ALLOWLIST` or `PREVIEW_TEST_CALL_TO`;
- current time inside `MAYA_CALL_WINDOW_START`–`MAYA_CALL_WINDOW_END` in `MAYA_CALL_TIMEZONE`;
- durable DNC lookup succeeds and reports no match.

Any invalid configuration, DNC lookup failure, or policy denial must stop before a provider API request.

## Audited deployment state

- Vercel project: `maya-agent`.
- Production alias: `https://maya-agent-rho.vercel.app`.
- Current production deployment observed READY on 2026-07-29:
  - deployment ID: `dpl_6q14sretURnLfd4KRSWw7dYLmCiw`;
  - deployment URL: `https://maya-agent-5mnwuaq79-elsykes74-cpus-projects.vercel.app`;
  - created: 2026-06-30.
- Latest Preview deployment observed READY on 2026-07-29:
  - deployment ID: `dpl_CHqSaF1gF3yFpz9upAAjd4BcMTB7`;
  - deployment URL: `https://maya-agent-4j3ihqddm-elsykes74-cpus-projects.vercel.app`;
  - created: 2026-07-27.
- Vercel did not expose a Git commit SHA for either inspected deployment. Deployment IDs, not an inferred commit, are therefore the authoritative rollback handles.
- The outbound safety variables were absent from both Preview and Production during this audit. This leaves the new provider-boundary kill switch disabled by default when the new code is deployed.
- Live health checks on both the production alias and the latest Preview deployment returned HTTP 503 for `/api/db/health` with `configured: true`. Durable DNC and outcome persistence cannot be accepted until database connectivity is restored.

## Pre-deployment gates

1. Create a clean release branch/commit containing only reviewed Maya changes. Record its full Git SHA.
2. Run locally:
   - `npm run check`;
   - `npm test`;
   - `npm run build`;
   - `git diff --check`;
   - from `services/pipecat-agent`: `uv run ruff check .`, `uv run python -m pyright bot.py`, and `uv run python -m pytest -q`.
3. Deploy to Vercel Preview only. Do not use `--prod`.
4. Configure Preview-only values:
   - `MAYA_OUTBOUND_CALLS_ENABLED=true`;
   - `MAYA_PREVIEW_CALL_ALLOWLIST=<authorized E.164 test number>`;
   - `MAYA_CALL_WINDOW_START`, `MAYA_CALL_WINDOW_END`, and `MAYA_CALL_TIMEZONE`;
   - `APP_URL=<exact Preview deployment URL>`;
   - short-lived `PREVIEW_TEST_CALL_SECRET`, `PREVIEW_TEST_CALL_TO`, and `PREVIEW_TEST_CALL_EXPIRES_AT` only for an authorized test;
   - `PIPECAT_WEBSOCKET_URL` only after a persistent authenticated worker is deployed.
5. Keep Production without `MAYA_OUTBOUND_CALLS_ENABLED=true` until Preview acceptance passes.
6. Verify Twilio voice and status webhooks point to the exact Preview deployment under test.
7. Run an explicitly authorized controlled call and correlate by `CallSid`: Twilio Inspector, application logs, recording, transcript, status callbacks, DNC state, and terminal outcome.
8. Record the accepted Preview deployment ID and release Git SHA as the new rollback candidate.

## Emergency stop

Remove or set `MAYA_OUTBOUND_CALLS_ENABLED=false` in the affected Vercel environment, then redeploy that environment so new serverless instances receive the value. Confirm through a blocked-call probe that no Twilio or Vapi request is made. Do not use a real prospect number for the probe.

## Production rollback

Rollback changes production traffic and requires explicit authorization.

1. Confirm the target deployment is READY:
   - `npx vercel inspect <deployment-id-or-url>`
2. Confirm the target predates the faulty release and record the current production deployment ID.
3. Execute:
   - `npx vercel rollback <known-good-deployment-id-or-url> --yes`
4. Wait for completion and verify:
   - `npx vercel rollback status maya-agent`
   - `npx vercel inspect https://maya-agent-rho.vercel.app`
5. Keep outbound calling disabled after rollback until a controlled health check confirms the expected revision and webhook routes.
6. Preserve the failed deployment ID, logs, correlated `CallSid` evidence, and rollback timestamp for incident review.

## Current rollback limitation

The rollback command has been syntax-checked against Vercel CLI 57.0.0, but an actual rollback was intentionally not executed because it would change production. The current production deployment listed above is a verified READY handle, not proof that its voice behavior is known-good.
