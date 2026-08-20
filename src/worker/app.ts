import { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { clickEvents, links } from "./db/schema";
import { createAuth } from "./lib/auth";
import { hashIp } from "./lib/crypto";
import { envMiddleware, ipHashPepper } from "./lib/env";
import { getDb } from "./lib/db";
import { renderScalarPage } from "./lib/scalar";
import type { AppBindings, AppVariables } from "./lib/types";
import { requireUser } from "./middleware/guards";
import { sessionMiddleware } from "./middleware/session";
import { registerLinkRoutes } from "./routes/links";

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_IMAGE_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const profileImagePrefix = (userId: string) => `images/profile/${userId}/`;

/**
 * Resolve the R2 key behind a user's image URL. The `image` field is user
 * editable (Better Auth `update-user`), so only keys inside the caller's own
 * prefix are ever returned — anything else is treated as "no managed image".
 */
const extractOwnedProfileImageKey = (imageUrl: string | null | undefined, userId: string) => {
  if (!imageUrl) {
    return null;
  }

  const marker = `/${profileImagePrefix(userId)}`;
  const index = imageUrl.indexOf(marker);
  if (index === -1) {
    return null;
  }

  const key = imageUrl.slice(index + 1);
  return key.startsWith(profileImagePrefix(userId)) ? key : null;
};

const buildProfileImageUrl = (request: Request, key: string) => `${new URL(request.url).origin}/${key}`;

const updateProfileImage = (auth: ReturnType<typeof createAuth>, headers: Headers, image: string | null) =>
  auth.api.updateUser({
    body: {
      image,
    },
    headers,
  } as never);

export const createApp = () => {
  const app = new OpenAPIHono<{ Bindings: AppBindings; Variables: AppVariables }>();

  app.use("*", envMiddleware);
  app.use("/api/me", sessionMiddleware);
  app.use("/api/me/*", sessionMiddleware);
  app.use("/api/organizations/*", sessionMiddleware);
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

  app.post("/api/me/profile-image", async (c) => {
    const user = requireUser(c);
    const auth = createAuth(c.env);
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "Profile image file is required" });
    }

    if (!PROFILE_IMAGE_ALLOWED_TYPES.has(file.type)) {
      throw new HTTPException(400, { message: "Unsupported image type" });
    }

    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      throw new HTTPException(400, { message: "Profile image must be 5MB or smaller" });
    }

    const key = `${profileImagePrefix(user.id)}${crypto.randomUUID()}`;
    await c.env.PROFILE_IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "private, max-age=31536000, immutable",
      },
      customMetadata: {
        userId: user.id,
      },
    });

    const imageUrl = buildProfileImageUrl(c.req.raw, key);
    await updateProfileImage(auth, c.req.raw.headers, imageUrl);

    const previousKey = extractOwnedProfileImageKey(user.image, user.id);
    if (previousKey && previousKey !== key) {
      c.executionCtx.waitUntil(c.env.PROFILE_IMAGES.delete(previousKey));
    }

    return c.json({ imageUrl }, 200);
  });

  app.delete("/api/me/profile-image", async (c) => {
    const user = requireUser(c);
    const auth = createAuth(c.env);
    const previousKey = extractOwnedProfileImageKey(user.image, user.id);

    await updateProfileImage(auth, c.req.raw.headers, null);

    if (previousKey) {
      c.executionCtx.waitUntil(c.env.PROFILE_IMAGES.delete(previousKey));
    }

    return c.json({ imageUrl: null }, 200);
  });

  app.get("/images/profile/*", async (c) => {
    const key = c.req.path.slice(1);
    const object = await c.env.PROFILE_IMAGES.get(key);
    if (!object) {
      return c.text("Not found", 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
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
        const ipHash = await hashIp(ip, ipHashPepper(c.env));
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
