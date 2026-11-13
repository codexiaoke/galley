ALTER TABLE `agents` ADD `can_publish` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `change_sets` ADD `published_without_review` integer DEFAULT false NOT NULL;