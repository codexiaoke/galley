# Galley 视频工坊

本机运行的项目管理与 4K 视频制作工具，复用 Galley 后台的表格、弹框、选择器与样式。线上 Galley 提供文章和演示画面；Studio 保存独立讲稿版本、配音、审查记录和成片，不会自动改写线上文章。

## 启动与连接线上站点

```bash
pnpm install
pnpm exec playwright install chromium
pnpm studio
```

在同一终端环境运行 `pnpm studio:open`，浏览器自动登录工坊。使用自定义 `STUDIO_DIR` / `STUDIO_PORT` 时，两条命令使用相同环境变量。也可在登录页输入 `STUDIO_DIR/.owner-key` 的内容。该密钥只用于本机站长管理，不要交给 Agent；浏览器用 HttpOnly 会话保存登录状态。

打开「工坊设置 → 配置站点」，填写线上站点根地址（如 `https://blog.example.com`）和该站点后台「MCP 管理」生成的访问密钥，点「测试并保存」。线上 Galley 需要包含当前版本的讲稿指纹接口。连接密钥加密保存在本机，不返回网页；切换站点需填写新站点的密钥。现有项目仍属于原站点。

首次启动也可以用 `GALLEY_URL` 和 `GALLEY_TOKEN` / `GALLEY_TOKEN_FILE` 初始化连接；数据库已有连接后，以界面保存的配置为准。密钥不要写进会提交的文件。

| 环境变量 | 作用 | 默认 |
|---|---|---|
| `GALLEY_URL` | 首次连接站点 | `http://localhost:3000` |
| `GALLEY_TOKEN` / `GALLEY_TOKEN_FILE` | 首次连接密钥或密钥文件 | 无 |
| `STUDIO_PORT` | 本机监听端口 | `4321` |
| `STUDIO_DIR` | 项目、配音和视频工作目录 | `~/galley-studio` |
| `STUDIO_TTS_SERVER` | `~/.claude.json` 中配音 MCP 服务名 | `my-voice-tts` |
| `STUDIO_TTS_COMMAND` | 直接指定配音启动命令（空格分隔） | 无 |

配音服务提供 `generate_voiceover({ text, output_path, subtitle_max_chars })`，返回 `duration_seconds` 和 `subtitle_cues: [{ start, end, text }]`，并将 WAV 写入 `output_path`。用完可以在工坊设置释放模型内存。

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
- 服务只监听 `127.0.0.1`，校验 Host / Origin。站长网页会话和 Agent Bearer 密钥分开；Agent 不能绕过工具开关调用网页管理接口。
- 首次页面请求由 esbuild / Tailwind 打包 UI；修改界面代码后重启工坊。运行检查：`pnpm test`、`pnpm typecheck`、`pnpm lint`。
