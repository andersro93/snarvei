import { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { clickEvents, links } from "./db/schema";
import { createAuth } from "./lib/auth";
import { hashIp } from "./lib/crypto";
import { getDb } from "./lib/db";
import { renderScalarPage } from "./lib/scalar";
import type { AppBindings, AppVariables } from "./lib/types";
import { sessionMiddleware } from "./middleware/session";
import { registerLinkRoutes } from "./routes/links";

export const createApp = () => {
  const app = new OpenAPIHono<{ Bindings: AppBindings; Variables: AppVariables }>();

  app.use("/api/me", sessionMiddleware);
  app.use("/api/teams/*", sessionMiddleware);
  app.use("/api/links", sessionMiddleware);
  app.use("/api/links/*", sessionMiddleware);

  app.on(["GET", "POST"], "/api/auth/*", async (c) => createAuth(c.env).handler(c.req.raw));

  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "Snarvei API",
      version: "0.1.0",
      description: "Organization-aware URL shortener API",
    },
  });

  app.get("/scalar", (c) => c.html(renderScalarPage("/openapi.json")));

  app.get("/api/me", async (c) => {
    const user = c.get("user");
    const session = c.get("session");
    if (!user || !session) {
      return c.json({ authenticated: false }, 401);
    }

    return c.json({
      authenticated: true,
      user,
      session,
    });
  });

  registerLinkRoutes(app);

  app.get("/l/:slug", async (c) => {
    const db = getDb(c);
    const slug = c.req.param("slug");
    const [link] = await db
      .select()
      .from(links)
      .where(and(eq(links.slug, slug), eq(links.isActive, true)))
      .limit(1);

    if (!link) {
      return c.text("Link not found", 404);
    }

    c.executionCtx.waitUntil(
      (async () => {
        const ip = c.req.raw.headers.get("CF-Connecting-IP");
        const ipHash = await hashIp(ip, c.env.AUTH_SECRET);
        const cf = c.req.raw.cf as IncomingRequestCfProperties | undefined;
        await db.insert(clickEvents).values({
          id: crypto.randomUUID(),
          linkId: link.id,
          clickedAt: new Date(),
          ipHash,
          userAgent: c.req.header("user-agent") ?? null,
          referer: c.req.header("referer") ?? null,
          country: cf?.country ?? null,
          region: cf?.region ?? null,
          city: cf?.city ?? null,
          colo: cf?.colo ?? null,
          asn: cf?.asn ?? null,
          host: new URL(c.req.url).host,
          path: new URL(c.req.url).pathname,
          queryString: new URL(c.req.url).search ? new URL(c.req.url).search.slice(1) : null,
          redirectStatusUsed: link.redirectStatus,
        });
      })(),
    );

    return c.redirect(link.targetUrl, link.redirectStatus as 301 | 302 | 307);
  });

  app.get("/api/health", (c) => c.json({ ok: true, service: "snarvei" }));

  return app;
};
