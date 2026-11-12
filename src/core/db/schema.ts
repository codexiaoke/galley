import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Galley 的核心表。设计说明见 docs/design-knowledge-blocks.md。
 * 知识块和文档都采用"实体 + 版本"结构：实体只记录身份和当前生效的版本。
 */

export const ACTOR_KINDS = ["owner", "agent"] as const;
export const BLOCK_TYPES = ["fact", "concept", "code", "data", "opinion", "experience"] as const;
export const BLOCK_STATUSES = ["draft", "verified", "stale", "retired"] as const;
export const VISIBILITIES = ["public", "private"] as const;
export const REVISION_STATES = ["draft", "approved"] as const;
export const DOCUMENT_KINDS = ["article", "page"] as const;
export const DOCUMENT_STATUSES = ["draft", "published", "unpublished"] as const;
export const REF_MODES = ["cite", "embed", "value"] as const;
export const CHANGE_SET_KINDS = ["article", "document_edit", "page", "knowledge", "block_update"] as const;
export const CHANGE_SET_STATUSES = ["open", "in_review", "approved", "rejected", "withdrawn"] as const;

export type ActorKind = (typeof ACTOR_KINDS)[number];
export type BlockType = (typeof BLOCK_TYPES)[number];
export type BlockStatus = (typeof BLOCK_STATUSES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type RefMode = (typeof REF_MODES)[number];
export type ChangeSetKind = (typeof CHANGE_SET_KINDS)[number];
export type ChangeSetStatus = (typeof CHANGE_SET_STATUSES)[number];

export type BlockSource = { url: string; title?: string; quote?: string; accessedAt?: string };

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull();

/** 通过 MCP 接入的 Agent。只保存密钥的校验值。 */
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

/** 每次 MCP 工具调用的记录。 */
export const agentCalls = sqliteTable(
  "agent_calls",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    tool: text("tool").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_calls_agent_idx").on(t.agentId, t.createdAt)],
);

/** 变更集：审阅的唯一单位，对应看板上的一张卡片。 */
export const changeSets = sqliteTable(
  "change_sets",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: CHANGE_SET_KINDS }).notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    status: text("status", { enum: CHANGE_SET_STATUSES }).notNull().default("open"),
    createdByKind: text("created_by_kind", { enum: ACTOR_KINDS }).notNull(),
    createdById: text("created_by_id"),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("change_sets_status_idx").on(t.status)],
);

export const blocks = sqliteTable("blocks", {
  id: text("id").primaryKey(),
  type: text("type", { enum: BLOCK_TYPES }).notNull(),
  visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("public"),
  status: text("status", { enum: BLOCK_STATUSES }).notNull().default("draft"),
  currentRevisionId: text("current_revision_id"),
  createdByKind: text("created_by_kind", { enum: ACTOR_KINDS }).notNull(),
  createdById: text("created_by_id"),
  createdAt: createdAt(),
});

export const blockRevisions = sqliteTable(
  "block_revisions",
  {
    id: text("id").primaryKey(),
    blockId: text("block_id").notNull(),
    revNo: integer("rev_no").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** 各类型的专有字段，结构见 core/blocks/types.ts */
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    sources: text("sources", { mode: "json" }).$type<BlockSource[]>().notNull(),
    /** 为 false 表示"不改变含义"的修改，生效后不触发引用它的文章重审 */
    semanticChange: integer("semantic_change", { mode: "boolean" }).notNull().default(true),
    reason: text("reason"),
    authorKind: text("author_kind", { enum: ACTOR_KINDS }).notNull(),
    authorId: text("author_id"),
    changeSetId: text("change_set_id"),
    state: text("state", { enum: REVISION_STATES }).notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("block_revisions_no_idx").on(t.blockId, t.revNo),
    index("block_revisions_cs_idx").on(t.changeSetId),
  ],
);

/** 分类：由站长创建，每篇文章属于一个分类。Agent 只能从已有的分类里选。 */
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: DOCUMENT_KINDS }).notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status", { enum: DOCUMENT_STATUSES }).notNull().default("draft"),
  currentRevisionId: text("current_revision_id"),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

export const documentRevisions = sqliteTable(
  "document_revisions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull(),
    revNo: integer("rev_no").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    body: text("body").notNull(),
    /** 分类记在版本上：改分类和改正文一样，要经过站长审阅 */
    categoryId: text("category_id"),
    authorKind: text("author_kind", { enum: ACTOR_KINDS }).notNull(),
    authorId: text("author_id"),
    changeSetId: text("change_set_id"),
    state: text("state", { enum: REVISION_STATES }).notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("document_revisions_no_idx").on(t.documentId, t.revNo),
    index("document_revisions_cs_idx").on(t.changeSetId),
  ],
);

/** 文档版本对知识块的引用，保存文档时由程序解析正文得到。 */
export const refs = sqliteTable(
  "refs",
  {
    id: text("id").primaryKey(),
    documentRevisionId: text("document_revision_id").notNull(),
    blockId: text("block_id").notNull(),
    mode: text("mode", { enum: REF_MODES }).notNull(),
    /** 只有"依据"引用锁定版本；嵌入类引用始终跟随知识块当前生效的版本 */
    pinnedBlockRevisionId: text("pinned_block_revision_id"),
    ordinal: integer("ordinal").notNull(),
    spanText: text("span_text"),
    valueKey: text("value_key"),
  },
  (t) => [index("refs_doc_rev_idx").on(t.documentRevisionId), index("refs_block_idx").on(t.blockId)],
);

/** 审阅批注。骨架阶段只建表，行内批注的界面之后再做。 */
export const reviewComments = sqliteTable(
  "review_comments",
  {
    id: text("id").primaryKey(),
    changeSetId: text("change_set_id").notNull(),
    targetType: text("target_type", { enum: ["block", "document"] }).notNull(),
    targetRevisionId: text("target_revision_id").notNull(),
    anchor: text("anchor", { mode: "json" }).$type<{ exact: string; prefix?: string; suffix?: string }>(),
    body: text("body").notNull(),
    status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
    reply: text("reply"),
    createdAt: createdAt(),
  },
  (t) => [index("review_comments_cs_idx").on(t.changeSetId)],
);

/** Agent 在某个变更集进行期间读取过的私密知识块，审阅时提示站长。 */
export const privateReads = sqliteTable(
  "private_reads",
  {
    id: text("id").primaryKey(),
    changeSetId: text("change_set_id"),
    blockId: text("block_id").notNull(),
    agentId: text("agent_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("private_reads_cs_idx").on(t.changeSetId)],
);
