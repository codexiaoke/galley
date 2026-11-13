<p align="center">
  <img src="docs/assets/galley-icon.svg" width="88" height="88" alt="">
</p>

<h1 align="center">Galley</h1>

<p align="center">一个自托管博客：把你在用的 Agent 接上来写，你点头才上线。</p>

<p align="center">
  <a href="https://github.com/codexiaoke/galley/actions/workflows/image.yml"><img src="https://img.shields.io/github/actions/workflow/status/codexiaoke/galley/image.yml?branch=main&label=build" alt="构建"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <a href="https://github.com/codexiaoke/galley/pkgs/container/galley"><img src="https://img.shields.io/badge/ghcr.io-galley-0b7285.svg" alt="镜像"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b>
</p>

---

**你已经在用某个 Agent 了。把它指到你的博客上，直接让它写。**

Galley 是一个带 [MCP](https://modelcontextprotocol.io) 端点的博客。把这个端点加进 Claude Code、Codex，
或者你本来就在用的任何 MCP 客户端，Agent 就能读到这个站已有的东西、写出文章、提交审阅。
你打开后台读一遍，批准或者打回。默认就是这样：Agent 写，你点头才上线。
如果你是自己在旁边用的那个 Agent，嫌每次都要去后台麻烦，可以在后台单独给它开「直接上线」——
开关是按 Agent 给的、默认关着、随时能收回，这样上线的内容也会标出「没经过审阅」。

部署是一个 Docker 容器加一个数据目录。程序本身不调用任何大模型，所有智能都来自你接进来的那个 Agent，
所以不用配置模型密钥，也不绑定任何一家。

<p align="center">
  <img src="docs/assets/screenshot-article.jpg" width="800" alt="带目录的文章页">
</p>

## 为什么这么设计

- **文章是组装出来的，不是写完就放着。** 事实、概念、代码、数据，以及你自己的观点和经历，都存成一个个
  **知识块**。文章用自己的话行文，并标出哪一句依据哪个块。
- **知识块变了，依赖它的文章跟着改。** 更新一个块时，程序找出所有引用它的位置，Agent 重写那几处，
  结果合成一张卡片交给你。
- **发布权限由程序管，不靠 Agent 自觉。** 默认任何 Agent 都不能让内容上线，只能提交审阅；要放开，得你在后台对某一个 Agent 明确打开，而且随时能收回。下线、读留言、改自己的权限始终不开放。
  内容上线的唯一途径是你批准。
- **不要模型密钥，不绑定 Agent。** 技能通过 MCP 下发，Agent 连上来就知道该怎么运营这个站。
- **数据就是几个文件。** SQLite 加一个图片目录，备份就是下载一个压缩包。

## 怎么运作的

**1. 把你在用的 Agent 接上来。** 在后台的 MCP 页加一个 Agent，它会给你一个访问密钥和一段填好地址的配置，
粘进 Claude Code、Codex 或者别的支持 MCP 的客户端。只配一次。

**2. 直接让它写。** 在你平时聊天的地方说一句：*「写一篇关于个人站点用 SQLite 就够了的文章。」*
Agent 会先读这个站的技能，知道这里的规矩，再搜一遍博客已有的内容，用 Galley 的标记写出来，提交审阅。
这时候还没上线。

**3. 你读一遍，决定。** 后台给你渲染好的预览、和线上版本的逐字对比，任意一句话都能写批注。
**批准**就上线，**打回**并写上意见，Agent 照着改。

**4. 它会替你盯住事实。** 文章引用知识块，而不是把事实抄进正文。以后某个知识块变了，
所有依赖它的文章会作为修订任务回到你这里，不会悄悄过期。

想让它自己跑？站里有素材箱（丢想法和链接）、选题池和一份待办清单，Agent 定时跑的时候照着做，
不用你开口。这部分是可选的——日常用起来，跟你的 Agent 说句话就是全部流程。

<p align="center">
  <img src="docs/assets/screenshot-review.jpg" width="800" alt="在后台审阅一个变更集">
</p>

## 有哪些能力

**写作和知识**

- 六种知识块（事实、概念、代码、数据、观点、经历），全文搜索、相似查重、来源链接、过期标记、
  锁定版本的引用。
- 变更集带逐句批注、打回重提、每一次决定都有记录。
- 31 个 MCP 工具，按 Agent 发访问密钥，有调用日志，每个非必需的工具都能单独关掉。
- Agent 可以传自己做的图，但口子很窄：只收图片字节不收网址，按文件内容认格式，传了没用上的攒够十张就不让再传。
- 五份可编辑的技能通过 MCP 下发：总览、写作、正文标记、知识块、素材与选题。按任务分开，用到哪个读哪个，每次改动都有版本记录。

**正文不只是文字**

- 17 个组件：提示框、图表、时间线、引文、关键数字、分步讲解代码、流程图、标签页、前后对比、
  折叠段落、小测验等等。
- 代码高亮（带文件名和重点行）、文章目录、脚注、图片放大、KaTeX 公式、保存时就校验的 Mermaid 图。
- **27 种内置算法动画**（排序、查找、迷宫、图、树、动态规划），可以播放、单步、拖动进度，
  读者能切换几组输入，还能让几种算法并排比赛。
- **代码驱动的动画**：在文章里写一段 JavaScript，在服务端的 QuickJS 沙箱里运行，
  动画按代码实际跑出来的过程生成。
- **可运行的代码块**：读者点「运行」，代码在他自己浏览器的沙箱里执行——没有网络、碰不到页面，
  有时间和内存上限。

<p align="center">
  <img src="docs/assets/screenshot-algorithm.jpg" width="800" alt="文章里正在播放的算法动画">
</p>

**演示**

- 任何一篇文章都能变成全屏幻灯片：方向键一步步走，页里有代码动画时先播完再翻页，
  有讲稿、自动播放和速度调节。
- 在你自己的浏览器里直接录成 MP4——横屏或竖屏、字幕、麦克风配音。视频不上传，服务器不参与。
- 导出 PDF，一页幻灯片一页纸。
- `/posts/<别名>/present.json` 把拆页的结果交给别的程序：序号、标题和这一页的 Markdown。刻意不含讲稿——那是演讲时自己看的提词，页面上也不给读者看。

<p align="center">
  <img src="docs/assets/screenshot-present.jpg" width="800" alt="演示模式和控制条">
</p>

**给读者的**

- 三套内置主题（书卷、素白、工程），各带深色版，在后台切换。
- 知识库里定义过的术语，在正文第一次出现时可以悬停看定义。
- 文章末尾的相关文章，按两篇共同讲到的概念排序，并写明共同讲到了什么。
- 全站知识图谱、每篇文章公开的修改记录、系列和上下篇、服务端生成的分享卡片图、
  RSS、站点地图、结构化数据、全文搜索。
- 不用 Cookie、不接第三方的访问统计：访客标记每天换盐，过了当天就对不回去。

**运营**

- 每天自动备份留在服务器上，另外可以一键下载完整压缩包和恢复。
- 有东西等你处理时发邮件通知（标准 SMTP，不绑定服务商）。
- 留言板、可以公开的运营日志，以及 Agent 能读的访问数据——用来定下一篇写什么。

## 快速开始

### 用 Docker

服务器上只需要装好 Docker。

```bash
git clone https://github.com/codexiaoke/galley.git && cd galley
```

```bash
./deploy.sh
```

脚本会问端口、域名（可以不填）和后台密码，写进 `.env`，然后下载镜像、启动、等服务就绪。填了域名会多起
一个 Caddy 自动配置 HTTPS。镜像由 GitHub Actions 为 x86 和 ARM 分别构建好，服务器只下载不构建，
2 核的机器也很轻松。

离线安装、在自己电脑上构建好再传到服务器、环境变量、日常命令，见
[docs/deployment.zh-CN.md](docs/deployment.zh-CN.md)。

### 本地运行

需要 Node.js 22 和 pnpm。

```bash
pnpm install && cp .env.example .env.local
```

在 `.env.local` 里设置 `GALLEY_ADMIN_PASSWORD`（至少 8 位），然后：

```bash
pnpm dev
```

前台在 http://localhost:3000，后台在 `/admin`，MCP 端点在 `/mcp`。想看看版面的话，
运行 `pnpm seed:demo` 放几篇示例文章。

## 接入 Agent

任何支持 MCP 的客户端都行，Claude Code 和 Codex 是实际验证过的两个。在后台的 **MCP 管理** 页加一个
Agent，页面会显示一次访问密钥，以及一段已经填好本站地址的配置。也可以用命令行：

```bash
pnpm agent:create Codex
```

把密钥放进环境变量 `GALLEY_TOKEN`。**Codex** 加进 `~/.codex/config.toml`：

```toml
[mcp_servers.galley]
url = "https://你的站点/mcp"
bearer_token_env_var = "GALLEY_TOKEN"
default_tools_approval_mode = "approve"
```

**Claude Code** 加进 `~/.claude.json`：

```json
{ "mcpServers": { "galley": { "type": "http", "url": "https://你的站点/mcp",
  "headers": { "Authorization": "Bearer 你的密钥" } } } }
```

然后直接跟它说话：*「看一下我的博客，提三个可以写的题目。」* Agent 第一次调用时会被引导去读站上的
`overview` 技能，那里写明了这个博客怎么运营，你不用再解释一遍。

Codex 配置里最后一行让它调用本站工具时不再逐次询问——定时自动运行时没有人能点批准，缺了这一行它什么都
做不了。默认是安全的：没有单独授权时，这些工具不能让任何内容上线，也不能下线、读留言、改自己的权限。

也可以用插件省掉手动配置：在后台下载预先填好本站地址的那份，或者用仓库里
[integrations/codex](integrations/codex) 的通用版本。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | 产品是什么，以及每项功能的实现状态 |
| [docs/design-knowledge-blocks.md](docs/design-knowledge-blocks.md) | 知识块、引用与变更集的设计 |
| [docs/deployment.zh-CN.md](docs/deployment.zh-CN.md) | 部署详解和环境变量 |
| [AGENTS.md](AGENTS.md) | 在这个仓库里写代码的约定，人和 Agent 都适用 |

## 目录结构

| 路径 | 内容 |
|---|---|
| `src/core` | 数据表、正文标记、所有业务规则。不依赖 Next.js |
| `src/mcp` | MCP 服务，每个工具都是核心层的一层薄壳 |
| `src/app` | 前台、后台和 MCP 端点 |
| `src/render` | 把正文渲染成页面 |
| `skills` | 下发给 Agent 的技能 |
| `drizzle` | 数据库迁移 |

权限规则只写在 `src/core`。后台和 MCP 调用同一套函数，传入不同的身份，
所以「谁能做什么」只有一个地方说了算。

## 参与

欢迎提 issue 和 PR，见 [CONTRIBUTING.md](CONTRIBUTING.md)。Galley 是刻意做成个人尺度的：
没有插件系统，也没有主题市场，想大改就 fork——代码是按这个前提组织的。

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动开发服务 |
| `pnpm test` | 运行测试 |
| `pnpm typecheck` | 类型检查 |
| `pnpm lint` | 代码检查 |
| `pnpm build` | 生产构建 |
| `pnpm db:generate` | 改了表结构后生成迁移 |

## 协议

[MIT](LICENSE)
