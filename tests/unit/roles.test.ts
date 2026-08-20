import { describe, expect, it } from "vitest";
import { isOrgAdmin, parseRoles } from "../../src/worker/middleware/guards";

describe("organization roles", () => {
  it("parses Better Auth's comma-joined role strings", () => {
    expect(parseRoles("owner")).toEqual(["owner"]);
    expect(parseRoles("member,admin")).toEqual(["member", "admin"]);
    expect(parseRoles(" admin , member ")).toEqual(["admin", "member"]);
    expect(parseRoles(null)).toEqual([]);
    expect(parseRoles(undefined)).toEqual([]);
  });

  it("treats owner or admin anywhere in the role list as org admin", () => {
    expect(isOrgAdmin("owner")).toBe(true);
    expect(isOrgAdmin("admin")).toBe(true);
    expect(isOrgAdmin("member,admin")).toBe(true);
    expect(isOrgAdmin("member")).toBe(false);
    expect(isOrgAdmin("")).toBe(false);
    expect(isOrgAdmin(null)).toBe(false);
  });
});
