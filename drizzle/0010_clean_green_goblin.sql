ALTER TABLE `media` ADD `uploaded_by_kind` text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE `media` ADD `uploaded_by_id` text;