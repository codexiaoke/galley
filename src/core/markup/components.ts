import { z } from "zod";
import { ALGORITHM_NAMES, checkAlgorithmParams, describeAlgorithms, getAlgorithm } from "../algo";
import { parsePresets } from "../algo/presets";
import { TRACE_API_DOC } from "../algo/trace-doc";
import { SCENE_API_DOC } from "../scene/doc";
import { SCENE_RATIO_NAMES } from "../scene/types";
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

type AlgoParamsShape = { input?: string; presets?: string; target?: string; start?: string };

const PRESETS_HELP =
  "presets 可以给几组输入让读者切换：presets=\"随机=38,27,43,3|已经有序=3,27,38,43|全部相同=5,5,5,5\"（组之间用 |，名字和输入之间用 =）。讲最好、最坏情况时特别有用。有 presets 时可以不写 input。";

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
      "算法动画：给一个算法名和输入，页面上生成一个可以播放的演示，读者能播放、暂停、单步前进后退、调速度、拖进度条；每一步有一句说明，旁边的伪代码高亮正在执行的那一行，还显示变量的值。讲算法、讲数据结构时用，比一大段文字描述清楚得多。输入要小（排序 8 到 12 个数正合适），太大读者看不完。可用的算法和输入写法见下面的清单。" + PRESETS_HELP,
    example: '::algo{type=quick-sort input="38,27,43,3,9,82,10,55" title="快速排序是怎么分区的"}',
    params: z.object({
      type: z.enum(ALGORITHM_NAMES),
      input: z.string().optional(),
      presets: z.string().optional(),
      target: z.string().optional(),
      start: z.string().optional(),
      title: z.string().optional(),
    }),
    validate: (p) => checkAlgorithmParams([String(p.type)], p as AlgoParamsShape),
    details: () =>
      [
        "| type | 算法 | input 怎么写 | 例子 |",
        "|---|---|---|---|",
        ...describeAlgorithms().map((a) => `| ${a.type} | ${a.label} | ${a.input} | \`${a.example}\` |`),
      ].join("\n"),
  },
  {
    name: "notes",
    form: "container",
    description:
      "讲稿：只在演示模式和导出的视频里用，文章里不显示。放在某一页（某个二级标题下）里，演示时显示在演讲者视图，导出视频时作为这一页的字幕和朗读内容。写成口语，一页两三句，讲这一页最想让人记住的东西；不要照念页面上的字。",
    example: ":::notes\n这一页只看一件事：回调和 Promise 的区别，在于错误往哪里走。\n:::",
    params: z.object({}),
  },
  {
    name: "code-steps",
    form: "container",
    description:
      "代码一步一步演变，像幻灯片一样播放：每一步是一个代码块，代码块后面写这一步的讲解。切到下一步时，新加的行滑进来、删掉的行淡出去、没变的行平滑地挪到新位置，改动的行自动高亮（也可以在代码块后面写 {2-3} 指定高亮哪几行）。讲重构、讲一段代码是怎么一步步写出来的、讲新旧写法的区别时用。做成演示或者导出视频时，这是最适合的形式。每步的代码不超过 40 行，最多 12 步；每步只改一点，读者才跟得上。",
    example:
      ':::code-steps{title="从回调到 async/await"}\n```js\nfunction load(id, cb) {\n  db.get(id, (err, row) => {\n    if (err) return cb(err)\n    cb(null, row)\n  })\n}\n```\n最早的写法：结果通过回调传回来，错误要手动往外传。\n\n```js\nasync function load(id) {\n  const row = await db.get(id)\n  return row\n}\n```\n换成 async/await：读起来和同步代码一样，错误会自动抛出。\n:::',
    params: z.object({ title: z.string().optional() }),
  },
  {
    name: "race",
    form: "leaf",
    description:
      "算法比赛：两三种算法用同一组输入并排同时播放，每一边实时显示比较了几次、交换了几次、走了几步，先完成的停下等着。讲「为什么这个比那个快」时用，一眼就能看出差别。types 写两到三个算法名（逗号隔开），它们要能接受同样的输入，比如都是排序算法。" + PRESETS_HELP,
    example: '::race{types="bubble-sort,insertion-sort,quick-sort" presets="随机=38,27,43,3,9,82,10,55|已经有序=3,9,10,27,38,43,55,82"}',
    params: z.object({
      types: z.string(),
      input: z.string().optional(),
      presets: z.string().optional(),
      target: z.string().optional(),
      start: z.string().optional(),
      title: z.string().optional(),
    }),
    validate: (p) => {
      const names = String(p.types).split(/[,，\s]+/).filter(Boolean);
      if (names.length < 2 || names.length > 3) return ["race 的 types 要写两到三个算法名，用逗号隔开。"];
      const unknown = names.filter((n) => !getAlgorithm(n));
      if (unknown.length) return [`没有这些算法：${unknown.join("、")}。可用的见 algo 组件的清单。`];
      const views = new Set(names.map((n) => getAlgorithm(n)!.group));
      if (views.size > 1) return ["race 里的算法要是同一类的（比如都是排序），才能用同一组输入比较。"];
      return checkAlgorithmParams(names, p as AlgoParamsShape);
    },
  },
  {
    name: "trace",
    form: "container",
    description:
      "代码驱动的算法动画：里面写一段真正的 JavaScript，在关键的地方调用 compare、swap 这些函数，页面上就按代码实际运行的过程生成一个可以播放的演示，伪代码区显示的就是这段代码，高亮正在执行的那一行。代码改了，动画跟着变。内置算法（algo）里没有的、或者想演示自己写法的时候用。代码在服务器的沙箱里运行，有错误时保存会失败并告诉你第几行。可以调用的函数见下面的说明。" + PRESETS_HELP,
    example:
      ':::trace{title="冒泡排序" input="5,1,4,2,8"}\n```js\nconst a = array(input)\nfor (let i = 0; i < a.length - 1; i++) {\n  for (let j = 0; j < a.length - 1 - i; j++) {\n    vars({ i, j })\n    if (compare(j, j + 1) > 0) swap(j, j + 1)\n  }\n  mark(a.length - 1 - i, "sorted")\n}\nmark(0, "sorted")\nstep("排好了")\n```\n:::',
    params: z.object({ input: z.string().optional(), presets: z.string().optional(), title: z.string().optional() }),
    validate: (p) => parsePresets(p.presets as string | undefined).errors,
    details: () => TRACE_API_DOC,
  },
  {
    name: "scene",
    form: "container",
    description:
      "场景动画：用一段 JavaScript 摆出画面上的东西（方块、圆、文字、代码、箭头、边界框、媒体库里的图片，以及由代码算出来的任意线条和形状、坐标系和函数图像），再写若干步，每一步里让它们出现、移动、变色、变形、沿着线走、沿着连线发消息、推近镜头，配一句写给读者看的话。页面上是一个可以播放的动画：滚动到眼前自动播放，读者可以暂停、单步前进后退；演示模式里场景独占一页，每按一下方向键走一步。场景里还可以放读者能动手的东西：滑块（param）、能拖的点（handle）、点一下看说明（tip），读者一动，画面按新的数值重新算。每一步还可以另写一句讲稿（say）：讲的时候说的口语，演示里是字幕和提词，文章里不出现——它和写给读者的那句不是一回事，不能照抄。讲一个系统怎么运转、几样东西之间怎么来回、一件事的结构是怎么一步步搭起来的时候用；讲数学和数据（函数图像、曲线怎么变、点怎么动）、带着读者看一张截图上的几个地方，也用它——这类内容用文字要写好几段，用动画读者一眼就明白。只是「谁到谁」的静态流程用 flow 就够了；讲算法用 algo 或 trace。可以调用的函数见下面的说明。",
    example:
      ':::scene{title="页面和 Worker 之间怎么通信"}\n```js\nconst page = box("页面", { sub: "主线程", tone: "c2" })\nconst worker = box("Worker", { sub: "后台线程", tone: "c5" })\nrow([page, worker], { gap: 220 })\nconst ask = arrow(page, worker, { label: "postMessage", bend: -40 })\nconst answer = arrow(worker, page, { label: "结果", bend: -40 })\n\nstep("页面运行在主线程上，它一忙，界面就卡住。", () => {\n  say("先看页面自己。它只有一条主线程，画界面、响应点击、跑脚本，全挤在这一条上。")\n  show(page)\n})\nstep("所以把费时间的计算交给 Worker：一个独立的后台线程。", () => {\n  say("那重活怎么办？在旁边再开一条线程，这就是 Worker。")\n  show(worker, { from: "right" })\n})\nstep("两边不共享内存，只能互相发消息。页面把任务发过去。", () => {\n  say("不过这两条线程谁也碰不到谁的数据，想合作只能传话。你看，页面先把任务递过去。")\n  show(ask)\n  send(ask, { label: "任务" })\n  highlight(worker)\n})\nstep("Worker 算完，再把结果发回来。这期间页面一直能响应操作。", () => {\n  say("Worker 在那边慢慢算，算好了再把结果递回来。这段时间里，页面该点还能点，一点不卡。")\n  reset(worker)\n  show(answer)\n  send(answer, { label: "结果", tone: "c5" })\n  pulse(page)\n})\n```\n:::',
    params: z.object({ title: z.string().optional(), ratio: z.enum(SCENE_RATIO_NAMES).default("16:9") }),
    details: () => SCENE_API_DOC,
  },
  {
    name: "fold",
    form: "container",
    description: "折叠段落：默认收起，读者点标题展开。用来放大部分读者不需要看的细节，比如完整的配置文件、推导过程。",
    example: ':::fold{title="完整的配置文件"}\n```yaml\n...\n```\n:::',
    params: z.object({ title: z.string().min(1) }),
  },
  {
    name: "quiz",
    form: "container",
    description:
      "小测验：一道选择题，读者点选后马上知道对不对，再看解析。放在一节讲完之后，让读者确认自己真的懂了。先写题目，再写选项：正确的写成「- [x] 选项」，错误的写成「- [ ] 选项」，2 到 6 个；有几个正确选项就是几选，读者选完点「提交」。选项后面可以接一段解析，说明为什么。一个 quiz 一道题，错误选项要像样（常见的误解），不要一眼就能排除。演示模式里按一下右方向键揭晓答案。",
    example:
      ':::quiz\n本体和知识图谱是什么关系？\n\n- [ ] 本体就是知识图谱的另一种叫法\n- [x] 本体规定有哪些概念和关系，知识图谱按它装进具体的数据\n- [ ] 两者没有关系\n\n本体像表结构，知识图谱像表里的数据：先有骨架，再往里填。\n:::',
    params: z.object({ title: z.string().optional() }),
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
