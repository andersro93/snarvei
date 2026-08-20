import { createMiddleware } from "hono/factory";
import type { AppBindings, AppVariables } from "./types";

const RETRY_AFTER_SECONDS = 60;

export const clientIp = (request: Request) => request.headers.get("cf-connecting-ip")?.trim() || "unknown";

/**
 * Per-client edge rate limit backed by the Workers Rate Limiting binding.
 * `scope` keeps separate budgets for independent surfaces (e.g. redirects vs auth).
 */
export const rateLimitMiddleware = (scope: string) =>
  createMiddleware<{ Bindings: AppBindings; Variables: AppVariables }>(async (c, next) => {
    const { success } = await c.env.RATE_LIMIT.limit({ key: `${scope}:${clientIp(c.req.raw)}` });
    if (!success) {
      c.header("retry-after", String(RETRY_AFTER_SECONDS));
      return c.json({ error: "Too many requests" }, 429);
    }
    await next();
  });
