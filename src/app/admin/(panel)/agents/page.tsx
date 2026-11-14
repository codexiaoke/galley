import { Activity, Bot, CircleCheck, Download, CircleX, Link2, Plus } from "lucide-react";
import { Suspense } from "react";
import { getDb } from "@/core/db/client";
import { listAgents, recentAgentCalls } from "@/core/services/agents";
import { getSiteSettings } from "@/core/services/settings";
import { toolsFor } from "@/core/tools";
import { addAgent, resetAgentToken, saveAgentTools, setAgentPublish, setAgentStatus } from "../../actions";
import { requireOwner } from "../../auth";
import { CopyBlock } from "../../copy";
import { siteMcpUrl } from "../../mcp-url";
import { ModalForm } from "../../modal";
import { Badge, buttonClass, Card, DetailRow, EmptyState, Field, formatRelative, formatTime, IconTile, INPUT, PageHeader, PageSkeleton, PrimaryCell, RowActions, Table } from "../../ui";

export default function AgentsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Agents />
    </Suspense>
  );
}

async function Agents() {
  await requireOwner();
  const mcpUrl = await siteMcpUrl(getSiteSettings(getDb()).url);
  const codexConfig = `[mcp_servers.galley]\nurl = "${mcpUrl}"\nbearer_token_env_var = "GALLEY_TOKEN"\ndefault_tools_approval_mode = "approve"`;
  const db = getDb();
  const agents = listAgents(db);
  const tools = toolsFor("galley");
  const groups = [...new Set(tools.map((tool) => tool.group))];
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
            <DetailRow label="Codex 插件">
              <div className="flex flex-wrap items-center gap-3">
                {/* 普通链接而不是 Link：这是下载文件 */}
                <a href="/admin/plugin/codex" className={buttonClass("secondary")}>
                  <Download size={15} />
                  下载插件
                </a>
                <span className="text-xs leading-relaxed text-a-muted">已经填好本站的地址。装上之后不用手动改配置，还能在任何项目里说「记到博客素材」。安装步骤在压缩包里的 README。</span>
              </div>
            </DetailRow>
            <DetailRow label="手动配置 Codex">
              <CopyBlock text={codexConfig} multiline />
              <p className="mt-2 text-xs leading-relaxed text-a-muted">
                访问密钥放在环境变量 GALLEY_TOKEN 里，不要写进配置文件。最后一行让 Codex 调用本站的工具时不再逐次询问：定时自动运行时没有人能点批准，缺了这一行它什么都做不了。放行是安全的，因为这些工具里没有发布的能力，内容仍然要你在这里批准才会上线。
              </p>
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
                  {agent.canPublish && !agent.disabled && (
                    <span className="ml-2">
                      <Badge tone="amber">可直接上线</Badge>
                    </span>
                  )}
                </td>
                <td className="text-a-muted" title={formatTime(agent.lastSeenAt)}>
                  {agent.lastSeenAt ? formatRelative(agent.lastSeenAt, now) : "从未连接"}
                </td>
                <td className="text-a-muted">{formatTime(agent.createdAt)}</td>
                <td>
                  <RowActions>
                    <ModalForm
                      triggerLabel={agent.canPublish ? "收回上线权限" : "允许直接上线"}
                      triggerVariant="link"
                      title={agent.canPublish ? `收回「${agent.name}」的上线权限？` : `让「${agent.name}」可以直接上线？`}
                      action={setAgentPublish}
                      hidden={{ id: agent.id, canPublish: agent.canPublish ? "false" : "true" }}
                      submitLabel={agent.canPublish ? "收回" : "允许"}
                      successMessage={agent.canPublish ? "已收回" : "已允许"}
                    >
                      {agent.canPublish ? (
                        <p>收回之后，它写好的内容要重新经过你审阅才能上线。已经上线的不受影响。</p>
                      ) : (
                        <>
                          <p>
                            开了之后，「{agent.name}」写完可以自己让内容上线，<strong>不再经过你审阅</strong>。
                            适合你自己在旁边用的那个——人就在跟前，再去后台点一次批准只是麻烦。
                          </p>
                          <p className="text-a-muted">
                            定时自己跑的那个建议留着不开。这样上线的内容在看板和运营日志上会标出「没经过审阅」，
                            你事后照样看得到，也可以下线。权限随时能收回。
                          </p>
                        </>
                      )}
                    </ModalForm>
                    <ModalForm
                      triggerLabel={agent.disabledTools.length > 0 ? `工具（关了 ${agent.disabledTools.length} 个）` : "工具"}
                      triggerVariant="link"
                      title={`「${agent.name}」可以用的工具`}
                      action={saveAgentTools}
                      hidden={{ id: agent.id }}
                      successMessage="工具设置已保存"
                      wide
                    >
                      <p className="text-a-muted">取消勾选的工具，这个 Agent 就看不到也用不了。灰色的几个是运营流程离不开的，不能关。下次连接时生效。</p>
                      {groups.map((group) => (
                        <fieldset key={group}>
                          <legend className="mb-1.5 text-xs text-a-muted">{group}</legend>
                          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                            {tools.filter((tool) => tool.group === group).map((tool) => (
                              <label key={tool.name} className={`flex items-start gap-2 ${tool.required ? "text-a-muted" : ""}`}>
                                <input
                                  type="checkbox"
                                  name="tool"
                                  value={tool.name}
                                  defaultChecked={tool.required || !agent.disabledTools.includes(tool.name)}
                                  disabled={tool.required}
                                  className="mt-1 size-3.5 accent-[var(--a-primary)]"
                                />
                                <span className="min-w-0">
                                  <span className="block">{tool.label}</span>
                                  <span className="block font-mono text-[11px] text-a-muted">{tool.name}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                    </ModalForm>
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

        <Card icon={Activity} title="调用记录" description="最近 50 次" flush>
          <Table
            head={["工具", "Agent", "结果", "时间"]}
            empty={calls.length === 0 ? <EmptyState icon={Activity} title="还没有记录" hint="Agent 连接之后，它的每次调用都会出现在这里。" /> : undefined}
          >
            {calls.map((call) => (
              <tr key={call.id}>
                {/* 被拒绝时下面有一句原因，可能比较长，允许它换行 */}
                <td className="!whitespace-normal">
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
