import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";
import type { AppBindings } from "../../src/worker/lib/types";
import { ORIGIN, createLink, jsonInit, setupWorkspace, testEnv as sharedEnv } from "./support/api";

/** Deterministic stand-in for the Workers Rate Limiting binding: allows `allow` calls per key. */
const fakeRateLimit = (allow: number) => {
  const counts = new Map<string, number>();
  return {
    keys: counts,
    async limit({ key }: { key: string }) {
      const seen = (counts.get(key) ?? 0) + 1;
      counts.set(key, seen);
      return { success: seen <= allow };
    },
  };
};

const app = createApp();

/** app.request with a fresh ExecutionContext so waitUntil() work (click recording) can run. */
const requestWith = async (bindings: AppBindings, input: string, init?: RequestInit) => {
  const ctx = createExecutionContext();
  const response = await app.request(input, init, bindings, ctx);
  await waitOnExecutionContext(ctx);
  return response;
};

describe("edge rate limiting (Workers Rate Limiting binding)", () => {
  const withLimiter = (allow: number) => {
    const limiter = fakeRateLimit(allow);
    const bindings: AppBindings = { ...sharedEnv, RATE_LIMIT: limiter as unknown as RateLimit };
    return { limiter, bindings };
  };

  it("returns 429 with Retry-After on /l/:slug once a client exceeds the limit, per IP", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/rl" });
    const { limiter, bindings } = withLimiter(2);

    const hit = (ip: string) => requestWith(bindings, `${ORIGIN}/l/${link.slug}`, { headers: { "CF-Connecting-IP": ip } });

    expect((await hit("198.51.100.10")).status).toBe(302);
    expect((await hit("198.51.100.10")).status).toBe(302);
    const limited = await hit("198.51.100.10");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    // A different client is unaffected.
    expect((await hit("198.51.100.11")).status).toBe(302);
    expect([...limiter.keys.keys()].every((key) => key.startsWith("redirect:"))).toBe(true);
  });

  it("applies the edge limit to /api/auth/* as well", async () => {
    const { bindings } = withLimiter(1);
    const attempt = () =>
      app.request(
        `${ORIGIN}/api/auth/sign-in/email`,
        { ...jsonInit("POST", { email: "nobody@example.com", password: "wrong-password" }), headers: { ...jsonInit("POST", {}).headers, "CF-Connecting-IP": "198.51.100.20" } },
        bindings,
      );
    expect((await attempt()).status).not.toBe(429);
    expect((await attempt()).status).toBe(429);
  });

  it("does not rate limit the admin UI/API or health endpoint", async () => {
    const { bindings } = withLimiter(0);
    expect((await app.request(`${ORIGIN}/api/health`, undefined, bindings)).status).toBe(200);
    expect((await app.request(`${ORIGIN}/api/me`, undefined, bindings)).status).toBe(401);
  });
});

describe("Workers Rate Limiting binding", () => {
  it("is configured in wrangler.jsonc and usable from the Worker", async () => {
    expect(env.RATE_LIMIT).toBeDefined();
    const outcome = await env.RATE_LIMIT.limit({ key: `probe:${crypto.randomUUID()}` });
    expect(outcome.success).toBe(true);
  });
});

describe("Better Auth rate limiting (database storage)", () => {
  it("rejects repeated failed sign-ins from one IP with 429", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const response = await app.request(
        `${ORIGIN}/api/auth/sign-in/email`,
        {
          ...jsonInit("POST", { email: `brute-${i}@example.com`, password: "wrong-password" }),
          headers: { ...jsonInit("POST", {}).headers, "CF-Connecting-IP": "203.0.113.77" },
        },
        { ...sharedEnv, RATE_LIMIT: fakeRateLimit(1000) as unknown as RateLimit },
      );
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
    expect(statuses[0]).toBe(401);

    const rows = await env.DB.prepare("SELECT count(*) AS n FROM rate_limits").first<{ n: number }>();
    expect(rows?.n ?? 0).toBeGreaterThan(0);
  });

  it("keys Better Auth limits by the CF-Connecting-IP header (not x-forwarded-for)", async () => {
    const attempt = (headers: Record<string, string>) =>
      app.request(
        `${ORIGIN}/api/auth/sign-in/email`,
        { ...jsonInit("POST", { email: "nobody2@example.com", password: "wrong-password" }), headers: { ...jsonInit("POST", {}).headers, ...headers } },
        { ...sharedEnv, RATE_LIMIT: fakeRateLimit(1000) as unknown as RateLimit },
      );
    // Exhaust the window for one real IP while rotating the spoofable header.
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      statuses.push((await attempt({ "CF-Connecting-IP": "203.0.113.88", "x-forwarded-for": `10.0.0.${i}` })).status);
    }
    expect(statuses).toContain(429);
  });
});
