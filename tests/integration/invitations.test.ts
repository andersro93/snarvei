import { describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";
import type { EmailMessage } from "../../src/worker/lib/email";
import { ORIGIN, createLink, createOrganization, createTeam, jsonInit, request as plainRequest, signUp, testEnv } from "./support/api";

const sent: EmailMessage[] = [];
const app = createApp({ sendEmail: async (message) => void sent.push(message) });
const authRequest = (input: string, init?: RequestInit) => app.request(input, init, testEnv);

const inviteMember = async (owner: Awaited<ReturnType<typeof signUp>>, organizationId: string, email: string, teamId?: string) => {
  const response = await authRequest(
    `${ORIGIN}/api/auth/organization/invite-member`,
    jsonInit("POST", { email, role: "member", organizationId, ...(teamId ? { teamId } : {}) }, owner),
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as { id: string };
};

const acceptInvitation = async (invitee: Awaited<ReturnType<typeof signUp>>, invitationId: string) => {
  const response = await authRequest(`${ORIGIN}/api/auth/organization/accept-invitation`, jsonInit("POST", { invitationId }, invitee));
  expect(response.status, await response.clone().text()).toBe(200);
};

describe("invitation -> membership -> team access flow (API)", () => {
  it("an invited member can accept, sees no links until assigned to a team, then sees that team's links", async () => {
    const owner = await signUp();
    const organization = await createOrganization(owner);
    const team = await createTeam(owner, organization.id, "Growth");
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/team-link" });

    const inviteeEmail = `invitee-${crypto.randomUUID()}@example.com`;
    const invitation = await inviteMember(owner, organization.id, inviteeEmail);
    expect(sent.at(-1)?.to).toBe(inviteeEmail);
    expect(sent.at(-1)?.text).toContain(`/app/invitations/${invitation.id}`);

    const invitee = await signUp({ email: inviteeEmail });
    const pending = await authRequest(`${ORIGIN}/api/auth/organization/get-invitation?id=${invitation.id}`, {
      headers: { cookie: invitee.cookie, "cf-connecting-ip": invitee.ip },
    });
    expect(pending.status, await pending.clone().text()).toBe(200);
    expect(((await pending.json()) as { organizationName: string }).organizationName).toBeTruthy();

    await acceptInvitation(invitee, invitation.id);

    // Member of the organization, but of no team: no links visible, team access denied.
    const orgLinks = await plainRequest(`${ORIGIN}/api/organizations/${organization.id}/links`, { headers: { cookie: invitee.cookie } });
    expect(orgLinks.status).toBe(200);
    expect(await orgLinks.json()).toEqual([]);
    expect((await plainRequest(`${ORIGIN}/api/links/${link.id}`, { headers: { cookie: invitee.cookie } })).status).toBe(403);

    // Owner assigns the member to the team.
    const added = await authRequest(
      `${ORIGIN}/api/auth/organization/add-team-member`,
      jsonInit("POST", { teamId: team.id, userId: invitee.userId, organizationId: organization.id }, owner),
    );
    if (added.status !== 200) {
      throw new Error(`add-team-member failed: ${added.status} ${await added.text()}`);
    }

    // Owners/admins can list team members through our API even if they are not in the team.
    const teamMembers = await plainRequest(`${ORIGIN}/api/teams/${team.id}/members`, { headers: { cookie: owner.cookie } });
    expect(teamMembers.status, await teamMembers.clone().text()).toBe(200);
    const listed = (await teamMembers.json()) as Array<{ userId: string; email: string | null }>;
    expect(listed.map((m) => m.userId)).toEqual([invitee.userId]);
    expect(listed[0]?.email).toBe(inviteeEmail);
    // ...and so can the team member themselves, but not an unrelated user.
    expect((await plainRequest(`${ORIGIN}/api/teams/${team.id}/members`, { headers: { cookie: invitee.cookie } })).status).toBe(200);
    const stranger = await signUp();
    expect((await plainRequest(`${ORIGIN}/api/teams/${team.id}/members`, { headers: { cookie: stranger.cookie } })).status).toBe(403);

    const visible = (await (await plainRequest(`${ORIGIN}/api/organizations/${organization.id}/links`, { headers: { cookie: invitee.cookie } })).json()) as Array<{ id: string }>;
    expect(visible.map((l) => l.id)).toEqual([link.id]);
    expect((await plainRequest(`${ORIGIN}/api/links/${link.id}`, { headers: { cookie: invitee.cookie } })).status).toBe(200);

    // And removing them from the team revokes access again.
    const removed = await authRequest(
      `${ORIGIN}/api/auth/organization/remove-team-member`,
      jsonInit("POST", { teamId: team.id, userId: invitee.userId, organizationId: organization.id }, owner),
    );
    expect(removed.status, await removed.clone().text()).toBe(200);
    expect((await plainRequest(`${ORIGIN}/api/links/${link.id}`, { headers: { cookie: invitee.cookie } })).status).toBe(403);
  });

  it("an invitation that targets a team grants team access immediately on acceptance", async () => {
    const owner = await signUp();
    const organization = await createOrganization(owner);
    const team = await createTeam(owner, organization.id, "Ops");
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/ops" });

    const inviteeEmail = `invitee-${crypto.randomUUID()}@example.com`;
    const invitation = await inviteMember(owner, organization.id, inviteeEmail, team.id);
    const invitee = await signUp({ email: inviteeEmail });
    await acceptInvitation(invitee, invitation.id);

    expect((await plainRequest(`${ORIGIN}/api/links/${link.id}`, { headers: { cookie: invitee.cookie } })).status).toBe(200);
  });

  it("rejects accepting an invitation addressed to a different email", async () => {
    const owner = await signUp();
    const organization = await createOrganization(owner);
    const invitation = await inviteMember(owner, organization.id, `someone-${crypto.randomUUID()}@example.com`);
    const stranger = await signUp();
    const response = await authRequest(`${ORIGIN}/api/auth/organization/accept-invitation`, jsonInit("POST", { invitationId: invitation.id }, stranger));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
