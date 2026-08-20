import { describe, expect, it } from "vitest";
import { createAuth } from "../../src/worker/lib/auth";
import type { AppBindings } from "../../src/worker/lib/types";

const env = (): AppBindings => ({
  DB: {} as D1Database,
  RATE_LIMIT: {} as RateLimit,
  PROFILE_IMAGES: {} as R2Bucket,
  AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
  APP_URL: "http://localhost:8787",
  APP_NAME: "Snarvei",
});

describe("createAuth memoisation", () => {
  it("reuses the Better Auth instance for the same bindings object (per isolate)", () => {
    const bindings = env();
    expect(createAuth(bindings)).toBe(createAuth(bindings));
  });

  it("creates separate instances for different bindings (e.g. tests injecting dependencies)", () => {
    expect(createAuth(env())).not.toBe(createAuth(env()));
    const bindings = env();
    expect(createAuth(bindings, { sendEmail: async () => {} })).not.toBe(createAuth(bindings));
  });
});
