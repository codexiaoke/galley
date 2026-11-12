import { Activity, Bot, BookMarked, CircleCheck, CircleX, Link2, Plus } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { listAgents, recentAgentCalls } from "@/core/services/agents";
import { listSkills } from "@/core/skills";
import { addAgent, resetAgentToken, setAgentStatus } from "../../actions";
import { requireOwner } from "../../auth";
import { CopyBlock } from "../../copy";
import { ModalForm } from "../../modal";
import { Badge, Card, DetailRow, EmptyState, Field, formatRelative, formatTime, IconTile, INPUT, PageHeader, PageSkeleton, PrimaryCell, RowActions, Table } from "../../ui";

export default function AgentsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Agents />
    </Suspense>
  );
}

async function Agents() {
  await requireOwner();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const mcpUrl = `${proto}://${host}/mcp`;
  const codexConfig = `[mcp_servers.galley]\nurl = "${mcpUrl}"\nbearer_token_env_var = "GALLEY_TOKEN"`;
  const db = getDb();
  const agents = listAgents(db);
  const skills = listSkills();
  const calls = recentAgentCalls(db, 50);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="MCP 管理"
        description="Agent 通过 MCP 连接到这个站点。每个 Agent 有自己的访问密钥，可以随时停用。"
        actions={
          <ModalForm
            triggerLabel={
              <>
                <Plus size={16} />
                接入 Agent
              </>
            }
            triggerVariant="primary"
            title="接入一个 Agent"
            action={addAgent}
            submitLabel="接入"
          >
            <Field label="名称" hint="用来在记录里区分不同的 Agent，例如 Codex。">
              <input name="name" required placeholder="Codex" className={INPUT} />
            </Field>
          </ModalForm>
        }
      />

      <div className="space-y-6">
        <Card icon={Link2} title="连接信息" description="把这些填进 Agent 的配置里">
          <dl className="space-y-4">
            <DetailRow label="服务地址">
              <CopyBlock text={mcpUrl} />
            </DetailRow>
            <DetailRow label="Codex 配置">
              <CopyBlock text={codexConfig} multiline />
              <p className="mt-2 text-xs text-a-muted">访问密钥放在环境变量 GALLEY_TOKEN 里，不要写进配置文件。</p>
            </DetailRow>
          </dl>
        </Card>

        <Card icon={Bot} title="已接入的 Agent" flush footer={agents.length > 0 ? `共 ${agents.length} 个` : undefined}>
          <Table
            head={["Agent", "状态", "最近连接", "接入时间", ""]}
            empty={agents.length === 0 ? <EmptyState icon={Bot} title="还没有接入任何 Agent" hint="点右上角的「接入 Agent」，拿到访问密钥后配置到 Codex 里。" /> : undefined}
          >
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td>
                  <PrimaryCell leading={<IconTile icon={Bot} />} title={agent.name} />
                </td>
                <td>
                  {agent.disabled ? (
                    <Badge tone="red" dot>
                      已停用
                    </Badge>
                  ) : (
                    <Badge tone="green" dot>
                      可用
                    </Badge>
                  )}
                </td>
                <td className="text-a-muted" title={formatTime(agent.lastSeenAt)}>
                  {agent.lastSeenAt ? formatRelative(agent.lastSeenAt, now) : "从未连接"}
                </td>
                <td className="text-a-muted">{formatTime(agent.createdAt)}</td>
                <td>
                  <RowActions>
                    <ModalForm
                      triggerLabel="重新生成密钥"
                      triggerVariant="link"
                      title="重新生成访问密钥？"
                      action={resetAgentToken}
                      hidden={{ id: agent.id }}
                      submitLabel="重新生成"
                      submitVariant="danger"
                    >
                      <p>「{agent.name}」现在的密钥会立刻失效，使用旧密钥的 Agent 将无法连接，直到你把新密钥配置进去。</p>
                    </ModalForm>
                    {agent.disabled ? (
                      <ModalForm
                        triggerLabel="启用"
                        triggerVariant="link"
                        title="重新启用这个 Agent？"
                        action={setAgentStatus}
                        hidden={{ id: agent.id, disabled: "false" }}
                        submitLabel="启用"
                        successMessage="已启用"
                      >
                        <p>「{agent.name}」可以用原来的密钥重新连接。</p>
                      </ModalForm>
                    ) : (
                      <ModalForm
                        triggerLabel="停用"
                        triggerVariant="linkDanger"
                        title="停用这个 Agent？"
                        action={setAgentStatus}
                        hidden={{ id: agent.id, disabled: "true" }}
                        submitLabel="停用"
                        submitVariant="danger"
                        successMessage="已停用"
                      >
                        <p>「{agent.name}」会立刻无法连接。它已经提交的内容不受影响，之后可以重新启用。</p>
                      </ModalForm>
                    )}
                  </RowActions>
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card icon={BookMarked} title="下发的技能" description="Agent 连接后读取的运营说明" footer="技能目前保存在代码仓库的 skills 目录里，之后会改为在这里编辑。">
          <ul className="grid gap-3 md:grid-cols-2">
            {skills.map((skill) => (
              <li key={skill.name} className="flex gap-2.5 rounded-md p-3 shadow-[inset_0_0_0_1px_var(--a-border)]">
                <IconTile icon={BookMarked} />
                <div className="min-w-0">
                  <p className="font-medium">{skill.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-a-muted">{skill.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card icon={Activity} title="调用记录" description="最近 50 次" flush>
          <Table
            head={["工具", "Agent", "结果", "时间"]}
            empty={calls.length === 0 ? <EmptyState icon={Activity} title="还没有记录" hint="Agent 连接之后，它的每次调用都会出现在这里。" /> : undefined}
          >
            {calls.map((call) => (
              <tr key={call.id}>
                <td>
                  <span className="flex items-center gap-2">
                    {call.ok ? <CircleCheck size={15} className="shrink-0 text-a-success" /> : <CircleX size={15} className="shrink-0 text-a-danger" />}
                    <span className="font-mono text-xs">{call.tool}</span>
                  </span>
                  {call.error && <span className="mt-1 block pl-[23px] text-xs text-a-danger">{call.error}</span>}
                </td>
                <td className="whitespace-nowrap">{call.agentName}</td>
                <td>{call.ok ? <Badge tone="green">成功</Badge> : <Badge tone="red">被拒绝</Badge>}</td>
                <td className="whitespace-nowrap text-a-muted" title={formatTime(call.createdAt)}>
                  {formatRelative(call.createdAt, now)}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
