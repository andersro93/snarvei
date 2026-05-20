import { OpenAPIHono } from "@hono/zod-openapi";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { clickEvents, links, linkTargetHistory, teamMembers, teams } from "../db/schema";
import { getDb } from "../lib/db";
import { generateSlug } from "../lib/slug";
import { requireOrganizationAccess, requireTeamAccess, requireUser } from "../middleware/guards";
import {
  analyticsRoute,
  createLinkRoute,
  deleteLinkRoute,
  getLinkRoute,
  historyRoute,
  type LinkDto,
  linkListRoute,
  organizationLinkListRoute,
  updateLinkRoute,
} from "../openapi/schemas";
import type { AppBindings, AppVariables } from "../lib/types";

type AppRoute = OpenAPIHono<{ Bindings: AppBindings; Variables: AppVariables }>;

type LinkWithTeam = typeof links.$inferSelect & {
  teamName?: string | null;
};

const mapLink = (link: LinkWithTeam): LinkDto => ({
  ...link,
  teamName: link.teamName ?? null,
  redirectStatus: link.redirectStatus as LinkDto["redirectStatus"],
  createdAt: link.createdAt.toISOString(),
  updatedAt: link.updatedAt.toISOString(),
});

const selectLinkWithTeam = (db: ReturnType<typeof getDb>, linkId: string) =>
  db
    .select({
      id: links.id,
      organizationId: links.organizationId,
      teamId: links.teamId,
      teamName: teams.name,
      slug: links.slug,
      targetUrl: links.targetUrl,
      redirectStatus: links.redirectStatus,
      isActive: links.isActive,
      title: links.title,
      description: links.description,
      createdBy: links.createdBy,
      updatedBy: links.updatedBy,
      createdAt: links.createdAt,
      updatedAt: links.updatedAt,
    })
    .from(links)
    .innerJoin(teams, eq(teams.id, links.teamId))
    .where(eq(links.id, linkId))
    .limit(1);

