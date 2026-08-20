import { describe, expect, it } from "vitest";
import { hashIp } from "../../src/worker/lib/crypto";

describe("hashIp", () => {
  it("hashes deterministically for the same input", async () => {
    const first = await hashIp("127.0.0.1", "secret-pepper-value");
    const second = await hashIp("127.0.0.1", "secret-pepper-value");
    expect(first).toBe(second);
  });

  it("changes when the input changes", async () => {
    const first = await hashIp("127.0.0.1", "secret-pepper-value");
    const second = await hashIp("127.0.0.2", "secret-pepper-value");
    expect(first).not.toBe(second);
  });

  it("changes when the pepper changes (keyed hash, not a plain digest)", async () => {
    const first = await hashIp("127.0.0.1", "pepper-one");
    const second = await hashIp("127.0.0.1", "pepper-two");
    expect(first).not.toBe(second);
  });

  it("produces a 64-character hex digest that never contains the raw IP", async () => {
    const hash = await hashIp("203.0.113.9", "secret-pepper-value");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.9");
  });

  it("treats missing IPs as 'unknown' rather than failing", async () => {
    expect(await hashIp(null, "secret-pepper-value")).toBe(await hashIp("  ", "secret-pepper-value"));
  });

  it("refuses to hash without a pepper", async () => {
    await expect(hashIp("127.0.0.1", "")).rejects.toThrow(/pepper/i);
    await expect(hashIp("127.0.0.1", undefined as unknown as string)).rejects.toThrow(/pepper/i);
  });
});
