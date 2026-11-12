import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/core/db/client";

/** 健康检查：进程在运行，并且数据库能读。给 Docker 和监控用。 */
export async function GET() {
  // 等待真实的请求再检查，否则结果会在构建时被固定下来。
  await connection();
  try {
    getDb().run(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
