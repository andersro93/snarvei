import { afterEach, describe, expect, it, vi } from "vitest";
import { ORIGIN, createLink, jsonInit, request, setupWorkspace, signUp } from "./support/api";

type ErrorBody = { error: string; issues?: unknown[] };

const readError = async (response: Response) => {
  expect(response.headers.get("content-type"), `content-type for ${response.status}`).toContain("application/json");
  return (await response.json()) as ErrorBody;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API error contract", () => {
  it("returns JSON {error} for 401", async () => {
    const response = await request(`${ORIGIN}/api/links/${crypto.randomUUID()}`);
    expect(response.status).toBe(401);
    expect(await readError(response)).toEqual({ error: expect.stringMatching(/auth/i) });
  });

  it("returns JSON {error} for 403", async () => {
    const { owner, team } = await setupWorkspace();
    const link = await createLink(owner, { teamId: team.id, targetUrl: "https://example.com/x" });
    const outsider = await signUp();
    const response = await request(`${ORIGIN}/api/links/${link.id}`, { headers: { cookie: outsider.cookie } });
    expect(response.status).toBe(403);
    expect(await readError(response)).toEqual({ error: expect.any(String) });
  });

  it("returns JSON {error} for 404 on unknown links and unknown API routes", async () => {
    const { owner } = await setupWorkspace();
    const missing = await request(`${ORIGIN}/api/links/${crypto.randomUUID()}`, { headers: { cookie: owner.cookie } });
    expect(missing.status).toBe(404);
    expect(await readError(missing)).toEqual({ error: "Link not found" });

    const unknownRoute = await request(`${ORIGIN}/api/does-not-exist`, { headers: { cookie: owner.cookie } });
    expect(unknownRoute.status).toBe(404);
    expect(await readError(unknownRoute)).toEqual({ error: "Not found" });
  });

  it("returns JSON {error, issues} for validation failures", async () => {
    const { owner, team } = await setupWorkspace();
    const response = await request(`${ORIGIN}/api/links`, jsonInit("POST", { teamId: team.id, targetUrl: "javascript:alert(1)" }, owner));
    expect(response.status).toBe(400);
    const body = await readError(response);
    expect(body.error).toMatch(/target url/i);
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues?.length).toBeGreaterThan(0);
  });

  it("returns a generic JSON {error} for unexpected failures without leaking details", async () => {
    const { owner, team } = await setupWorkspace();
    vi.spyOn(crypto, "randomUUID").mockImplementationOnce(() => {
      throw new Error("simulated internal failure with secret details");
    });
    const response = await request(
      `${ORIGIN}/api/links`,
      jsonInit("POST", { teamId: team.id, targetUrl: "https://example.com/boom" }, owner),
    );
    expect(response.status).toBe(500);
    const body = await readError(response);
    expect(body).toEqual({ error: "Internal Server Error" });
  });
});

describe("OpenAPI document", () => {
  const fetchDoc = async () =>
    (await (await request(`${ORIGIN}/openapi.json`)).json()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown>; security?: unknown[] }>>;
      components?: { securitySchemes?: Record<string, unknown> };
    };

  it("documents every app route, including /api/me, /api/health and /l/{slug}", async () => {
    const doc = await fetchDoc();
    for (const path of ["/api/me", "/api/me/profile-image", "/api/health", "/l/{slug}", "/api/links", "/api/links/{linkId}"]) {
      expect(Object.keys(doc.paths), path).toContain(path);
    }
  });

  it("documents the optional custom slug and the 409 conflict on link creation", async () => {
    const doc = (await (await request(`${ORIGIN}/openapi.json`)).json()) as {
      paths: Record<
        string,
        Record<
          string,
          {
            responses: Record<string, unknown>;
            requestBody?: { content: Record<string, { schema: { properties?: Record<string, unknown>; required?: string[] } }> };
          }
        >
      >;
    };
    const op = doc.paths["/api/links"]?.post;
    expect(op).toBeDefined();
    expect(Object.keys(op!.responses)).toContain("409");
    const schema = op!.requestBody?.content["application/json"]?.schema;
    expect(schema?.properties).toHaveProperty("slug");
    expect(schema?.required ?? []).not.toContain("slug");
  });

  it("declares the session cookie security scheme and error responses on protected routes", async () => {
    const doc = await fetchDoc();
    expect(doc.components?.securitySchemes).toHaveProperty("cookieAuth");
    const protectedOps = [
      ["/api/links", "post"],
      ["/api/links/{linkId}", "get"],
      ["/api/links/{linkId}", "patch"],
      ["/api/links/{linkId}", "delete"],
      ["/api/links/{linkId}/history", "get"],
      ["/api/links/{linkId}/analytics", "get"],
      ["/api/teams/{teamId}/links", "get"],
      ["/api/organizations/{organizationId}/links", "get"],
    ] as const;
    for (const [path, method] of protectedOps) {
      const op = doc.paths[path]?.[method];
      expect(op, `${method} ${path}`).toBeDefined();
      expect(Object.keys(op!.responses), `${method} ${path}`).toEqual(expect.arrayContaining(["401", "403"]));
      expect(op!.security, `${method} ${path} security`).toEqual([{ cookieAuth: [] }]);
    }
    for (const [path, method] of protectedOps.filter(([p]) => p.includes("{linkId}"))) {
      expect(Object.keys(doc.paths[path]![method]!.responses), `${method} ${path}`).toContain("404");
    }
  });
});
