# Galley 视频工坊

本机运行的项目管理与 4K 视频制作工具，复用 Galley 后台的表格、弹框、选择器与样式。线上 Galley 提供文章和演示画面；Studio 保存独立讲稿版本、配音、审查记录和成片，不会自动改写线上文章。

工坊部署在自己的电脑上，与线上博客分开。整体架构见[项目介绍](../../README.zh-CN.md)，模型服务准备与逐拍配音见[配音配置与使用](voice-setup.md)。

## 本机 Docker 部署（推荐）

Studio 使用独立的 `compose.studio.yml`，不启动或改动博客容器。镜像包含 Chromium、中文字体和 FFmpeg，使用锁文件中的 Playwright 版本。支持 ARM64 和 x86_64 构建；4K 排版与编码都在本机容器执行。

Mac 上已安装 Docker Desktop / OrbStack、Node 22、pnpm，并按[配音说明](voice-setup.md)配置好独立的 TTS MCP 后，在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm studio:docker up
pnpm studio:docker open
```

部署脚本是 [`docker.ts`](docker.ts)，`pnpm studio:docker` 为它的入口。`up` 构建镜像、配置本机配音连接并启动容器；`open` 自动登录管理页。默认地址为 `http://localhost:4321`，端口只发布到 `127.0.0.1`。自定义端口时，各条命令都带同一个 `STUDIO_PORT`，例如 `STUDIO_PORT=4331 pnpm studio:docker up`。原有 `pnpm studio` 占用相同端口时，先停止它；旧数据按下面的迁移步骤导入。

