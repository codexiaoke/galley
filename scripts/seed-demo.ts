/**
 * 往数据库里放几篇示例文章，方便查看前台的版面效果。
 * 用法：pnpm seed:demo
 * 已经存在的文章会跳过，可以重复运行。只用于本地查看，不要对正式的数据库运行。
 */
import { eq } from "drizzle-orm";
import { OWNER } from "../src/core/actor";
import { getDb } from "../src/core/db/client";
import { documentRevisions, documents } from "../src/core/db/schema";
import { createBlock } from "../src/core/services/blocks";
import { createCategory, findCategoryBySlug } from "../src/core/services/categories";
import { decideChangeSet, openChangeSet, submitChangeSet } from "../src/core/services/changeSets";
import { saveDocument } from "../src/core/services/documents";

type BlockSeed = { key: string; type: "opinion" | "experience" | "fact"; title: string; body: string; sources?: { url: string; title: string }[] };
type PostSeed = { slug: string; category: string; title: string; summary: string; publishedAt: string; blocks: BlockSeed[]; body: (ids: Record<string, string>) => string };

const CATEGORIES = [
  { slug: "ai-coding", name: "AI 编程" },
  { slug: "engineering", name: "工程实践" },
  { slug: "essays", name: "随笔" },
];

/** 不是由这个脚本创建、但需要归入分类的已有文章（之前验证流程时留下的示例）。 */
const BACKFILL: Record<string, string> = { "agent-run-blog": "ai-coding" };

const plain = (slug: string, category: string, title: string, summary: string, publishedAt: string, paragraphs: string[]): PostSeed => ({
  slug,
  category,
  title,
  summary,
  publishedAt,
  blocks: [],
  body: () => paragraphs.join("\n\n"),
});

