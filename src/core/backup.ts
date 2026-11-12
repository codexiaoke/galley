import Database from "better-sqlite3";
import { desc, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Actor } from "./actor";
import { closeDb, dataDir, dbFile, type Db } from "./db/client";
import { blockRevisions, blocks, categories, documentRevisions, documents, media } from "./db/schema";
import { forbidden, invalid } from "./errors";
import { newId } from "./ids";
import { mediaDir } from "./services/media";
import { packTar, unpackTar, type TarEntry } from "./tar";

/**
 * 备份、恢复和导出。
 *
 * - 备份：一个 .tar.gz，里面是数据库的一份完整快照和媒体库的全部图片。拿着它可以在任何地方把站点原样恢复出来。
 * - 恢复：用一份备份替换现在的全部数据。替换前的数据会挪到一边留着，不会直接删掉。
 * - 导出：把已发布的文章导出成 Markdown 文件，知识块导出成 JSON。给人看、给别的工具用，不能用来恢复。
 */

const FORMAT = 1;

type Manifest = { app: "galley"; format: number; createdAt: string; documents: number; blocks: number; media: number };

const count = (db: Db, table: typeof documents | typeof blocks | typeof media) => db.select({ id: table.id }).from(table).all().length;

export function createBackup(db: Db, actor: Actor): { filename: string; archive: Buffer } {
  if (actor.kind !== "owner") throw forbidden("只有站长可以备份站点。");
  // VACUUM INTO 写出的是某一时刻的完整数据库，备份进行时站点可以照常读写。
  fs.mkdirSync(dataDir(), { recursive: true });
  const snapshot = path.join(dataDir(), `.backup-${newId()}.db`);
  try {
    db.$client.prepare("VACUUM INTO ?").run(snapshot);
    const now = new Date();
    const images = db.select({ name: media.name }).from(media).all();
    const entries: TarEntry[] = [{ name: "galley.db", data: fs.readFileSync(snapshot) }];
    for (const { name } of images) {
      const file = path.join(mediaDir(), name);
      if (fs.existsSync(file)) entries.push({ name: `media/${name}`, data: fs.readFileSync(file) });
    }
    const manifest: Manifest = {
      app: "galley",
      format: FORMAT,
      createdAt: now.toISOString(),
      documents: count(db, documents),
      blocks: count(db, blocks),
      media: entries.length - 1,
    };
    entries.unshift({ name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) });
    const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
    return { filename: `galley-backup-${stamp}.tar.gz`, archive: gzipSync(packTar(entries, now.getTime())) };
  } finally {
    fs.rmSync(snapshot, { force: true });
  }
}

/** 读出一份备份里有什么，同时检查它是不是一份完好的 Galley 备份。 */
function readBackup(archive: Buffer): { manifest: Manifest; database: Buffer; images: TarEntry[] } {
  let entries: TarEntry[];
  try {
    entries = unpackTar(gunzipSync(archive));
  } catch {
    throw invalid("这不是一份可以读取的备份文件。请选择从「下载备份」得到的 .tar.gz 文件。");
  }
  const manifestEntry = entries.find((e) => e.name === "manifest.json");
  const database = entries.find((e) => e.name === "galley.db");
  if (!manifestEntry || !database) throw invalid("这不是 Galley 的备份文件。");
  let manifest: Manifest;
  try {
    manifest = JSON.parse(manifestEntry.data.toString("utf8"));
  } catch {
    throw invalid("备份文件里的说明信息已损坏。");
  }
  if (manifest.app !== "galley") throw invalid("这不是 Galley 的备份文件。");
  if (manifest.format > FORMAT) throw invalid("这份备份来自更新版本的 Galley，请先升级程序再恢复。");
  const images = entries.filter((e) => e.name !== "manifest.json" && e.name !== "galley.db");
  for (const image of images) {
    if (!/^media\/[a-z0-9]+\.[a-z0-9]+$/.test(image.name)) throw invalid(`备份里有不认识的文件：${image.name}`);
  }
  return { manifest, database: database.data, images };
}

/**
 * 用一份备份替换现在的全部数据。
 *
 * 先把备份解到一个临时目录里检查，确认数据库完好之后才动现有的数据；
 * 现有的数据不删除，整个挪到数据目录下的 before-restore-<时间> 文件夹里，恢复错了还能找回来。
 */
