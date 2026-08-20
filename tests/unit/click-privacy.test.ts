import { describe, expect, it } from "vitest";
import { sanitizeQueryString, sanitizeReferer, sanitizeUserAgent } from "../../src/worker/lib/click-privacy";

describe("click event privacy", () => {
  it("keeps only campaign (utm_*) parameters from the query string", () => {
    expect(sanitizeQueryString("utm_source=newsletter&utm_medium=email")).toBe("utm_source=newsletter&utm_medium=email");
    expect(sanitizeQueryString("utm_source=newsletter&token=secret&email=a%40b.c")).toBe("utm_source=newsletter");
    expect(sanitizeQueryString("token=secret")).toBeNull();
    expect(sanitizeQueryString("")).toBeNull();
    expect(sanitizeQueryString(null)).toBeNull();
  });

  it("truncates overlong utm values", () => {
    expect(sanitizeQueryString(`utm_campaign=${"x".repeat(500)}`)?.length).toBeLessThanOrEqual(4 + 1 + 200 + 8);
  });

  it("stores the referer without query string, fragment or credentials", () => {
    expect(sanitizeReferer("https://ref.example/path?session=abc#frag")).toBe("https://ref.example/path");
    expect(sanitizeReferer("https://user:pw@ref.example/")).toBe("https://ref.example/");
    expect(sanitizeReferer("not a url")).toBeNull();
    expect(sanitizeReferer(null)).toBeNull();
  });

  it("caps the user agent length", () => {
    expect(sanitizeUserAgent("SnarveiTest/1.0")).toBe("SnarveiTest/1.0");
    expect(sanitizeUserAgent("x".repeat(1000))?.length).toBe(256);
    expect(sanitizeUserAgent(null)).toBeNull();
  });
});