const POSTS: PostSeed[] = [
  plain("skills-over-prompts", "ai-coding", "把提示词收进技能里", "同一段叮嘱抄进三个 Agent 的配置之后，我决定换个做法。", "2026-11-09", [
    "一开始我把运营博客的要求写成一大段提示词，贴进 Agent 的配置里。后来换了一个 Agent，又贴了一遍。再后来改了其中一条规则，才发现要改三个地方，而且已经有一处忘了改。",
    "技能解决的就是这个问题。把说明按任务拆开，存在站点这一侧，Agent 连上来的时候自己读。规则只有一份，改了就对所有 Agent 生效。",
    "这和软件里把配置集中管理是同一个道理，只是配置的读者从程序变成了模型。",
  ]),
  plain("sqlite-is-enough", "engineering", "个人站点用 SQLite 就够了", "少维护一个数据库服务，比多一点并发能力重要得多。", "2026-10-12", [
    "给个人项目选数据库的时候，很容易按照公司项目的习惯直接上一个独立的数据库服务。但个人站点的访问量和写入量，离需要它的程度差着几个数量级。",
    "SQLite 把整个数据库放在一个文件里。备份就是复制这个文件，迁移就是把它拷到另一台机器上。部署的时候不需要多启动一个服务，也就少了一个会在半夜出问题的东西。",
    "它当然有限制：不适合很多人同时写入。可是一个只有站长一个人在审稿的博客，本来就没有这个需求。",
  ]),
  plain("on-writing-slowly", "essays", "慢慢写", "工具让写作变快了，但想清楚一件事需要的时间并没有变短。", "2026-09-21", [
    "现在生成一篇文章只需要一分钟。可是我发现，真正花时间的部分一点没少：我到底想说什么，这个判断站不站得住，有没有更简单的讲法。",
    "这些事没有办法交出去。所以我给自己定的规矩是，观点必须是我自己的，写在素材里；怎么把它讲清楚，可以让 Agent 帮忙。",
    "写得快不是目的。写出来的东西过半年自己还愿意认，才是。",
  ]),
  {
    slug: "why-knowledge-blocks",
    category: "engineering",
    title: "为什么把博客做成知识库",
    summary: "文章会过期，但没有人会回头去改旧文章。把事实单独存起来，是让内容保持正确的前提。",
    publishedAt: "2026-10-28",
    blocks: [
      { key: "decay", type: "opinion", title: "技术文章过期很快", body: "技术文章的过期速度远比作者以为的快，而且过期之后几乎不会有人回头修改。" },
      { key: "once", type: "opinion", title: "事实核实一次即可", body: "一条事实只要核实过一次，之后所有引用它的文章都不必重新核实。" },
      { key: "burden", type: "experience", title: "手工维护引用关系不可行", body: "我试过手工记录每篇文章引用了哪些事实，坚持不到两周就放弃了。" },
    ],
    body: (b) =>
      [
        `写技术博客的人大概都有过这种经历：翻到自己一年前的文章，发现里面的版本号、接口名、甚至结论都已经不对了。:cite[技术文章的过期速度比我们以为的快得多，而过期之后几乎没有人会回去改]{b=${b.decay}}。`,
        "",
        "问题不在于懒。一篇文章是一整块文字，哪句话依赖哪条事实，写完之后只有作者自己记得，过几个月连作者也忘了。等某条事实变了，没有任何办法知道它影响了哪些文章。",
        "",
        "## 把事实从文章里拿出来",
        "",
        "解决办法是把文章拆成两层。一层是行文，是作者用自己的话讲的故事；另一层是行文所依赖的硬内容，比如事实、数据、代码和作者自己的判断。硬内容单独存放，行文只是引用它们。",
        "",
        `这样做的直接好处是省力。:cite[一条事实核实过一次，之后引用它的文章都不用再核实]{b=${b.once}}。写得越多，可以直接引用的内容就越多，新文章里需要重新查证的部分反而越来越少。`,
        "",
        "## 为什么以前没人这么做",
        "",
        `这个思路并不新，企业的技术文档领域用了几十年。它没有走进个人写作，是因为拆分和维护的负担太重。:cite[我自己试过手工记录引用关系，没坚持两周]{b=${b.burden}}。`,
        "",
        "> 让一件事变得可行的，往往不是新的想法，而是做这件事的成本降下来了。",
        "",
        "现在这部分工作可以交给 Agent。它不嫌烦，也不会忘记更新。人只需要做最后的判断：这条事实对不对，这段话该不该发。",
      ].join("\n"),
  },
  {
    slug: "review-is-the-bottleneck",
    category: "ai-coding",
    title: "审稿才是瓶颈",
    summary: "让 AI 写一篇文章只要一分钟，认真读完它却要十分钟。运营的设计应该围着审稿的人转。",
    publishedAt: "2026-11-05",
    blocks: [
      { key: "fatigue", type: "opinion", title: "审阅疲劳", body: "如果 Agent 提交改动的速度超过人能读的速度，人就会开始不看就批准。" },
      { key: "gate", type: "opinion", title: "发布应由程序把关", body: "Agent 能不能发布，应该由程序决定，而不是靠提示词里的一句叮嘱。" },
    ],
    body: (b) =>
      [
        "讨论 AI 写作的时候，大家的注意力都在生成这一头：写得像不像人，会不会编造。但真正用它运营一个博客，很快就会发现卡住的地方在另一头。",
        "",
        "生成是廉价的，审阅是昂贵的。一篇文章生成只要一分钟，认真读完、核对来源却要十分钟，而且这十分钟必须由人来花。",
        "",
        "## 不看就批准",
        "",
        `:cite[一旦改动提交的速度超过了人能读的速度，人就会开始不看就批准]{b=${b.fatigue}}。到那一步，所谓的人工把关就只剩下形式。`,
        "",
        "所以设计的重点应该是让每一次审阅尽量轻：",
        "",
        "- 相关的改动合并成一次，不要拆成十次来打扰；",
        "- 已经核实过的内容不要让人再看一遍；",
        "- 只改了错别字，就不要触发整篇重审；",
        "- 在手机上也能处理，利用碎片时间。",
        "",
        "## 把关不能靠自觉",
        "",
        `另一件容易被忽略的事是权限。:cite[Agent 能不能发布，应该由程序说了算，而不是靠提示词里的一句叮嘱]{b=${b.gate}}。提示词可以被绕过，可以被遗忘，也可以被一段恶意的输入覆盖；程序里不存在的功能，则怎么都调用不到。`,
      ].join("\n"),
  },
  {
    slug: "notes-on-typography",
    category: "essays",
    title: "关于这个站点的排版",
    summary: "纸张的底色、宋体、每行三十多个字。记录一下这些选择背后的理由。",
    publishedAt: "2025-12-20",
    blocks: [{ key: "measure", type: "opinion", title: "行宽的上限", body: "中文正文每行超过四十个字之后，眼睛换行时容易串行。" }],
    body: (b) =>
      [
        "这个站点的版面只有一个目标：让人愿意把一篇文章读完。",
        "",
        `所以栏宽是克制的。:cite[中文正文每行超过四十个字，换行时眼睛就容易串行]{b=${b.measure}}，屏幕再宽，也只是把字号和栏宽一起放大，不会让一行变得更长。`,
        "",
        "底色是暖的纸张色，而不是纯白。长时间阅读时，纯白的屏幕更像一盏灯，纸张色则更像一页纸。正文用宋体，是因为宋体的横细竖粗在大段文字里最容易辨认，也最接近我们读书时的经验。",
        "",
        "页面上除了文字几乎没有别的东西。没有侧栏，没有推荐，没有悬浮的按钮。站名只在页面最上方出现一次，往下读它就自然离开了视野。",
      ].join("\n"),
  },
];

