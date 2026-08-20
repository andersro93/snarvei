import { describe, expect, it } from "vitest";
import { createTrustedOrigins } from "../../src/worker/lib/auth";

const origins = async (baseUrl: string, requestUrl: string, originHeader?: string) =>
  createTrustedOrigins(baseUrl)(new Request(requestUrl, { headers: originHeader ? { origin: originHeader } : {} }));

describe("trusted origins", () => {
  it("trusts only the configured app origin in production, even when served on another host", async () => {
    expect(await origins("https://snarvei.example", "https://snarvei.example/api/auth/sign-in/email", "https://snarvei.example")).toEqual(["https://snarvei.example"]);
    // e.g. the workers.dev or a version-preview hostname: not trusted
    expect(await origins("https://snarvei.example", "https://snarvei.andersro93.workers.dev/api/auth/sign-in/email", "https://snarvei.andersro93.workers.dev")).toEqual([
      "https://snarvei.example",
    ]);
  });

  it("additionally trusts loopback origins for local development and e2e when the app itself runs on loopback", async () => {
    expect(await origins("http://localhost:8787", "http://127.0.0.1:4173/api/auth/sign-in/email", "http://127.0.0.1:4173")).toEqual([
      "http://localhost:8787",
      "http://127.0.0.1:4173",
    ]);
    expect(await origins("http://127.0.0.1:4173", "http://localhost:5173/api/auth/sign-in/email", "http://localhost:5173")).toEqual([
      "http://127.0.0.1:4173",
      "http://localhost:5173",
    ]);
    // but never a non-loopback origin, even in dev
    expect(await origins("http://localhost:8787", "http://evil.example/api/auth/sign-in/email", "http://evil.example")).toEqual(["http://localhost:8787"]);
  });

  it("returns the base origin when no request is available", async () => {
    expect(await createTrustedOrigins("https://snarvei.example")()).toEqual(["https://snarvei.example"]);
  });
});
