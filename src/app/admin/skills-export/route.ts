import { gzipSync } from "node:zlib";
import { getDb } from "@/core/db/client";
import { exportSkillFiles } from "@/core/services/skills";
import { packTar } from "@/core/tar";
import { isOwner } from "../auth";

/** 把全部技能导出成标准的技能文件夹，打包下载。 */
export async function GET() {
  if (!(await isOwner())) return new Response("请先登录后台。", { status: 401 });
  const entries = exportSkillFiles(getDb()).map((file) => ({ name: `galley-skills/${file.path}`, data: Buffer.from(file.content) }));
  return new Response(new Uint8Array(gzipSync(packTar(entries))), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": 'attachment; filename="galley-skills.tar.gz"',
      "Cache-Control": "no-store",
    },
  });
}
