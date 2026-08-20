import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ORIGIN, createLink, jsonInit, request, setupWorkspace, signUp } from "./support/api";

describe("members with multiple roles", () => {
  it("a member whose role string also contains admin gets admin-level access", async () => {
    const { owner, organization, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/multi" });

    // Invite + accept a plain member, then give them a comma-joined role string (as Better Auth stores multiple roles).
    const inviteeEmail = `multi-${crypto.randomUUID()}@example.com`;
    const invite = await request(
      `${ORIGIN}/api/auth/organization/invite-member`,
      jsonInit("POST", { email: inviteeEmail, role: "member", organizationId: organization.id }, owner),
    );
    expect(invite.status).toBe(200);
    const invitation = (await invite.json()) as { id: string };
    const invitee = await signUp({ email: inviteeEmail });
    const accept = await request(
      `${ORIGIN}/api/auth/organization/accept-invitation`,
      jsonInit("POST", { invitationId: invitation.id }, invitee),
    );
    expect(accept.status).toBe(200);

    // Plain member of no team: denied.
    expect((await request(`${ORIGIN}/api/links/${link.id}`, { headers: { cookie: invitee.cookie } })).status).toBe(403);

    await env.DB.prepare("UPDATE members SET role = ? WHERE organization_id = ? AND user_id = ?")
      .bind("member,admin", organization.id, invitee.userId)
      .run();

    expect((await request(`${ORIGIN}/api/links/${link.id}`, { headers: { cookie: invitee.cookie } })).status).toBe(200);
    const orgLinks = (await (
      await request(`${ORIGIN}/api/organizations/${organization.id}/links`, { headers: { cookie: invitee.cookie } })
    ).json()) as Array<{ id: string }>;
    expect(orgLinks.map((l) => l.id)).toEqual([link.id]);
  });
});