仓库不包含模型、参考音频或独立的 `my-voice-tts` 服务，部署脚本不会安装这些内容。没有配音服务时，可先按[手动运行容器](#手动运行容器)启动工坊。

Mac 的 MLX 配音仍使用宿主机上的模型和个人声线。启动命令注册 `com.galley.studio.tts` LaunchAgent，登录后自动运行，配音调用结束后模型仍按原 TTS 的空闲策略卸载。配音连接只监听 `127.0.0.1:4322`，容器通过 `host.docker.internal` 调用；独立随机密钥经标准输入写入容器数据卷，不放进命令参数或镜像。服务只接受讲稿、返回 WAV 和字幕，不接受客户端文件路径，也不提供任意 MCP 工具转发。宿主机读取 `~/.claude.json` 的配音启动配置，容器无需挂载整份个人配置。

本机配音依赖此仓库和 Node 的路径；移动仓库、更新 Node 或改变配音启动配置后，重新运行 `pnpm studio:docker up`。日志在 `~/.galley-studio-tts/service.log`。需要移除开机启动时，先执行下面的 `stop`，再删除 `~/Library/LaunchAgents/com.galley.studio.tts.plist`。

```bash
pnpm studio:docker help   # 查看部署命令
pnpm studio:docker status # 查看容器和 Mac 配音连接的状态
pnpm studio:docker logs   # 查看容器日志
pnpm studio:docker stop   # 停止容器和本次登录的配音服务，保留数据
pnpm studio:docker up     # 更新代码后重建并启动
```

首次打开后在「工坊设置」连接线上博客。Studio 项目、审查、Agent、密钥、配音和导出都保存在 Docker 卷 `galley-studio_studio-data`（容器内 `/data`），重建容器不清空数据。**不要使用 `docker compose down -v`，它会删除数据卷。** Codex 仍连接 `http://localhost:4321/mcp`，使用 Studio Agent 密钥。

更新已有工坊时先等配音和导出结束，再更新代码与宿主机依赖：

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm studio:docker up
```

镜像从本机源码构建；GitHub 发布的博客镜像不包含 Studio。Docker 运行时不挂载源码，修改代码后需要重建。

### 迁移已有工坊

先确认没有配音或导出任务，停止旧 Studio，并备份整个旧 `STUDIO_DIR`（包括隐藏的 `.owner-key` 和 `.secret-key`）。仅在新的 Docker 卷尚未存放项目时导入；不要把两个工坊的数据目录覆盖合并。以下命令在仓库根目录执行，`/你的/旧工坊目录` 必须换成真实路径：

```bash
docker compose -f compose.studio.yml build
docker compose -f compose.studio.yml run --rm --user root \
  -v /你的/旧工坊目录:/old:ro studio sh -c \
  'test ! -e /data/studio.db && cp -a /old/. /data/ && chown -R node:node /data'
pnpm studio:docker up
```

如果旧工坊用 `GALLEY_SECRET_KEY` 环境变量加密站点密钥，须安全地给新容器提供相同变量，或在迁移后重新保存连接密钥。不能只拷贝 `studio.db`；音频、历史成片和加密密钥也属于同一份备份。迁移后核对项目版本、历史导出、Agent 和连接状态，再停用原入口。原目录留作备份。

Docker 中的后台请求自动把 `localhost` / `127.0.0.1` 站点地址改走宿主机，数据库和浏览器预览仍使用原网址。因此本机开发站点和线上 HTTPS 站点都可连接，不必改写历史项目来源。

备份 Docker 工坊时先停止容器，然后把整个 `/data` 复制出来：

```bash
docker compose -f compose.studio.yml stop studio
docker compose -f compose.studio.yml cp studio:/data ../galley-studio-backup
docker compose -f compose.studio.yml start studio
```

### 手动运行容器

只需要管理、预览或使用已有配音时，可直接 `docker compose -f compose.studio.yml up -d --build`。管理登录密钥可用 `docker compose -f compose.studio.yml exec studio cat /data/.owner-key` 读取，只在本机登录页输入。

手动接配音时，宿主机运行 `pnpm studio:tts`，将 `~/.galley-studio-tts/.token` 安全复制为容器 `/data/.tts-token`，然后设置 `STUDIO_TTS_URL=http://host.docker.internal:4322` 重建容器。自动部署入口负责这些步骤。当前宿主机配音连接针对 Mac Docker Desktop / OrbStack 的网络；Linux 宿主机需要另行配置可达的服务地址，不能直接假设它能访问宿主机回环端口。

## 连接博客站点

打开「工坊设置 → 配置站点」，填写已有博客的根地址（如 `https://blog.example.com`）和该站点后台「MCP 管理」生成的访问密钥，点「测试并保存」。不需要重新部署博客，也不用复制线上数据库。

线上 Galley 需要包含当前版本的讲稿指纹接口。连接密钥加密保存在工坊数据目录中，不返回网页；切换站点需填写新站点的密钥。现有项目仍属于原站点。Docker 方式推荐在界面配置，重建容器后沿用已保存的连接。

## 从源码启动

```bash
pnpm install
pnpm exec playwright install chromium
pnpm studio
```

在同一终端环境运行 `pnpm studio:open`，浏览器自动登录工坊。使用自定义 `STUDIO_DIR` / `STUDIO_PORT` 时，两条命令使用相同环境变量。也可在登录页输入 `STUDIO_DIR/.owner-key` 的内容。该密钥只用于本机站长管理，不要交给 Agent；浏览器用 HttpOnly 会话保存登录状态。

首次启动也可以用 `GALLEY_URL` 和 `GALLEY_TOKEN` / `GALLEY_TOKEN_FILE` 初始化连接；数据库已有连接后，以界面保存的配置为准。密钥不要写进会提交的文件。

以下是 Studio 进程使用的运行时变量。Compose 只映射 `compose.studio.yml` 明确列出的变量；例如宿主机的 `GALLEY_TOKEN` 不会自动进入容器，Docker 用户应在工坊设置保存站点密钥。

| 环境变量 | 作用 | 默认 |
|---|---|---|
| `GALLEY_URL` | 首次连接站点 | `http://localhost:3000` |
| `GALLEY_TOKEN` / `GALLEY_TOKEN_FILE` | 首次连接密钥或密钥文件 | 无 |
| `STUDIO_PORT` | 本机监听端口 | `4321` |
| `STUDIO_HOST` | 监听地址；容器内使用 `0.0.0.0`，端口仍只发布给本机 | `127.0.0.1` |
| `STUDIO_DIR` | 项目、配音和视频工作目录 | `~/galley-studio` |
| `STUDIO_TTS_SERVER` | `~/.claude.json` 中配音 MCP 服务名 | `my-voice-tts` |
| `STUDIO_TTS_COMMAND` | 直接指定配音启动命令（空格分隔） | 无 |
| `STUDIO_TTS_URL` | 宿主机配音连接地址；未配置时直接调用 stdio MCP | 无 |
| `STUDIO_TTS_TOKEN_FILE` | 配音连接密钥文件 | `STUDIO_DIR/.tts-token` |
| `STUDIO_TTS_PORT` / `STUDIO_TTS_DIR` | 宿主机配音端口与密钥、日志目录 | `4322` / `~/.galley-studio-tts` |
| `STUDIO_LOCAL_SITE_HOST` | 容器后台访问本机博客时替换的主机名 | Compose 中为 `host.docker.internal` |

配音服务提供 `generate_voiceover` 与 `unload_voice_model`。完整的服务配置、返回格式、试听、重配与排错见[配音配置与使用](voice-setup.md)。

## 制作和审查

1. **新建项目**：选择已发布文章，指定名称，可分配给一个 Studio Agent。逐拍导入讲稿及来源版本；旧声音按内容迁移复用。
2. **修改讲稿**：网页可逐拍修改文字、无配音时的停留时长；Agent 可批量修改。每次保存生成新版本，旧版本仍能查看。文字没改的声音复用，改过的声音失效。
3. **讲稿审查**：提交后锁定该版本。站长可添加拍点批注、批准或附理由打回；作者逐条回复，再提交。待审版本也可撤回修改。批准后才能生成配音。
4. **生成配音和样片**：配音异步执行，可查看进度或在失败后续做。可单拍重新生成声音；每份音频使用不可变文件名。配音齐全后，后台生成原生 3840×2160、30 fps 的 MP4 和 SRT。
5. **成片审查**：播放实际样片，按时间点或拍点批注。通过后把同一个文件标为定稿，不再渲染一次。需要调整时建立新版本，历史定稿保留。
6. **下载和管理**：导出记录提供进度、预览、下载、重命名、取消与删除。待审或已定稿文件不能删除。此前导出会标为「历史导出 · 未审查」，不会冒充新流程的定稿。

文章、引用块或站点视觉配置变化会改变演示指纹。导出时既检查文章接口，也要求演示页匹配指纹，避免用新版画面冒充旧版审查结果。来源变了须「同步来源文章」并重新审查；旧版本不支持在新站点内容上重新渲染，但已导出的文件仍可审查和下载。同步保留相同拍点的工坊讲稿，请特别核对页面增删和重排后的对应关系。

## Agent 接入

Studio 有自己的 MCP 端点和 Agent 密钥，与线上 Galley 分开。进入「Agent 管理 → 接入 Agent」生成密钥，再把项目分配给它。Agent 只能查看和修改分配给自己的项目，不能批准审查、管理其他 Agent 或修改权限。

默认必须提交审查。站长可在该 Agent 的权限设置中允许「直接确认讲稿和定稿」，并控制可关闭的工具。授权后才出现 `studio_publish_project`；每次调用仍检查当前权限，操作记录和成片标明「未经人工审阅」。定稿是本机制作状态，不会上传到视频平台，也不会发布线上文章。

通用 Streamable HTTP 配置（在工坊所在电脑使用）：

```json
{
  "mcpServers": {
    "galley-studio": {
      "url": "http://localhost:4321/mcp",
      "headers": { "Authorization": "Bearer <Studio Agent 密钥>" }
    }
  }
}
```

Codex 可先把密钥放到 `STUDIO_AGENT_TOKEN`，再运行：

```bash
codex mcp add galley-studio --url http://localhost:4321/mcp --bearer-token-env-var STUDIO_AGENT_TOKEN
```

接入后先调用 `studio_get_skill` 读取当前制作技能（源文件为 `skills/studio/SKILL.md`）。Codex 插件的 `galley-studio` 技能会引导读取这份说明，插件本身不自动连接工坊，也不存另一份制作流程。

工具流程：`studio_list_projects` / `studio_get_project` → `studio_update_narration` / `studio_reply_comment` → `studio_submit_review(stage: script)` → `studio_generate_voices` → `studio_render_video` / `studio_get_export` → `studio_submit_review(stage: video)`。有直接定稿权限且任务允许时可使用 `studio_publish_project` 确认相应阶段；用户明确要求人工审查时仍送审。所有版本修改和审查操作都需带刚读取的 `revisionId`，避免覆盖其他人的修改。接口每次请求重新认证，停用、重置密钥或撤权立即生效。

## 渲染与数据

### 讲解指向

在每拍「编辑 → 讲解指向」中添加目标与讲稿原话，并选择强调方式：「指示」只显示目标边框；「聚焦」弱化周围、突出目标；「放大聚焦」在重点段落推近镜头，讲完退回全景。字幕不随镜头缩放。原话可覆盖完整句子，效果在这段讲解期间停留；只填关键词时会较快退场。只在需要看清细节时放大，概括、转场不必加指向。标题、段落、列表项和场景元素均有语义锚点，指向不依赖显示器大小或录屏鼠标。

Agent 在 `studio_get_project` 的 `revision.beats[].targets` 读取目标清单，用现有 `studio_update_narration` 修改指向：

```json
{
  "projectId": "<项目 ID>",
  "revisionId": "<刚读取的当前版本 ID>",
  "edits": [{ "id": "<拍点 ID>", "guides": [{ "targetId": "<本拍目标 ID>", "phrase": "从本拍讲稿复制的连续原话", "emphasis": "zoom" }] }],
  "note": "补充讲解指向"
}
```

`text`、`suggestedMs`、`guides` 可分别修改；`guides: []` 清除本拍指向。`emphasis` 可选 `point`、`focus`、`zoom`，省略时为 `focus`。原话必须唯一出现、按讲稿顺序排列且不能重叠。指向和讲稿一起建立版本、审查；仅改指向或强调方式不重做声音。旧项目先同步来源以获取目标目录。重新配音后从真实字幕重新定位，段内按字数插值；草稿估时预览会显示提示。审查时同时检查是否遮字、指向时元素是否可见、讲述对象是否一致，以及推近与回退是否舒适。导出会拒绝从未实际显示的指向。

- 4K 导出不录屏。后台 Chromium 负责 HTML/SVG 排版，按固定时间推进 JS/CSS 动画，再由 FFmpeg 合成原始配音。屏幕分辨率、窗口大小和切换标签页不影响清晰度。位图仍受原图分辨率限制。
- MP4 为 H.264（avc1、yuv420p）与 AAC，CRF 18，可用 QuickTime 播放。从准备好的封面开始，无工坊提示、浏览器界面或开发按钮。离线导出直接换页，保留页内动画。
- `studio.db` 保存项目、版本、批注、操作、Agent 和连接配置；`exports.json` 保存导出目录。首次迁移先保留旧目录备份，旧配音与成片不删除。
- `voice-assets/` 保存不可变 WAV 与内容缓存；`<文章>/exports/<任务>/` 保存 MP4、SRT、实际时间轴和制作清单。备份请复制整个 `STUDIO_DIR`（含密钥文件），在关闭服务后操作。
- 重启后未完成任务会明确标为中断，可以重新生成。刷新或关闭网页不会中断后台任务。
- 源码服务只监听 `127.0.0.1`；Docker 内监听 `0.0.0.0`，Compose 只发布到宿主机 `127.0.0.1`。两者都校验本机 Host / Origin。站长网页会话和 Agent Bearer 密钥分开；Agent 不能绕过工具开关调用网页管理接口。
- 首次页面请求由 esbuild / Tailwind 打包 UI；修改界面代码后重启工坊。运行检查：`pnpm test`、`pnpm typecheck`、`pnpm lint`。
