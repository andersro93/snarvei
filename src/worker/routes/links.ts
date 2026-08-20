import { OpenAPIHono } from "@hono/zod-openapi";
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { decodeCursor, paginate } from "../lib/pagination";
import { clickEvents, links, linkTargetHistory, teams } from "../db/schema";
import { getDb } from "../lib/db";
import { generateSlug } from "../lib/slug";
import { getAccessibleTeamIds, requireTeamAccess, requireUser } from "../middleware/guards";
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

const MAX_SLUG_ATTEMPTS = 10;

/** D1 reports unique-index violations as "UNIQUE constraint failed: <table>.<column>". */
const isSlugCollision = (error: unknown) => error instanceof Error && /UNIQUE constraint failed: links\.slug/.test(error.message);

/** Keyset condition for newest-first link pages: rows strictly after the cursor. */
const linksAfter = (after: { at: number; id: string } | null) =>
  after ? or(lt(links.createdAt, new Date(after.at)), and(eq(links.createdAt, new Date(after.at)), lt(links.id, after.id))) : undefined;

const ANALYTICS_DEFAULT_DAYS = 30;
const ANALYTICS_MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolve the analytics window; defaults to the last 30 days, capped at one year, `to` exclusive. */
const resolveAnalyticsRange = (query: { from?: string; to?: string }) => {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - ANALYTICS_DEFAULT_DAYS * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new HTTPException(400, { message: "from/to must be ISO timestamps" });
  }
  if (from.getTime() >= to.getTime()) {
    throw new HTTPException(400, { message: "from must be before to" });
  }
  if (to.getTime() - from.getTime() > ANALYTICS_MAX_DAYS * DAY_MS) {
    throw new HTTPException(400, { message: `Analytics range must be at most ${ANALYTICS_MAX_DAYS} days` });
  }
  return { from, to };
};

/** Columns returned for a link (joined with its team name). */
const linkSelection = {
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
};

