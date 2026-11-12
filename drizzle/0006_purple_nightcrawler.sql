CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`from_path` text,
	`status` text DEFAULT 'new' NOT NULL,
	`sender_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_status_idx` ON `messages` (`status`);--> statement-breakpoint
CREATE INDEX `messages_sender_idx` ON `messages` (`sender_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `page_views` (
	`day` text NOT NULL,
	`path` text NOT NULL,
	`visitor` text NOT NULL,
	`referrer` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_views_unique_idx` ON `page_views` (`day`,`path`,`visitor`);--> statement-breakpoint
CREATE INDEX `page_views_day_idx` ON `page_views` (`day`);