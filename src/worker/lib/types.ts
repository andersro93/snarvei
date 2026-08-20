import type { Database } from "../db/client";

export type AppBindings = {
  DB: D1Database;
  /** Workers Rate Limiting binding used for the public redirect and auth endpoints. */
  RATE_LIMIT: RateLimit;
  PROFILE_IMAGES: R2Bucket;
  AUTH_SECRET: string;
  /** Optional dedicated pepper for IP hashing; defaults to AUTH_SECRET. */
  IP_HASH_PEPPER?: string;
  APP_URL?: string;
  APP_NAME?: string;
  NODE_ENV?: string;
};

export type AppVariables = {
  db: Database;
  session: {
    id: string;
    userId: string;
    activeOrganizationId?: string | null;
    activeTeamId?: string | null;
  } | null;
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  } | null;
  activeOrganizationId: string | null;
};
