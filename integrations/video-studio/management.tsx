import { Settings2 } from "lucide-react";
import { Badge, DetailRow, Field, INPUT, PageHeader, RowActions, Table } from "../../src/app/admin/ui";
import { Modal, ModalForm } from "../../src/app/admin/modal";
import type { ToolInfo } from "../../src/core/tools";
import { request, run } from "./actions";
import { fromDisplay, PRODUCTION_FIELDS, toDisplay, type Production, type ProductionOverride } from "./core/production";

export type Config = { galley: string; hasToken: boolean; production: Production; ttsServer: string; ttsFound: boolean; dir: string };
export type Agent = { id: string; name: string; disabled: boolean; canPublish: boolean; disabledTools: string[] };
export type AgentData = { agents: Agent[]; tools: ToolInfo[]; calls: { id: string; agentName: string; tool: string; ok: boolean; error: string | null; createdAt: string }[] };
const shown = (key: keyof Production, value: number) => `${toDisplay(key, value)} ${PRODUCTION_FIELDS.find((field) => field.key === key)!.unit}`;

/**
 * 成片设置的输入框。给了 defaults 就是项目里的单独设置：留空的项跟着工坊默认值。
 * 毫秒的项按秒填写。
 */
export function ProductionFields({ value, defaults }: { value: ProductionOverride; defaults?: Production }) {
  return <fieldset className="space-y-3 border-t border-a-border pt-3">
    <legend className="pt-3 font-medium">成片设置</legend>
    {defaults && <p className="text-xs text-a-muted">留空的项跟着工坊默认值。改了只影响之后的预览和导出，不用重新部署博客。</p>}
    {PRODUCTION_FIELDS.map((field) => <Field key={field.key} label={`${field.label}（${field.unit}）`}>
      <input name={`production-${field.key}`} type="number" className={INPUT} step={field.step}
        min={field.key === "zoomMax" ? 1 : field.key === "coverMs" || field.key === "endingMs" ? 0.3 : 0} max={field.key === "zoomMax" ? 3 : field.key === "coverMs" || field.key === "endingMs" ? 10 : field.key === "speechTailMs" ? 3 : 2}
        defaultValue={value[field.key] === undefined ? "" : toDisplay(field.key, value[field.key]!)} required={!defaults}
        placeholder={defaults ? `默认 ${shown(field.key, defaults[field.key])}` : undefined} />
    </Field>)}
  </fieldset>;
}

/** 读出 ProductionFields 填的值；partial 时留空的项不写 */
export function readProduction(form: FormData, partial: true): ProductionOverride;
export function readProduction(form: FormData, partial?: false): Production;
export function readProduction(form: FormData, partial = false) {
  return Object.fromEntries(PRODUCTION_FIELDS.flatMap((field) => {
    const raw = String(form.get(`production-${field.key}`) ?? "").trim();
    return raw === "" && partial ? [] : [[field.key, fromDisplay(field.key, Number(raw))]];
  }));
}

