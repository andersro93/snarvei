import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/worker/app";
import type { EmailMessage } from "../../src/worker/lib/email";
import { ORIGIN, createOrganization, jsonInit, signUp, testEnv } from "./support/api";

const sent: EmailMessage[] = [];
const app = createApp({ sendEmail: async (message) => void sent.push(message) });
const appRequest = (input: string, init?: RequestInit) => app.request(input, init, testEnv);

afterEach(() => {
  sent.length = 0;
  vi.restoreAllMocks();
});

describe("transactional email", () => {
  it("sends an invitation email with the accept link and never logs the link", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const owner = await signUp();
    const organization = await createOrganization(owner);
    const invitee = `invitee-${crypto.randomUUID()}@example.com`;

    const response = await appRequest(
      `${ORIGIN}/api/auth/organization/invite-member`,
      jsonInit("POST", { email: invitee, role: "member", organizationId: organization.id }, owner),
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const invitation = (await response.json()) as { id: string };

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(invitee);
    expect(sent[0]?.subject).toMatch(/invited/i);
    expect(sent[0]?.text).toContain(`/app/invitations/${invitation.id}`);

    const logged = log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).not.toContain(invitation.id);
  });

  it("sends a password reset email with the reset link", async () => {
    const owner = await signUp();
    const response = await appRequest(
      `${ORIGIN}/api/auth/request-password-reset`,
      jsonInit("POST", { email: owner.email, redirectTo: "/app/reset-password" }, owner),
    );
    expect(response.status, await response.clone().text()).toBe(200);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(owner.email);
    expect(sent[0]?.subject).toMatch(/password/i);
    expect(sent[0]?.text).toMatch(/\/api\/auth\/reset-password\/[A-Za-z0-9_-]+/);
  });
});
