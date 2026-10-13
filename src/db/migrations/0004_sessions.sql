CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_expires` ON `sessions` (`expires_at`);