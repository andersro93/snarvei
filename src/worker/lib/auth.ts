import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { organization, twoFactor } from "better-auth/plugins";
import { createDb } from "../db/client";
import { schema } from "../db/schema";
import type { AppBindings } from "./types";

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

const createSettingsLink = (baseUrl: string) => `${baseUrl.replace(/\/$/, "")}/app/settings`;

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

export const createAuth = (env: AppBindings): AuthInstance => {
  const db = createDb(env.DB);
  const baseUrl = env.APP_URL || "http://localhost:8787";
  const baseOrigin = new URL(baseUrl).origin;
  const relyingPartyId = new URL(baseUrl).hostname;

  return betterAuth({
    secret: env.AUTH_SECRET,
    baseURL: baseUrl,
    appName: env.APP_NAME || "Snarvei",
    trustedOrigins: createTrustedOrigins(baseUrl),
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
    },
    user: {
      changeEmail: {
        enabled: true,
      },
    },
    emailVerification: {
      async sendVerificationEmail(data) {
        console.log(
          JSON.stringify({
            type: "email-verification",
            email: data.user.email,
            verificationUrl: data.url,
            callbackUrl: createSettingsLink(baseUrl),
          }),
        );
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
          console.log(
            JSON.stringify({
              type: "organization-invitation",
              email: data.email,
              organizationName: data.organization.name,
              invitationId: data.id,
              inviteLink: createInviteLink(baseUrl, data.id),
            }),
          );
        },
      }),
    ],
  }) as AuthInstance;
};
