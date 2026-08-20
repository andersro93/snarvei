import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ORIGIN, createLink, request, setupWorkspace } from "./support/api";

describe("recorded click events minimise personal data", () => {
  it("drops non-campaign query parameters, strips referer query/fragment and caps the user agent", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/privacy" });

    const response = await request(`${ORIGIN}/l/${link.slug}?utm_source=newsletter&email=person%40example.com&token=secret123`, {
      headers: {
        "CF-Connecting-IP": "203.0.113.9",
        "user-agent": `Agent/${"y".repeat(600)}`,
        referer: "https://ref.example/page?session=abc#frag",
      },
    });
    expect(response.status).toBe(302);

    const event = await env.DB.prepare("SELECT query_string, referer, user_agent, ip_hash FROM click_events WHERE link_id = ?")
      .bind(link.id)
      .first<{ query_string: string | null; referer: string | null; user_agent: string | null; ip_hash: string }>();
    expect(event?.query_string).toBe("utm_source=newsletter");
    expect(event?.referer).toBe("https://ref.example/page");
    expect(event?.user_agent?.length).toBe(256);
    expect(JSON.stringify(event)).not.toContain("secret123");
    expect(JSON.stringify(event)).not.toContain("person");
    expect(JSON.stringify(event)).not.toContain("203.0.113.9");
  });
});
