import { describe, expect, it } from "vitest";
// Vite `?raw` import: the static headers file shipped with the SPA assets.
import spaHeaders from "../../public/_headers?raw";
import { ORIGIN, request } from "./support/api";

const expectCommonHeaders = (response: Response) => {
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
};

describe("security headers on Worker responses", () => {
  it("sets them on JSON API responses", async () => {
    const response = await request(`${ORIGIN}/api/health`);
    expect(response.status).toBe(200);
    expectCommonHeaders(response);
  });

  it("sets them on the Scalar docs page with a CSP that only allows the docs script", async () => {
    const response = await request(`${ORIGIN}/scalar`);
    expect(response.status).toBe(200);
    expectCommonHeaders(response);
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src [^;]*cdn\.jsdelivr\.net/);
  });

  it("sets them on redirect misses without interfering with the redirect itself", async () => {
    const response = await request(`${ORIGIN}/l/does-not-exist`);
    expect(response.status).toBe(404);
    expectCommonHeaders(response);
  });
});

describe("static asset headers (public/_headers)", () => {
  it("applies a CSP and framing/sniffing protections to the SPA and assets", () => {
    expect(spaHeaders).toMatch(/^\/\*\s*$/m);
    expect(spaHeaders).toContain("X-Frame-Options: DENY");
    expect(spaHeaders).toContain("X-Content-Type-Options: nosniff");
    expect(spaHeaders).toContain("Referrer-Policy: strict-origin-when-cross-origin");
    expect(spaHeaders).toMatch(/Strict-Transport-Security: max-age=\d+/);
    expect(spaHeaders).toMatch(/Content-Security-Policy: [^\n]*default-src 'self'/);
    expect(spaHeaders).toMatch(/Content-Security-Policy: [^\n]*frame-ancestors 'none'/);
    expect(spaHeaders).toMatch(/Permissions-Policy: /);
  });
});
