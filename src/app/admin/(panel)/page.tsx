import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  CircleCheck,
  CircleX,
  FilePen,
  FilePlus2,
  LayoutTemplate,
  PencilLine,
  RefreshCcw,
  Sparkles,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import type { ChangeSetStatus } from "@/core/db/schema";
import { recentAgentCalls } from "@/core/services/agents";
import { listBlocks } from "@/core/services/blocks";
import { listChangeSets } from "@/core/services/changeSets";
import { listDocuments, listStaleCitations } from "@/core/services/documents";
import { requireOwner } from "../auth";
import { Badge, Card, EmptyState, formatRelative, PageHeader, PageSkeleton, ROW_LINK, StatCard, Table, type Tone } from "../ui";

type Column = {
  status: ChangeSetStatus;
  title: string;
  hint: string;
  tone: Tone;
  /** 这一列没有卡片时显示的图标和说明 */
  empty: { icon: LucideIcon; title: string; hint: string };
};

const COLUMNS: Column[] = [
  {
    status: "open",
    title: "进行中",
    hint: "Agent 正在准备",
    tone: "neutral",
    empty: { icon: PencilLine, title: "没有进行中的改动", hint: "Agent 开始写稿或整理知识块时，会先出现在这里。" },
  },
  {
    status: "in_review",
    title: "待审",
    hint: "等你处理",
    tone: "blue",
    empty: { icon: CircleCheck, title: "都处理完了", hint: "Agent 提交新的改动后，会在这里等你审阅。" },
  },
  {
    status: "rejected",
    title: "已打回",
    hint: "等 Agent 修改",
    tone: "amber",
    empty: { icon: Undo2, title: "没有被打回的改动", hint: "你打回的改动会留在这里，直到 Agent 改好重新提交。" },
  },
  {
    status: "approved",
    title: "已上线",
    hint: "最近批准的",
    tone: "green",
    empty: { icon: BookOpenCheck, title: "还没有上线的内容", hint: "你批准的改动会出现在这里。" },
  },
];

/** "已上线"一列只显示最近的几张，其余的去文章页看，避免这一列比别的列长出一大截。 */
const RECENT_APPROVED = 3;

const KIND: Record<string, { label: string; icon: LucideIcon }> = {
  article: { label: "新文章", icon: FilePlus2 },
  document_edit: { label: "文章修改", icon: FilePen },
  page: { label: "页面调整", icon: LayoutTemplate },
  knowledge: { label: "知识整理", icon: Sparkles },
  block_update: { label: "知识更新", icon: RefreshCcw },
};

/** 每一列的淡底色：和这一列的状态标签同色，颜色很浅，只起区分的作用。 */
const LANE_BG: Record<Tone, string> = {
  neutral: "var(--a-tag-gray)",
  blue: "var(--a-tag-blue)",
  amber: "var(--a-tag-yellow)",
  green: "var(--a-tag-green)",
  red: "var(--a-tag-red)",
  purple: "var(--a-tag-purple)",
  orange: "var(--a-tag-orange)",
  pink: "var(--a-tag-pink)",
};

const KIND_TONE: Record<string, Tone> = { article: "blue", document_edit: "purple", page: "pink", knowledge: "green", block_update: "orange" };

export default function BoardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Board />
    </Suspense>
  );
}

