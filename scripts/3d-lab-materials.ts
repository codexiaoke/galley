import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { OWNER } from "../src/core/actor";
import type { Db } from "../src/core/db/client";
import { listMedia, saveMedia } from "../src/core/services/media";

/** 例稿的资源占位符仅由种子脚本处理；播放器只接收文章中的真实媒体引用。 */
export function bindLabMaterials(db: Db, source: string) {
  const directory=path.join(process.cwd(),"examples/assets/materials");
  const manifest=JSON.parse(readFileSync(path.join(directory,"sources.json"),"utf8")) as {token:string;file:string;source:string}[];
  const existing=listMedia(db);
  let body=source;
  for (const entry of manifest) {
    const token=`__${entry.token}__`; if (!body.includes(token)) continue;
    const bytes=readFileSync(path.join(directory,entry.file));
    const originalName=`${createHash("sha256").update(bytes).digest("hex").slice(0,10)}-${entry.file}`;
    const row=existing.find((m)=>m.originalName===originalName) ?? saveMedia(db,OWNER,{bytes,originalName,alt:`三维材质 ${entry.file}`,family:"image"});
    body=body.replaceAll(token,`/media/${row.name}`);
  }
  return body;
}
