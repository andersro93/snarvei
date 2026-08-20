import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { expect } from "vitest";
import { createApp } from "../../../src/worker/app";
import type { AppBindings } from "../../../src/worker/lib/types";

export const ORIGIN = "http://localhost";

export const testEnv: AppBindings = {
  DB: env.DB,
  PROFILE_IMAGES: {} as R2Bucket,
  AUTH_SECRET: "6b2bb1c1f08b4dcb8edc6fe6d64ed7135ecfa4012d3224d4203f3a1c4a2727b1",
  APP_URL: "http://localhost:8787",
  APP_NAME: "Snarvei",
};

export const app = createApp();

/** Perform a request against the app with a fresh ExecutionContext and wait for waitUntil() work. */
export const request = async (input: string | Request, init?: RequestInit) => {
  const ctx = createExecutionContext();
  const response = await app.request(input, init, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
};

export const jsonInit = (method: string, body?: unknown, cookie?: string): RequestInit => ({
  method,
  headers: {
    "content-type": "application/json",
    origin: ORIGIN,
    ...(cookie ? { cookie } : {}),
  },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const extractSessionCookie = (response: Response) => {
  const match = response.headers.get("set-cookie")?.match(/better-auth\.session_token=[^;]+/);
  if (!match) {
    throw new Error("Missing Better Auth session cookie");
  }
  return match[0];
};

export type TestUser = { cookie: string; userId: string; email: string };

export const signUp = async (): Promise<TestUser> => {
  const suffix = crypto.randomUUID();
  const email = `user-${suffix}@example.com`;
  const response = await request(
    `${ORIGIN}/api/auth/sign-up/email`,
    jsonInit("POST", { name: `User ${suffix}`, email, password: "Password123!" }),
  );
  expect(response.status, await response.clone().text()).toBeLessThan(400);
  const cookie = extractSessionCookie(response);
  const me = (await (await request(`${ORIGIN}/api/me`, { headers: { cookie } })).json()) as { user: { id: string } };
  return { cookie, userId: me.user.id, email };
};

export const createOrganization = async (user: TestUser) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const response = await request(
    `${ORIGIN}/api/auth/organization/create`,
    jsonInit("POST", { name: `Org ${suffix}`, slug: `org-${suffix}` }, user.cookie),
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as { id: string; slug: string };
};

export const createTeam = async (user: TestUser, organizationId: string, name = "Growth") => {
  const response = await request(
    `${ORIGIN}/api/auth/organization/create-team`,
    jsonInit("POST", { name, organizationId }, user.cookie),
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as { id: string };
};

export type LinkDto = {
  id: string;
  slug: string;
  targetUrl: string;
  redirectStatus: number;
  isActive: boolean;
  title: string | null;
  description: string | null;
};

export const createLink = async (
  user: TestUser,
  body: { teamId: string; targetUrl: string; redirectStatus?: 301 | 302 | 307; title?: string; description?: string },
) => {
  const response = await request(`${ORIGIN}/api/links`, jsonInit("POST", body, user.cookie));
  expect(response.status, await response.clone().text()).toBe(201);
  return (await response.json()) as LinkDto;
};

/** Owner + organization + team, ready to create links. */
export const setupWorkspace = async () => {
  const owner = await signUp();
  const organization = await createOrganization(owner);
  const team = await createTeam(owner, organization.id);
  return { owner, organization, team };
};

export const countRows = async (table: string, column: string, value: string) => {
  const row = await env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`).bind(value).first<{ n: number }>();
  return row?.n ?? 0;
};
