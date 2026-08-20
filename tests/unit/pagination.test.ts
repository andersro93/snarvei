import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, paginate } from "../../src/worker/lib/pagination";

describe("keyset cursor", () => {
  it("round-trips through an opaque, URL-safe string", () => {
    const cursor = { at: 1_700_000_000_000, id: "abc-123" };
    const encoded = encodeCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it("treats an absent cursor as the first page and rejects garbage", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(() => decodeCursor("garbage")).toThrow(/cursor/i);
    expect(() => decodeCursor(encodeCursor({ at: Number.NaN, id: "x" }))).toThrow(/cursor/i);
  });

  it("paginate returns limit items and a next cursor only when more rows exist", () => {
    const rows = [3, 2, 1].map((n) => ({ at: n, id: String(n) }));
    const page = paginate(rows, 2, (row) => row);
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.nextCursor ?? undefined)).toEqual({ at: 2, id: "2" });
    const last = paginate(rows.slice(2), 2, (row) => row);
    expect(last.items).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
  });
});
