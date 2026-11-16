CREATE TABLE `studio_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`production` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `studio_projects` ADD `production` text;