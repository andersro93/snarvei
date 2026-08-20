import type { OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { teamMembers, users } from "../db/schema";
import { getDb } from "../lib/db";
import type { AppBindings, AppVariables } from "../lib/types";
import { requireTeamAccess, requireUser } from "../middleware/guards";
import { teamMembersRoute } from "../openapi/schemas";

/**
 * Team membership is the permission boundary for org members, so owners/admins
 * (who are not necessarily in the team) must be able to see and manage it.
 * Better Auth's own list-team-members endpoint only allows team members.
 */
export const registerTeamRoutes = (app: OpenAPIHono<{ Bindings: AppBindings; Variables: AppVariables }>) => {
  app.openapi(teamMembersRoute, async (c) => {
    requireUser(c);
    const { teamId } = c.req.valid("param");
    await requireTeamAccess(c, teamId);

    const db = getDb(c);
    const rows = await db
      .select({
        id: teamMembers.id,
        userId: teamMembers.userId,
        name: users.name,
        email: users.email,
        createdAt: teamMembers.createdAt,
      })
      .from(teamMembers)
      .leftJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, teamId));

    return c.json(
      rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        name: row.name ?? null,
        email: row.email ?? null,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      })),
      200,
    );
  });
};
