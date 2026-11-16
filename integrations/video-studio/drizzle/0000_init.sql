-- 工坊的第一个迁移。全部用 IF NOT EXISTS：拆分前工坊跑的是博客的迁移，已有的数据库里这些表都在，这里原样接住。
CREATE TABLE IF NOT EXISTS `agent_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`tool` text NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_calls_agent_idx` ON `agent_calls` (`agent_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`disabled_tools` text DEFAULT '[]' NOT NULL,
	`can_publish` integer DEFAULT false NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `agents_token_hash_unique` ON `agents` (`token_hash`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `skill_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `skill_revisions_name_idx` ON `skill_revisions` (`name`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `skill_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_name` text NOT NULL,
	`suggestion` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`agent_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `skill_suggestions_status_idx` ON `skill_suggestions` (`status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `skills` (
	`name` text PRIMARY KEY NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `studio_comments` (
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
CREATE TABLE IF NOT EXISTS `studio_connection` (
	`id` integer PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`token` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `studio_events` (
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
CREATE TABLE IF NOT EXISTS `studio_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`assigned_agent_id` text,
	`current_revision_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `studio_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `studio_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `studio_revision_number_idx` ON `studio_revisions` (`project_id`,`number`);