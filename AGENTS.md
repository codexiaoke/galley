<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Galley 项目约定

- 需求见 `docs/requirements.md`，核心设计见 `docs/design-knowledge-blocks.md`。改动前先读。
- 业务规则和权限判断只写在 `src/core`。`src/mcp` 和 `src/app` 只调用核心层，不重复实现规则。
- `src/core` 不依赖 Next.js，内部使用相对路径导入。
- MCP 接口里不能出现批准、发布、下线、读取留言、修改技能、修改权限这些能力。
- 新增 MCP 工具时，先在 `src/core/tools.ts` 的清单里登记（名字、分类、说明、能不能关），否则注册时会报错：站长在后台按这份清单开关工具。
- 页面里读取数据库之前，必须先访问请求数据（`cookies()`）或调用 `await connection()`：数据库驱动是同步的，否则页面会在构建时被预渲染成固定内容。
- 前台带缓存的读取函数（`src/app/data.ts`、`src/app/site.ts`）一律写成两层：外层 `await connection()`，内层才是 `'use cache'`。构建时执行到的缓存函数，结果会被带到线上；Docker 镜像构建时数据库是空的，站名和文章列表就会停在构建时的样子。
- 运行时要从磁盘读的东西（`drizzle/`、`skills/`）不在构建产物里，新增这类目录时要同时加进 `Dockerfile`。
- 前台和后台是两套界面：前台用 `galley-` 开头的样式（纸张色、宋体），后台用 `src/app/admin/ui.tsx` 和 `modal.tsx` 里的零件（`a-` 开头的配色）。不要混用。
- 后台的列表用表格，新建、编辑、确认类操作用 `ModalForm` 弹框；服务端操作统一走 `actions.ts` 里的 `run`。
- 后台的视觉参照 Notion 和飞书：内容直接排在白底上，不套卡片，不用投影，不给图标加底色方块；颜色只用在标签（`Badge`）和主按钮上。新增页面时沿用 `ui.tsx` 里的零件，不要自己另写一套样式。
- 后台不使用浏览器原生的 `<select>`，下拉选择一律用 `src/app/admin/select.tsx` 里的 `Select`。
- 修改表结构后运行 `pnpm db:generate`。提交前运行 `pnpm test`、`pnpm typecheck`、`pnpm lint`。