export const registerLinkRoutes = (app: AppRoute) => {
  app.openapi(linkListRoute, async (c) => {
    const { teamId } = c.req.valid("param");
    const { limit, cursor } = c.req.valid("query");
    const after = decodeCursor(cursor);
    await requireTeamAccess(c, teamId);
    const db = getDb(c);

    const teamLinks = await db
      .select(linkSelection)
      .from(links)
      .innerJoin(teams, eq(teams.id, links.teamId))
      .where(and(eq(links.teamId, teamId), linksAfter(after)))
      .orderBy(desc(links.createdAt), desc(links.id))
      .limit(limit + 1);

    const page = paginate(teamLinks, limit, (row) => ({ at: row.createdAt.getTime(), id: row.id }));
    if (page.nextCursor) {
      c.header("x-next-cursor", page.nextCursor);
    }
    return c.json(page.items.map(mapLink), 200);
  });

  app.openapi(organizationLinkListRoute, async (c) => {
    const { organizationId } = c.req.valid("param");
    const { limit, cursor } = c.req.valid("query");
    const after = decodeCursor(cursor);
    const db = getDb(c);
    const visibleTeamIds = await getAccessibleTeamIds(c, organizationId);

    const baseQuery = db.select(linkSelection).from(links).innerJoin(teams, eq(teams.id, links.teamId));

    const respond = (rows: Awaited<typeof baseQuery>) => {
      const page = paginate(rows, limit, (row) => ({ at: row.createdAt.getTime(), id: row.id }));
      if (page.nextCursor) {
        c.header("x-next-cursor", page.nextCursor);
      }
      return c.json(page.items.map(mapLink), 200);
    };

    if (visibleTeamIds === null) {
      const orgLinks = await baseQuery
        .where(and(eq(links.organizationId, organizationId), linksAfter(after)))
        .orderBy(desc(links.createdAt), desc(links.id))
        .limit(limit + 1);
      return respond(orgLinks);
    }

    if (!visibleTeamIds.length) {
      return c.json([], 200);
    }

    const orgLinks = await baseQuery
      .where(and(inArray(links.teamId, visibleTeamIds), linksAfter(after)))
      .orderBy(desc(links.createdAt), desc(links.id))
      .limit(limit + 1);
    return respond(orgLinks);
  });

  app.openapi(createLinkRoute, async (c) => {
    const user = requireUser(c);
    const db = getDb(c);
    const body = c.req.valid("json");
    const team = await requireTeamAccess(c, body.teamId);

    const linkId = crypto.randomUUID();
    const historyId = crypto.randomUUID();
    const now = new Date();

    // Insert the link and its initial history row atomically (D1 batches are
    // transactional). Slug uniqueness is enforced by the database; on the rare
    // collision we simply generate a new slug and try again.
    for (let attempt = 0; ; attempt += 1) {
      const slug = generateSlug();
      try {
        await db.batch([
          db.insert(links).values({
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
          }),
          db.insert(linkTargetHistory).values({
            id: historyId,
            linkId,
            oldTargetUrl: null,
            newTargetUrl: body.targetUrl,
            changedBy: user.id,
            changedAt: now,
          }),
        ]);
        break;
      } catch (error) {
        if (isSlugCollision(error) && attempt < MAX_SLUG_ATTEMPTS - 1) {
          continue;
        }
        throw error;
      }
    }

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
      throw new HTTPException(404, { message: "Link not found" });
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

    const updateLink = db
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
      // Target change + history row must land together (or not at all).
      await db.batch([
        updateLink,
        db.insert(linkTargetHistory).values({
          id: crypto.randomUUID(),
          linkId,
          oldTargetUrl: existing.targetUrl,
          newTargetUrl: body.targetUrl,
          changedBy: user.id,
          changedAt: now,
        }),
      ]);
    } else {
      await updateLink;
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
    return c.json({ success: true as const }, 200);
  });

  app.openapi(historyRoute, async (c) => {
    requireUser(c);
    const { linkId } = c.req.valid("param");
    const { limit, cursor } = c.req.valid("query");
    const after = decodeCursor(cursor);
    const db = getDb(c);
    const [existing] = await db.select().from(links).where(eq(links.id, linkId)).limit(1);
    if (!existing) {
      throw new HTTPException(404, { message: "Link not found" });
    }

    await requireTeamAccess(c, existing.teamId);

    const history = await db
      .select()
      .from(linkTargetHistory)
      .where(
        and(
          eq(linkTargetHistory.linkId, linkId),
          after
            ? or(
                lt(linkTargetHistory.changedAt, new Date(after.at)),
                and(eq(linkTargetHistory.changedAt, new Date(after.at)), lt(linkTargetHistory.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(linkTargetHistory.changedAt), desc(linkTargetHistory.id))
      .limit(limit + 1);

    const page = paginate(history, limit, (item) => ({ at: item.changedAt.getTime(), id: item.id }));
    if (page.nextCursor) {
      c.header("x-next-cursor", page.nextCursor);
    }
    return c.json(
      page.items.map((item) => ({
        ...item,
        changedAt: item.changedAt.toISOString(),
      })),
      200,
    );
  });

  app.openapi(analyticsRoute, async (c) => {
    requireUser(c);
    const { linkId } = c.req.valid("param");
    const range = resolveAnalyticsRange(c.req.valid("query"));
    const db = getDb(c);
    const [existing] = await db.select().from(links).where(eq(links.id, linkId)).limit(1);
    if (!existing) {
      throw new HTTPException(404, { message: "Link not found" });
    }

    await requireTeamAccess(c, existing.teamId);

    const inRange = and(eq(clickEvents.linkId, linkId), gte(clickEvents.clickedAt, range.from), lt(clickEvents.clickedAt, range.to));
    const [summary] = await db
      .select({
        totalClicks: sql<number>`count(*)`,
        uniqueVisitors: sql<number>`count(distinct ${clickEvents.ipHash})`,
      })
      .from(clickEvents)
      .where(inRange);

    const topCountries = await db
      .select({ country: clickEvents.country, clicks: sql<number>`count(*)` })
      .from(clickEvents)
      .where(inRange)
      .groupBy(clickEvents.country)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    const topReferrers = await db
      .select({ referer: clickEvents.referer, clicks: sql<number>`count(*)` })
      .from(clickEvents)
      .where(inRange)
      .groupBy(clickEvents.referer)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    const clicksByDay = await db
      .select({
        day: sql<string>`strftime('%Y-%m-%d', ${clickEvents.clickedAt} / 1000, 'unixepoch')`,
        clicks: sql<number>`count(*)`,
      })
      .from(clickEvents)
      .where(inRange)
      .groupBy(sql`strftime('%Y-%m-%d', ${clickEvents.clickedAt} / 1000, 'unixepoch')`)
      .orderBy(sql`strftime('%Y-%m-%d', ${clickEvents.clickedAt} / 1000, 'unixepoch') asc`);

    return c.json(
      {
        totalClicks: summary?.totalClicks ?? 0,
        uniqueVisitorApproximation: summary?.uniqueVisitors ?? 0,
        topCountries,
        topReferrers,
        clicksByDay,
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
      200,
    );
  });
};
