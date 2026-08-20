import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { members, teamMembers, teams } from "../db/schema";
import { getDb } from "../lib/db";
import type { AppBindings, AppVariables } from "../lib/types";

type AppContext = Context<{ Bindings: AppBindings; Variables: AppVariables }>;

/** Better Auth may store several roles as a comma-joined string ("member,admin"). */
export const parseRoles = (role: string | null | undefined) =>
  (role ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

/** Org owners and admins see every team in the organization. */
export const isOrgAdmin = (role: string | null | undefined) => parseRoles(role).some((value) => value === "owner" || value === "admin");

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
  if (isOrgAdmin(membership.role)) {
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

/**
 * Team ids the current user may see in an organization: `null` means "all"
 * (owner/admin), otherwise the teams they are explicitly a member of.
 */
export const getAccessibleTeamIds = async (c: AppContext, organizationId: string): Promise<string[] | null> => {
  const user = requireUser(c);
  const membership = await requireOrganizationAccess(c, organizationId);
  if (isOrgAdmin(membership.role)) {
    return null;
  }

  const db = getDb(c);
  const rows = await db
    .select({ id: teamMembers.teamId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.userId, user.id), eq(teams.organizationId, organizationId)));
  return rows.map((row) => row.id);
};
