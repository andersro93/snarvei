## Summary

<!-- What changed and why. Link the issue (Closes #...). -->

## Test plan

- [ ] `pnpm lint && pnpm format:check && pnpm build && pnpm test`
- [ ] `pnpm test:e2e` when UI or browser-facing behaviour changed
- [ ] New behaviour is covered by a test that failed before the change
- [ ] Schema change? `pnpm db:generate` committed, migration is backward compatible (see AGENTS.md → Database Migrations)
- [ ] Docs/runbook updated if behaviour or operations changed
