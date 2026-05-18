import { describe, expect, it } from "vitest";
import { generateSlug } from "../../src/worker/lib/slug";

describe("generateSlug", () => {
  it("creates an 8 character slug by default", () => {
    expect(generateSlug()).toHaveLength(8);
  });

  it("uses the requested slug length", () => {
    expect(generateSlug(12)).toHaveLength(12);
  });

  it("avoids ambiguous characters", () => {
    const slug = generateSlug(64);
    expect(slug).not.toMatch(/[0OIl1]/);
  });
});
