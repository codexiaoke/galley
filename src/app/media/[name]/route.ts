import fs from "node:fs/promises";
import { getDb } from "@/core/db/client";
import { findMediaFile } from "@/core/services/media";

/**
 * 媒体库里的图片。文件名是程序生成的、不会重复，所以内容永远不变，可以让浏览器长期缓存。
 * nosniff 让浏览器只按我们声明的类型处理它，不去猜。
 */
export async function GET(_request: Request, context: RouteContext<"/media/[name]">) {
  const { name } = await context.params;
  const file = findMediaFile(getDb(), name);
  if (!file) return new Response("Not found", { status: 404 });
  try {
    const bytes = await fs.readFile(file.path);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
