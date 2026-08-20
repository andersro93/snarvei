import { HTTPException } from "hono/http-exception";

/** Opaque keyset cursor: newest-first ordering by (timestamp desc, id desc). */
export type Cursor = { at: number; id: string };

const encode = (value: string) => btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (value: string) => atob(value.replace(/-/g, "+").replace(/_/g, "/"));

export const encodeCursor = (cursor: Cursor) => encode(JSON.stringify([cursor.at, cursor.id]));

export const decodeCursor = (raw: string | undefined): Cursor | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(decode(raw)) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "number" &&
      Number.isFinite(parsed[0]) &&
      typeof parsed[1] === "string"
    ) {
      return { at: parsed[0], id: parsed[1] };
    }
  } catch {
    // fall through
  }
  throw new HTTPException(400, { message: "Invalid cursor" });
};

/**
 * Given `limit + 1` rows fetched newest-first, return the page and the cursor
 * for the next page (or null when this was the last page).
 */
export const paginate = <T>(rows: T[], limit: number, keyOf: (row: T) => Cursor) => {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? encodeCursor(keyOf(last)) : null };
};
