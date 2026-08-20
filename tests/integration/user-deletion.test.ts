import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ORIGIN, countRows, createLink, request, setupWorkspace } from "./support/api";

describe("deleting a user", () => {
  it("keeps the team's links, history and analytics (authorship becomes null)", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/survives" });
    await request(`${ORIGIN}/l/${link.slug}`);
    expect(await countRows("click_events", "link_id", link.id)).toBe(1);

    // Simulate account deletion (Better Auth deleteUser / manual cleanup).
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(owner.userId).run();
    expect(await countRows("users", "id", owner.userId)).toBe(0);

    expect(await countRows("links", "id", link.id)).toBe(1);
    expect(await countRows("link_target_history", "link_id", link.id)).toBe(1);
    expect(await countRows("click_events", "link_id", link.id)).toBe(1);

    const row = await env.DB.prepare("SELECT created_by, updated_by FROM links WHERE id = ?")
      .bind(link.id)
      .first<{ created_by: string | null; updated_by: string | null }>();
    expect(row).toEqual({ created_by: null, updated_by: null });
    const history = await env.DB.prepare("SELECT changed_by FROM link_target_history WHERE link_id = ?")
      .bind(link.id)
      .first<{ changed_by: string | null }>();
    expect(history?.changed_by).toBeNull();

    // The short link keeps working for the public.
    const redirect = await request(`${ORIGIN}/l/${link.slug}`);
    expect(redirect.status).toBe(302);
  });

  it("still removes the user's own sessions and accounts", async () => {
    const { owner } = await setupWorkspace();
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(owner.userId).run();
    expect(await countRows("sessions", "user_id", owner.userId)).toBe(0);
    expect(await countRows("accounts", "user_id", owner.userId)).toBe(0);
  });
});
