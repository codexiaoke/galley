CREATE TABLE `studio_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`stage` text NOT NULL,
	`beat_id` text,
	`time_ms` integer,
	`body` text NOT NULL,
	`reply` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `studio_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revision_id`) REFERENCES `studio_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `studio_connection` (
	`id` integer PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`token` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `studio_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revision_id`) REFERENCES `studio_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `studio_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`assigned_agent_id` text,
	`current_revision_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `studio_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_revision_number_idx` ON `studio_revisions` (`project_id`,`number`);