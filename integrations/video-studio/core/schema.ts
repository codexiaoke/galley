import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { StudioRevisionData } from "./types";

/**
 * 视频工坊数据库里的表。工坊用自己的数据库文件和自己的迁移（integrations/video-studio/drizzle，
 * 迁移记录在 __studio_migrations），不跑博客的迁移。
 *
 * 工坊借用博客的 Agent 和技能服务（src/core/services/agents.ts、skills.ts），所以这几张表的定义直接用博客的，
 * 由工坊的迁移在工坊库里建出来。博客改了这几张表，要给工坊重新生成迁移：
 * pnpm db:generate:studio。core/__tests__/schema.test.ts 会检查两边建出来的表一样。
 */
export { agentCalls, agents, skillRevisions, skills, skillSuggestions } from "../../../src/core/db/schema";

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull();

export const studioProjects = sqliteTable("studio_projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  assignedAgentId: text("assigned_agent_id"),
  currentRevisionId: text("current_revision_id").notNull(),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const studioRevisions = sqliteTable("studio_revisions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => studioProjects.id),
  number: integer("number").notNull(),
  data: text("data", { mode: "json" }).$type<StudioRevisionData>().notNull(),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [uniqueIndex("studio_revision_number_idx").on(t.projectId, t.number)]);

export const studioComments = sqliteTable("studio_comments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => studioProjects.id),
  revisionId: text("revision_id").notNull().references(() => studioRevisions.id),
  stage: text("stage", { enum: ["script", "video"] }).notNull(),
  beatId: text("beat_id"),
  timeMs: integer("time_ms"),
  body: text("body").notNull(),
  reply: text("reply"),
  createdAt: createdAt(),
});

export const studioEvents = sqliteTable("studio_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => studioProjects.id),
  revisionId: text("revision_id").notNull().references(() => studioRevisions.id),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
});

export const studioConnection = sqliteTable("studio_connection", {
  id: integer("id").primaryKey(),
  url: text("url").notNull(),
  token: text("token").notNull(),
});

