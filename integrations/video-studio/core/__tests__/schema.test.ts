import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDb } from "../../../../src/core/db/client";
import { openStudioDb } from "../db";

/** 一张表在库里的样子：每一列的名字、类型、能不能为空、默认值、是不是主键；外键；索引。 */
function shape(sqlite: Database.Database, table: string) {
  // 列的先后不比：博客的列是一次次加上去的，工坊的迁移一次建好，顺序会不同，但列应该一样
  const columns = (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[])
    .map((column) => ({ ...column, cid: undefined }))
    .sort((x, y) => String(x.name).localeCompare(String(y.name)));
  const foreignKeys = (sqlite.prepare(`PRAGMA foreign_key_list(${table})`).all() as Record<string, unknown>[]).map((k) => ({ ...k, id: undefined, seq: undefined }));
  const indexes = (sqlite.prepare(`PRAGMA index_list(${table})`).all() as { name: string; unique: number }[])
    .filter((i) => !i.name.startsWith("sqlite_autoindex"))
    .map((i) => ({ name: i.name, unique: i.unique, columns: sqlite.prepare(`PRAGMA index_info(${i.name})`).all().map((c) => (c as { name: string }).name) }));
  return { columns, foreignKeys, indexes };
}

describe("工坊的数据库", () => {
  it("借用的 Agent、技能表和博客建出来的一模一样", () => {
    const blog = openDb(":memory:").$client;
    const studio = openStudioDb(":memory:").$client;
    for (const table of ["agents", "agent_calls", "skills", "skill_revisions", "skill_suggestions"]) {
      expect(shape(studio, table), `${table} 和博客的不一样，运行 pnpm db:generate:studio 重新生成工坊的迁移`).toEqual(shape(blog, table));
    }
  });

  it("博客的库里不再有工坊的表", () => {
    const tables = (openDb(":memory:").$client.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    expect(tables.filter((name) => name.startsWith("studio_"))).toEqual([]);
  });
});
