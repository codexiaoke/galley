CREATE TABLE `agent_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`tool` text NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_calls_agent_idx` ON `agent_calls` (`agent_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_token_hash_unique` ON `agents` (`token_hash`);--> statement-breakpoint
CREATE TABLE `block_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`rev_no` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`data` text NOT NULL,
	`sources` text NOT NULL,
	`semantic_change` integer DEFAULT true NOT NULL,
	`reason` text,
	`author_kind` text NOT NULL,
	`author_id` text,
	`change_set_id` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `block_revisions_no_idx` ON `block_revisions` (`block_id`,`rev_no`);--> statement-breakpoint
CREATE INDEX `block_revisions_cs_idx` ON `block_revisions` (`change_set_id`);--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_revision_id` text,
	`created_by_kind` text NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `change_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_by_kind` text NOT NULL,
	`created_by_id` text,
	`decision_note` text,
	`created_at` integer NOT NULL,
	`submitted_at` integer,
	`decided_at` integer
);
--> statement-breakpoint
CREATE INDEX `change_sets_status_idx` ON `change_sets` (`status`);--> statement-breakpoint
CREATE TABLE `document_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`rev_no` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`author_kind` text NOT NULL,
	`author_id` text,
	`change_set_id` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_revisions_no_idx` ON `document_revisions` (`document_id`,`rev_no`);--> statement-breakpoint
CREATE INDEX `document_revisions_cs_idx` ON `document_revisions` (`change_set_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_revision_id` text,
	`published_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_slug_unique` ON `documents` (`slug`);--> statement-breakpoint
CREATE TABLE `private_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`change_set_id` text,
	`block_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `private_reads_cs_idx` ON `private_reads` (`change_set_id`);--> statement-breakpoint
CREATE TABLE `refs` (
	`id` text PRIMARY KEY NOT NULL,
	`document_revision_id` text NOT NULL,
	`block_id` text NOT NULL,
	`mode` text NOT NULL,
	`pinned_block_revision_id` text,
	`ordinal` integer NOT NULL,
	`span_text` text,
	`value_key` text
);
--> statement-breakpoint
CREATE INDEX `refs_doc_rev_idx` ON `refs` (`document_revision_id`);--> statement-breakpoint
CREATE INDEX `refs_block_idx` ON `refs` (`block_id`);--> statement-breakpoint
CREATE TABLE `review_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`change_set_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_revision_id` text NOT NULL,
	`anchor` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reply` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `review_comments_cs_idx` ON `review_comments` (`change_set_id`);