export const registerLinkRoutes = (app: AppRoute) => {
  app.openapi(linkListRoute, async (c) => {
    const { teamId } = c.req.valid("param");
    await requireTeamAccess(c, teamId);
    const db = getDb(c);

    const teamLinks = await db
      .select({
        id: links.id,
        organizationId: links.organizationId,
        teamId: links.teamId,
        teamName: teams.name,
        slug: links.slug,
        targetUrl: links.targetUrl,
        redirectStatus: links.redirectStatus,
        isActive: links.isActive,
        title: links.title,
        description: links.description,
        createdBy: links.createdBy,
        updatedBy: links.updatedBy,
        createdAt: links.createdAt,
        updatedAt: links.updatedAt,
      })
      .from(links)
      .innerJoin(teams, eq(teams.id, links.teamId))
      .where(eq(links.teamId, teamId))
      .orderBy(desc(links.createdAt));

    return c.json(teamLinks.map(mapLink), 200);
  });

  app.openapi(organizationLinkListRoute, async (c) => {
    const user = requireUser(c);
    const { organizationId } = c.req.valid("param");
    const db = getDb(c);
    const membership = await requireOrganizationAccess(c, organizationId);

    const baseQuery = db
      .select({
        id: links.id,
        organizationId: links.organizationId,
        teamId: links.teamId,
        teamName: teams.name,
        slug: links.slug,
        targetUrl: links.targetUrl,
        redirectStatus: links.redirectStatus,
        isActive: links.isActive,
        title: links.title,
        description: links.description,
        createdBy: links.createdBy,
        updatedBy: links.updatedBy,
        createdAt: links.createdAt,
        updatedAt: links.updatedAt,
      })
      .from(links)
      .innerJoin(teams, eq(teams.id, links.teamId));

    if (membership.role === "owner" || membership.role === "admin") {
      const orgLinks = await baseQuery.where(eq(links.organizationId, organizationId)).orderBy(desc(links.createdAt));
      return c.json(orgLinks.map(mapLink), 200);
    }

    const visibleTeamRows = await db
      .select({ id: teamMembers.teamId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(and(eq(teamMembers.userId, user.id), eq(teams.organizationId, organizationId)));

    const visibleTeamIds = visibleTeamRows.map((team) => team.id);
    if (!visibleTeamIds.length) {
      return c.json([], 200);
    }

    const orgLinks = await baseQuery.where(inArray(links.teamId, visibleTeamIds)).orderBy(desc(links.createdAt));
    return c.json(orgLinks.map(mapLink), 200);
  });

  app.openapi(createLinkRoute, async (c) => {
    const user = requireUser(c);
    const db = getDb(c);
    const body = c.req.valid("json");
    const team = await requireTeamAccess(c, body.teamId);

    let slug = generateSlug();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [existing] = await db.select({ id: links.id }).from(links).where(eq(links.slug, slug)).limit(1);
      if (!existing) {
        break;
      }
      slug = generateSlug();
    }

    const linkId = crypto.randomUUID();
    const now = new Date();
    await db.insert(links).values({
      id: linkId,
      organizationId: team.organizationId,
      teamId: team.id,
      slug,
      targetUrl: body.targetUrl,
      redirectStatus: body.redirectStatus,
      isActive: true,
      title: body.title ?? null,
      description: body.description ?? null,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(linkTargetHistory).values({
      id: crypto.randomUUID(),
      linkId,
      oldTargetUrl: null,
      newTargetUrl: body.targetUrl,
      changedBy: user.id,
      changedAt: now,
    });

    const [created] = await selectLinkWithTeam(db, linkId);
    if (!created) {
      throw new HTTPException(500, { message: "Failed to create link" });
    }

    return c.json(mapLink(created), 201);
  });

  app.openapi(getLinkRoute, async (c) => {
    requireUser(c);
    const { linkId } = c.req.valid("param");
    const db = getDb(c);
    const [link] = await selectLinkWithTeam(db, linkId);
    if (!link) {
      return c.json({ error: "Link not found" }, 404);
    }

    await requireTeamAccess(c, link.teamId);
    return c.json(mapLink(link), 200);
  });

  app.openapi(updateLinkRoute, async (c) => {
    const user = requireUser(c);
    const db = getDb(c);
    const { linkId } = c.req.valid("param");
    const body = c.req.valid("json");

    const [existing] = await db.select().from(links).where(eq(links.id, linkId)).limit(1);
    if (!existing) {
      throw new HTTPException(404, { message: "Link not found" });
    }

    await requireTeamAccess(c, existing.teamId);

    const nextTarget = body.targetUrl ?? existing.targetUrl;
    const nextStatus = body.redirectStatus ?? existing.redirectStatus;
    const nextActive = body.isActive ?? existing.isActive;
    const nextTitle = body.title === undefined ? existing.title : body.title;
    const nextDescription = body.description === undefined ? existing.description : body.description;
    const now = new Date();

    await db
      .update(links)
      .set({
        targetUrl: nextTarget,
        redirectStatus: nextStatus,
        isActive: nextActive,
        title: nextTitle,
        description: nextDescription,
        updatedBy: user.id,
        updatedAt: now,
      })
      .where(eq(links.id, linkId));

    if (body.targetUrl && body.targetUrl !== existing.targetUrl) {
      await db.insert(linkTargetHistory).values({
        id: crypto.randomUUID(),
        linkId,
        oldTargetUrl: existing.targetUrl,
        newTargetUrl: body.targetUrl,
        changedBy: user.id,
        changedAt: now,
      });
    }

    const [updated] = await selectLinkWithTeam(db, linkId);
    if (!updated) {
      throw new HTTPException(500, { message: "Failed to update link" });
    }

    return c.json(mapLink(updated), 200);
  });

  app.openapi(deleteLinkRoute, async (c) => {
    requireUser(c);
    const { linkId } = c.req.valid("param");
    const db = getDb(c);
    const [existing] = await db.select().from(links).where(eq(links.id, linkId)).limit(1);
    if (!existing) {
      throw new HTTPException(404, { message: "Link not found" });
    }

    await requireTeamAccess(c, existing.teamId);
    await db.delete(links).where(eq(links.id, linkId));
    return c.json({ success: true }, 200);
  });

  app.openapi(historyRoute, async (c) => {
    requireUser(c);
    const { linkId } = c.req.valid("param");
    const db = getDb(c);
    const [existing] = await db.select().from(links).where(eq(links.id, linkId)).limit(1);
    if (!existing) {
      throw new HTTPException(404, { message: "Link not found" });
    }

    await requireTeamAccess(c, existing.teamId);

    const history = await db
      .select()
      .from(linkTargetHistory)
      .where(eq(linkTargetHistory.linkId, linkId))
      .orderBy(desc(linkTargetHistory.changedAt));

    return c.json(
      history.map((item) => ({
        ...item,
        changedAt: item.changedAt.toISOString(),
      })),
      200,
    );
  });

  app.openapi(analyticsRoute, async (c) => {
    requireUser(c);
    const { linkId } = c.req.valid("param");
    const db = getDb(c);
    const [existing] = await db.select().from(links).where(eq(links.id, linkId)).limit(1);
    if (!existing) {
      throw new HTTPException(404, { message: "Link not found" });
    }

    await requireTeamAccess(c, existing.teamId);

    const [summary] = await db
      .select({
        totalClicks: sql<number>`count(*)`,
        uniqueVisitors: sql<number>`count(distinct ${clickEvents.ipHash})`,
      })
      .from(clickEvents)
      .where(eq(clickEvents.linkId, linkId));

    const topCountries = await db
      .select({ country: clickEvents.country, clicks: sql<number>`count(*)` })
      .from(clickEvents)
      .where(eq(clickEvents.linkId, linkId))
      .groupBy(clickEvents.country)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    const topReferrers = await db
      .select({ referer: clickEvents.referer, clicks: sql<number>`count(*)` })
      .from(clickEvents)
      .where(eq(clickEvents.linkId, linkId))
      .groupBy(clickEvents.referer)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    const clicksByDay = await db
      .select({
        day: sql<string>`strftime('%Y-%m-%d', ${clickEvents.clickedAt} / 1000, 'unixepoch')`,
        clicks: sql<number>`count(*)`,
      })
      .from(clickEvents)
      .where(eq(clickEvents.linkId, linkId))
      .groupBy(sql`strftime('%Y-%m-%d', ${clickEvents.clickedAt} / 1000, 'unixepoch')`)
      .orderBy(sql`strftime('%Y-%m-%d', ${clickEvents.clickedAt} / 1000, 'unixepoch') asc`);

    return c.json(
      {
        totalClicks: summary?.totalClicks ?? 0,
        uniqueVisitorApproximation: summary?.uniqueVisitors ?? 0,
        topCountries,
        topReferrers,
        clicksByDay,
      },
      200,
    );
  });
};
