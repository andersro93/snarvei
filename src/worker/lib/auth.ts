import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { organization, twoFactor } from "better-auth/plugins";
import { createDb } from "../db/client";
import { schema } from "../db/schema";
import {
  changeEmailVerificationEmail,
  createEmailSender,
  type EmailSender,
  invitationEmail,
  passwordResetEmail,
  verificationEmail,
} from "./email";
import type { AppBindings } from "./types";

export type AuthDeps = {
  /** Transactional email transport; defaults to createEmailSender(env). */
  sendEmail?: EmailSender;
};

type AuthSessionResult = {
  session: {
    id: string;
    userId: string;
    activeOrganizationId?: string | null;
    activeTeamId?: string | null;
  };
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  };
} | null;

type AuthInstance = {
  handler: (request: Request) => Response | Promise<Response>;
  api: {
    getSession: (input: { headers: Headers }) => Promise<AuthSessionResult>;
    updateUser: (input: {
      body: {
        name?: string;
        image?: string | null;
      };
      headers: Headers;
    }) => Promise<unknown>;
  };
};

const createInviteLink = (baseUrl: string, invitationId: string) =>
  `${baseUrl.replace(/\/$/, "")}/app?invitation=${encodeURIComponent(invitationId)}`;


const createTrustedOrigins = (baseUrl: string) => {
  const baseOrigin = new URL(baseUrl).origin;

  return async (request?: Request) => {
    if (!request) {
      return [baseOrigin];
    }

    const requestOrigin = new URL(request.url).origin;
    const headerOrigin = request.headers.get("origin");

    // Only trust the incoming Origin when it matches the request host exactly.
    // This keeps local same-origin E2E flows working without trusting arbitrary
    // cross-origin requests against deployed environments.
    if (headerOrigin && headerOrigin === requestOrigin && headerOrigin !== baseOrigin) {
      return [baseOrigin, headerOrigin];
    }

    return [baseOrigin];
  };
};

/**
 * Build the Better Auth options for a given environment. Kept separate from
 * `createAuth` so tests can introspect the configuration (plugins, schema
 * expectations) without instantiating the auth runtime.
 */
export const createAuthOptions = (env: AppBindings, deps: AuthDeps = {}): BetterAuthOptions => {
  const db = createDb(env.DB);
  const baseUrl = env.APP_URL || "http://localhost:8787";
  const baseOrigin = new URL(baseUrl).origin;
  const relyingPartyId = new URL(baseUrl).hostname;
  const appName = env.APP_NAME || "Snarvei";
  const sendEmail = deps.sendEmail ?? createEmailSender(env);

  return {
    secret: env.AUTH_SECRET,
    baseURL: baseUrl,
    appName: env.APP_NAME || "Snarvei",
    trustedOrigins: createTrustedOrigins(baseUrl),
    // Better Auth's limiter is off unless NODE_ENV=production and defaults to
    // per-isolate memory storage, which is useless on Workers. Use D1 so the
    // limit is shared across isolates/colos. Default special rules cover
    // sign-in/sign-up/two-factor (3 per 10s); the base rule applies elsewhere.
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
    },
    advanced: {
      ipAddress: {
        // Cloudflare sets this from the real client address; x-forwarded-for is spoofable.
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        ...schema,
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
      usePlural: true,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword(data) {
        await sendEmail({ to: data.user.email, ...passwordResetEmail({ appName, url: data.url }) });
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        async sendChangeEmailConfirmation(data) {
          await sendEmail({
            to: data.newEmail,
            ...changeEmailVerificationEmail({ appName, newEmail: data.newEmail, url: data.url }),
          });
        },
      },
    },
    emailVerification: {
      async sendVerificationEmail(data) {
        await sendEmail({ to: data.user.email, ...verificationEmail({ appName, url: data.url }) });
      },
    },
    plugins: [
      twoFactor({
        issuer: env.APP_NAME || "Snarvei",
      }),
      passkey({
        rpID: relyingPartyId,
        rpName: env.APP_NAME || "Snarvei",
        origin: baseOrigin,
      }),
      organization({
        teams: {
          enabled: true,
          allowRemovingAllTeams: false,
        },
        schema: {
          session: {
            fields: {
              activeOrganizationId: "activeOrganizationId",
              activeTeamId: "activeTeamId",
            },
          },
        },
        async sendInvitationEmail(data) {
          await sendEmail({
            to: data.email,
            ...invitationEmail({
              appName,
              organizationName: data.organization.name,
              inviterName: data.inviter?.user?.name ?? null,
              inviteLink: createInviteLink(baseUrl, data.id),
            }),
          });
        },
      }),
    ],
  };
};

export const createAuth = (env: AppBindings, deps: AuthDeps = {}): AuthInstance =>
  betterAuth(createAuthOptions(env, deps)) as AuthInstance;
