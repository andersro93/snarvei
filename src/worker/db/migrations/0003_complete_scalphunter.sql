-- Better Auth 1.7: organization plugin now maintains teams.member_count and a
-- team_members.membership_key hash; the twoFactor plugin adds brute-force
-- lockout fields. membership_key needs no backfill (Better Auth falls back to
-- the (team_id, user_id) pair lookup when it is NULL). member_count is
-- backfilled from the existing team_members rows.
ALTER TABLE `team_members` ADD `membership_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_membership_key_unique` ON `team_members` (`membership_key`);--> statement-breakpoint
ALTER TABLE `teams` ADD `member_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `two_factors` ADD `failed_verification_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `two_factors` ADD `locked_until` integer;--> statement-breakpoint
UPDATE `teams` SET `member_count` = (SELECT count(*) FROM `team_members` WHERE `team_members`.`team_id` = `teams`.`id`);
