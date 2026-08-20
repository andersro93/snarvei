import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "../../src/worker/lib/log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("structured logger", () => {
  it("writes one JSON line per event with level, event and fields", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("request.error", { path: "/x", rayId: "abc" });
    expect(error).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(error.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line).toMatchObject({ level: "error", event: "request.error", path: "/x", rayId: "abc" });
    expect(typeof line.time).toBe("string");
  });

  it("routes info/warn to the matching console method", () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    log.info("email.sent", { to: "a@b" });
    log.warn("email.not_configured", {});
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({ level: "info", event: "email.sent", to: "a@b" });
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({ level: "warn", event: "email.not_configured" });
  });

  it("serialises Error values safely", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("boom", { error: new Error("kaboom") });
    const line = JSON.parse(String(error.mock.calls[0]?.[0])) as { error: { name: string; message: string; stack?: string } };
    expect(line.error).toMatchObject({ name: "Error", message: "kaboom" });
  });
});
