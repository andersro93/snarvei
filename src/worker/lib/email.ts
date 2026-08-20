/**
 * Transactional email. A provider-agnostic `EmailSender` is created from the
 * environment: Resend's HTTP API when `RESEND_API_KEY` + `EMAIL_FROM` are set,
 * otherwise a no-op that logs a *redacted* event (never links or bodies, which
 * are bearer credentials). `EMAIL_DEV_LOG=true` logs full messages for local
 * development only.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailSender = (message: EmailMessage) => Promise<void>;

type EmailEnv = {
  APP_NAME?: string;
  APP_URL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_DEV_LOG?: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

export const createEmailSender = (env: EmailEnv): EmailSender => {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const apiKey = env.RESEND_API_KEY;
    const from = env.EMAIL_FROM;
    return async (message) => {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) }),
      });
      if (!response.ok) {
        throw new Error(`Email provider rejected the message (HTTP ${response.status})`);
      }
    };
  }

  if (env.EMAIL_DEV_LOG === "true") {
    return async (message) => {
      console.log(JSON.stringify({ level: "info", event: "email.dev_log", to: message.to, subject: message.subject, text: message.text }));
    };
  }

  return async (message) => {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "email.not_configured",
        message: "No email provider configured (set RESEND_API_KEY and EMAIL_FROM); message dropped",
        to: message.to,
        subject: message.subject,
      }),
    );
  };
};

const layout = (appName: string, title: string, bodyHtml: string) => `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111">
<h2 style="margin:0 0 16px">${escapeHtml(title)}</h2>
${bodyHtml}
<p style="color:#666;font-size:12px;margin-top:32px">Sent by ${escapeHtml(appName)}. If you did not expect this email you can ignore it.</p>
</body></html>`;

const linkButton = (href: string, label: string) =>
  `<p><a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(label)}</a></p><p style="font-size:12px;color:#666">Or open this link: ${escapeHtml(href)}</p>`;

export const invitationEmail = (input: { appName: string; organizationName: string; inviterName?: string | null; inviteLink: string }): Omit<EmailMessage, "to"> => {
  const by = input.inviterName ? ` by ${input.inviterName}` : "";
  return {
    subject: `You have been invited to ${input.organizationName} on ${input.appName}`,
    text: `You have been invited${by} to join ${input.organizationName} on ${input.appName}.\n\nAccept the invitation: ${input.inviteLink}\n\nIf you did not expect this invitation you can ignore this email.`,
    html: layout(
      input.appName,
      `Join ${input.organizationName}`,
      `<p>You have been invited${escapeHtml(by)} to join <strong>${escapeHtml(input.organizationName)}</strong> on ${escapeHtml(input.appName)}.</p>${linkButton(input.inviteLink, "Accept invitation")}`,
    ),
  };
};

export const verificationEmail = (input: { appName: string; url: string }): Omit<EmailMessage, "to"> => ({
  subject: `Verify your email for ${input.appName}`,
  text: `Confirm this email address for ${input.appName}: ${input.url}`,
  html: layout(input.appName, "Verify your email", `<p>Confirm this email address for ${escapeHtml(input.appName)}.</p>${linkButton(input.url, "Verify email")}`),
});

export const passwordResetEmail = (input: { appName: string; url: string }): Omit<EmailMessage, "to"> => ({
  subject: `Reset your ${input.appName} password`,
  text: `Reset your ${input.appName} password: ${input.url}\n\nIf you did not request this, ignore this email.`,
  html: layout(input.appName, "Reset your password", `<p>Use the button below to choose a new password.</p>${linkButton(input.url, "Reset password")}`),
});

export const changeEmailVerificationEmail = (input: { appName: string; newEmail: string; url: string }): Omit<EmailMessage, "to"> => ({
  subject: `Confirm your new ${input.appName} email address`,
  text: `Confirm changing your ${input.appName} email address to ${input.newEmail}: ${input.url}`,
  html: layout(
    input.appName,
    "Confirm your new email address",
    `<p>Confirm changing your email address to <strong>${escapeHtml(input.newEmail)}</strong>.</p>${linkButton(input.url, "Confirm change")}`,
  ),
});
