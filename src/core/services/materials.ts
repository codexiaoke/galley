import { desc, eq, inArray, sql } from "drizzle-orm";
import { actorColumns, type Actor } from "../actor";
import type { Db } from "../db/client";
import { blockRevisions, blocks, materials, topics, type MaterialStatus } from "../db/schema";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { newId } from "../ids";

export type Material = typeof materials.$inferSelect;

/**
 * 往素材箱里放一条素材。站长在后台放，Agent 也可以替站长记：
 * 比如站长在别的项目里解决了一个问题，让 Agent 把过程摘要记下来。
 */
export function addMaterial(db: Db, actor: Actor, input: { content: string; url?: string; isPrivate?: boolean }): Material {
  const content = input.content.trim();
  if (!content) throw invalid("素材的内容不能为空。");
  const url = input.url?.trim() || null;
  if (url && !/^https?:\/\//i.test(url)) throw invalid("链接需要以 http:// 或 https:// 开头。");
  const who = actorColumns(actor);
  const row: Material = {
    id: newId(),
    content,
    url,
    isPrivate: input.isPrivate ?? false,
    status: "new",
    processedNote: null,
    createdByKind: who.kind,
    createdById: who.id,
    createdAt: new Date(),
    processedAt: null,
  };
  db.insert(materials).values(row).run();
  return row;
}

/** 一条素材整理出了什么：知识块和选题。 */
export function materialOutputs(db: Db, materialId: string) {
  const blockRows = db
    .select({ id: blocks.id, type: blocks.type, status: blocks.status, title: blockRevisions.title })
    .from(blocks)
    .innerJoin(blockRevisions, eq(blockRevisions.blockId, blocks.id))
    .where(eq(blocks.originMaterialId, materialId))
    .orderBy(desc(blockRevisions.revNo))
    .all();
  // 每个知识块只取最新的一个版本的标题。
  const seen = new Set<string>();
  const outputBlocks = blockRows.filter((b) => !seen.has(b.id) && seen.add(b.id));
  const outputTopics = db
    .select({ id: topics.id, title: topics.title, status: topics.status })
    .from(topics)
    .where(eq(topics.originMaterialId, materialId))
    .all();
  return { blocks: outputBlocks, topics: outputTopics };
}

export function listMaterials(db: Db, filter: { status?: MaterialStatus[] } = {}) {
  const rows = db
    .select()
    .from(materials)
    .where(filter.status ? inArray(materials.status, filter.status) : undefined)
    // 同一毫秒里放进来的几条（比如批量写入），按写入顺序排。
    .orderBy(desc(materials.createdAt), sql`${materials}.rowid desc`)
    .all();
  const blockCounts = new Map(
    db
      .select({ id: blocks.originMaterialId, n: sql<number>`count(*)` })
      .from(blocks)
      .groupBy(blocks.originMaterialId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  const topicCounts = new Map(
    db
      .select({ id: topics.originMaterialId, n: sql<number>`count(*)` })
      .from(topics)
      .groupBy(topics.originMaterialId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  return rows.map((m) => ({ ...m, blockCount: blockCounts.get(m.id) ?? 0, topicCount: topicCounts.get(m.id) ?? 0 }));
}

export function getMaterial(db: Db, id: string) {
  const material = db.select().from(materials).where(eq(materials.id, id)).get();
  if (!material) throw notFound(`素材 ${id} 不存在。`);
  return { ...material, outputs: materialOutputs(db, id) };
}

/** 标记一条素材已经处理完，并留一句说明：整理成了什么，或者为什么没有可用的内容。 */
export function markMaterialProcessed(db: Db, actor: Actor, id: string, note?: string) {
  const material = db.select().from(materials).where(eq(materials.id, id)).get();
  if (!material) throw notFound(`素材 ${id} 不存在。`);
  if (material.status === "archived") throw conflict("这条素材已经归档。");
  const processedNote = note?.trim() || null;
  if (actor.kind === "agent" && !processedNote) throw invalid("请写一句说明：整理成了什么，或者为什么没有可用的内容。");
  db.update(materials).set({ status: "processed", processedNote, processedAt: new Date() }).where(eq(materials.id, id)).run();
  return { materialId: id, status: "processed" as const, outputs: materialOutputs(db, id) };
}

/** 站长改变一条素材的状态：重新放回未处理，或者归档不再出现在待办里。 */
export function setMaterialStatus(db: Db, actor: Actor, id: string, status: MaterialStatus) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以改变素材的状态。");
  const result = db
    .update(materials)
    .set(status === "new" ? { status, processedNote: null, processedAt: null } : { status })
    .where(eq(materials.id, id))
    .run();
  if (result.changes === 0) throw notFound(`素材 ${id} 不存在。`);
}

/** 删除素材。已经整理出知识块或选题的不能删，否则这些内容就失去了出处。 */
export function deleteMaterial(db: Db, actor: Actor, id: string) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以删除素材。");
  const outputs = materialOutputs(db, id);
  if (outputs.blocks.length + outputs.topics.length > 0) {
    throw conflict("这条素材已经整理出了知识块或选题，不能删除。可以把它归档。");
  }
  const result = db.delete(materials).where(eq(materials.id, id)).run();
  if (result.changes === 0) throw notFound(`素材 ${id} 不存在。`);
}
