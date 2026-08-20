import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";
import type { AppBindings } from "../../src/worker/lib/types";
import { permissiveRateLimit, randomIp } from "./support/api";

const app = createApp();

const testEnv: AppBindings = {
  DB: env.DB,
  RATE_LIMIT: permissiveRateLimit,
  PROFILE_IMAGES: {} as R2Bucket,
  AUTH_SECRET: "6b2bb1c1f08b4dcb8edc6fe6d64ed7135ecfa4012d3224d4203f3a1c4a2727b1",
  APP_URL: "http://localhost:8787",
  APP_NAME: "Snarvei",
};

const request = (input: string, init?: RequestInit) => app.request(input, init, testEnv);

const jsonRequest = (method: string, body: unknown, cookie?: string): RequestInit => ({
  method,
  headers: {
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
  },
  body: JSON.stringify(body),
});

const extractSessionCookie = (response: Response) => {
  const setCookie = response.headers.get("set-cookie");
  const match = setCookie?.match(/better-auth\.session_token=[^;]+/);
  if (!match) {
    throw new Error("Missing Better Auth session cookie");
  }
  return match[0];
};

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;


type AuthSession = {
  cookie: string;
  userId: string;
};

type ProtectedFixture = {
  organizationId: string;
  teamId: string;
  otherTeamId: string;
  linkId: string;
  otherLinkId: string;
};

type ProtectedRequestCase = {
  name: string;
  input: string;
  init?: RequestInit;
};

const signUpAndGetSession = async (): Promise<AuthSession> => {
  const suffix = crypto.randomUUID();
  const init = jsonRequest("POST", {
    name: `User ${suffix}`,
    email: `user-${suffix}@example.com`,
    password: "Password123!",
  });
  const response = await request("http://localhost/api/auth/sign-up/email", {
    ...init,
    headers: { ...(init.headers as Record<string, string>), "cf-connecting-ip": randomIp() },
  });

  expect(response.status).toBeLessThan(400);
  const cookie = extractSessionCookie(response);

  const meResponse = await request("http://localhost/api/me", {
    headers: { cookie },
  });
  expect(meResponse.status).toBe(200);

  const payload = (await meResponse.json()) as {
    user: { id: string };
  };

  return {
    cookie,
    userId: payload.user.id,
  };
};