export function Settings({ config, refresh }: { config: Config; refresh: () => Promise<void> }) {
  return <Modal triggerLabel={<><Settings2 size={15} />工坊设置</>} title="工坊设置">
    <dl className="space-y-4"><DetailRow label="连接站点"><span className="break-all">{config.galley || "未连接，请配置线上站点"}</span></DetailRow><DetailRow label="访问密钥"><Badge tone={config.hasToken ? "green" : "neutral"}>{config.hasToken ? "已配置" : "未配置（选填）"}</Badge></DetailRow><DetailRow label="配音服务">{config.ttsServer} · {config.ttsFound ? "已配置" : "未找到"}</DetailRow><DetailRow label="文件位置"><span className="break-all text-xs">{config.dir}</span></DetailRow><DetailRow label="成片设置"><span className="text-xs">{PRODUCTION_FIELDS.map((field) => `${field.label} ${shown(field.key, config.production[field.key])}`).join(" · ")}</span></DetailRow></dl>
    <div className="mt-5 flex flex-wrap gap-3 border-t border-a-border pt-4">
      <ModalForm triggerLabel="配置站点" title="连接 Galley 站点" submitLabel="测试并保存" successMessage="站点已连接" action={(_, form) => run(async () => { await request("/api/config", "PATCH", { url: String(form.get("url")), token: String(form.get("token")) }); await refresh(); })}>
        <Field label="站点根地址"><input name="url" type="url" className={INPUT} defaultValue={config.galley} required placeholder="https://blog.example.com" /></Field>
        <Field label="站点访问密钥（选填）"><input name="token" type="password" className={INPUT} autoComplete="new-password" placeholder="同一站点留空则保留现有密钥" /></Field>
        <p className="text-xs text-a-muted">文章的演示结构是公开的，不填密钥也能建项目。密钥是线上 Galley 后台「MCP 管理」生成的，以后读未发布的版本时要用。保存前会验证文章接口。已有项目仍属于原站点。</p>
      </ModalForm>
      <ModalForm triggerLabel="成片设置" title="成片设置（所有项目的默认值）" submitLabel="保存" successMessage="成片设置已保存" action={(_, form) => run(async () => { await request("/api/settings/production", "PUT", readProduction(form)); await refresh(); })}>
        <ProductionFields value={config.production} />
        <p className="text-xs text-a-muted">每个项目可以在「项目设置」里单独改。改了只影响之后的预览和导出，已经导出的视频不变。</p>
      </ModalForm>
      <ModalForm triggerLabel="释放模型内存" title="释放配音模型内存？" submitLabel="释放" action={() => run(async () => { await request("/api/unload", "POST"); })}><p>已有音频会保留，下次生成时重新加载模型。</p></ModalForm>
    </div>
  </Modal>;
}
export function AgentManagement({ data, refresh }: { data: AgentData; refresh: () => Promise<void> }) {
  const tokenHint = "这是 Studio 专用密钥，请保存到 STUDIO_AGENT_TOKEN。它与连接线上 Galley 的密钥分开，连接方式见本页说明。";
  const keyAction = async (url: string, body?: unknown) => {
    try { const result = await request<{ token: string; agent: { name: string } }>(url, "POST", body); await refresh(); return { ok: true, token: result.token, agentName: result.agent.name }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  };
  return <>
    <PageHeader title="Agent 管理" description="分配视频项目，管理制作工具和直接定稿权限。" actions={<ModalForm triggerLabel="接入 Agent" triggerVariant="primary" title="接入 Studio Agent" submitLabel="生成密钥" tokenHint={tokenHint} action={(_, form) => keyAction("/api/agents", { name: String(form.get("name")) })}><Field label="Agent 名称"><input name="name" className={INPUT} required maxLength={120} placeholder="例如：视频制作助手" /></Field></ModalForm>} />
    <Table head={["Agent", "状态", "定稿权限", "操作"]} empty={!data.agents.length && <p className="p-6 text-a-muted">还没有接入 Agent。创建后，将项目分配给它即可开始制作。</p>}>
      {data.agents.map((agent) => <tr key={agent.id}><td>{agent.name}</td><td><Badge tone={agent.disabled ? "neutral" : "green"}>{agent.disabled ? "已停用" : "已启用"}</Badge></td><td><Badge tone={agent.canPublish ? "amber" : "neutral"}>{agent.canPublish ? "可直接定稿" : "需要站长审查"}</Badge></td><td><RowActions>
        <ModalForm triggerLabel="权限设置" triggerVariant="link" title={`${agent.name} · 权限设置`} action={(_, form) => run(async () => { await request(`/api/agents/${agent.id}`, "PATCH", { disabled: form.has("disabled"), canPublish: form.has("canPublish"), disabledTools: data.tools.filter((tool) => !tool.required && !form.getAll("tools").includes(tool.name)).map((tool) => tool.name) }); await refresh(); })}>
          <label className="flex gap-2"><input type="checkbox" name="disabled" defaultChecked={agent.disabled} />停用此 Agent（密钥立即失效）</label>
          <label className="flex gap-2"><input type="checkbox" name="canPublish" defaultChecked={agent.canPublish} />允许直接确认讲稿和定稿</label><p className="text-xs text-a-muted">直接定稿会标明「未经人工审阅」。Agent 只能操作分配给自己的项目，不能修改权限或批准其他 Agent 的项目。</p>
          <fieldset className="space-y-2 border-t border-a-border pt-3"><legend className="pt-3 font-medium">可用工具</legend>{data.tools.map((tool) => <label key={tool.name} className="flex gap-2 text-xs"><input type="checkbox" name="tools" value={tool.name} disabled={tool.required} defaultChecked={tool.required || !agent.disabledTools.includes(tool.name)} />{tool.label}{tool.required ? "（必需）" : ""}</label>)}</fieldset>
        </ModalForm>
        <ModalForm triggerLabel="重置密钥" triggerVariant="link" title="重置 Agent 密钥？" tokenHint={tokenHint} submitLabel="生成新密钥" action={() => keyAction(`/api/agents/${agent.id}/token`)}><p>原密钥会立即失效，需要更新 Agent 客户端配置。</p></ModalForm>
      </RowActions></td></tr>)}
    </Table>
    <section className="mt-8 border-t border-a-border pt-5"><h2 className="mb-2 font-semibold">连接信息</h2><p className="mb-3 text-sm text-a-muted">在运行工坊的这台电脑上连接；远程 Agent 无法直接访问本机 localhost。</p><pre className="overflow-x-auto bg-a-subtle p-3 text-xs">{JSON.stringify({ mcpServers: { "galley-studio": { url: `${location.origin}/mcp`, headers: { Authorization: "Bearer <Studio Agent 密钥>" } } } }, null, 2)}</pre><p className="mt-3 text-xs text-a-muted">Codex 可用：<code>codex mcp add galley-studio --url {location.origin}/mcp --bearer-token-env-var STUDIO_AGENT_TOKEN</code></p></section>
    <section className="mt-8"><h2 className="mb-3 font-semibold">最近调用</h2><Table head={["Agent / 工具", "结果", "时间"]}>{data.calls.map((call) => <tr key={call.id}><td>{call.agentName}<div className="text-xs text-a-muted">{call.tool}</div></td><td><Badge tone={call.ok ? "green" : "red"}>{call.ok ? "成功" : "失败"}</Badge>{call.error && <p className="mt-1 max-w-sm whitespace-normal text-xs text-a-muted">{call.error}</p>}</td><td className="text-xs text-a-muted">{new Date(call.createdAt).toLocaleString("zh-CN")}</td></tr>)}</Table></section>
  </>;
}
