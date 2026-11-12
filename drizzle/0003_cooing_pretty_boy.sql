CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`url` text,
	`is_private` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`processed_note` text,
	`created_by_kind` text NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE INDEX `materials_status_idx` ON `materials` (`status`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`origin_material_id` text,
	`change_set_id` text,
	`created_by_kind` text NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `topics_status_idx` ON `topics` (`status`);--> statement-breakpoint
ALTER TABLE `blocks` ADD `origin_material_id` text;--> statement-breakpoint
ALTER TABLE `change_sets` ADD `topic_id` text;