import { z } from "zod";
import type { BlockType } from "../db/schema";

/**
 * 组件库。同一份定义有两个用途：
 * 1. 校验 Agent 提交的正文里的组件参数；
 * 2. 生成给 Agent 看的组件说明（通过 MCP 的 list_components）。
 */
export type ComponentDef = {
  name: string;
  /** leaf 写作 ::name{...}，container 写作 :::name{...} 内容 ::: */
  form: "leaf" | "container";
  description: string;
  example: string;
  params: z.ZodObject;
  /** 指向知识块的参数：参数名 -> 允许的知识块类型 */
  blockParams?: Record<string, BlockType[]>;
};

export const COMPONENTS: ComponentDef[] = [
  {
    name: "callout",
    form: "container",
    description: "提示框，用于需要读者特别注意的补充说明。",
    example: ":::callout{type=warning}\n这里是提示内容。\n:::",
    params: z.object({ type: z.enum(["info", "tip", "warning"]).default("info") }),
  },
  {
    name: "chart",
    form: "leaf",
    description: "把一个数据类知识块画成图表。第一列作为类别，其余列作为数值序列。",
    example: '::chart{data=d81k2mvv type=bar title="各系统支持 MCP 的时间"}',
    params: z.object({
      data: z.string(),
      type: z.enum(["bar", "line", "pie"]).default("bar"),
      title: z.string().optional(),
    }),
    blockParams: { data: ["data"] },
  },
];

const byName = new Map(COMPONENTS.map((c) => [c.name, c]));

export const getComponent = (name: string) => byName.get(name);

/** 正文里的内置标记名，不是组件。 */
export const BUILTIN_DIRECTIVES = ["cite", "value", "block"] as const;

export function describeComponents() {
  return COMPONENTS.map((c) => ({
    name: c.name,
    form: c.form,
    description: c.description,
    example: c.example,
    params: z.toJSONSchema(c.params),
  }));
}
