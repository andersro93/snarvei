import { createMiddleware } from "hono/factory";
import { createAuth } from "../lib/auth";
import type { AppBindings, AppVariables } from "../lib/types";

export const sessionMiddleware = createMiddleware<{ Bindings: AppBindings; Variables: AppVariables }>(
  async (c, next) => {
    if (!c.env.DB || !c.env.AUTH_SECRET) {
      c.set("session", null);
      c.set("user", null);
      c.set("activeOrganizationId", null);
      await next();
      return;
    }

    const auth = createAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const authSession = session?.session as (typeof session extends null ? never : {
      id: string;
      userId: string;
      activeOrganizationId?: string | null;
    }) | null | undefined;

    c.set("session", authSession ?? null);
    c.set("user", session?.user ?? null);
    c.set("activeOrganizationId", authSession?.activeOrganizationId ?? null);

    await next();
  },
);
