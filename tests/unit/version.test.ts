import { describe, expect, it } from "vitest";
import { resolveAppVersion } from "../../src/worker/lib/version";

describe("resolveAppVersion", () => {
  it("prefers an explicit value, otherwise falls back to the build-time value or 'dev'", () => {
    expect(resolveAppVersion("abc123")).toBe("abc123");
    // No Vite define in the test runtime -> "dev"
    expect(resolveAppVersion(undefined)).toBe("dev");
    expect(resolveAppVersion("")).toBe("dev");
  });
});
