import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { organization } from "better-auth/plugins";
import { createDb } from "../db/client";
import { schema } from "../db/schema";
import type { AppBindings } from "./types";

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

export const createAuth = (env: AppBindings) => {
  const db = createDb(env.DB);
  const baseUrl = env.APP_URL || "http://localhost:8787";

  return betterAuth({
    secret: env.AUTH_SECRET,
    baseURL: baseUrl,
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
    },
    plugins: [
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
  });
};
