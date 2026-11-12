import { z } from "zod";
import type { BlockSource, BlockType } from "../db/schema";
import { invalid } from "../errors";

const sourceSchema = z.object({
  url: z.url(),
  title: z.string().optional(),
  /** 来源里支持该说法的原文摘录 */
  quote: z.string().optional(),
  accessedAt: z.string().optional(),
});

/** 各类型知识块的专有字段。 */
export const BLOCK_DATA_SCHEMAS = {
  fact: z.object({
    /** 事实成立的日期 */
    asOf: z.string().optional(),
    /** 建议复查的日期 */
    reviewAfter: z.string().optional(),
    /** 可以被文章单独取用的命名取值，例如 { version: "16.4" } */
    values: z.record(z.string(), z.string()).optional(),
  }),
  concept: z.object({ term: z.string().min(1), aliases: z.array(z.string()).optional() }),
  code: z.object({ language: z.string().min(1), code: z.string().min(1) }),
  data: z.object({
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.union([z.string(), z.number()]))),
    unit: z.string().optional(),
    asOf: z.string().optional(),
  }),
  opinion: z.object({ formedAt: z.string().optional() }),
  experience: z.object({ when: z.string().optional() }),
} satisfies Record<BlockType, z.ZodObject>;

/** 这些类型的内容来自外部，必须给出来源。观点和经历的来源是站长本人。 */
const SOURCE_REQUIRED: BlockType[] = ["fact", "data"];

export type BlockContent = {
  title: string;
  body: string;
  data: Record<string, unknown>;
  sources: BlockSource[];
};

export function validateBlockContent(
  type: BlockType,
  input: { title: string; body: string; data?: unknown; sources?: unknown },
): BlockContent {
  const problems: string[] = [];
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) problems.push("title 不能为空");
  if (!body) problems.push("body 不能为空");

  const data = BLOCK_DATA_SCHEMAS[type].safeParse(input.data ?? {});
  if (!data.success) {
    for (const i of data.error.issues) problems.push(`data.${i.path.join(".")}: ${i.message}`);
  }
  const sources = z.array(sourceSchema).safeParse(input.sources ?? []);
  if (!sources.success) {
    for (const i of sources.error.issues) problems.push(`sources.${i.path.join(".")}: ${i.message}`);
  } else if (SOURCE_REQUIRED.includes(type) && sources.data.length === 0) {
    problems.push(`${type} 类型的知识块至少需要一个来源`);
  }

  if (problems.length > 0 || !data.success || !sources.success) {
    throw invalid(`知识块内容不合法：${problems.join("；")}`, problems);
  }
  return { title, body, data: data.data as Record<string, unknown>, sources: sources.data };
}

/** 取出事实块的命名取值。其他类型没有取值。 */
export function blockValues(type: BlockType, data: Record<string, unknown>): Record<string, string> {
  if (type !== "fact") return {};
  return (data.values as Record<string, string> | undefined) ?? {};
}
