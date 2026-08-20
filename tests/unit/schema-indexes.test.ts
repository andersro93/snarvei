import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { clickEvents, links } from "../../src/worker/db/schema";

const indexColumns = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).indexes.map((index) => ({
    name: index.config.name,
    columns: index.config.columns.map((column) => ("name" in column ? String(column.name) : "<expression>")),
  }));

describe("analytics-critical indexes", () => {
  it("click_events has a composite (link_id, clicked_at) index for per-link time-window queries", () => {
    const indexes = indexColumns(clickEvents);
    expect(indexes).toContainEqual(expect.objectContaining({ columns: ["link_id", "clicked_at"] }));
  });

  it("links keep the team/org indexes used by the list endpoints", () => {
    const indexes = indexColumns(links);
    expect(indexes.map((index) => index.columns)).toEqual(expect.arrayContaining([["team_id"], ["organization_id"]]));
  });
});
