-- Authorship columns (links.created_by/updated_by, link_target_history.changed_by)
-- become nullable with ON DELETE SET NULL instead of CASCADE: links belong to
-- teams, so deleting a user must never delete links, history or analytics.
--
-- SQLite cannot alter foreign keys in place, so both tables are rebuilt.
-- D1 applies a migration atomically and `PRAGMA foreign_keys=OFF` is a no-op
-- inside a transaction, which means `DROP TABLE links` may still cascade into
-- its children (click_events, link_target_history). Child rows are therefore
-- backed up before the rebuild and restored afterwards (INSERT OR IGNORE keeps
-- this correct whether or not the cascade actually ran).
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_link_target_history` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`old_target_url` text,
	`new_target_url` text NOT NULL,
	`changed_by` text,
	`changed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_link_target_history`("id", "link_id", "old_target_url", "new_target_url", "changed_by", "changed_at") SELECT "id", "link_id", "old_target_url", "new_target_url", "changed_by", "changed_at" FROM `link_target_history`;--> statement-breakpoint
DROP TABLE `link_target_history`;--> statement-breakpoint
ALTER TABLE `__new_link_target_history` RENAME TO `link_target_history`;--> statement-breakpoint
CREATE INDEX `link_target_history_link_id_idx` ON `link_target_history` (`link_id`);--> statement-breakpoint
CREATE TABLE `__bak_link_target_history` AS SELECT * FROM `link_target_history`;--> statement-breakpoint
CREATE TABLE `__bak_click_events` AS SELECT * FROM `click_events`;--> statement-breakpoint
CREATE TABLE `__new_links` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`team_id` text NOT NULL,
	`slug` text NOT NULL,
	`target_url` text NOT NULL,
	`redirect_status` integer DEFAULT 302 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`title` text,
	`description` text,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_links`("id", "organization_id", "team_id", "slug", "target_url", "redirect_status", "is_active", "title", "description", "created_by", "updated_by", "created_at", "updated_at") SELECT "id", "organization_id", "team_id", "slug", "target_url", "redirect_status", "is_active", "title", "description", "created_by", "updated_by", "created_at", "updated_at" FROM `links`;--> statement-breakpoint
DROP TABLE `links`;--> statement-breakpoint
ALTER TABLE `__new_links` RENAME TO `links`;--> statement-breakpoint
CREATE UNIQUE INDEX `links_slug_unique` ON `links` (`slug`);--> statement-breakpoint
CREATE INDEX `links_team_id_idx` ON `links` (`team_id`);--> statement-breakpoint
CREATE INDEX `links_org_id_idx` ON `links` (`organization_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `link_target_history` SELECT * FROM `__bak_link_target_history`;--> statement-breakpoint
INSERT OR IGNORE INTO `click_events` SELECT * FROM `__bak_click_events`;--> statement-breakpoint
DROP TABLE `__bak_link_target_history`;--> statement-breakpoint
DROP TABLE `__bak_click_events`;
