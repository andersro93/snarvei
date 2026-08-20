import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { schema } from "../../src/worker/db/schema";
import { createAuthOptions } from "../../src/worker/lib/auth";

/**
 * Guards against schema drift between the Better Auth version in use and our
 * Drizzle schema. Better Auth resolves fields by the Drizzle column *property*
 * name, so every field it expects must exist as a property on our tables.
 */
describe("Better Auth schema compatibility", () => {
  const modelToTable: Record<string, keyof typeof schema> = {
    user: "users",
    session: "sessions",
    account: "accounts",
    verification: "verifications",
    organization: "organizations",
    member: "members",
    invitation: "invitations",
    team: "teams",
    teamMember: "teamMembers",
    twoFactor: "twoFactors",
    passkey: "passkeys",
  };

  const options = createAuthOptions({
    DB: {} as D1Database,
    PROFILE_IMAGES: {} as R2Bucket,
    AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
    APP_URL: "http://localhost:8787",
    APP_NAME: "Snarvei",
  });
  const tables = getAuthTables(options);

  it("maps every Better Auth model to a Drizzle table", () => {
    expect(Object.keys(tables).sort()).toEqual(Object.keys(modelToTable).sort());
  });

  for (const [model, tableKey] of Object.entries(modelToTable)) {
    it(`has every field Better Auth expects on "${model}" (${String(tableKey)})`, () => {
      const columns = Object.keys(getTableColumns(schema[tableKey]));
      const expected = Object.entries(tables[model]?.fields ?? {}).map(([field, def]) => def.fieldName ?? field);
      const missing = expected.filter((name) => !columns.includes(name));
      expect(missing, `missing columns: ${missing.join(", ")}`).toEqual([]);
    });
  }
});
