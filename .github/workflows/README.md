# GitHub Actions deployment inputs

This repository uses three workflows:

1. `.github/workflows/ci.yml`
2. `.github/workflows/deploy-dev.yml`
3. `.github/workflows/deploy-production.yml`

Required GitHub Actions secrets:

1. `CLOUDFLARE_API_TOKEN`
2. `CLOUDFLARE_ACCOUNT_ID`

Required Cloudflare Worker secrets configured in the target Worker environment:

1. `AUTH_SECRET` (at least 32 characters). The Worker refuses to serve requests (HTTP 500 `Server misconfigured`) when it is missing or too short, or when `APP_URL`/`DB` are not configured.

Optional:

1. `IP_HASH_PEPPER` — dedicated secret for hashing visitor IPs. Defaults to `AUTH_SECRET`; set it so that rotating `AUTH_SECRET` does not reset unique-visitor analytics.

Notes:

1. `wrangler.jsonc` is now the source of truth for production and `env.dev` runtime configuration.
2. `deploy-dev.yml` runs on `workflow_run` of `CI` for `main` and only proceeds when that run succeeded. `deploy-production.yml` verifies a successful `Validate` check run exists for the chosen ref before deploying.
3. `AUTH_SECRET` is not created by the workflows. Add it once for production with `wrangler secret put AUTH_SECRET` and once for dev with `wrangler secret put AUTH_SECRET --env dev`.
4. The `Dev` and `Production` GitHub environments are used for deployment visibility, secret scoping, and optional approval rules.

## Migrations, rollback and recovery

1. CI (`pnpm db:check`) fails when `src/worker/db/schema.ts` and the committed migrations drift apart.
2. Both deploy workflows list pending remote migrations, apply them, and only then deploy the Worker. Deploys are queued, never cancelled mid-flight.
3. Migrations must be backward compatible with the running Worker (expand/contract) — see `AGENTS.md` "Database Migrations".
4. Rolling back the Worker: `pnpm exec wrangler deployments list` then `pnpm exec wrangler rollback [version-id]` (add `--env dev` for dev).
5. Recovering data: D1 Time Travel — `pnpm exec wrangler d1 time-travel info DB --remote` and `... restore DB --remote --timestamp <iso>` (30-day window; writes after the bookmark are lost). Before risky production migrations take a snapshot: `pnpm exec wrangler d1 export DB --remote --output backup.sql`.
