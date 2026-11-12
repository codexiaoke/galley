ALTER TABLE `change_sets` ADD `reject_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `change_sets` ADD `hidden_from_log` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `document_revisions` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- 加这一列之前就被打回过的改动：从"打回时的正文"推算出至少被打回过一次。
UPDATE `change_sets` SET `reject_count` = 1 WHERE `reject_count` = 0 AND (
  `id` IN (SELECT `change_set_id` FROM `document_revisions` WHERE `rejected_body` IS NOT NULL)
  OR `id` IN (SELECT `change_set_id` FROM `block_revisions` WHERE `rejected_body` IS NOT NULL)
);