const seedProtectedFixture = async (userId: string): Promise<ProtectedFixture> => {
  const now = Date.now();
  const organizationId = createId("org");
  const teamId = createId("team");
  const otherTeamId = createId("team");
  const linkId = createId("link");
  const otherLinkId = createId("link");

  await env.DB.batch([
    env.DB
      .prepare("INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
      .bind(organizationId, `Org ${organizationId}`, `slug-${organizationId}`, now),
    env.DB
      .prepare("INSERT INTO members (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(createId("member"), organizationId, userId, "member", now),
    env.DB
      .prepare("INSERT INTO teams (id, name, organization_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(teamId, `Team ${teamId}`, organizationId, now),
    env.DB
      .prepare("INSERT INTO teams (id, name, organization_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(otherTeamId, `Team ${otherTeamId}`, organizationId, now),
    env.DB
      .prepare("INSERT INTO team_members (id, team_id, user_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(createId("team-member"), teamId, userId, now),
    env.DB
      .prepare(
        `INSERT INTO links (
          id, organization_id, team_id, slug, target_url, redirect_status, is_active,
          title, description, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        linkId,
        organizationId,
        teamId,
        `slug-${linkId}`,
        "https://example.com/original",
        302,
        1,
        "Seed link",
        "Seeded for authz tests",
        userId,
        userId,
        now,
        now,
      ),
    env.DB
      .prepare(
        `INSERT INTO links (
          id, organization_id, team_id, slug, target_url, redirect_status, is_active,
          title, description, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        otherLinkId,
        organizationId,
        otherTeamId,
        `slug-${otherLinkId}`,
        "https://example.com/other",
        302,
        1,
        "Other seed link",
        "Seeded for org-wide list tests",
        userId,
        userId,
        now,
        now,
      ),
  ]);

  return { organizationId, teamId, otherTeamId, linkId, otherLinkId };
};

describe("protected endpoint authentication", () => {
  const cases: Array<{ name: string; input: string; init?: RequestInit }> = [
    { name: "GET /api/me", input: "http://localhost/api/me" },
    { name: "GET /api/organizations/:organizationId/links", input: "http://localhost/api/organizations/org-auth/links" },
    { name: "GET /api/teams/:teamId/links", input: "http://localhost/api/teams/team-auth/links" },
    {
      name: "POST /api/links",
      input: "http://localhost/api/links",
      init: jsonRequest("POST", {
        teamId: "team-auth",
        targetUrl: "https://example.com/create",
        redirectStatus: 302,
      }),
    },
    { name: "GET /api/links/:linkId", input: "http://localhost/api/links/link-auth" },
    {
      name: "PATCH /api/links/:linkId",
      input: "http://localhost/api/links/link-auth",
      init: jsonRequest("PATCH", { title: "Updated title" }),
    },
    { name: "DELETE /api/links/:linkId", input: "http://localhost/api/links/link-auth", init: { method: "DELETE" } },
    { name: "GET /api/links/:linkId/history", input: "http://localhost/api/links/link-auth/history" },
    { name: "GET /api/links/:linkId/analytics", input: "http://localhost/api/links/link-auth/analytics" },
  ];

  for (const testCase of cases) {
    it(`${testCase.name} returns 401 without a session`, async () => {
      const response = await request(testCase.input, testCase.init);
      expect(response.status).toBe(401);
    });
  }
});

describe("protected endpoint authorization", () => {
  const cases: Array<(fixture: ProtectedFixture) => ProtectedRequestCase> = [
    (fixture: ProtectedFixture) => ({
      name: "GET /api/organizations/:organizationId/links",
      input: `http://localhost/api/organizations/${fixture.organizationId}/links`,
    }),
    (fixture: ProtectedFixture) => ({
      name: "GET /api/teams/:teamId/links",
      input: `http://localhost/api/teams/${fixture.teamId}/links`,
    }),
    (fixture: ProtectedFixture) => ({
      name: "POST /api/links",
      input: "http://localhost/api/links",
      init: jsonRequest("POST", {
        teamId: fixture.teamId,
        targetUrl: "https://example.com/create",
        redirectStatus: 302,
      }),
    }),
    (fixture: ProtectedFixture) => ({
      name: "GET /api/links/:linkId",
      input: `http://localhost/api/links/${fixture.linkId}`,
    }),
    (fixture: ProtectedFixture) => ({
      name: "PATCH /api/links/:linkId",
      input: `http://localhost/api/links/${fixture.linkId}`,
      init: jsonRequest("PATCH", { title: "Forbidden update" }),
    }),
    (fixture: ProtectedFixture) => ({
      name: "DELETE /api/links/:linkId",
      input: `http://localhost/api/links/${fixture.linkId}`,
      init: { method: "DELETE" },
    }),
    (fixture: ProtectedFixture) => ({
      name: "GET /api/links/:linkId/history",
      input: `http://localhost/api/links/${fixture.linkId}/history`,
    }),
    (fixture: ProtectedFixture) => ({
      name: "GET /api/links/:linkId/analytics",
      input: `http://localhost/api/links/${fixture.linkId}/analytics`,
    }),
  ];

  for (const createCase of cases) {
    it(
      `${createCase({ organizationId: "org", teamId: "team", otherTeamId: "other-team", linkId: "link", otherLinkId: "other-link" }).name} returns 403 for a user outside the team`,
      async () => {
      const owner = await signUpAndGetSession();
      const outsider = await signUpAndGetSession();
      const fixture = await seedProtectedFixture(owner.userId);
      const testCase = createCase(fixture);
      const response = await request(testCase.input, {
        ...testCase.init,
        headers: {
          ...(testCase.init?.headers ?? {}),
          cookie: outsider.cookie,
        },
      });

      expect(response.status).toBe(403);
      },
    );
  }
});

describe("protected endpoint access for team members", () => {
  it("GET /api/me returns 200 for an authenticated user", async () => {
    const member = await signUpAndGetSession();
    const response = await request("http://localhost/api/me", {
      headers: { cookie: member.cookie },
    });

    expect(response.status).toBe(200);
  });

  it("GET /api/teams/:teamId/links returns 200 for a team member", async () => {
    const member = await signUpAndGetSession();
    const fixture = await seedProtectedFixture(member.userId);
    const response = await request(`http://localhost/api/teams/${fixture.teamId}/links`, {
      headers: { cookie: member.cookie },
    });

    expect(response.status).toBe(200);
  });

  it("GET /api/organizations/:organizationId/links returns only visible team links for a member", async () => {
    const owner = await signUpAndGetSession();
    const fixture = await seedProtectedFixture(owner.userId);
    const member = await signUpAndGetSession();
    const now = Date.now();

    await env.DB.batch([
      env.DB
        .prepare("INSERT INTO members (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(createId("member"), fixture.organizationId, member.userId, "member", now),
      env.DB
        .prepare("INSERT INTO team_members (id, team_id, user_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(createId("team-member"), fixture.teamId, member.userId, now),
    ]);

    const response = await request(`http://localhost/api/organizations/${fixture.organizationId}/links`, {
      headers: { cookie: member.cookie },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Array<{ id: string; teamId: string; teamName?: string | null }>;
    expect(payload).toHaveLength(1);
    expect(payload[0]?.id).toBe(fixture.linkId);
    expect(payload[0]?.teamId).toBe(fixture.teamId);
    expect(payload[0]?.teamName).toBe(`Team ${fixture.teamId}`);
  });

  it("GET /api/organizations/:organizationId/links returns all org links for an admin", async () => {
    const admin = await signUpAndGetSession();
    const fixture = await seedProtectedFixture(admin.userId);

    await env.DB.prepare("UPDATE members SET role = ? WHERE organization_id = ? AND user_id = ?").bind("admin", fixture.organizationId, admin.userId).run();

    const response = await request(`http://localhost/api/organizations/${fixture.organizationId}/links`, {
      headers: { cookie: admin.cookie },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Array<{ id: string }>;
    expect(payload.map((item) => item.id).sort()).toEqual([fixture.linkId, fixture.otherLinkId].sort());
  });

  it("POST /api/links returns 201 for a team member", async () => {
    const member = await signUpAndGetSession();
    const fixture = await seedProtectedFixture(member.userId);
    const response = await request(
      "http://localhost/api/links",
      jsonRequest(
        "POST",
        {
          teamId: fixture.teamId,
          targetUrl: "https://example.com/created",
          redirectStatus: 302,
        },
        member.cookie,
      ),
    );

    expect(response.status).toBe(201);
  });

  it("GET /api/links/:linkId returns 200 for a team member", async () => {
    const member = await signUpAndGetSession();
    const fixture = await seedProtectedFixture(member.userId);
    const response = await request(`http://localhost/api/links/${fixture.linkId}`, {
      headers: { cookie: member.cookie },
    });

    expect(response.status).toBe(200);
  });

  it("PATCH /api/links/:linkId returns 200 for a team member", async () => {
    const member = await signUpAndGetSession();
    const fixture = await seedProtectedFixture(member.userId);
    const response = await request(
      `http://localhost/api/links/${fixture.linkId}`,
      jsonRequest("PATCH", { title: "Updated title" }, member.cookie),
    );

    expect(response.status).toBe(200);
  });

  it("DELETE /api/links/:linkId returns 200 for a team member", async () => {
    const member = await signUpAndGetSession();
    const fixture = await seedProtectedFixture(member.userId);
    const response = await request(`http://localhost/api/links/${fixture.linkId}`, {
      method: "DELETE",
      headers: { cookie: member.cookie },
    });

    expect(response.status).toBe(200);
  });

  it("GET /api/links/:linkId/history returns 200 for a team member", async () => {
    const member = await signUpAndGetSession();
    const fixture = await seedProtectedFixture(member.userId);
    const response = await request(`http://localhost/api/links/${fixture.linkId}/history`, {
      headers: { cookie: member.cookie },
    });

    expect(response.status).toBe(200);
  });

  it("GET /api/links/:linkId/analytics returns 200 for a team member", async () => {
    const member = await signUpAndGetSession();
    const fixture = await seedProtectedFixture(member.userId);
    const response = await request(`http://localhost/api/links/${fixture.linkId}/analytics`, {
      headers: { cookie: member.cookie },
    });

    expect(response.status).toBe(200);
  });
});
