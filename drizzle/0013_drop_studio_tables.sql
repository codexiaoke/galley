-- 视频工坊的表搬到了工坊自己的数据库和迁移里（integrations/video-studio/drizzle），博客不再建它们。
-- 先删引用别人的表，再删被引用的表，免得外键检查拦住。
DROP TABLE IF EXISTS `studio_comments`;--> statement-breakpoint
DROP TABLE IF EXISTS `studio_events`;--> statement-breakpoint
DROP TABLE IF EXISTS `studio_revisions`;--> statement-breakpoint
DROP TABLE IF EXISTS `studio_projects`;--> statement-breakpoint
DROP TABLE IF EXISTS `studio_connection`;
