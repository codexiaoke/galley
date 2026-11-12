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
  /** 指向站内文章的参数（值是文章的网址别名） */
  postParams?: string[];
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
  {
    name: "timeline",
    form: "container",
    description:
      "时间线，用来讲一件事按时间发展的经过。里面写一个列表，每一项以加粗的时间开头，后面是这个时间点发生的事。三项以上才值得用。",
    example: ":::timeline\n- **2025 年 3 月**　第一次试着让 Agent 写文章。\n- **2025 年 9 月**　改成知识块加引用的写法。\n- **2026 年 11 月**　开源。\n:::",
    params: z.object({}),
  },
  {
    name: "quote",
    form: "leaf",
    description:
      "把一个知识块作为引文突出显示，适合站长最核心的观点、或者需要读者停下来看一眼的原话。一篇文章最多用一两次。事实类知识块会带上出处。",
    example: "::quote{b=kqra7ywr}",
    params: z.object({ b: z.string() }),
    blockParams: { b: ["opinion", "experience", "fact", "concept"] },
  },
  {
    name: "post",
    form: "leaf",
    description: "站内另一篇已发布文章的卡片：标题、摘要和日期，点击进入那篇文章。用在「延伸阅读」或者需要读者先看另一篇的地方。",
    example: "::post{slug=why-knowledge-blocks}",
    params: z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "网址别名只能用小写字母、数字和连字符") }),
    postParams: ["slug"],
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
