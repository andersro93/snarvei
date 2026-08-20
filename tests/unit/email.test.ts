import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailSender, invitationEmail, passwordResetEmail, verificationEmail } from "../../src/worker/lib/email";

const baseEnv = { APP_NAME: "Snarvei", APP_URL: "https://snarvei.example" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createEmailSender", () => {
  it("sends through the Resend HTTP API when configured", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const send = createEmailSender({ ...baseEnv, RESEND_API_KEY: "re_test", EMAIL_FROM: "Snarvei <no-reply@snarvei.example>" });
    await send({ to: "someone@example.com", subject: "Hello", text: "Plain", html: "<p>Plain</p>" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Snarvei <no-reply@snarvei.example>",
      to: ["someone@example.com"],
      subject: "Hello",
      text: "Plain",
      html: "<p>Plain</p>",
    });
  });

  it("throws when the provider rejects the message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 422 })));
    const send = createEmailSender({ ...baseEnv, RESEND_API_KEY: "re_test", EMAIL_FROM: "no-reply@snarvei.example" });
    await expect(send({ to: "x@example.com", subject: "s", text: "t" })).rejects.toThrow(/422/);
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
