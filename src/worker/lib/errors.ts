import type { Hook } from "@hono/zod-openapi";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppBindings, AppVariables } from "./types";

type AppEnv = { Bindings: AppBindings; Variables: AppVariables };

export type ErrorBody = { error: string; issues?: unknown[] };

const STATUS_MESSAGES: Record<number, string> = {
  400: "Bad Request",
  401: "Authentication required",
  403: "Forbidden",
  404: "Not found",
  429: "Too many requests",
  500: "Internal Server Error",
};

/** Single JSON error shape for every non-2xx response produced by the app. */
export const errorJson = (c: Context<AppEnv>, status: 400 | 401 | 403 | 404 | 429 | 500, error?: string, issues?: unknown[]) =>
  c.json<ErrorBody>({ error: error || STATUS_MESSAGES[status] || "Error", ...(issues ? { issues } : {}) }, status);

/** Maps HTTPException (guards/handlers) to JSON; everything else is logged and masked. */
export const onError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof HTTPException) {
    const status = error.status as 400 | 401 | 403 | 404 | 429 | 500;
    return errorJson(c, status, error.message);
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "request.error",
      method: c.req.method,
      path: c.req.path,
      rayId: c.req.header("cf-ray") ?? null,
      userId: c.get("user")?.id ?? null,
      error: { name: error.name, message: error.message, stack: error.stack },
    }),
  );
  return errorJson(c, 500);
};

export const notFound: NotFoundHandler<AppEnv> = (c) => errorJson(c, 404);

/** zod validation failures (request body/params/query) -> 400 {error, issues}. */
export const validationHook: Hook<unknown, AppEnv, string, unknown> = (result, c) => {
  if (!result.success) {
    const issues = result.error.issues;
    const first = issues[0];
    const location = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return errorJson(c, 400, `${location}${first?.message ?? "Invalid request"}`, issues);
  }
};
