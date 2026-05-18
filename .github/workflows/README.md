# GitHub Actions deployment inputs

This repository uses three workflows:

1. `.github/workflows/ci.yml`
2. `.github/workflows/deploy-dev.yml`
3. `.github/workflows/deploy-production.yml`

Required GitHub Actions secrets:

1. `CLOUDFLARE_API_TOKEN`
2. `CLOUDFLARE_ACCOUNT_ID`

Recommended Cloudflare Worker secret configured in the target Worker environment:

1. `AUTH_SECRET`

Notes:

1. `wrangler.jsonc` is now the source of truth for production and `env.dev` runtime configuration.
2. Replace the placeholder D1 database ids and app URLs in `wrangler.jsonc` before the first deployment.
3. `AUTH_SECRET` is not created by the workflows. Add it once for production with `wrangler secret put AUTH_SECRET` and once for dev with `wrangler secret put AUTH_SECRET --env dev`.
4. The `Dev` and `Production` GitHub environments are used for deployment visibility, secret scoping, and optional approval rules.
