import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ORIGIN, countRows, createLink, jsonInit, request, setupWorkspace } from "./support/api";

describe("public redirect /l/:slug", () => {
  it("redirects with 302 by default and records a click event with a hashed IP", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/landing" });

    const response = await request(`${ORIGIN}/l/${link.slug}?utm_source=newsletter`, {
      headers: { "CF-Connecting-IP": "203.0.113.9", "user-agent": "SnarveiTest/1.0", referer: "https://ref.example/" },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/landing");

    const event = await env.DB.prepare("SELECT * FROM click_events WHERE link_id = ?").bind(link.id).first<Record<string, unknown>>();
    expect(event).not.toBeNull();
    expect(event?.ip_hash).toBeTruthy();
    expect(event?.ip_hash).not.toContain("203.0.113.9");
    expect(event?.host).toBe("localhost");
    expect(event?.path).toBe(`/l/${link.slug}`);
    expect(event?.query_string).toBe("utm_source=newsletter");
    expect(event?.user_agent).toBe("SnarveiTest/1.0");
    expect(event?.referer).toBe("https://ref.example/");
    expect(event?.redirect_status_used).toBe(302);
  });

  it.each([301, 302, 307] as const)("marks %i redirects as non-cacheable so retargeting always takes effect", async (status) => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/c", redirectStatus: status });

    const response = await request(`${ORIGIN}/l/${link.slug}`);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("marks 404 responses for unknown slugs as non-cacheable", async () => {
    const response = await request(`${ORIGIN}/l/nope-${crypto.randomUUID().slice(0, 6)}`);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([301, 307] as const)("honours a %i redirect status", async (status) => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/a", redirectStatus: status });

    const response = await request(`${ORIGIN}/l/${link.slug}`);
    expect(response.status).toBe(status);
    expect(response.headers.get("location")).toBe("https://example.com/a");
  });

  it("returns 404 for an inactive link and records no click", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/off" });
    const patch = await request(`${ORIGIN}/api/links/${link.id}`, jsonInit("PATCH", { isActive: false }, owner.cookie));
    expect(patch.status).toBe(200);

    const response = await request(`${ORIGIN}/l/${link.slug}`);
    expect(response.status).toBe(404);
    expect(await countRows("click_events", "link_id", link.id)).toBe(0);
  });

  it("generates distinct, URL-safe slugs for every link", async () => {
    const { owner, team } = await setupWorkspace();
    const slugs = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createLink(owner, { teamId: team.id, targetUrl: `https://example.com/${i}` })),
    ).then((created) => created.map((l) => l.slug));
    expect(new Set(slugs).size).toBe(5);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[A-Za-z0-9]{8}$/);
    }
  });
});

