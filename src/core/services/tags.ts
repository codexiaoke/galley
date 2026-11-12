import { and, eq } from "drizzle-orm";
import type { Actor } from "../actor";
import type { Db } from "../db/client";
import { documentRevisions, documents } from "../db/schema";
import { forbidden, invalid, notFound } from "../errors";
import { normalizeTags, sameTag } from "../tags";
import { applyOwnerChange } from "./changeSets";
import { saveDocument } from "./documents";

/** 已发布的文章里用到的标签，以及每个标签有几篇文章。文章多的在前。 */
export function listTags(db: Db): { tag: string; count: number }[] {
  const rows = db
    .select({ tags: documentRevisions.tags })
    .from(documents)
    .innerJoin(documentRevisions, eq(documents.currentRevisionId, documentRevisions.id))
    .where(and(eq(documents.status, "published"), eq(documents.kind, "article")))
    .all();
  // 大小写不同的算同一个标签，显示第一次见到的写法。
  const counts = new Map<string, { tag: string; count: number }>();
  for (const { tags } of rows) {
    for (const tag of tags) {
      const entry = counts.get(tag.toLowerCase()) ?? { tag, count: 0 };
      entry.count++;
      counts.set(tag.toLowerCase(), entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
}

/**
 * 站长把一个标签改名，或者合并进另一个已有的标签（改成那个标签的名字就是合并）。to 为 null 表示删掉这个标签。
 *
 * 标签记在文章的版本上，所以这相当于站长直接修改了每一篇用到它的已发布文章：
 * 一起放进一条改动记录里，立即生效，留下新版本。只要有一篇正在别的改动里，就整体不做。
 */
export function renameTag(db: Db, actor: Actor, from: string, to: string | null) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以修改标签。");
  const target = to === null ? null : normalizeTags([to])[0];
  if (to !== null && !target) throw invalid("新的标签名不能为空。");
  if (target && target === from) throw invalid("新名字和原来的一样。");

  const affected = db
    .select({ id: documents.id, title: documentRevisions.title, summary: documentRevisions.summary, body: documentRevisions.body, tags: documentRevisions.tags })
    .from(documents)
    .innerJoin(documentRevisions, eq(documents.currentRevisionId, documentRevisions.id))
    .where(eq(documents.status, "published"))
    .all()
    .filter((doc) => doc.tags.some((t) => sameTag(t, from)));
  if (affected.length === 0) throw notFound(`没有已发布的文章用到标签「${from}」。`);

  const outcome = applyOwnerChange(
    db,
    actor,
    { kind: "document_edit", title: target ? `站长把标签「${from}」改为「${target}」` : `站长删除标签「${from}」` },
    (tx, changeSetId) => {
      for (const doc of affected) {
        const replaced = doc.tags.flatMap((t) => (sameTag(t, from) ? (target ? [target] : []) : [t]));
        // 合并到已有的标签时可能出现重复，normalizeTags 会去掉。
        const result = saveDocument(tx, actor, { changeSetId, documentId: doc.id, title: doc.title, summary: doc.summary, body: doc.body, tags: normalizeTags(replaced) });
        if (!result.saved) throw invalid(`文章「${doc.title}」现在的正文没有通过检查，没法顺带修改它的标签。请先修好这篇文章。`);
      }
      return affected.length;
    },
  );
  return { documents: outcome.result, slugs: outcome.applied ? outcome.affected.slugs : [] };
}
