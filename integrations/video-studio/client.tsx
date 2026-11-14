import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, Bot, Film, FolderClock, RefreshCw } from "lucide-react";
import { Badge, buttonClass, EmptyState, Field, INPUT, PageHeader, Table } from "../../src/app/admin/ui";
import { ModalForm } from "../../src/app/admin/modal";
import { Select } from "../../src/app/admin/select";
import { ToastProvider } from "../../src/app/admin/toast";
import { GalleyMark } from "../../src/app/admin/mark";
import type { StudioProject, StudioProjectDetail } from "../../src/core/studio-types";
import { request, run } from "./actions";
import { ExportHistory, type ExportRecord } from "./history";
import { ProjectView, ReviewBadge } from "./project-view";
import { AgentManagement, Settings, type AgentData, type Config } from "./management";

type Article = { slug: string; title: string };
function Studio() {
  const [auth, setAuth] = useState<boolean | null>(null), [error, setError] = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [view, setView] = useState(location.hash.slice(1) || "projects");
  const [config, setConfig] = useState<Config>(), [articles, setArticles] = useState<Article[]>([]);
  const [projects, setProjects] = useState<StudioProject[]>([]), [project, setProject] = useState<StudioProjectDetail>();
  const [jobs, setJobs] = useState<ExportRecord[]>([]), [agents, setAgents] = useState<AgentData>({ agents: [], tools: [], calls: [] });
  const [loading, setLoading] = useState(true);
  const projectId = view.startsWith("project/") ? view.slice(8) : "";
  useEffect(() => {
    const initialize = async () => {
      if (location.hash.startsWith("#session=")) {
        const token = decodeURIComponent(location.hash.slice(9)); history.replaceState(null, "", "/#projects"); setView("projects");
        await request("/api/session", "POST", { token });
      }
      const session = await request<{ authenticated: boolean; passwordEnabled: boolean }>("/api/session");
      setAuth(session.authenticated); setPasswordEnabled(session.passwordEnabled);
    };
    void initialize().catch((cause) => { setError(String(cause)); setAuth(false); });
  }, []);
  useEffect(() => { const change = () => setView(location.hash.slice(1) || "projects"); window.addEventListener("hashchange", change); return () => window.removeEventListener("hashchange", change); }, []);
  const refresh = useCallback(async () => {
    const results = await Promise.all([request<Config>("/api/config"), request<StudioProject[]>("/api/projects"), request<{ exports: ExportRecord[] }>("/api/exports"), request<AgentData>("/api/agents"), projectId ? request<StudioProjectDetail>(`/api/projects/${projectId}`) : Promise.resolve(undefined)]);
    setConfig(results[0]); setProjects(results[1]); setJobs(results[2].exports); setAgents(results[3]); setProject(results[4]); setLoading(false);
  }, [projectId]);
  const readArticles = useCallback(async () => { const result = await request<{ articles: Article[] }>("/api/articles"); setArticles(result.articles); }, []);
  useEffect(() => {
    if (!auth) return;
    let stopped = false;
    const update = () => { void refresh().catch((cause) => { if (!stopped) { setError(String(cause)); setLoading(false); } }); };
    update(); const timer = setInterval(update, 2500); return () => { stopped = true; clearInterval(timer); };
  }, [auth, refresh]);
  useEffect(() => { if (auth && config?.galley && config.hasToken) void request<{ articles: Article[] }>("/api/articles").then((result) => setArticles(result.articles)).catch((cause) => setError(String(cause))); }, [auth, config?.galley, config?.hasToken]);
  if (auth === null) return <main className="p-10 text-a-muted">正在打开工坊…</main>;
  if (!auth) return <main className="mx-auto max-w-lg px-6 py-24"><GalleyMark /><h1 className="mt-6 text-2xl font-semibold">打开工坊管理入口</h1><p className="mt-4 leading-relaxed text-a-muted">{passwordEnabled ? "输入本机工坊的登录密码，管理讲稿、配音和成片。" : <>Docker 部署运行 <code>pnpm studio:docker open</code>，源码运行使用 <code>pnpm studio:open</code> 自动登录。也可以输入工作目录中 <code>.owner-key</code> 的内容。</>}</p><form method="post" className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); const token = String(new FormData(event.currentTarget).get("token")); void request("/api/session", "POST", { token }).then(() => { setAuth(true); setError(""); }).catch((cause) => setError(String(cause))); }}><Field label={passwordEnabled ? "工坊密码" : "管理密钥"}><input name="token" type="password" className={INPUT} required autoComplete={passwordEnabled ? "current-password" : "off"} /></Field><button className={buttonClass("primary")}>打开工坊</button>{error && <p role="alert" className="text-a-danger">{error}</p>}</form></main>;
  return <div className="studio-shell"><aside className="studio-sidebar"><a href="#projects" className="flex items-center gap-2.5 px-2 py-2"><GalleyMark /><span className="font-semibold">Galley<span className="ml-2 font-normal text-a-muted">视频工坊</span></span></a><div className="studio-nav-label mt-9 px-3 text-[11px] text-a-muted">工作台</div><nav aria-label="工坊导航" className="mt-2 space-y-1"><a href="#projects" className="studio-nav" aria-current={view === "projects" || projectId ? "page" : undefined}><Film size={17} />视频项目</a><a href="#exports" className="studio-nav" aria-current={view === "exports" ? "page" : undefined}><FolderClock size={17} />导出记录</a><a href="#agents" className="studio-nav" aria-current={view === "agents" ? "page" : undefined}><Bot size={17} />Agent 管理</a></nav><div className="studio-sidebar-footer">{config && <><Settings config={config} refresh={async () => { await refresh(); await readArticles(); }} />{config.galley && <a href={config.galley} target="_blank" rel="noreferrer" className="studio-site-link">打开站点<ArrowUpRight size={13} /></a>}</>}</div></aside>
    <main className="studio-main">{error && <div role="alert" className="mb-5 flex items-start gap-3 border-b border-a-border pb-4"><Badge tone="red">需要处理</Badge><p className="min-w-0 flex-1 break-words">{error}</p><button onClick={() => setError("")} className={buttonClass("link")}>关闭</button></div>}
      {view === "exports" ? <ExportHistory jobs={jobs} articles={articles} refresh={refresh} /> : view === "agents" ? <AgentManagement data={agents} refresh={refresh} /> : projectId ? project?.id === projectId ? <ProjectView key={project.id} project={project} jobs={jobs} agents={agents.agents} refresh={refresh} /> : <p className="text-a-muted">正在读取项目…</p> : <>
        <PageHeader title="视频项目" description="从讲稿到成片，每一步都有版本、审查与制作记录。" actions={<ModalForm triggerLabel="新建视频项目" triggerVariant="primary" title="从文章建立视频项目" submitLabel="建立项目" action={(_, form) => run(async () => { const project = await request<StudioProjectDetail>("/api/projects", "POST", { slug: String(form.get("slug")), name: String(form.get("name")), assignedAgentId: form.get("agent") || null }); location.hash = `project/${project.id}`; })}><Field label="来源文章"><Select name="slug" placeholder="选择已发布的文章" options={articles.map((article) => ({ value: article.slug, label: article.title }))} /></Field><Field label="项目名称"><input name="name" className={INPUT} maxLength={120} required placeholder="例如：Web Worker 科普视频" /></Field><Field label="负责 Agent"><Select name="agent" defaultValue="" options={[{ value: "", label: "站长自己制作" }, ...agents.agents.filter((agent) => !agent.disabled).map((agent) => ({ value: agent.id, label: agent.name }))]} /></Field><p className="text-xs text-a-muted">导入文章的画面与讲稿，建立独立制作版本；工坊里的讲稿修改不会自动改动线上文章。</p>{!articles.length && <p className="text-a-danger">没有可用文章，请先在工坊设置中配置站点并确认已有发布文章。</p>}</ModalForm>} />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-a-muted">{projects.length} 个项目 · {projects.filter((item) => item.revision.scriptStatus === "in_review" || item.revision.videoStatus === "in_review").length} 个待审</span><button className={buttonClass("link")} onClick={() => void Promise.all([refresh(), readArticles()]).catch((cause) => setError(String(cause)))}><RefreshCw size={14} />刷新</button></div>
        <Table head={["项目", "负责 Agent", "讲稿", "成片", "更新时间"]} empty={!projects.length && <EmptyState icon={Film} title={loading ? "正在读取项目…" : "开始制作第一支视频"} hint="新建项目 → 讲稿审查 → 配音与 4K 样片 → 成片审查 → 定稿下载" />}>
          {projects.map((item) => <tr key={item.id}><td><a href={`#project/${item.id}`} className="font-medium hover:underline">{item.name}</a><div className="mt-1 text-xs text-a-muted">v{item.revision.number} · {item.revision.source.title}</div></td><td>{agents.agents.find((agent) => agent.id === item.assignedAgentId)?.name ?? "站长"}</td><td><ReviewBadge status={item.revision.scriptStatus} direct={item.revision.scriptDirect} /></td><td><ReviewBadge status={item.revision.videoStatus} direct={item.revision.videoDirect} /></td><td className="text-xs text-a-muted">{new Date(item.updatedAt).toLocaleString("zh-CN")}</td></tr>)}
        </Table>
      </>}
    </main></div>;
}
createRoot(document.getElementById("app")!).render(<div className="admin"><ToastProvider><Studio /></ToastProvider></div>);
