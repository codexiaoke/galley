import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { createBackup, exportContent, restoreBackup } from "../backup";
import { closeDb, getDb, type Db } from "../db/client";
import { GalleyError } from "../errors";
import { parseMarkup } from "../markup/parse";
import { authenticateAgent, createAgent } from "../services/agents";
import { decideChangeSet, openChangeSet, submitChangeSet } from "../services/changeSets";
import { getPublishedDocument, saveDocument } from "../services/documents";
import { deleteMedia, findMediaFile, listMedia, saveMedia } from "../services/media";
import { DEFAULT_SETTINGS, getSiteSettings, updateSiteSettings } from "../services/settings";
import { isSafeEntryName, packTar, unpackTar } from "../tar";

let db: Db;
let agent: Actor;
let dir: string;

/** 一张最小的 PNG：只有文件头，足够通过格式识别。 */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

function expectError(fn: () => unknown, code: GalleyError["code"], pattern?: RegExp) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GalleyError);
    expect((e as GalleyError).code).toBe(code);
    if (pattern) expect((e as GalleyError).message).toMatch(pattern);
    return;
  }
  throw new Error("预期会抛出错误，但没有");
}

function publish(slug: string, body: string) {
  const cs = openChangeSet(db, agent, { kind: "article", title: `新文章：${slug}` });
  const saved = saveDocument(db, agent, { changeSetId: cs.id, kind: "article", slug, title: slug, summary: "摘要", body });
  if (!saved.saved) throw new Error(`保存失败：${JSON.stringify(saved.issues)}`);
  submitChangeSet(db, agent, cs.id);
  decideChangeSet(db, OWNER, cs.id, "approve");
  return saved.documentId;
}

beforeEach(() => {
  // 这些功能要读写磁盘上的文件，所以每个测试用一个独立的临时数据目录。
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "galley-test-"));
  process.env.GALLEY_DATA_DIR = dir;
  db = getDb();
  agent = authenticateAgent(db, createAgent(db, OWNER, "测试 Agent").token)!;
});

afterEach(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.GALLEY_DATA_DIR;
});

describe("站点设置", () => {
  it("没设置过时是默认值；站长可以修改，Agent 不行", () => {
    expect(getSiteSettings(db)).toEqual(DEFAULT_SETTINGS);
    expectError(() => updateSiteSettings(db, agent, { name: "x" }), "forbidden");
    updateSiteSettings(db, OWNER, { name: " 程序员小柯 ", url: "https://example.com/blog/" });
    expect(getSiteSettings(db)).toMatchObject({ name: "程序员小柯", url: "https://example.com" });
    // 只改一项时，其他项保持不变。
    updateSiteSettings(db, OWNER, { author: "小柯" });
    expect(getSiteSettings(db)).toMatchObject({ name: "程序员小柯", author: "小柯", url: "https://example.com" });
  });

  it("拒绝空的网站名和不合法的网址", () => {
    expectError(() => updateSiteSettings(db, OWNER, { name: "  " }), "invalid");
    expectError(() => updateSiteSettings(db, OWNER, { url: "example.com" }), "invalid", /合法的网址/);
    expectError(() => updateSiteSettings(db, OWNER, { url: "ftp://example.com" }), "invalid", /http/);
    expect(updateSiteSettings(db, OWNER, { url: "" }).url).toBe("");
  });
});

describe("页脚文字", () => {
  it("可以写一段文字和一个链接；链接要是完整的 http(s) 网址，可以带路径", () => {
    expect(getSiteSettings(db)).toMatchObject({ footerText: "", footerUrl: "" });
    updateSiteSettings(db, OWNER, { footerText: "  京ICP备  12345678号  ", footerUrl: "https://beian.miit.gov.cn/#/Integrated/index" });
    expect(getSiteSettings(db)).toMatchObject({ footerText: "京ICP备 12345678号", footerUrl: "https://beian.miit.gov.cn/#/Integrated/index" });

    expectError(() => updateSiteSettings(db, OWNER, { footerUrl: "beian.miit.gov.cn" }), "invalid", /合法的网址/);
    expectError(() => updateSiteSettings(db, OWNER, { footerUrl: "javascript:alert(1)" }), "invalid", /http/);
    expectError(() => updateSiteSettings(db, OWNER, { footerText: "字".repeat(121) }), "invalid", /120/);

    // 只改别的设置时，页脚保持不变；清空就是不显示。
    updateSiteSettings(db, OWNER, { name: "新名字" });
    expect(getSiteSettings(db).footerText).toBe("京ICP备 12345678号");
    updateSiteSettings(db, OWNER, { footerText: "", footerUrl: "" });
    expect(getSiteSettings(db)).toMatchObject({ footerText: "", footerUrl: "" });
  });
});

