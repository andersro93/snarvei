import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestampMs = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: timestampMs("created_at"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestampMs("created_at"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestampMs("created_at"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: timestampMs("created_at"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata", { mode: "json" }),
  createdAt: timestampMs("created_at"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$onUpdate(() => new Date()),
});

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestampMs("created_at"),
  },
  (table) => [
    index("members_org_id_idx").on(table.organizationId),
    index("members_user_id_idx").on(table.userId),
    uniqueIndex("members_org_user_unique").on(table.organizationId, table.userId),
  ],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
    createdAt: timestampMs("created_at"),
  },
  (table) => [index("invitations_org_id_idx").on(table.organizationId), index("invitations_email_idx").on(table.email)],
);

export const teams = sqliteTable(
  "teams",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestampMs("created_at"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$onUpdate(() => new Date()),
  },
  (table) => [
    index("teams_org_id_idx").on(table.organizationId),
    uniqueIndex("teams_org_name_unique").on(table.organizationId, table.name),
  ],
);

export const teamMembers = sqliteTable(
  "team_members",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  },
  (table) => [
    index("team_members_team_id_idx").on(table.teamId),
    index("team_members_user_id_idx").on(table.userId),
    uniqueIndex("team_members_team_user_unique").on(table.teamId, table.userId),
  ],
);

export const links = sqliteTable(
  "links",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    targetUrl: text("target_url").notNull(),
    redirectStatus: integer("redirect_status").notNull().default(302),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    title: text("title"),
    description: text("description"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestampMs("created_at"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("links_team_id_idx").on(table.teamId), index("links_org_id_idx").on(table.organizationId)],
);

export const linkTargetHistory = sqliteTable(
  "link_target_history",
  {
    id: text("id").primaryKey(),
    linkId: text("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    oldTargetUrl: text("old_target_url"),
    newTargetUrl: text("new_target_url").notNull(),
    changedBy: text("changed_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    changedAt: timestampMs("changed_at"),
  },
  (table) => [index("link_target_history_link_id_idx").on(table.linkId)],
);

export const clickEvents = sqliteTable(
  "click_events",
  {
    id: text("id").primaryKey(),
    linkId: text("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    clickedAt: timestampMs("clicked_at"),
    ipHash: text("ip_hash").notNull(),
    userAgent: text("user_agent"),
    referer: text("referer"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    colo: text("colo"),
    asn: integer("asn"),
    host: text("host").notNull(),
    path: text("path").notNull(),
    queryString: text("query_string"),
    redirectStatusUsed: integer("redirect_status_used").notNull(),
  },
  (table) => [index("click_events_link_id_idx").on(table.linkId), index("click_events_clicked_at_idx").on(table.clickedAt)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  memberships: many(members),
  teamMemberships: many(teamMembers),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  teams: many(teams),
  links: many(links),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
  teamMembers: many(teamMembers),
  links: many(links),
}));

export const linksRelations = relations(links, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [links.organizationId],
    references: [organizations.id],
  }),
  team: one(teams, {
    fields: [links.teamId],
    references: [teams.id],
  }),
  history: many(linkTargetHistory),
  clickEvents: many(clickEvents),
}));

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  organizations,
  members,
  invitations,
  teams,
  teamMembers,
  links,
  linkTargetHistory,
  clickEvents,
};
