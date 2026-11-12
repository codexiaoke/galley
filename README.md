# Galley

一个由 Agent 运营、由站长把关的个人博客系统。

Galley 原意是印刷前交给编辑审阅的校样。在这里，Agent 负责选题、写稿和维护内容，站长负责审阅和批准。

## 它和别的博客系统有什么不同

- **内容是知识库，文章是组装结果。** 事实、概念、代码、数据、站长的观点和经历存成一个个知识块，文章用自己的话行文，并标出每段话依据的知识块。
- **知识块变了，文章跟着变。** 更新一个知识块时，程序找出所有引用它的位置，Agent 修订，站长在一张卡片里一次看完。
- **发布由程序把关。** Agent 通过 MCP 连接，接口里没有发布能力。内容只有在站长批准后才上线。
- **程序本身不调用任何大模型。** 所有智能来自接入的 Agent，部署者不需要配置模型密钥。
- **不绑定 Agent。** 使用标准 MCP，并通过 MCP 下发技能，Agent 连上来就知道该怎么运营。

完整的需求和设计见 [需求文档](docs/requirements.md) 和 [知识块、引用与变更集](docs/design-knowledge-blocks.md)。

## 当前状态

项目处于骨架阶段，核心流程已经跑通：

| 部分 | 状态 |
|---|---|
| 知识块、文档、引用、变更集的数据结构 | 已实现 |
| 正文标记的解析和校验 | 已实现 |
| 变更集的提交、批准、打回，以及发布把关 | 已实现 |
| 引用的版本锁定、过期判定、不改变含义的修改 | 已实现 |
| MCP 端点和 16 个工具，访问密钥认证，调用记录 | 已实现 |
| 两份默认技能，通过 MCP 工具下发 | 已实现 |
| 前台：首页、分类页、文章页、依据的悬浮卡片，书卷式风格 | 已实现 |
| 分类：后台创建，Agent 写文章时选择 | 已实现 |
| 后台：左侧菜单的管理界面，看板、审阅、文章、知识块、分类、MCP 管理，表格加弹框 | 已实现 |
| 素材箱、选题池、行内批注、版本对比、运营分析、留言、备份导出 | 未开始 |
| 官方技能扩展、Codex 插件、Docker 部署 | 未开始 |

## 本地运行

需要 Node.js 22 和 pnpm。

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

在 `.env.local` 里设置 `GALLEY_ADMIN_PASSWORD`（至少 12 位），然后启动：

```bash
pnpm dev
```

- 前台：http://localhost:3000
- 后台：http://localhost:3000/admin
- MCP 端点：http://localhost:3000/mcp

## 接入 Agent

在后台的"MCP 管理"页接入一个 Agent，页面会显示一次访问密钥和 Codex 的配置片段。也可以在命令行接入：

```bash
pnpm agent:create Codex
```

把密钥放进环境变量 `GALLEY_TOKEN`，然后在 Codex 的配置里加入：

```toml
[mcp_servers.galley]
url = "http://localhost:3000/mcp"
bearer_token_env_var = "GALLEY_TOKEN"
```

Agent 连接后会收到说明，引导它先读取 `overview` 技能。

## 目录结构

| 路径 | 内容 |
|---|---|
| `src/core` | 核心层：数据表、正文标记、所有业务规则。不依赖 Next.js |
| `src/mcp` | MCP 服务：每个工具都是核心层的外壳 |
| `src/app` | 前台、后台和 MCP 端点 |
| `src/render` | 把正文渲染成页面 |
| `skills` | 下发给 Agent 的技能 |
| `drizzle` | 数据库迁移 |
| `docs` | 需求和设计文档 |

权限规则只写在核心层。后台和 MCP 调用同一套函数，由传入的身份决定能做什么。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动开发服务 |
| `pnpm test` | 运行测试 |
| `pnpm typecheck` | 类型检查 |
| `pnpm lint` | 代码检查 |
| `pnpm build` | 生产构建 |
| `pnpm db:generate` | 修改表结构后生成迁移 |
| `pnpm seed:demo` | 放入几篇示例文章，方便查看前台版面（只用于本地） |

## 协议

MIT
