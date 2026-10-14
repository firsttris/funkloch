CREATE TABLE `counters` (
	`device_id` integer NOT NULL,
	`ts` integer NOT NULL,
	`unicast` integer NOT NULL,
	`broadcast` integer NOT NULL,
	`errors` integer NOT NULL,
	PRIMARY KEY(`device_id`, `ts`),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `counters_ts` ON `counters` (`ts`);--> statement-breakpoint
ALTER TABLE `devices` ADD `tx_errors_high` integer DEFAULT false NOT NULL;