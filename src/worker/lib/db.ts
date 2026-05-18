import type { Context } from "hono";
import { createDb } from "../db/client";
import type { AppBindings, AppVariables } from "./types";

export const getDb = (c: Context<{ Bindings: AppBindings; Variables: AppVariables }>) => {
  let db = c.get("db");
  if (!db) {
    db = createDb(c.env.DB);
    c.set("db", db);
  }
  return db;
};
