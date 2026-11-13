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
export const MATERIAL_STATUSES = ["new", "processed", "archived"] as const;
export const TOPIC_STATUSES = ["proposed", "accepted", "in_progress", "done", "dropped"] as const;

export type ActorKind = (typeof ACTOR_KINDS)[number];
export type BlockType = (typeof BLOCK_TYPES)[number];
export type BlockStatus = (typeof BLOCK_STATUSES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type RefMode = (typeof REF_MODES)[number];
export type ChangeSetKind = (typeof CHANGE_SET_KINDS)[number];
export type ChangeSetStatus = (typeof CHANGE_SET_STATUSES)[number];
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export type BlockSource = { url: string; title?: string; quote?: string; accessedAt?: string };

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull();

/** 通过 MCP 接入的 Agent。只保存密钥的校验值。 */
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  /** 站长对这个 Agent 关掉的工具名。空表示全部可用。有哪些工具见 core/tools.ts */
  disabledTools: text("disabled_tools", { mode: "json" }).$type<string[]>().notNull().default([]),
  /**
   * 这个 Agent 可以直接让内容上线，不用等站长批准。默认关。
   * 打开的是你自己在旁边盯着的那个（比如电脑上的 Claude Code）；定时自己跑的仍然该让它等审阅。
   */
  canPublish: integer("can_publish", { mode: "boolean" }).notNull().default(false),
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
    /** 这个变更集是为哪个选题而开的。批准后选题完成，撤回后选题回到选题池 */
    topicId: text("topic_id"),
    decisionNote: text("decision_note"),
    /** 被站长打回过几次 */
    rejectCount: integer("reject_count").notNull().default(0),
    /** 没有经过审阅、由 Agent 自己直接上线的。看板和运营日志上标出来，站长事后还能看到 */
    publishedWithoutReview: integer("published_without_review", { mode: "boolean" }).notNull().default(false),
    /** 站长把它从公开的运营日志里隐藏了 */
    hiddenFromLog: integer("hidden_from_log", { mode: "boolean" }).notNull().default(false),
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
  /** 被标记为过期时写下的原因：哪里可能不成立了、依据是什么。恢复为已核实时清空 */
  staleReason: text("stale_reason"),
  /** 由素材箱里的哪条素材整理而来 */
  originMaterialId: text("origin_material_id"),
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
    /** 上一次被打回时的正文。重新提交后，审阅页用它显示"相对上次打回改了什么" */
    rejectedBody: text("rejected_body"),
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

/**
 * 素材：站长（或替站长记录的 Agent）随手丢进来的原始输入，一句想法、一个链接加评价、一段踩坑记录。
 * 它是文章"像站长本人写的"的来源：Agent 把素材整理成观点、经历类的知识块和选题。
 * 素材永远不会直接出现在前台。
 */
export const materials = sqliteTable(
  "materials",
  {
    id: text("id").primaryKey(),
    content: text("content").notNull(),
    url: text("url"),
    /** 为真时，由它整理出的知识块一律是私密的，不能被公开文章引用 */
    isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: MATERIAL_STATUSES }).notNull().default("new"),
    /** 处理时留下的一句说明：整理成了什么，或者为什么没有可用的内容 */
    processedNote: text("processed_note"),
    createdByKind: text("created_by_kind", { enum: ACTOR_KINDS }).notNull(),
    createdById: text("created_by_id"),
    createdAt: createdAt(),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("materials_status_idx").on(t.status)],
);

/**
 * 选题：一个待写的题目。Agent 提出的是候选，站长采纳后才进入可写的队列；站长自己加的直接可写。
 * priority 越大越先写。
 */
export const topics = sqliteTable(
  "topics",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    /** 为什么值得写、打算从什么角度写 */
    note: text("note").notNull().default(""),
    status: text("status", { enum: TOPIC_STATUSES }).notNull(),
    priority: integer("priority").notNull().default(0),
    originMaterialId: text("origin_material_id"),
    /** 被领取后对应的变更集 */
    changeSetId: text("change_set_id"),
    createdByKind: text("created_by_kind", { enum: ACTOR_KINDS }).notNull(),
    createdById: text("created_by_id"),
    createdAt: createdAt(),
  },
  (t) => [index("topics_status_idx").on(t.status)],
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
    /** 标签，同样记在版本上。规则见 core/tags.ts */
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    /** 所属的系列名，同一系列的文章按发布时间排成上下篇。没有系列时为空。同样记在版本上 */
    series: text("series"),
    /** 上一次被打回时的正文，用途同知识块版本上的同名字段 */
    rejectedBody: text("rejected_body"),
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

