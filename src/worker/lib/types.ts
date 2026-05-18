import type { Database } from "../db/client";

export type AppBindings = Env & {
  AUTH_SECRET: string;
  APP_URL?: string;
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