describe("link mutations", () => {
  it("records an initial history entry on create", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/v1" });

    const history = (await (
      await request(`${ORIGIN}/api/links/${link.id}/history`, { headers: { cookie: owner.cookie } })
    ).json()) as Array<{
      oldTargetUrl: string | null;
      newTargetUrl: string;
    }>;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ oldTargetUrl: null, newTargetUrl: "https://example.com/v1" });
  });

  it("appends history when the target changes and not for title-only edits", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/v1" });

    const titleOnly = await request(`${ORIGIN}/api/links/${link.id}`, jsonInit("PATCH", { title: "Renamed" }, owner.cookie));
    expect(titleOnly.status).toBe(200);
    expect(await countRows("link_target_history", "link_id", link.id)).toBe(1);

    const retarget = await request(
      `${ORIGIN}/api/links/${link.id}`,
      jsonInit("PATCH", { targetUrl: "https://example.com/v2" }, owner.cookie),
    );
    expect(retarget.status).toBe(200);
    const history = (await (
      await request(`${ORIGIN}/api/links/${link.id}/history`, { headers: { cookie: owner.cookie } })
    ).json()) as Array<{
      oldTargetUrl: string | null;
      newTargetUrl: string;
    }>;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ oldTargetUrl: "https://example.com/v1", newTargetUrl: "https://example.com/v2" });

    const redirect = await request(`${ORIGIN}/l/${link.slug}`);
    expect(redirect.headers.get("location")).toBe("https://example.com/v2");
  });

  it("deleting a link removes its history and click events", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/gone" });
    await request(`${ORIGIN}/l/${link.slug}`);
    await request(`${ORIGIN}/l/${link.slug}`);
    expect(await countRows("click_events", "link_id", link.id)).toBe(2);
    expect(await countRows("link_target_history", "link_id", link.id)).toBe(1);

    const del = await request(`${ORIGIN}/api/links/${link.id}`, jsonInit("DELETE", undefined, owner.cookie));
    expect(del.status).toBe(200);

    expect(await countRows("links", "id", link.id)).toBe(0);
    expect(await countRows("link_target_history", "link_id", link.id)).toBe(0);
    expect(await countRows("click_events", "link_id", link.id)).toBe(0);
    expect((await request(`${ORIGIN}/l/${link.slug}`)).status).toBe(404);
  });

  it("reports analytics for recorded clicks", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/stats" });
    await request(`${ORIGIN}/l/${link.slug}`, { headers: { "CF-Connecting-IP": "198.51.100.1" } });
    await request(`${ORIGIN}/l/${link.slug}`, { headers: { "CF-Connecting-IP": "198.51.100.1" } });
    await request(`${ORIGIN}/l/${link.slug}`, { headers: { "CF-Connecting-IP": "198.51.100.2" } });

    const analytics = (await (await request(`${ORIGIN}/api/links/${link.id}/analytics`, { headers: { cookie: owner.cookie } })).json()) as {
      totalClicks: number;
      uniqueVisitorApproximation: number;
      clicksByDay: Array<{ day: string; clicks: number }>;
    };
    expect(analytics.totalClicks).toBe(3);
    expect(analytics.uniqueVisitorApproximation).toBe(2);
    expect(analytics.clicksByDay).toHaveLength(1);
    expect(analytics.clicksByDay[0]?.clicks).toBe(3);
  });

  it.each([
    ["missing targetUrl", { title: "x" }],
    ["invalid targetUrl", { targetUrl: "not a url" }],
    ["javascript: targetUrl", { targetUrl: "javascript:alert(1)" }],
    ["data: targetUrl", { targetUrl: "data:text/html,hi" }],
    ["file: targetUrl", { targetUrl: "file:///etc/passwd" }],
    ["targetUrl with credentials", { targetUrl: "https://user:pw@example.com/" }],
    ["unsupported redirect status", { targetUrl: "https://example.com", redirectStatus: 308 }],
    ["overlong title", { targetUrl: "https://example.com", title: "x".repeat(121) }],
  ])("rejects create with %s (400)", async (_name, partial) => {
    const { owner, team } = await setupWorkspace();
    const response = await request(`${ORIGIN}/api/links`, jsonInit("POST", { teamId: team.id, ...partial }, owner.cookie));
    expect(response.status).toBe(400);
  });

  it("rejects retargeting to a non-http(s) URL (400) and keeps the old target", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/keep" });
    const response = await request(`${ORIGIN}/api/links/${link.id}`, jsonInit("PATCH", { targetUrl: "javascript:alert(1)" }, owner.cookie));
    expect(response.status).toBe(400);
    expect((await request(`${ORIGIN}/l/${link.slug}`)).headers.get("location")).toBe("https://example.com/keep");
  });

  it("treats blank title/description as absent on create and as 'clear' on update", async () => {
    const { owner, team } = await setupWorkspace();
    const created = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/d", title: "  ", description: "" });
    expect(created.title).toBeNull();
    expect(created.description).toBeNull();

    const titled = (await (
      await request(`${ORIGIN}/api/links/${created.id}`, jsonInit("PATCH", { title: "Campaign", description: "Desc" }, owner.cookie))
    ).json()) as { title: string | null; description: string | null };
    expect(titled).toMatchObject({ title: "Campaign", description: "Desc" });

    const cleared = (await (
      await request(`${ORIGIN}/api/links/${created.id}`, jsonInit("PATCH", { title: "", description: "   " }, owner.cookie))
    ).json()) as { title: string | null; description: string | null };
    expect(cleared).toMatchObject({ title: null, description: null });

    const untouched = (await (
      await request(`${ORIGIN}/api/links/${created.id}`, jsonInit("PATCH", { redirectStatus: 307 }, owner.cookie))
    ).json()) as { title: string | null; redirectStatus: number };
    expect(untouched).toMatchObject({ title: null, redirectStatus: 307 });
  });

  it("returns 404 for an unknown link id", async () => {
    const { owner } = await setupWorkspace();
    const response = await request(`${ORIGIN}/api/links/${crypto.randomUUID()}`, { headers: { cookie: owner.cookie } });
    expect(response.status).toBe(404);
  });
});