/**
 * 审阅批注：站长在待审内容的某段文字上写的意见。
 * 定位靠被批注的原文和它前后的少量文字（anchor），不依赖行号。Agent 修改后原文可能已经不在了，
 * 这时批注仍然保留，界面上显示它当初针对的那段文字。
 */
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

/** 站点设置：一行一个设置项。有哪些设置项、默认值是什么，见 services/settings.ts。 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * 媒体库里的图片。文件本身存在数据目录的 media 文件夹里，文件名就是 name。
 * name 由程序生成（随机编号加扩展名），不使用上传时的文件名，避免重名和路径问题。
 */
export const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  /** 文件名，同时是访问地址的最后一段：/media/<name> */
  name: text("name").notNull().unique(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  /** 图片的说明文字，引用时作为 alt */
  alt: text("alt").notNull().default(""),
  /** 上传时的原始文件名，只用于在后台辨认 */
  originalName: text("original_name").notNull().default(""),
  /** 谁传的。Agent 传的图片在后台标出来，站长一眼能认出哪些不是自己传的 */
  uploadedByKind: text("uploaded_by_kind", { enum: ACTOR_KINDS }).notNull().default("owner"),
  uploadedById: text("uploaded_by_id"),
  createdAt: createdAt(),
});

export const MESSAGE_STATUSES = ["new", "read", "archived"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/**
 * 读者给站长的留言。只有站长能在后台看到，前台不展示，Agent 读不到：
 * 留言是陌生人写的任意文字，可能夹带操纵 Agent 的指令，也可能有别人的联系方式。
 */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    contact: text("contact").notNull().default(""),
    body: text("body").notNull(),
    /** 读者是从哪个页面点过来留言的，例如 /posts/some-slug */
    fromPath: text("from_path"),
    status: text("status", { enum: MESSAGE_STATUSES }).notNull().default("new"),
    /** 提交者的匿名标记（地址等信息加盐后的散列），只用来限制提交频率，看不出是谁 */
    senderHash: text("sender_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_status_idx").on(t.status), index("messages_sender_idx").on(t.senderHash, t.createdAt)],
);

/**
 * 访问记录：某一天、某个页面、某位访客，一行。同一位访客同一天多次看同一个页面只记一次。
 *
 * 不使用 Cookie，也不保存地址。访客的标记是"当天的随机盐 + 地址 + 浏览器标识"的散列，
 * 盐每天更换且不保留，所以无法还原出地址，也无法把同一个人在不同日子的访问关联起来。
 */
export const pageViews = sqliteTable(
  "page_views",
  {
    /** 日期，按服务器所在时区，格式 2026-11-12 */
    day: text("day").notNull(),
    path: text("path").notNull(),
    visitor: text("visitor").notNull(),
    /** 来源网站的域名。直接访问、站内跳转时为空 */
    referrer: text("referrer"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("page_views_unique_idx").on(t.day, t.path, t.visitor), index("page_views_day_idx").on(t.day)],
);

/**
 * 站长改过或者自己新建的技能。程序自带的默认技能在仓库的 skills/ 目录里，不在这张表里；
 * 这张表里有同名的一行时，以这里的为准。
 */
export const skills = sqliteTable("skills", {
  name: text("name").primaryKey(),
  description: text("description").notNull().default(""),
  body: text("body").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** 技能每次保存留下的一个版本，用来回看改过什么。 */
export const skillRevisions = sqliteTable(
  "skill_revisions",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    body: text("body").notNull(),
    /** 这次改了什么，站长自己写的一句话 */
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("skill_revisions_name_idx").on(t.name, t.createdAt)],
);

/**
 * Agent 对技能提出的修改建议。Agent 不能改技能，只能在这里说"哪里应该改、为什么"，
 * 由站长看过之后自己决定改不改、怎么改。
 */
export const skillSuggestions = sqliteTable(
  "skill_suggestions",
  {
    id: text("id").primaryKey(),
    skillName: text("skill_name").notNull(),
    suggestion: text("suggestion").notNull(),
    reason: text("reason").notNull().default(""),
    agentId: text("agent_id").notNull(),
    status: text("status", { enum: ["open", "done", "dismissed"] }).notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [index("skill_suggestions_status_idx").on(t.status)],
);
