import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { actorColumns, type Actor } from "../actor";
import type { Db } from "../db/client";
import { materials, topics, type TopicStatus } from "../db/schema";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { newId } from "../ids";
import { openChangeSet } from "./changeSets";

export type Topic = typeof topics.$inferSelect;

/**
 * 新建选题。
 * Agent 提出的是候选（proposed），要站长采纳才能写；站长自己加的直接进入可写的队列（accepted）。
 * 写什么由站长决定，这和"发布由站长把关"是同一个道理。
 */
export function createTopic(db: Db, actor: Actor, input: { title: string; note?: string; materialId?: string; priority?: number }): Topic {
  const title = input.title.trim();
  if (!title) throw invalid("选题需要一个标题。");
  if (input.materialId && !db.select({ id: materials.id }).from(materials).where(eq(materials.id, input.materialId)).get()) {
    throw notFound(`素材 ${input.materialId} 不存在。`);
  }
  const who = actorColumns(actor);
  const row: Topic = {
    id: newId(),
    title,
    note: input.note?.trim() ?? "",
    status: actor.kind === "owner" ? "accepted" : "proposed",
    priority: actor.kind === "owner" && Number.isFinite(input.priority) ? Math.trunc(input.priority!) : 0,
    originMaterialId: input.materialId ?? null,
    changeSetId: null,
    createdByKind: who.kind,
    createdById: who.id,
    createdAt: new Date(),
  };
  db.insert(topics).values(row).run();
  return row;
}

export function listTopics(db: Db, filter: { status?: TopicStatus[] } = {}): Topic[] {
  return db
    .select()
    .from(topics)
    .where(filter.status ? inArray(topics.status, filter.status) : undefined)
    .orderBy(desc(topics.priority), asc(topics.createdAt), sql`${topics}.rowid asc`)
    .all();
}

function requireTopic(db: Db, id: string): Topic {
  const topic = db.select().from(topics).where(eq(topics.id, id)).get();
  if (!topic) throw notFound(`选题 ${id} 不存在。`);
  return topic;
}

/** 站长修改选题的标题、说明和优先级。 */
export function updateTopic(db: Db, actor: Actor, id: string, input: { title: string; note?: string; priority?: number }) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以修改选题。");
  const topic = requireTopic(db, id);
  const title = input.title.trim();
  if (!title) throw invalid("选题需要一个标题。");
  const priority = Number.isFinite(input.priority) ? Math.trunc(input.priority!) : topic.priority;
  db.update(topics).set({ title, note: input.note?.trim() ?? "", priority }).where(eq(topics.id, id)).run();
}

/** 站长对选题做决定：采纳（可以写了）、不写、或者把不写的重新放回队列。 */
export function decideTopic(db: Db, actor: Actor, id: string, decision: "accept" | "drop") {
  if (actor.kind !== "owner") throw forbidden("只有站长可以决定写不写某个选题。");
  const topic = requireTopic(db, id);
  if (topic.status === "in_progress") throw conflict("这个选题已经有 Agent 在写了。要取消，请先在看板上处理对应的改动。");
  if (topic.status === "done") throw conflict("这个选题已经写完了。");
  db.update(topics).set({ status: decision === "accept" ? "accepted" : "dropped" }).where(eq(topics.id, id)).run();
}

/**
 * Agent 领取一个已采纳的选题，开始写。会开一个与选题关联的变更集并返回。
 * 变更集被批准后选题自动完成；被撤回后选题回到队列。
 */
export function claimTopic(db: Db, actor: Actor, id: string) {
  const topic = requireTopic(db, id);
  if (topic.status !== "accepted") {
    const why: Record<TopicStatus, string> = {
      proposed: "它还是候选，要等站长采纳",
      accepted: "",
      in_progress: "它已经被领取了",
      done: "它已经写完了",
      dropped: "站长决定不写它",
    };
    throw conflict(`选题「${topic.title}」现在不能领取：${why[topic.status]}。`);
  }
  return db.transaction((tx) => {
    const changeSet = openChangeSet(tx as unknown as Db, actor, {
      kind: "article",
      title: `新文章：${topic.title}`,
      summary: topic.note,
      topicId: topic.id,
    });
    tx.update(topics).set({ status: "in_progress", changeSetId: changeSet.id }).where(eq(topics.id, id)).run();
    return { topic: { ...topic, status: "in_progress" as const, changeSetId: changeSet.id }, changeSet };
  });
}
