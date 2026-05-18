# AGENTS.md

This file is the execution brief for future AI agents and contributors working on `snarvei`.

## Product Summary

Snarvei is an organization-aware URL shortener and redirect management system.

Core goals:

1. Create short links under a shared short domain.
2. Redirect users through `GET /l/:slug`.
3. Allow redirect targets to be changed after the short URL has already been distributed.
4. Track click analytics per link.
5. Support multiple organizations with invitations and organization membership.
6. Use Teams as the only internal permission boundary in V1.

## Locked V1 Decisions

These decisions are already made and should be treated as defaults unless the user explicitly changes them.

### Stack

1. Cloudflare Workers
2. Hono for the API and redirect handling
3. React for the admin UI
4. Material UI for the component system
5. Better Auth for authentication and organization management
6. D1 as the primary data store
7. Drizzle ORM for schema and database access
8. `@hono/zod-openapi` + Zod for request/response validation and OpenAPI generation
9. Scalar for the API reference UI
10. Vitest with `@cloudflare/vitest-pool-workers` for unit/integration tests
11. Playwright for end-to-end UI tests
12. `pnpm` as package manager

### Routing

1. Public redirect route is `GET /l/:slug`.
2. Admin UI lives under `/app/*`.
3. Auth routes live under `/api/auth/*`.
4. App API routes live under `/api/*`.
5. OpenAPI document should be exposed at `/openapi.json`.
6. Scalar API reference should be exposed at `/scalar`.

### Authentication and Authorization

1. V1 auth method is email/password only.
2. Any authenticated user may create an organization in V1.
3. Better Auth organizations are enabled.
4. Better Auth teams are enabled.
5. Team is the only Team-level permission concept in V1.
6. There are no Team sub-roles in V1.
7. If a user is a member of a Team, they have full access to links in that Team.
8. Org `owner` and `admin` can access all Teams in the org.
9. Org `member` can only access Teams they explicitly belong to.

### Links and Analytics

1. Slugs are generated only in V1.
2. Slugs are globally unique.
3. Slugs must not reveal the owning organization.
4. Every Link belongs to exactly one Team.
5. Default redirect status is `302`.
6. Support `301`, `302`, and `307`.
7. Link target changes must be recorded in history.
8. Click analytics should store hashed IP only, never raw IP.
9. Click analytics should retain data for as long as the Link exists.
10. Deleting a Link should also delete its analytics and target history.
11. Activation/deactivation is manual in V1.

### Better Auth Schema

1. Better Auth tables should use plural naming.
2. For Drizzle adapter setup, use `usePlural: true`.

## Recommended Data Model

Better Auth managed tables will cover users, sessions, accounts, organizations, memberships, invitations, teams, and team memberships.

Application-specific tables should include:

1. `links`
2. `link_target_history`
3. `click_events`

Suggested app-level fields:

### `links`

1. `id`
2. `organization_id`
3. `team_id`
4. `slug` unique
5. `target_url`
6. `redirect_status`
7. `is_active`
8. `title` nullable
9. `description` nullable
10. `created_by`
11. `updated_by`
12. `created_at`
13. `updated_at`

### `link_target_history`

1. `id`
2. `link_id`
3. `old_target_url`
4. `new_target_url`
5. `changed_by`
6. `changed_at`

### `click_events`

1. `id`
2. `link_id`
3. `clicked_at`
4. `ip_hash`
5. `user_agent`
6. `referer`
7. `country`
8. `region` nullable
9. `city` nullable
10. `colo` nullable
11. `asn` nullable
12. `host`
13. `path`
14. `query_string` nullable
15. `redirect_status_used`

## Authorization Rules

Keep authorization centralized in helpers or middleware, not spread ad hoc across handlers.

Recommended logic:

1. If org role is `owner` or `admin`, allow access to all Teams and Links in that organization.
2. Otherwise, require explicit Team membership for the Team that owns the Link.
3. A Link mutation must always validate both org access and Team ownership.

## API Contract Guidance

Use `@hono/zod-openapi` for all app routes.

Rules:

1. Every API route should have a request schema when applicable.
2. Every API route should have explicit response schemas.
3. The OpenAPI document should be generated from the route definitions.
4. Avoid hand-maintained OpenAPI files when route metadata can be generated from code.

## Testing Expectations

Testing is a first-class requirement, not optional polish.

Minimum expectations:

1. Unit tests for utility and authorization logic.
2. Workers runtime integration tests for route behavior and D1 interactions.
3. Playwright tests for critical user flows.
4. Redirect and analytics behavior must be tested.
5. Destructive behavior like Link deletion must be tested.

Critical Playwright flows should include:

1. sign up / sign in
2. create organization
3. create team
4. invite member
5. assign member to team
6. create link
7. visit `/l/:slug`
8. edit link target
9. view analytics
10. delete link and verify removal

## UX Guidance

The admin UI should feel clean and deliberate, not generic.

Priorities:

1. Keep the information architecture obvious.
2. Make Team scoping easy to understand.
3. Make link creation and editing fast.
4. Present analytics clearly without overbuilding V1.
5. Keep public redirect concerns separate from admin routes.

## Non-Goals for V1

Do not introduce these unless the user explicitly asks for them:

1. custom domains
2. custom Team roles
3. custom slugs
4. SSO/SAML
5. scheduled activation/deactivation
6. Analytics Engine as primary analytics storage
7. queue-based ingestion unless needed for reliability later

## Implementation Advice

1. Prefer a single full-stack Worker project.
2. Keep route definitions and Zod schemas close together.
3. Keep authorization helpers explicit and easy to test.
4. Use D1 as the source of truth in V1.
5. Record analytics asynchronously with `waitUntil` after issuing the redirect.
6. Hash IPs with a secret-derived salt/pepper; do not persist raw IP addresses.
7. Keep schema and code ready for later migration to richer analytics if needed.

## Expected Repo Direction

The repo is greenfield at the start of this work.

Expected major areas:

1. Worker app and API
2. React admin app
3. database schema and migrations
4. tests
5. generated or code-backed OpenAPI/Scalar docs

When in doubt, optimize for:

1. clarity
2. explicitness
3. testability
4. small correct changes
