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
  /** Optional explicit version override; by default the build bakes in GITHUB_SHA (see vite.config.ts). */
  APP_VERSION?: string;
  /** Transactional email via the Cloudflare Email Service `send_email` binding. Both required to actually send; otherwise messages are dropped with a redacted log line. */
  EMAIL?: SendEmail;
  EMAIL_FROM?: string;
  /** Local development only: log full email bodies (links!) to the console. */
  EMAIL_DEV_LOG?: string;
};

export type AppVariables = {
  db: Database;
  /** Minimal session view kept in request context; never the raw Better Auth row (which carries the token). */
  session: {
    id: string;
    userId: string;
    expiresAt: string | null;
    activeOrganizationId: string | null;
    activeTeamId: string | null;
  } | null;
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  } | null;
  activeOrganizationId: string | null;
};
