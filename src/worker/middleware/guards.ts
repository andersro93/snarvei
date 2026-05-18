import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { members, teamMembers, teams } from "../db/schema";
import { getDb } from "../lib/db";
import type { AppBindings, AppVariables } from "../lib/types";

type AppContext = Context<{ Bindings: AppBindings; Variables: AppVariables }>;

export const requireUser = (c: AppContext) => {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }
  return user;
};

export const requireOrganizationAccess = async (c: AppContext, organizationId: string) => {
  const user = requireUser(c);
  const db = getDb(c);

  const [membership] = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.organizationId, organizationId),
        eq(members.userId, user.id),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new HTTPException(403, { message: "Organization access denied" });
  }

  return membership;
};

export const requireTeamAccess = async (c: AppContext, teamId: string) => {
  const user = requireUser(c);
  const db = getDb(c);

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) {
    throw new HTTPException(404, { message: "Team not found" });
  }

  const membership = await requireOrganizationAccess(c, team.organizationId);
  if (membership.role === "owner" || membership.role === "admin") {
    return team;
  }

  const [teamMembership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)))
    .limit(1);

  if (!teamMembership) {
    throw new HTTPException(403, { message: "Team access denied" });
  }

  return team;
};
