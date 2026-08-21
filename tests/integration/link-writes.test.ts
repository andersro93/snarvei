import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as slugModule from "../../src/worker/lib/slug";
import { ORIGIN, countRows, createLink, jsonInit, request, setupWorkspace } from "./support/api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("link creation robustness", () => {
  it("retries slug generation when the generated slug already exists (even repeatedly)", async () => {
    const { owner, team } = await setupWorkspace();
    const existing = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/first" });

    // Keep colliding more times than any fixed pre-check loop would tolerate, then succeed.
    const spy = vi.spyOn(slugModule, "generateSlug");
    for (let i = 0; i < 8; i += 1) {
      spy.mockReturnValueOnce(existing.slug);
    }
    spy.mockReturnValueOnce("Zz9Zz9Zz");

    const response = await request(
      `${ORIGIN}/api/links`,
      jsonInit("POST", { teamId: team.id, targetUrl: "https://example.com/second" }, owner.cookie),
    );
    expect(response.status, await response.clone().text()).toBe(201);
    const created = (await response.json()) as { slug: string };
    expect(created.slug).toBe("Zz9Zz9Zz");
  });

  it("creates the link and its initial history entry atomically", async () => {
    const { owner, team } = await setupWorkspace();
    const first = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/a" });
    const [firstHistory] = (
      await env.DB.prepare("SELECT id FROM link_target_history WHERE link_id = ?").bind(first.id).all<{ id: string }>()
    ).results;
    expect(firstHistory).toBeDefined();

    // Force the history insert to fail (duplicate primary key) while the link insert would succeed.
    const realRandomUUID = crypto.randomUUID.bind(crypto);
    const newLinkId = realRandomUUID();
    const spy = vi.spyOn(crypto, "randomUUID");
    spy.mockImplementationOnce(() => newLinkId as `${string}-${string}-${string}-${string}-${string}`);
    spy.mockImplementationOnce(() => firstHistory!.id as `${string}-${string}-${string}-${string}-${string}`);
    spy.mockImplementation(() => realRandomUUID());

    const response = await request(
      `${ORIGIN}/api/links`,
      jsonInit("POST", { teamId: team.id, targetUrl: "https://example.com/b" }, owner.cookie),
    );
    expect(response.status).toBe(500);

    // No orphan link without history may remain.
    expect(await countRows("links", "id", newLinkId)).toBe(0);
  });

  it("updates the target and appends history atomically", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/v1" });
    const [history] = (await env.DB.prepare("SELECT id FROM link_target_history WHERE link_id = ?").bind(link.id).all<{ id: string }>())
      .results;

    // Force the history insert to collide on primary key: the update must be rolled back too.
    const realRandomUUID = crypto.randomUUID.bind(crypto);
    const spy = vi.spyOn(crypto, "randomUUID");
    spy.mockImplementationOnce(() => history!.id as `${string}-${string}-${string}-${string}-${string}`);
    spy.mockImplementation(() => realRandomUUID());

    const response = await request(
      `${ORIGIN}/api/links/${link.id}`,
      jsonInit("PATCH", { targetUrl: "https://example.com/v2" }, owner.cookie),
    );
    expect(response.status).toBe(500);

    const redirect = await request(`${ORIGIN}/l/${link.slug}`);
    expect(redirect.headers.get("location")).toBe("https://example.com/v1");
    expect(await countRows("link_target_history", "link_id", link.id)).toBe(1);
  });
});

describe("custom slugs", () => {
  it("creates a link with the requested slug and redirects through it", async () => {
    const { owner, team } = await setupWorkspace();
    const slug = `launch-${crypto.randomUUID().slice(0, 8)}`;
    const response = await request(
      `${ORIGIN}/api/links`,
      jsonInit("POST", { teamId: team.id, targetUrl: "https://example.com/launch", slug }, owner),
    );
    expect(response.status, await response.clone().text()).toBe(201);
    const created = (await response.json()) as { slug: string };
    expect(created.slug).toBe(slug);

    const redirect = await request(`${ORIGIN}/l/${slug}`);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("https://example.com/launch");
  });

  it("normalises the slug to lowercase and trims whitespace", async () => {
    const { owner, team } = await setupWorkspace();
    const suffix = crypto.randomUUID().slice(0, 8);
    const response = await request(
      `${ORIGIN}/api/links`,
      jsonInit("POST", { teamId: team.id, targetUrl: "https://example.com/x", slug: `  Summer-${suffix} ` }, owner),
    );
    expect(response.status, await response.clone().text()).toBe(201);
    const created = (await response.json()) as { slug: string };
    expect(created.slug).toBe(`summer-${suffix}`);
    expect((await request(`${ORIGIN}/l/summer-${suffix}`)).status).toBe(302);
  });

  it("returns 409 when the slug is already taken, also across organizations, and leaves no orphan rows", async () => {
    const first = await setupWorkspace();
    const second = await setupWorkspace();
    const slug = `taken-${crypto.randomUUID().slice(0, 8)}`;
    await createLink(first.owner, { teamId: first.team.id, targetUrl: "https://example.com/a", slug });

    const before = await env.DB.prepare("SELECT count(*) AS n FROM links").first<{ n: number }>();
    for (const workspace of [first, second]) {
      const response = await request(
        `${ORIGIN}/api/links`,
        jsonInit("POST", { teamId: workspace.team.id, targetUrl: "https://example.com/b", slug }, workspace.owner),
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "Slug is already taken" });
    }
    const after = await env.DB.prepare("SELECT count(*) AS n FROM links").first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
    expect(await countRows("link_target_history", "new_target_url", "https://example.com/b")).toBe(0);
  });

  it("rejects malformed slugs with a 400 naming the field", async () => {
    const { owner, team } = await setupWorkspace();
    const response = await request(
      `${ORIGIN}/api/links`,
      jsonInit("POST", { teamId: team.id, targetUrl: "https://example.com/malformed-slug", slug: "Hello World!" }, owner),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/^slug: /);
    expect(await countRows("link_target_history", "new_target_url", "https://example.com/malformed-slug")).toBe(0);
  });

  it("still generates a slug when none is provided", async () => {
    const { owner, team } = await setupWorkspace();
    const created = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/generated" });
    expect(created.slug).toHaveLength(8);
  });

  it("ignores a slug sent on update — a distributed slug never changes", async () => {
    const { owner, team } = await setupWorkspace();
    const slug = `fixed-${crypto.randomUUID().slice(0, 8)}`;
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/v1", slug });
    const response = await request(
      `${ORIGIN}/api/links/${link.id}`,
      jsonInit("PATCH", { slug: "something-else", title: "Renamed" }, owner),
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const updated = (await response.json()) as { slug: string; title: string | null };
    expect(updated.slug).toBe(slug);
    expect(updated.title).toBe("Renamed");
  });
});
