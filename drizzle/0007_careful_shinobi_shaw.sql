CREATE TABLE `skill_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `skill_revisions_name_idx` ON `skill_revisions` (`name`,`created_at`);--> statement-breakpoint
CREATE TABLE `skill_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_name` text NOT NULL,
	`suggestion` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`agent_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `skill_suggestions_status_idx` ON `skill_suggestions` (`status`);--> statement-breakpoint
CREATE TABLE `skills` (
	`name` text PRIMARY KEY NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `agents` ADD `disabled_tools` text DEFAULT '[]' NOT NULL;