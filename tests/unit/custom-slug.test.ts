import { describe, expect, it } from "vitest";
import { CustomSlugSchema } from "../../src/worker/openapi/schemas";

describe("CustomSlugSchema", () => {
  it("accepts lowercase letters, digits and single hyphens", () => {
    expect(CustomSlugSchema.parse("q3-launch")).toBe("q3-launch");
    expect(CustomSlugSchema.parse("abc")).toBe("abc");
    expect(CustomSlugSchema.parse("a".repeat(64))).toBe("a".repeat(64));
  });

  it("trims and lower-cases before validating", () => {
    expect(CustomSlugSchema.parse("  Q3-Launch ")).toBe("q3-launch");
  });

  it.each([
    ["too short", "ab"],
    ["too long", "a".repeat(65)],
    ["leading hyphen", "-q3"],
    ["trailing hyphen", "q3-"],
    ["double hyphen", "q3--launch"],
    ["underscore", "q3_launch"],
    ["slash", "q3/launch"],
    ["space inside", "q3 launch"],
    ["unicode", "lansering-på-norsk"],
    ["empty", ""],
  ])("rejects %s (%j)", (_label, value) => {
    expect(CustomSlugSchema.safeParse(value).success).toBe(false);
  });
});
