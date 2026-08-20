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

    const response = await request(`${ORIGIN}/api/links`, jsonInit("POST", { teamId: team.id, targetUrl: "https://example.com/second" }, owner.cookie));
    expect(response.status, await response.clone().text()).toBe(201);
    const created = (await response.json()) as { slug: string };
    expect(created.slug).toBe("Zz9Zz9Zz");
  });

  it("creates the link and its initial history entry atomically", async () => {
    const { owner, team } = await setupWorkspace();
    const first = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/a" });
    const [firstHistory] = (await env.DB.prepare("SELECT id FROM link_target_history WHERE link_id = ?")
      .bind(first.id)
      .all<{ id: string }>()).results;
    expect(firstHistory).toBeDefined();

    // Force the history insert to fail (duplicate primary key) while the link insert would succeed.
    const realRandomUUID = crypto.randomUUID.bind(crypto);
    const newLinkId = realRandomUUID();
    const spy = vi.spyOn(crypto, "randomUUID");
    spy.mockImplementationOnce(() => newLinkId as `${string}-${string}-${string}-${string}-${string}`);
    spy.mockImplementationOnce(() => firstHistory!.id as `${string}-${string}-${string}-${string}-${string}`);
    spy.mockImplementation(() => realRandomUUID());

    const response = await request(`${ORIGIN}/api/links`, jsonInit("POST", { teamId: team.id, targetUrl: "https://example.com/b" }, owner.cookie));
    expect(response.status).toBe(500);

    // No orphan link without history may remain.
    expect(await countRows("links", "id", newLinkId)).toBe(0);
  });

  it("updates the target and appends history atomically", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/v1" });
    const [history] = (await env.DB.prepare("SELECT id FROM link_target_history WHERE link_id = ?")
      .bind(link.id)
      .all<{ id: string }>()).results;

    // Force the history insert to collide on primary key: the update must be rolled back too.
    const realRandomUUID = crypto.randomUUID.bind(crypto);
    const spy = vi.spyOn(crypto, "randomUUID");
    spy.mockImplementationOnce(() => history!.id as `${string}-${string}-${string}-${string}-${string}`);
    spy.mockImplementation(() => realRandomUUID());

    const response = await request(`${ORIGIN}/api/links/${link.id}`, jsonInit("PATCH", { targetUrl: "https://example.com/v2" }, owner.cookie));
    expect(response.status).toBe(500);

    const redirect = await request(`${ORIGIN}/l/${link.slug}`);
    expect(redirect.headers.get("location")).toBe("https://example.com/v1");
    expect(await countRows("link_target_history", "link_id", link.id)).toBe(1);
  });
});
