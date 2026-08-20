-- Better Auth 1.7: account identity is scoped by (issuer, accountId).
-- See https://better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-is-scoped-by-issuer
-- All existing accounts in V1 are email/password ("credential") accounts, so we
-- backfill them with the issuer value Better Auth uses for credential accounts.
-- SQLite cannot add a NOT NULL column without a default, so the default doubles
-- as the backfill. Better Auth always writes `issuer` explicitly for new rows.
ALTER TABLE `accounts` ADD `issuer` text NOT NULL DEFAULT 'local:credential';--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_issuer_account_id_unique` ON `accounts` (`issuer`,`account_id`);
