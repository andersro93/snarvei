import { OpenAPIHono, z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { NONCE, secureHeaders } from "hono/secure-headers";
import { clickEvents, links } from "./db/schema";
import { type AuthDeps, createAuth } from "./lib/auth";
import { hashIp } from "./lib/crypto";
import { envMiddleware, ipHashPepper } from "./lib/env";
import { errorJson, notFound, onError, validationHook } from "./lib/errors";
import { log } from "./lib/log";
import { resolveAppVersion } from "./lib/version";
import { rateLimitMiddleware } from "./lib/rate-limit";
import { getDb } from "./lib/db";
import { renderScalarPage } from "./lib/scalar";
import type { AppBindings, AppVariables } from "./lib/types";
import { ErrorSchema, authErrorResponses, cookieSecurity } from "./openapi/schemas";
import { requireUser } from "./middleware/guards";
import { sessionMiddleware } from "./middleware/session";
import { registerLinkRoutes } from "./routes/links";
import { registerTeamRoutes } from "./routes/teams";

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

/**
 * Routes implemented with plain Hono handlers (no request validation needed)
 * still belong in the OpenAPI document. Their shapes are declared here.
 */
const registerPlainRoutesInOpenApi = (app: OpenAPIHono<{ Bindings: AppBindings; Variables: AppVariables }>) => {
  const registry = app.openAPIRegistry;
  const jsonError = (description: string) => ({ description, content: { "application/json": { schema: ErrorSchema } } });

  registry.registerPath({
    method: "get",
    path: "/api/health",
    summary: "Health check",
    responses: {
      200: {
        description: "Service is up (database reachable)",
        content: {
          "application/json": {
            schema: z.object({ ok: z.literal(true), service: z.string(), version: z.string(), checks: z.record(z.string(), z.string()) }),
          },
        },
      },
      503: {
        description: "A dependency check failed",
        content: {
          "application/json": {
            schema: z.object({ ok: z.literal(false), service: z.string(), version: z.string(), checks: z.record(z.string(), z.string()) }),
          },
        },
      },
      500: jsonError("Server misconfigured"),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/me",
    summary: "Current session and user",
    security: cookieSecurity,
    responses: {
      200: {
        description: "Authenticated",
        content: {
          "application/json": {
            schema: z.object({
              authenticated: z.literal(true),
              user: z.object({ id: z.string(), email: z.string(), name: z.string(), image: z.string().nullable().optional() }).passthrough(),
              session: z.object({ id: z.string(), userId: z.string(), activeOrganizationId: z.string().nullable().optional() }).passthrough(),
            }),
          },
        },
      },
      401: authErrorResponses[401],
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/me/profile-image",
    summary: "Upload a profile image (multipart/form-data, field `file`; JPEG/PNG/WebP/GIF, max 5MB)",
    security: cookieSecurity,
    request: { body: { content: { "multipart/form-data": { schema: z.object({ file: z.string().openapi({ format: "binary" }) }) } } } },
    responses: {
      200: { description: "Uploaded", content: { "application/json": { schema: z.object({ imageUrl: z.string() }) } } },
      400: jsonError("Missing, unsupported or oversized file"),
      401: authErrorResponses[401],
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/me/profile-image",
    summary: "Remove the profile image",
    security: cookieSecurity,
    responses: {
      200: { description: "Removed", content: { "application/json": { schema: z.object({ imageUrl: z.null() }) } } },
      401: authErrorResponses[401],
    },
  });

  registry.registerPath({
    method: "get",
    path: "/l/{slug}",
    summary: "Public redirect for a short link (records a click asynchronously)",
    request: { params: z.object({ slug: z.string().openapi({ param: { name: "slug", in: "path" } }) }) },
    responses: {
      302: { description: "Redirect (also 301/307 depending on the link's configured status). Cache-Control: no-store" },
      404: { description: "Unknown or inactive slug" },
      429: jsonError("Rate limited (Retry-After header set)"),
    },
  });
};

/** Shared hardening headers for every Worker-handled response. */
const baseSecurityHeaders = {
  xFrameOptions: "DENY",
  referrerPolicy: "strict-origin-when-cross-origin",
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
  crossOriginResourcePolicy: "same-origin",
  permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
} satisfies Parameters<typeof secureHeaders>[0];

export type AppDeps = AuthDeps;

export const createApp = (deps: AppDeps = {}) => {
  const app = new OpenAPIHono<{ Bindings: AppBindings; Variables: AppVariables }>({ defaultHook: validationHook });

  app.onError(onError);
  app.notFound(notFound);

  app.use("*", envMiddleware);
  app.use("*", secureHeaders(baseSecurityHeaders));
  // The docs page loads the self-hosted Scalar bundle and has an inline config
  // script, so it gets its own CSP with a per-request nonce.
  app.use(
    "/scalar",
    secureHeaders({
      ...baseSecurityHeaders,
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", NONCE],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.scalar.com"],
        fontSrc: ["'self'", "data:", "https://fonts.scalar.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    }),
  );
  app.use("/l/*", rateLimitMiddleware("redirect"));
  app.use("/api/auth/*", rateLimitMiddleware("auth"));
  app.use("/api/me", sessionMiddleware);
  app.use("/api/me/*", sessionMiddleware);
  app.use("/api/organizations/*", sessionMiddleware);
  app.use("/api/teams/*", sessionMiddleware);
  app.use("/api/links", sessionMiddleware);
  app.use("/api/links/*", sessionMiddleware);

  app.on(["GET", "POST"], "/api/auth/*", async (c) => createAuth(c.env, deps).handler(c.req.raw));

  app.openAPIRegistry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description: "Better Auth session cookie set by /api/auth/* sign-in endpoints.",
  });
  registerPlainRoutesInOpenApi(app);

  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "Snarvei API",
      version: "0.1.0",
      description: "Organization-aware URL shortener API",
    },
  });

  app.get("/scalar", (c) => c.html(renderScalarPage("/openapi.json", c.get("secureHeadersNonce") ?? "")));

  app.get("/api/me", async (c) => {
    const user = c.get("user");
    const session = c.get("session");
    if (!user || !session) {
      return errorJson(c, 401);
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
  registerTeamRoutes(app);

  app.get("/l/:slug", async (c) => {
    const db = getDb(c);
    const slug = c.req.param("slug");
    const [link] = await db
      .select()
      .from(links)
      .where(and(eq(links.slug, slug), eq(links.isActive, true)))
      .limit(1);

    // Never let browsers/CDNs cache redirects (or misses): the product promise
    // is that a distributed short link can be retargeted or deactivated later.
    c.header("cache-control", "no-store");

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

  app.get("/api/health", async (c) => {
    c.header("cache-control", "no-store");
    const checks: Record<string, string> = {};
    try {
      await c.env.DB.prepare("SELECT 1").first();
      checks.database = "ok";
    } catch (error) {
      checks.database = `error: ${error instanceof Error ? error.message : String(error)}`;
    }
    const ok = Object.values(checks).every((value) => value === "ok");
    if (!ok) {
      log.error("health.degraded", { checks });
    }
    return c.json({ ok, service: "snarvei", version: resolveAppVersion(c.env.APP_VERSION), checks }, ok ? 200 : 503);
  });

  return app;
};
