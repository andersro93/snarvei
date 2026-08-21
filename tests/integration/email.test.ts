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

describe("forgot password flow", () => {
  const requestReset = async (email: string) =>
    appRequest(`${ORIGIN}/api/auth/request-password-reset`, jsonInit("POST", { email, redirectTo: "/reset-password" }));

  it("lets a user who forgot their password set a new one from the emailed link and revokes existing sessions", async () => {
    const owner = await signUp();
    expect((await requestReset(owner.email)).status).toBe(200);
    expect(sent).toHaveLength(1);

    // The email carries Better Auth's verification URL; following it must land on the app's reset page with the token.
    const verifyUrl = sent[0]!.text.match(/https?:\/\/\S+\/api\/auth\/reset-password\/\S+/)?.[0];
    expect(verifyUrl).toBeTruthy();
    const verify = await appRequest(verifyUrl!, { redirect: "manual" });
    expect(verify.status).toBe(302);
    const landing = new URL(verify.headers.get("location")!, testEnv.APP_URL);
    expect(landing.pathname).toBe("/reset-password");
    const token = landing.searchParams.get("token");
    expect(token).toBeTruthy();
    expect(landing.searchParams.get("error")).toBeNull();

    const reset = await appRequest(`${ORIGIN}/api/auth/reset-password`, jsonInit("POST", { newPassword: "NewPassword456!", token }));
    expect(reset.status, await reset.clone().text()).toBe(200);

    // Old password is rejected, new one works, and the pre-reset session is gone.
    const oldSignIn = await appRequest(
      `${ORIGIN}/api/auth/sign-in/email`,
      jsonInit("POST", { email: owner.email, password: "Password123!" }),
    );
    expect(oldSignIn.status).toBe(401);
    const newSignIn = await appRequest(
      `${ORIGIN}/api/auth/sign-in/email`,
      jsonInit("POST", { email: owner.email, password: "NewPassword456!" }),
    );
    expect(newSignIn.status, await newSignIn.clone().text()).toBe(200);
    expect((await appRequest(`${ORIGIN}/api/me`, { headers: { cookie: owner.cookie } })).status).toBe(401);
  });

  it("does not reveal whether an email is registered", async () => {
    const unknown = await requestReset(`nobody-${crypto.randomUUID()}@example.com`);
    expect(unknown.status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  it("redirects an invalid or expired link to the reset page with an error flag", async () => {
    const response = await appRequest(`${ORIGIN}/api/auth/reset-password/not-a-real-token?callbackURL=%2Freset-password`, {
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    const landing = new URL(response.headers.get("location")!, testEnv.APP_URL);
    expect(landing.pathname).toBe("/reset-password");
    expect(landing.searchParams.get("error")).toBe("INVALID_TOKEN");
  });
});
