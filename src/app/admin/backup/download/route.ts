import { OWNER } from "@/core/actor";
import { createBackup } from "@/core/backup";
import { getDb } from "@/core/db/client";
import { isOwner } from "../../auth";

/** 下载完整备份。只有登录的站长可以。 */
export async function GET() {
  if (!(await isOwner())) return new Response("请先登录后台。", { status: 401 });
  const { filename, archive } = createBackup(getDb(), OWNER);
  return new Response(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(archive.length),
      "Cache-Control": "no-store",
    },
  });
}
