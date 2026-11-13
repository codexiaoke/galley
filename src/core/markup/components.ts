import { z } from "zod";
import { ALGORITHM_NAMES, checkAlgorithm, describeAlgorithms } from "../algo";
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
  /** 取知识块命名取值的参数：引用按"取值"记录，保存时检查这个取值存在 */
  valueKeyParam?: string;
  /** 指向媒体库图片的参数（值是 /media/ 开头的地址） */
  mediaParams?: string[];
  /** 只能写在哪个组件里面，例如 tab 只能放在 tabs 里 */
  inside?: string;
  /** 不在给 Agent 的组件清单里单独列出（说明写在外层组件里） */
  hidden?: boolean;
  /** 参数之间的检查（参数各自的格式由 params 检查），返回错误信息 */
  validate?: (params: Record<string, unknown>) => string[];
  /** 附加在说明后面的详细清单（Markdown），比如可用的算法 */
  details?: () => string;
};

const mediaUrl = z.string().regex(/^\/media\/[a-z0-9]+\.[a-z0-9]+$/, "只能用媒体库里的图片，地址以 /media/ 开头");

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
    description:
      "把一个数据类知识块画成图表，滚动到读者眼前时带生长动画。第一列作为类别，其余列作为数值序列。bar 横向柱状图，比较几样东西的大小（多列时并排分组）；line 折线图，看随时间的变化，第一列应当是时间（可以多条线）；pie 环形图，看各部分占整体的比例，只用第二列，三到六项最合适。",
    example: '::chart{data=d81k2mvv type=line title="每月的访问量"}',
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
  {
    name: "stat",
    form: "leaf",
    description:
      "关键数字：把事实块的一个命名取值放大显示，滚动到眼前时从 0 滚动到这个数，下面一行小字说明。连续写两三个会自动排成一行。只用于全文最想让读者记住的一两个数字，不要滥用。",
    example: '::stat{b=n5t2r8ye key=stars label="GitHub 星标"}\n::stat{b=n5t2r8ye key=contributors label="贡献者"}',
    params: z.object({ b: z.string(), key: z.string(), label: z.string() }),
    blockParams: { b: ["fact"] },
    valueKeyParam: "key",
  },
  {
    name: "steps",
    form: "container",
    description:
      "分步讲解一段代码：一边是步骤说明，一边是代码，读到哪一步就高亮哪几行。里面先放一个代码块（普通的 ``` 代码块，或者 ::block 嵌入的代码知识块），再写一个有序列表，每一项以花括号里的行号开头，后面是这一步的说明。三到六步最合适。",
    example:
      ":::steps\n```ts\nconst block = await getBlock(id);\nif (!block) return null;\nreturn render(block);\n```\n\n1. {1} 先按编号取出知识块。\n2. {2} 取不到时什么都不显示，不报错。\n3. {3} 最后交给渲染函数。\n:::",
    params: z.object({}),
  },
  {
    name: "flow",
    form: "container",
    description:
      "流程图：节点和连线依次出现，连线上有流动的小点表示走向。适合讲架构、讲一件事经过哪几个环节。里面写一个列表，每项一条连线：「甲 -> 乙」，要说明时写「甲 -> 乙: 说明」；也可以连写「甲 -> 乙 -> 丙」。节点最多 12 个，名字尽量短。",
    example: ":::flow\n- Agent -> MCP 接口: 提交变更集\n- MCP 接口 -> 站长: 等待审阅\n- 站长 -> 网站: 批准后发布\n:::",
    params: z.object({}),
  },
  {
    name: "tabs",
    form: "container",
    description:
      "标签页：几种并列的写法只显示一种，读者点标签切换。适合同一件事在不同系统、不同语言里的写法。外层用四个冒号 ::::tabs，里面每一页写成 :::tab{label=名字} 内容 :::（三个冒号）。外层的冒号必须比里层多。",
    example: "::::tabs\n:::tab{label=macOS}\n```bash\nbrew install sqlite\n```\n:::\n:::tab{label=Ubuntu}\n```bash\nsudo apt install sqlite3\n```\n:::\n::::",
    params: z.object({}),
  },
  {
    name: "tab",
    form: "container",
    description: "标签页里的一页，只能写在 tabs 里面。",
    example: ":::tab{label=macOS}\n内容\n:::",
    params: z.object({ label: z.string().min(1) }),
    inside: "tabs",
    hidden: true,
  },
  {
    name: "compare",
    form: "leaf",
    description: "前后对比：两张同样大小的图片叠在一起，读者左右拖动分隔线对比。适合改版前后、优化前后。两张图都要来自媒体库。",
    example: '::compare{before=/media/k2x9.png after=/media/p7q3.png beforeLabel="改版前" afterLabel="改版后"}',
    params: z.object({
      before: mediaUrl,
      after: mediaUrl,
      beforeLabel: z.string().default("之前"),
      afterLabel: z.string().default("之后"),
    }),
    mediaParams: ["before", "after"],
  },
  {
    name: "algo",
    form: "leaf",
    description:
      "算法动画：给一个算法名和输入，页面上生成一个可以播放的演示，读者能播放、暂停、单步前进后退、调速度、拖进度条；每一步有一句说明，旁边的伪代码高亮正在执行的那一行，还显示变量的值。讲算法、讲数据结构时用，比一大段文字描述清楚得多。输入要小（排序 8 到 12 个数正合适），太大读者看不完。可用的算法和输入写法见下面的清单。",
    example: '::algo{type=quick-sort input="38,27,43,3,9,82,10,55" title="快速排序是怎么分区的"}',
    params: z.object({
      type: z.enum(ALGORITHM_NAMES),
      input: z.string().min(1),
      target: z.string().optional(),
      start: z.string().optional(),
      title: z.string().optional(),
    }),
    validate: (p) => checkAlgorithm(String(p.type), { input: String(p.input), target: p.target as string | undefined, start: p.start as string | undefined }),
    details: () =>
      [
        "| type | 算法 | input 怎么写 | 例子 |",
        "|---|---|---|---|",
        ...describeAlgorithms().map((a) => `| ${a.type} | ${a.label} | ${a.input} | \`${a.example}\` |`),
      ].join("\n"),
  },
  {
    name: "fold",
    form: "container",
    description: "折叠段落：默认收起，读者点标题展开。用来放大部分读者不需要看的细节，比如完整的配置文件、推导过程。",
    example: ':::fold{title="完整的配置文件"}\n```yaml\n...\n```\n:::',
    params: z.object({ title: z.string().min(1) }),
  },
];

const byName = new Map(COMPONENTS.map((c) => [c.name, c]));

export const getComponent = (name: string) => byName.get(name);

/** 正文里的内置标记名，不是组件。 */
export const BUILTIN_DIRECTIVES = ["cite", "value", "block"] as const;

export function describeComponents() {
  return COMPONENTS.filter((c) => !c.hidden).map((c) => ({
    name: c.name,
    form: c.form,
    description: c.description,
    example: c.example,
    params: z.toJSONSchema(c.params),
    ...(c.details ? { details: c.details() } : {}),
  }));
}
