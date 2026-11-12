import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

/** 数据库连接。$client 是底层的 better-sqlite3 连接，备份和关闭连接时会用到。 */
export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/** 打开数据库并应用迁移。传入 ":memory:" 可得到测试用的内存库。 */
export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

export function dataDir(): string {
  return process.env.GALLEY_DATA_DIR ?? path.join(process.cwd(), "data");
}

// 开发模式下模块会被重复加载，把连接挂在 globalThis 上避免重复打开。
const holder = globalThis as unknown as { __galleyDb?: Db };

export const dbFile = () => path.join(dataDir(), "galley.db");

export function getDb(): Db {
  holder.__galleyDb ??= openDb(dbFile());
  return holder.__galleyDb;
}

/** 关闭当前的数据库连接。下一次 getDb() 会重新打开。恢复备份时要先关闭，才能替换数据库文件。 */
export function closeDb() {
  holder.__galleyDb?.$client.close();
  holder.__galleyDb = undefined;
}