const db = getDb();

for (const category of CATEGORIES) {
  if (!findCategoryBySlug(db, category.slug)) createCategory(db, OWNER, category);
}

/** 给还没有分类的已有示例文章补上分类。只用于示例数据，正常的修改要走变更集。 */
function backfillCategory(slug: string, categorySlug: string) {
  const doc = db.select().from(documents).where(eq(documents.slug, slug)).get();
  const category = findCategoryBySlug(db, categorySlug);
  if (!doc?.currentRevisionId || !category) return;
  const revision = db.select().from(documentRevisions).where(eq(documentRevisions.id, doc.currentRevisionId)).get();
  if (revision && !revision.categoryId) {
    db.update(documentRevisions).set({ categoryId: category.id }).where(eq(documentRevisions.id, revision.id)).run();
  }
}

let created = 0;
for (const post of POSTS) {
  if (db.select({ id: documents.id }).from(documents).where(eq(documents.slug, post.slug)).get()) {
    backfillCategory(post.slug, post.category);
    continue;
  }

  const cs = openChangeSet(db, OWNER, { kind: "article", title: `示例文章：${post.title}` });
  const ids: Record<string, string> = {};
  for (const block of post.blocks) {
    const result = createBlock(db, OWNER, { changeSetId: cs.id, type: block.type, title: block.title, body: block.body, sources: block.sources, confirmNew: true });
    if (!result.created) throw new Error(`知识块没有创建成功：${block.title}`);
    ids[block.key] = result.blockId;
  }
  const saved = saveDocument(db, OWNER, { changeSetId: cs.id, kind: "article", slug: post.slug, category: post.category, title: post.title, summary: post.summary, body: post.body(ids) });
  if (!saved.saved) throw new Error(`示例文章保存失败：${JSON.stringify(saved.issues)}`);
  submitChangeSet(db, OWNER, cs.id);
  decideChangeSet(db, OWNER, cs.id, "approve");
  // 示例文章需要不同的发布日期，才能看出目录按时间和年份排列的效果。
  db.update(documents).set({ publishedAt: new Date(`${post.publishedAt}T09:00:00`) }).where(eq(documents.id, saved.documentId)).run();
  created++;
}
for (const [slug, categorySlug] of Object.entries(BACKFILL)) backfillCategory(slug, categorySlug);

console.log(`新增 ${created} 篇示例文章，跳过 ${POSTS.length - created} 篇已存在的。运行中的服务需要重启才能看到。`);
