import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailSender, invitationEmail, passwordResetEmail, verificationEmail } from "../../src/worker/lib/email";

const baseEnv = { APP_NAME: "Snarvei", APP_URL: "https://snarvei.example" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type SentBuilder = { from: string; to: string; subject: string; text?: string; html?: string };

const fakeBinding = (impl?: () => Promise<{ messageId: string }>) => {
  const send = vi.fn<(builder: SentBuilder) => Promise<{ messageId: string }>>(impl ?? (async () => ({ messageId: "msg_123" })));
  return { binding: { send } as unknown as SendEmail, send };
};

describe("createEmailSender", () => {
  it("sends through the Cloudflare Email Service binding when it and EMAIL_FROM are configured", async () => {
    const { binding, send } = fakeBinding();
    const sendEmail = createEmailSender({ ...baseEnv, EMAIL: binding, EMAIL_FROM: "Snarvei <no-reply@snarvei.example>" });
    await sendEmail({ to: "someone@example.com", subject: "Hello", text: "Plain", html: "<p>Plain</p>" });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual({
      from: "Snarvei <no-reply@snarvei.example>",
      to: "someone@example.com",
      subject: "Hello",
      text: "Plain",
      html: "<p>Plain</p>",
    });
  });

  it("surfaces the provider error code when the binding rejects the message", async () => {
    const { binding } = fakeBinding(async () => {
      throw Object.assign(new Error("sender not verified"), { code: "E_SENDER_NOT_VERIFIED" });
    });
    const sendEmail = createEmailSender({ ...baseEnv, EMAIL: binding, EMAIL_FROM: "no-reply@snarvei.example" });
    await expect(sendEmail({ to: "x@example.com", subject: "s", text: "t" })).rejects.toThrow(/E_SENDER_NOT_VERIFIED/);
  });

  it("logs a redacted event (no links or bodies) when no provider is configured", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = createEmailSender(baseEnv);
    await send({ to: "x@example.com", subject: "Invitation", text: "Open https://snarvei.example/app?invitation=secret-id" });

    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain("email.not_configured");
    expect(line).toContain("x@example.com");
    expect(line).not.toContain("secret-id");
    expect(line).not.toContain("https://");
  });

  it("treats a binding without EMAIL_FROM as not configured", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { binding, send } = fakeBinding();
    const sendEmail = createEmailSender({ ...baseEnv, EMAIL: binding });
    await sendEmail({ to: "x@example.com", subject: "s", text: "t" });
    expect(send).not.toHaveBeenCalled();
    expect(String(log.mock.calls[0]?.[0])).toContain("email.not_configured");
  });

  it("logs the full message only when EMAIL_DEV_LOG is enabled (local development)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const send = createEmailSender({ ...baseEnv, EMAIL_DEV_LOG: "true" });
    await send({ to: "x@example.com", subject: "Invitation", text: "Open https://snarvei.example/app?invitation=secret-id" });
    expect(String(log.mock.calls[0]?.[0])).toContain("invitation=secret-id");
  });
});

describe("email templates", () => {
  it("invitation email names the organization and carries the invite link", () => {
    const message = invitationEmail({
      appName: "Snarvei",
      organizationName: "Acme",
      inviterName: "Ada",
      inviteLink: "https://snarvei.example/app?invitation=abc",
    });
    expect(message.subject).toContain("Acme");
    expect(message.text).toContain("https://snarvei.example/app?invitation=abc");
    expect(message.text).toContain("Ada");
    expect(message.html).toContain("https://snarvei.example/app?invitation=abc");
  });

  it("verification and password reset emails carry their links", () => {
    expect(verificationEmail({ appName: "Snarvei", url: "https://x/verify?token=1" }).text).toContain("https://x/verify?token=1");
    expect(passwordResetEmail({ appName: "Snarvei", url: "https://x/reset?token=2" }).text).toContain("https://x/reset?token=2");
  });
});
