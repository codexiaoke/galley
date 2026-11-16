import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as blogSchema from "../../../src/core/db/schema";
import type { Db } from "../../../src/core/db/client";

const MIGRATIONS_DIR = path.join(process.cwd(), "integrations/video-studio/drizzle");

/**
 * 打开工坊的数据库，应用工坊自己的迁移（记录在 __studio_migrations，和博客的 __drizzle_migrations 分开）。
 * 拆分以前工坊跑的是博客的迁移，库里还留着博客的表和迁移记录，用不到，也不去动它们。
 *
 * 返回值的类型沿用博客的 Db：工坊借用的 Agent、技能服务按这个类型收参数；工坊自己的表从 ./schema 引用。
 */
export function openStudioDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema: blogSchema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR, migrationsTable: "__studio_migrations" });
  return db as Db;
}
