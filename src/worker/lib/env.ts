import { createMiddleware } from "hono/factory";
import type { AppBindings, AppVariables } from "./types";

const MIN_SECRET_LENGTH = 32;

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * Fail fast on misconfiguration instead of degrading silently (which would
 * surface as confusing 401s, or worse, unpeppered IP hashes).
 */
export function validateEnv(env: Partial<AppBindings> | undefined): asserts env is AppBindings {
  if (!env?.DB) {
    throw new EnvValidationError("DB binding is missing");
  }
  if (!env.RATE_LIMIT) {
    throw new EnvValidationError("RATE_LIMIT binding is missing");
  }
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < MIN_SECRET_LENGTH) {
    throw new EnvValidationError(`AUTH_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters`);
  }
  if (!env.APP_URL) {
    throw new EnvValidationError("APP_URL is missing");
  }
  try {
    new URL(env.APP_URL);
  } catch {
    throw new EnvValidationError("APP_URL is not a valid URL");
  }
}

/** Secret used to pepper IP hashes; falls back to AUTH_SECRET when no dedicated pepper is configured. */
export const ipHashPepper = (env: AppBindings) => env.IP_HASH_PEPPER || env.AUTH_SECRET;

export const envMiddleware = createMiddleware<{ Bindings: AppBindings; Variables: AppVariables }>(async (c, next) => {
  try {
    validateEnv(c.env);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "env.invalid",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return c.json({ error: "Server misconfigured" }, 500);
  }

  await next();
});
