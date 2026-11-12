import { revalidateTag } from "next/cache";
import { OWNER } from "@/core/actor";
import { restoreBackup } from "@/core/backup";
import { GalleyError } from "@/core/errors";
import { PUBLIC_CONTENT_TAG } from "../../../data";
import { isOwner } from "../../auth";

/**
 * 从备份恢复：用上传的备份替换现在的全部数据。只有登录的站长可以。
 *
 * 备份文件可能比较大，所以走普通的上传接口，而不是有大小限制的服务端操作。
 * 登录的 cookie 设了 SameSite=Lax，别的网站发起的 POST 带不上它，所以不会被跨站伪造。
 */
export async function POST(request: Request) {
  if (!(await isOwner())) return Response.json({ error: "请先登录后台。" }, { status: 401 });
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "请选择一份备份文件。" }, { status: 400 });
  try {
    const { manifest, previousDataDir } = restoreBackup(OWNER, Buffer.from(await file.arrayBuffer()));
    // 前台的页面是带缓存的，数据整个换掉之后要全部刷新。
    revalidateTag(PUBLIC_CONTENT_TAG, "max");
    return Response.json({ ok: true, manifest, previousDataDir });
  } catch (e) {
    if (e instanceof GalleyError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