export function restoreBackup(actor: Actor, archive: Buffer): { manifest: Manifest; previousDataDir: string } {
  if (actor.kind !== "owner") throw forbidden("只有站长可以恢复备份。");
  const { manifest, database, images } = readBackup(archive);

  const root = dataDir();
  fs.mkdirSync(root, { recursive: true });
  const staging = path.join(root, `.restore-${newId()}`);
  fs.mkdirSync(path.join(staging, "media"), { recursive: true });
  try {
    fs.writeFileSync(path.join(staging, "galley.db"), database);
    for (const image of images) fs.writeFileSync(path.join(staging, image.name), image.data);

    // 打开看一眼：是不是完好的数据库，里面是不是我们的表。
    const check = new Database(path.join(staging, "galley.db"), { readonly: true });
    try {
      const integrity = check.pragma("integrity_check", { simple: true });
      const hasTables = check.prepare("select count(*) as n from sqlite_master where type = 'table' and name in ('documents', 'blocks', 'change_sets')").get() as { n: number };
      if (integrity !== "ok" || hasTables.n !== 3) throw invalid("备份里的数据库已损坏，没有恢复。现有的数据没有被改动。");
    } finally {
      check.close();
    }

    // 到这里才动现有的数据：关闭连接，把旧文件挪走，把新文件放进来。
    closeDb();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
    const previous = path.join(root, `before-restore-${stamp}`);
    fs.mkdirSync(previous, { recursive: true });
    for (const name of ["galley.db", "galley.db-wal", "galley.db-shm", "media"]) {
      const from = path.join(root, name);
      if (fs.existsSync(from)) fs.renameSync(from, path.join(previous, name));
    }
    fs.renameSync(path.join(staging, "galley.db"), dbFile());
    fs.renameSync(path.join(staging, "media"), mediaDir());
    return { manifest, previousDataDir: previous };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/** YAML 里的一个字符串值。JSON 的字符串写法在 YAML 里同样合法。 */
const yaml = (value: string) => JSON.stringify(value);

/**
 * 把内容导出成通用的格式：每篇已发布的文章一个 Markdown 文件（开头带标题、日期等信息），
 * 全部知识块一个 JSON 文件。正文里的引用标记原样保留。
 */
export function exportContent(db: Db, actor: Actor): { filename: string; archive: Buffer } {
  if (actor.kind !== "owner") throw forbidden("只有站长可以导出内容。");
  const posts = db
    .select({ doc: documents, rev: documentRevisions, category: categories.name })
    .from(documents)
    .innerJoin(documentRevisions, eq(documents.currentRevisionId, documentRevisions.id))
    .leftJoin(categories, eq(documentRevisions.categoryId, categories.id))
    .where(eq(documents.status, "published"))
    .orderBy(desc(documents.publishedAt))
    .all();
  const entries: TarEntry[] = posts.map(({ doc, rev, category }) => {
    const front = [
      "---",
      `title: ${yaml(rev.title)}`,
      `slug: ${yaml(doc.slug)}`,
      rev.summary ? `summary: ${yaml(rev.summary)}` : "",
      category ? `category: ${yaml(category)}` : "",
      rev.tags.length ? `tags: [${rev.tags.map(yaml).join(", ")}]` : "",
      doc.publishedAt ? `date: ${doc.publishedAt.toISOString()}` : "",
      `updated: ${rev.createdAt.toISOString()}`,
      "---",
      "",
    ].filter((line, i, all) => line !== "" || i === all.length - 1);
    return { name: `${doc.kind === "page" ? "pages" : "posts"}/${doc.slug}.md`, data: Buffer.from(`${front.join("\n")}\n${rev.body.trimEnd()}\n`) };
  });

  const blockRows = db
    .select({ block: blocks, rev: blockRevisions })
    .from(blocks)
    .innerJoin(blockRevisions, eq(blocks.currentRevisionId, blockRevisions.id))
    .all()
    .map(({ block, rev }) => ({
      id: block.id,
      type: block.type,
      status: block.status,
      visibility: block.visibility,
      title: rev.title,
      body: rev.body,
      data: rev.data,
      sources: rev.sources,
      updated: rev.createdAt.toISOString(),
    }));
  entries.push({ name: "blocks.json", data: Buffer.from(JSON.stringify(blockRows, null, 2)) });
  entries.push({
    name: "README.txt",
    data: Buffer.from(
      [
        "这是从 Galley 导出的内容。",
        "",
        "posts/      每篇已发布的文章一个 Markdown 文件，开头是标题、日期等信息。",
        "blocks.json 全部知识块。文章正文里 :cite[...]{b=编号} 这样的标记，编号对应这里的 id。",
        "",
        "这份导出是给人看、给别的工具用的，不包含修改历史和图片，不能用来恢复站点。",
        "要完整地搬家或恢复，请用后台的「下载备份」。",
        "",
      ].join("\n"),
    ),
  });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return { filename: `galley-export-${stamp}.tar.gz`, archive: gzipSync(packTar(entries)) };
}
