import fs from "node:fs";
import { OWNER } from "@/core/actor";
import { storedBackupPath } from "@/core/auto-backup";
import { createBackup } from "@/core/backup";
import { getDb } from "@/core/db/client";
import { isOwner } from "../../auth";

const download = (filename: string, archive: Buffer) =>
  new Response(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(archive.length),
      "Cache-Control": "no-store",
    },
  });

/**
 * 下载完整备份。只有登录的站长可以。
 * 不带参数时现做一份；带 ?file= 时下载服务器上存着的那份自动备份。
 */
export async function GET(request: Request) {
  if (!(await isOwner())) return new Response("请先登录后台。", { status: 401 });
  const name = new URL(request.url).searchParams.get("file");
  if (name) {
    const file = storedBackupPath(name);
    if (!file) return new Response("没有这份备份。", { status: 404 });
    return download(name, fs.readFileSync(file));
  }
  const { filename, archive } = createBackup(getDb(), OWNER);
  return download(filename, archive);
}
