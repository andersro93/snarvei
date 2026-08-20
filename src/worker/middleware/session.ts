import { createMiddleware } from "hono/factory";
import { createAuth } from "../lib/auth";
import type { AppBindings, AppVariables } from "../lib/types";

export const sessionMiddleware = createMiddleware<{ Bindings: AppBindings; Variables: AppVariables }>(
  async (c, next) => {
    // Environment is validated by envMiddleware before any route runs.
    const auth = createAuth(c.env);
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    const raw = result?.session;
    const session = raw
      ? {
          id: raw.id,
          userId: raw.userId,
          expiresAt: raw.expiresAt ? new Date(raw.expiresAt).toISOString() : null,
          activeOrganizationId: raw.activeOrganizationId ?? null,
          activeTeamId: raw.activeTeamId ?? null,
        }
      : null;

    c.set("session", session);
    c.set("user", result?.user ?? null);
    c.set("activeOrganizationId", session?.activeOrganizationId ?? null);

    await next();
  },
);
