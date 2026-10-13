CREATE TABLE `channel_scans` (
	`ts` integer NOT NULL,
	`channel` integer NOT NULL,
	`energy` real NOT NULL,
	PRIMARY KEY(`ts`, `channel`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`protocol` text NOT NULL,
	`address` text NOT NULL,
	`name` text NOT NULL,
	`custom_name` text,
	`role` text DEFAULT 'unknown' NOT NULL,
	`model` text,
	`vendor` text,
	`power` text DEFAULT 'unknown' NOT NULL,
	`network_address` text,
	`battery` real,
	`reported_online` integer,
	`online` integer DEFAULT true NOT NULL,
	`typical_interval` integer,
	`first_seen` integer NOT NULL,
	`last_seen` integer,
	`removed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_protocol_address` ON `devices` (`protocol`,`address`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`kind` text NOT NULL,
	`type` text NOT NULL,
	`protocol` text,
	`device_id` integer,
	`details` text,
	`notified` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_ts` ON `events` (`ts`);--> statement-breakpoint
CREATE INDEX `events_device_ts` ON `events` (`device_id`,`ts`);--> statement-breakpoint
CREATE TABLE `hourly` (
	`device_id` integer NOT NULL,
	`hour` integer NOT NULL,
	`median` real,
	`min` real,
	`max` real,
	`raw_median` real,
	`raw_min` real,
	`raw_max` real,
	`count` integer DEFAULT 0 NOT NULL,
	`offline_minutes` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`device_id`, `hour`),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hourly_hour` ON `hourly` (`hour`);--> statement-breakpoint
CREATE TABLE `links` (
	`snapshot_id` integer NOT NULL,
	`from_id` integer NOT NULL,
	`to_id` integer NOT NULL,
	`lqi` real,
	`rssi` real,
	`parent` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`snapshot_id`, `from_id`, `to_id`),
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `samples` (
	`device_id` integer NOT NULL,
	`ts` integer NOT NULL,
	`score` real NOT NULL,
	`raw` real NOT NULL,
	`lqi` real,
	`rssi` real,
	`source` text NOT NULL,
	PRIMARY KEY(`device_id`, `ts`),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `samples_ts` ON `samples` (`ts`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`protocol` text NOT NULL,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `snapshots_protocol_ts` ON `snapshots` (`protocol`,`ts`);