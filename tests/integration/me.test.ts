import { describe, expect, it } from "vitest";
import { ORIGIN, request, signUp } from "./support/api";

describe("GET /api/me", () => {
  it("returns the user and a minimal session without exposing the session token", async () => {
    const user = await signUp();
    const response = await request(`${ORIGIN}/api/me`, { headers: { cookie: user.cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { authenticated: boolean; user: Record<string, unknown>; session: Record<string, unknown> };
    expect(body.authenticated).toBe(true);
    expect(body.user.id).toBe(user.userId);
    expect(body.session).toMatchObject({ userId: user.userId });
    expect(body.session).not.toHaveProperty("token");
    expect(Object.keys(body.session).sort()).toEqual(["activeOrganizationId", "activeTeamId", "expiresAt", "id", "userId"]);
  });
});
