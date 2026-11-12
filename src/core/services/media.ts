import { desc, eq, inArray } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import type { Actor } from "../actor";
import { dataDir, type Db } from "../db/client";
import { changeSets, documentRevisions, documents, media } from "../db/schema";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { newId } from "../ids";
import type { MarkupIssue, ParsedImage } from "../markup/parse";

/**
 * 媒体库：站长上传的图片。
 *
 * 文件存在数据目录的 media 文件夹里，数据库里记一行。文件名由程序生成，
 * 类型靠文件内容的开头几个字节判断，不相信上传时的文件名和声明的类型。
 */

export type Media = typeof media.$inferSelect;

/** 单个文件的大小上限。 */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

/** 支持的图片格式，以及怎样从文件开头认出它。不支持 SVG：它可以带脚本。 */
const TYPES: { mime: string; ext: string; matches: (b: Uint8Array) => boolean }[] = [
  { mime: "image/png", ext: "png", matches: (b) => b[0] === 0x89 && ascii(b, 1, 4) === "PNG" },
  { mime: "image/jpeg", ext: "jpg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", ext: "gif", matches: (b) => ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a" },
  { mime: "image/webp", ext: "webp", matches: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
  { mime: "image/avif", ext: "avif", matches: (b) => ascii(b, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(b, 8, 12)) },
];

export const mediaDir = () => path.join(dataDir(), "media");

export function saveMedia(db: Db, actor: Actor, input: { bytes: Uint8Array; originalName?: string; alt?: string }): Media {
  if (actor.kind !== "owner") throw forbidden("只有站长可以上传图片。");
  const { bytes } = input;
  if (bytes.length === 0) throw invalid("请选择一张图片。");
  if (bytes.length > MAX_MEDIA_BYTES) throw invalid(`图片不能超过 ${MAX_MEDIA_BYTES / 1024 / 1024} MB。`);
  const type = TYPES.find((t) => bytes.length >= 12 && t.matches(bytes));
  if (!type) throw invalid("只支持 PNG、JPEG、GIF、WebP 和 AVIF 格式的图片。");

  const id = newId();
  const row: Media = {
    id,
    name: `${id}.${type.ext}`,
    mime: type.mime,
    size: bytes.length,
    alt: input.alt?.trim() ?? "",
    originalName: path.basename(input.originalName ?? "").slice(0, 200),
    createdAt: new Date(),
  };
  fs.mkdirSync(mediaDir(), { recursive: true });
  fs.writeFileSync(path.join(mediaDir(), row.name), bytes);
  db.insert(media).values(row).run();
  return row;
}

/** 哪些文档的正文里用到了哪些图片：线上的版本，加上还没结束的改动里的草稿。 */
function usage(db: Db): Map<string, Set<string>> {
  const current = db
    .select({ documentId: documents.id, body: documentRevisions.body })
    .from(documents)
    .innerJoin(documentRevisions, eq(documents.currentRevisionId, documentRevisions.id))
    .all();
  const drafts = db
    .select({ documentId: documentRevisions.documentId, body: documentRevisions.body })
    .from(documentRevisions)
    .innerJoin(changeSets, eq(documentRevisions.changeSetId, changeSets.id))
    .where(inArray(changeSets.status, ["open", "in_review", "rejected"]))
    .all();
  const used = new Map<string, Set<string>>();
  for (const { documentId, body } of [...current, ...drafts]) {
    for (const match of body.matchAll(/\/media\/([a-z0-9]+\.[a-z0-9]+)/g)) {
      if (!used.has(match[1])) used.set(match[1], new Set());
      used.get(match[1])!.add(documentId);
    }
  }
  return used;
}

export function listMedia(db: Db) {
  const used = usage(db);
  return db
    .select()
    .from(media)
    .orderBy(desc(media.createdAt))
    .all()
    .map((m) => ({ ...m, url: `/media/${m.name}`, usedBy: used.get(m.name)?.size ?? 0 }));
}

export function updateMediaAlt(db: Db, actor: Actor, id: string, alt: string) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以修改图片的说明。");
  const result = db.update(media).set({ alt: alt.trim() }).where(eq(media.id, id)).run();
  if (result.changes === 0) throw notFound("这张图片不存在。");
}

/** 删除图片。还有文章在用的不能删，否则文章里会出现一张打不开的图。 */
export function deleteMedia(db: Db, actor: Actor, id: string) {
  if (actor.kind !== "owner") throw forbidden("只有站长可以删除图片。");
  const row = db.select().from(media).where(eq(media.id, id)).get();
  if (!row) throw notFound("这张图片不存在。");
  const usedBy = usage(db).get(row.name)?.size ?? 0;
  if (usedBy > 0) throw conflict(`还有 ${usedBy} 篇文章在用这张图片，不能删除。先把它从文章里去掉。`);
  db.delete(media).where(eq(media.id, id)).run();
  fs.rmSync(path.join(mediaDir(), row.name), { force: true });
}

/** 按文件名找到一张图片在磁盘上的位置。只认数据库里登记过的文件名，所以不会读到别的文件。 */
export function findMediaFile(db: Db, name: string): { path: string; mime: string } | undefined {
  const row = db.select({ name: media.name, mime: media.mime }).from(media).where(eq(media.name, name)).get();
  return row && { path: path.join(mediaDir(), row.name), mime: row.mime };
}

/** 检查正文里引用的图片是不是都在媒体库里。 */
export function checkImages(db: Db, images: ParsedImage[]): MarkupIssue[] {
  if (images.length === 0) return [];
  const known = new Set(
    db
      .select({ name: media.name })
      .from(media)
      .where(inArray(media.name, [...new Set(images.map((i) => i.name))]))
      .all()
      .map((m) => m.name),
  );
  return images
    .filter((image) => !known.has(image.name))
    .map((image) => ({ level: "error" as const, message: `媒体库里没有 /media/${image.name} 这张图片。可用的图片用 list_media 查看。`, line: image.line }));
}
