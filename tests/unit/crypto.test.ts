import { describe, expect, it } from "vitest";
import { hashIp } from "../../src/worker/lib/crypto";

describe("hashIp", () => {
  it("hashes deterministically for the same input", async () => {
    const first = await hashIp("127.0.0.1", "secret");
    const second = await hashIp("127.0.0.1", "secret");
    expect(first).toBe(second);
  });

  it("changes when the input changes", async () => {
    const first = await hashIp("127.0.0.1", "secret");
    const second = await hashIp("127.0.0.2", "secret");
    expect(first).not.toBe(second);
  });
});
