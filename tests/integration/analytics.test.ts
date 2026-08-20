import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ORIGIN, createLink, request, setupWorkspace } from "./support/api";

const DAY = 24 * 60 * 60 * 1000;

const insertClick = async (linkId: string, clickedAt: Date, ipHash = "h") =>
  env.DB.prepare(
    "INSERT INTO click_events (id, link_id, clicked_at, ip_hash, host, path, redirect_status_used) VALUES (?, ?, ?, ?, 'localhost', '/l/x', 302)",
  )
    .bind(crypto.randomUUID(), linkId, clickedAt.getTime(), ipHash)
    .run();

type Analytics = {
  totalClicks: number;
  uniqueVisitorApproximation: number;
  clicksByDay: Array<{ day: string; clicks: number }>;
  range: { from: string; to: string };
};

describe("analytics time window", () => {
  it("defaults to the last 30 days and reports the range it used", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/a" });
    const now = Date.now();
    await insertClick(link.id, new Date(now - 1 * DAY), "recent-1");
    await insertClick(link.id, new Date(now - 2 * DAY), "recent-2");
    await insertClick(link.id, new Date(now - 60 * DAY), "old-1");

    const response = await request(`${ORIGIN}/api/links/${link.id}/analytics`, { headers: { cookie: owner.cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Analytics;
    expect(body.totalClicks).toBe(2);
    expect(body.uniqueVisitorApproximation).toBe(2);
    expect(body.clicksByDay.reduce((sum, day) => sum + day.clicks, 0)).toBe(2);
    expect(new Date(body.range.from).getTime()).toBeLessThan(now - 29 * DAY);
    expect(new Date(body.range.to).getTime()).toBeGreaterThan(now - 60_000);
  });

  it("honours explicit from/to bounds (ISO timestamps)", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/b" });
    const now = Date.now();
    await insertClick(link.id, new Date(now - 1 * DAY), "a");
    await insertClick(link.id, new Date(now - 60 * DAY), "b");
    await insertClick(link.id, new Date(now - 90 * DAY), "c");

    const from = new Date(now - 70 * DAY).toISOString();
    const to = new Date(now - 50 * DAY).toISOString();
    const response = await request(`${ORIGIN}/api/links/${link.id}/analytics?from=${from}&to=${to}`, { headers: { cookie: owner.cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Analytics;
    expect(body.totalClicks).toBe(1);
  });

  it("rejects invalid or inverted ranges and ranges longer than a year", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/c" });
    const now = Date.now();
    const cases = [
      `from=not-a-date`,
      `from=${new Date(now).toISOString()}&to=${new Date(now - DAY).toISOString()}`,
      `from=${new Date(now - 400 * DAY).toISOString()}&to=${new Date(now).toISOString()}`,
    ];
    for (const query of cases) {
      const response = await request(`${ORIGIN}/api/links/${link.id}/analytics?${query}`, { headers: { cookie: owner.cookie } });
      expect(response.status, query).toBe(400);
    }
  });
});

describe("list pagination", () => {
  it("pages organization links with limit + cursor, newest first, without overlap", async () => {
    const { owner, organization, team } = await setupWorkspace();
    for (let i = 0; i < 5; i += 1) {
      await createLink(owner, { teamId: team.id, targetUrl: `https://example.com/${i}`, title: `L${i}` });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url = `${ORIGIN}/api/organizations/${organization.id}/links?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const response = await request(url, { headers: { cookie: owner.cookie } });
      expect(response.status).toBe(200);
      const items = (await response.json()) as Array<{ id: string }>;
      expect(items.length).toBeLessThanOrEqual(2);
      seen.push(...items.map((item) => item.id));
      cursor = response.headers.get("x-next-cursor");
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
  });

  it("caps limit and rejects invalid cursors", async () => {
    const { owner, organization } = await setupWorkspace();
    expect((await request(`${ORIGIN}/api/organizations/${organization.id}/links?limit=0`, { headers: { cookie: owner.cookie } })).status).toBe(400);
    expect((await request(`${ORIGIN}/api/organizations/${organization.id}/links?limit=9999`, { headers: { cookie: owner.cookie } })).status).toBe(400);
    expect((await request(`${ORIGIN}/api/organizations/${organization.id}/links?cursor=garbage`, { headers: { cookie: owner.cookie } })).status).toBe(400);
  });

  it("pages link history the same way", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/h0" });
    for (let i = 1; i <= 3; i += 1) {
      const response = await request(`${ORIGIN}/api/links/${link.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: ORIGIN, cookie: owner.cookie },
        body: JSON.stringify({ targetUrl: `https://example.com/h${i}` }),
      });
      expect(response.status).toBe(200);
    }
    const first = await request(`${ORIGIN}/api/links/${link.id}/history?limit=3`, { headers: { cookie: owner.cookie } });
    expect(first.status).toBe(200);
    expect(((await first.json()) as unknown[]).length).toBe(3);
    const cursor = first.headers.get("x-next-cursor");
    expect(cursor).toBeTruthy();
    const second = await request(`${ORIGIN}/api/links/${link.id}/history?limit=3&cursor=${encodeURIComponent(cursor!)}`, { headers: { cookie: owner.cookie } });
    expect(((await second.json()) as unknown[]).length).toBe(1);
    expect(second.headers.get("x-next-cursor")).toBeNull();
  });
});