describe("媒体库", () => {
  it("按文件内容认格式，文件名由程序生成", () => {
    const item = saveMedia(db, OWNER, { bytes: PNG, originalName: "../../evil.svg", alt: "一张图" });
    expect(item.name).toMatch(/^[a-z0-9]+\.png$/);
    expect(item.originalName).toBe("evil.svg");
    expect(fs.existsSync(path.join(dir, "media", item.name))).toBe(true);
    expect(findMediaFile(db, item.name)?.mime).toBe("image/png");
    // 没登记过的文件名一律找不到，哪怕磁盘上真有这个文件。
    expect(findMediaFile(db, "../galley.db")).toBeUndefined();
  });

  it("拒绝不是图片的文件、空文件和 Agent 的上传", () => {
    expectError(() => saveMedia(db, OWNER, { bytes: new TextEncoder().encode("<svg onload=alert(1)></svg>") }), "invalid", /只支持/);
    expectError(() => saveMedia(db, OWNER, { bytes: new Uint8Array() }), "invalid");
    expectError(() => saveMedia(db, agent, { bytes: PNG }), "forbidden");
  });

  it("正文只能引用媒体库里的图片", () => {
    const item = saveMedia(db, OWNER, { bytes: PNG, alt: "截图" });
    expect(parseMarkup("![外部](https://example.com/a.png)").issues[0].message).toMatch(/不在媒体库里/);
    expect(parseMarkup(`![截图](/media/${item.name})`).images).toEqual([{ name: item.name, line: 1 }]);

    const cs = openChangeSet(db, agent, { kind: "article", title: "带图的文章" });
    const base = { changeSetId: cs.id, kind: "article" as const, slug: "with-image", title: "带图" };
    const missing = saveDocument(db, agent, { ...base, body: "![没有的](/media/nope0000.png)" });
    expect(missing.saved).toBe(false);
    expect(missing.issues[0].message).toMatch(/媒体库里没有/);
    expect(saveDocument(db, agent, { ...base, body: `![截图](/media/${item.name})` }).saved).toBe(true);
  });

  it("还有文章在用的图片不能删", () => {
    const used = saveMedia(db, OWNER, { bytes: PNG });
    const unused = saveMedia(db, OWNER, { bytes: PNG });
    publish("uses-image", `![图](/media/${used.name})`);
    expect(listMedia(db).find((m) => m.id === used.id)?.usedBy).toBe(1);
    expectError(() => deleteMedia(db, OWNER, used.id), "conflict", /还有 1 篇文章/);
    deleteMedia(db, OWNER, unused.id);
    expect(fs.existsSync(path.join(dir, "media", unused.name))).toBe(false);
  });
});

describe("压缩包的读写", () => {
  it("写进去的文件能原样读出来", () => {
    const entries = [
      { name: "manifest.json", data: Buffer.from("{}") },
      { name: "media/abc.png", data: Buffer.from(PNG) },
      { name: "empty", data: Buffer.alloc(0) },
      { name: "exactly-one-block", data: Buffer.alloc(512, 7) },
    ];
    expect(unpackTar(packTar(entries))).toEqual(entries);
  });

  it("拒绝会写到目录外面的文件名", () => {
    for (const name of ["../evil", "/etc/passwd", "a/../../b", "a//b", ""]) expect(isSafeEntryName(name)).toBe(false);
    expect(isSafeEntryName("media/abc.png")).toBe(true);
    // 手工伪造一个名字不安全的压缩包：读的时候要拒绝。
    const forged = packTar([{ name: "aa/evil", data: Buffer.from("x") }]);
    forged.write("..", 0, "ascii");
    expect(() => unpackTar(forged)).toThrow(/不安全/);
  });
});

describe("备份与恢复", () => {
  it("恢复之后，内容、设置和图片都回到备份时的样子", () => {
    updateSiteSettings(db, OWNER, { name: "备份前的站名" });
    const image = saveMedia(db, OWNER, { bytes: PNG });
    publish("kept", `备份时就有的文章。\n\n![图](/media/${image.name})`);
    const { archive, filename } = createBackup(db, OWNER);
    expect(filename).toMatch(/^galley-backup-\d{8}-\d{6}\.tar\.gz$/);

    // 备份之后又改了一些东西。
    updateSiteSettings(db, OWNER, { name: "备份后改的站名" });
    publish("added-later", "备份之后才写的文章。");
    fs.rmSync(path.join(dir, "media", image.name));

    const { previousDataDir, manifest } = restoreBackup(OWNER, archive);
    expect(manifest.media).toBe(1);
    db = getDb();
    expect(getSiteSettings(db).name).toBe("备份前的站名");
    expect(getPublishedDocument(db, "kept")).toBeDefined();
    expect(getPublishedDocument(db, "added-later")).toBeUndefined();
    expect(fs.existsSync(path.join(dir, "media", image.name))).toBe(true);
    // 恢复前的数据没有删除，挪到了一边。
    expect(fs.existsSync(path.join(previousDataDir, "galley.db"))).toBe(true);
  });

  it("不是备份的文件、损坏的备份都不会动现有的数据", () => {
    publish("safe", "现有的文章。");
    expectError(() => restoreBackup(OWNER, Buffer.from("随便一个文件")), "invalid", /不是一份可以读取的备份/);
    const { archive } = exportContent(db, OWNER);
    expectError(() => restoreBackup(OWNER, archive), "invalid", /不是 Galley 的备份/);
    expectError(() => restoreBackup(agent, archive), "forbidden");
    expect(getPublishedDocument(getDb(), "safe")).toBeDefined();
    expect(fs.readdirSync(dir).filter((name) => name.startsWith("before-restore") || name.startsWith(".restore"))).toEqual([]);
  });

  it("只有站长可以备份和导出", () => {
    expectError(() => createBackup(db, agent), "forbidden");
    expectError(() => exportContent(db, agent), "forbidden");
  });

  it("导出的文章是带信息头的 Markdown", () => {
    publish("exported", "正文第一段。");
    const files = unpackTar(gunzipSync(exportContent(db, OWNER).archive));
    const post = files.find((f) => f.name === "posts/exported.md")!.data.toString("utf8");
    expect(post).toMatch(/^---\ntitle: "exported"\nslug: "exported"\nsummary: "摘要"\n/);
    expect(post).toMatch(/---\n\n正文第一段。\n$/);
    expect(files.map((f) => f.name)).toContain("blocks.json");
  });
});