async function Board() {
  await requireOwner();
  const db = getDb();
  const all = listChangeSets(db);
  const stale = listStaleCitations(db);
  const calls = recentAgentCalls(db, 8);
  const published = listDocuments(db).filter((d) => d.status === "published").length;
  const blockCount = listBlocks(db).length;
  const waiting = all.filter((c) => c.status === "in_review").length;
  const now = new Date();

  return (
    <>
      <PageHeader title="看板" description="Agent 提交的每一项改动都是一张卡片。只有你批准之后，内容才会上线。" />

      {/* 四个数字排成一行，中间用细线隔开，不做成四张卡片 */}
      <div className="mb-10 grid grid-cols-2 divide-a-border rounded-lg border border-a-border max-xl:[&>*:nth-child(-n+2)]:border-b max-xl:[&>*:nth-child(odd)]:border-r xl:grid-cols-4 xl:divide-x [&>*]:border-a-border">
        <StatCard label="待审" value={waiting} emphasis={waiting > 0 ? "primary" : undefined} hint={waiting > 0 ? "等你处理" : "没有待处理的改动"} />
        <StatCard label="已上线文章" value={published} hint="读者现在能看到的" />
        <StatCard label="知识块" value={blockCount} hint="已确认的事实、观点和代码" />
        <StatCard label="过期引用" value={stale.length} emphasis={stale.length > 0 ? "warning" : undefined} hint={stale.length > 0 ? "等 Agent 修订" : "所有引用都是最新的"} />
      </div>

      {/* 四列等高：每列一层很淡的底色，空的列用一句说明把高度撑满 */}
      <div className="mb-12 grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => {
          const inColumn = all.filter((c) => c.status === column.status);
          const cards = inColumn.slice(0, column.status === "approved" ? RECENT_APPROVED : 50);
          const rest = inColumn.length - cards.length;
          return (
            <section key={column.status} className="flex min-h-[19rem] flex-col rounded-lg p-2" style={{ background: `color-mix(in srgb, ${LANE_BG[column.tone]} 55%, transparent)` }}>
              <h2 className="mb-2 flex items-center gap-2 px-1 pt-0.5">
                <Badge tone={column.tone} dot>
                  {column.title}
                </Badge>
                <span className="text-xs tabular-nums text-a-muted">{inColumn.length}</span>
              </h2>

              {cards.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-4 pb-6 text-center">
                  <column.empty.icon size={22} strokeWidth={1.4} className="text-a-muted/60" />
                  <p className="mt-2.5 text-a-muted">{column.empty.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-a-muted/80">{column.empty.hint}</p>
                </div>
              ) : (
                <ul className="flex flex-1 flex-col gap-1.5">
                  {cards.map((cs) => {
                    const kind = KIND[cs.kind] ?? { label: cs.kind, icon: FilePen };
                    return (
                      <li key={cs.id}>
                        <Link
                          href={`/admin/change-sets/${cs.id}`}
                          className="admin-lift block rounded-md bg-a-surface px-3 py-2.5 shadow-[0_0_0_1px_rgb(15_15_15/0.07),0_1px_2px_rgb(15_15_15/0.05)]"
                        >
                          <span className="block font-medium leading-snug">{cs.title}</span>
                          <span className="mt-2 flex items-center gap-2">
                            <Badge tone={KIND_TONE[cs.kind] ?? "neutral"}>{kind.label}</Badge>
                            <span className="text-xs text-a-muted">{formatRelative(cs.submittedAt ?? cs.createdAt, now)}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                  {rest > 0 && (
                    <li className="mt-auto">
                      <Link
                        href={column.status === "approved" ? "/admin/documents" : "/admin"}
                        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-a-muted transition-colors duration-100 hover:bg-a-surface/70 hover:text-a-text"
                      >
                        {column.status === "approved" ? `查看全部文章，还有 ${rest} 篇` : `还有 ${rest} 条`}
                        <ArrowRight size={12} />
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="grid gap-x-10 gap-y-10 xl:grid-cols-2">
        <Card icon={TriangleAlert} title="过期引用" description="引用的知识块已经变化，等 Agent 修订" flush>
          <Table
            head={["文章", "受影响的句子", "原因"]}
            empty={stale.length === 0 ? <EmptyState icon={CircleCheck} title="没有需要修订的引用" hint="文章引用的知识块都是最新的。" /> : undefined}
          >
            {stale.map((s, i) => (
              <tr key={i}>
                <td>
                  <Link href={`/posts/${s.slug}`} target="_blank" className={ROW_LINK}>
                    {s.documentTitle}
                  </Link>
                </td>
                <td className="max-w-[11rem] truncate text-a-muted" title={s.spanText ?? undefined}>
                  {s.spanText}
                </td>
                <td>
                  <Badge tone="amber">{s.reason === "block_updated" ? "知识块已更新" : "被标记过期"}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          icon={Activity}
          title="Agent 最近的操作"
          description="通过 MCP 发起的调用"
          actions={
            <Link href="/admin/agents" className={ROW_LINK}>
              全部记录
              <ArrowRight size={13} />
            </Link>
          }
          flush
        >
          <Table head={["操作", "Agent", "时间"]} empty={calls.length === 0 ? <EmptyState icon={Activity} title="还没有记录" hint="Agent 连接之后，它的每次调用都会出现在这里。" /> : undefined}>
            {calls.map((call) => (
              <tr key={call.id}>
                <td>
                  <span className="flex items-center gap-2">
                    {call.ok ? <CircleCheck size={15} className="shrink-0 text-a-success" /> : <CircleX size={15} className="shrink-0 text-a-danger" />}
                    <span className="font-mono text-xs">{call.tool}</span>
                  </span>
                </td>
                <td>{call.agentName}</td>
                <td className="whitespace-nowrap text-a-muted">{formatRelative(call.createdAt, now)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
