import { describe, expect, it } from "vitest";
import { TargetUrlSchema } from "../../src/worker/openapi/schemas";

const accepts = (value: string) => TargetUrlSchema.safeParse(value).success;

describe("TargetUrlSchema", () => {
  it.each([
    "https://example.com",
    "http://example.com/path?query=1#frag",
    "https://sub.example.co.uk:8443/a/b",
    "https://xn--bcher-kva.example/",
  ])("accepts %s", (value) => {
    expect(accepts(value)).toBe(true);
  });

  it.each([
    ["javascript: URL", "javascript:alert(1)"],
    ["data: URL", "data:text/html,<script>alert(1)</script>"],
    ["file: URL", "file:///etc/passwd"],
    ["intent: URL", "intent://scan/#Intent;scheme=zxing;end"],
    ["mailto: URL", "mailto:someone@example.com"],
    ["ftp: URL", "ftp://example.com/file"],
    ["protocol-relative URL", "//example.com/path"],
    ["embedded credentials", "https://user:pass@example.com/"],
    ["no scheme", "example.com/path"],
    ["not a URL", "not a url"],
    ["empty", ""],
    ["whitespace", "   "],
  ])("rejects %s", (_label, value) => {
    expect(accepts(value)).toBe(false);
  });

  it("rejects URLs longer than 2048 characters", () => {
    expect(accepts(`https://example.com/${"a".repeat(2048)}`)).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    expect(TargetUrlSchema.parse("  https://example.com/x  ")).toBe("https://example.com/x");
  });
});
