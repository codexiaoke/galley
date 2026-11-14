# 配音配置与使用

Galley Studio 负责按拍调用配音、保存音频、对齐字幕和合成视频。具体模型、声线与参考音频由你自己的配音服务负责。
**本仓库不包含模型权重、个人参考音频或独立的 `my-voice-tts` 实现，也没有模型下载、声线训练或克隆安装脚本。**
先安装并验证自己的 TTS 服务，再用下面的方式接入。当前实际验证的是 Mac 上已有的 MLX 配音服务；其他实现须满足文末的 MCP 契约。

## 1. 准备宿主机配音服务

服务运行在你的 Mac 上，通过 stdio 提供 MCP。Python 虚拟环境、模型、参考音频都留在宿主机；不必把它们复制进 Studio 镜像。

需要能执行的启动命令，例如：

```text
/absolute/path/to/tts/.venv/bin/python /absolute/path/to/tts/tts_mcp_server.py
```

这是路径示例，并非仓库自带文件。先按你的 TTS 服务说明安装依赖、准备模型和声线。配置时使用绝对路径，避免后台服务找不到虚拟环境。

### 方式 A：复用已有 MCP 配置

在 `~/.claude.json` 的 `mcpServers` 中加入或保留配音项，**与已有配置合并，不要覆盖整个文件**：

```json
{
  "mcpServers": {
    "my-voice-tts": {
      "type": "stdio",
      "command": "/absolute/path/to/tts/.venv/bin/python",
      "args": ["/absolute/path/to/tts/tts_mcp_server.py"],
      "env": { "TTS_IDLE_UNLOAD_MINUTES": "10" }
    }
  }
}
```

默认读取 `my-voice-tts`。使用其他名称时，启动前设置 `STUDIO_TTS_SERVER`。`env` 原样传给 TTS 子进程；
上例的空闲卸载变量属于当前 `my-voice-tts` 的配置，其他服务应按自己的说明填写，不一定支持同名参数。
Studio 直接读取这份配置，不需要启动 Claude 客户端，也不会把整份配置挂载进容器。

### 方式 B：直接指定启动命令

没有上述配置文件时，可在启动终端中设置：

```bash
export STUDIO_TTS_COMMAND='/absolute/path/to/tts/.venv/bin/python /absolute/path/to/tts/tts_mcp_server.py'
pnpm studio:docker up
```

这个变量优先于 `~/.claude.json`。当前实现按空白分隔命令和参数，不执行 shell，也不展开 `~`、管道或引号；
路径包含空格或需要单独设置 TTS 环境变量时，用方式 A 的 `command`、`args` 和 `env`。

## 2. 启动工坊与配音连接

在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm studio:docker up
pnpm studio:docker status
pnpm studio:docker open
```

部署入口是 [`docker.ts`](docker.ts)，由 `pnpm studio:docker` 调用。它启动两部分：

| 部分 | 地址 / 位置 | 用途 |
|---|---|---|
| Studio 容器 | `http://localhost:4321`，数据卷内 `/data` | 网页、项目、MCP、配音资产与 4K 导出 |
| Mac 配音连接 | `127.0.0.1:4322`，LaunchAgent `com.galley.studio.tts` | 接受容器讲稿，启动本机 TTS MCP，再返回 WAV 与字幕 |

连接密钥自动生成在 `~/.galley-studio-tts/.token`，部署脚本经标准输入写入容器的 `/data/.tts-token`。
它不同于博客 Agent、工坊 Agent 和站长管理密钥，不需要填入 Agent 客户端。

工坊设置里的「配音已配置」表示已找到连接配置，不代表模型已经加载或声音已经生成。
`status` 用来检查服务进程；首次真实配音才会启动模型调用。第一次可能较慢，之后是否保留模型由 TTS 服务管理。

Mac 登录后会自动启动配音连接，Docker 服务在 Docker 引擎运行后按重启策略恢复。
移动仓库、更新 Node 路径或修改配音启动配置后，重新运行 `pnpm studio:docker up`。
停止服务用 `pnpm studio:docker stop`；永久移除配音的登录启动项见[工坊部署说明](README.md#本机-docker-部署推荐)。

## 3. 在项目里生成和检查声音

1. 在工坊设置中连接博客，选择已发布文章创建项目。讲稿导入后可逐拍修改，与线上正文独立保存。
2. 修改需要说出来的文字，空讲稿的拍点只停留、不配音。提交讲稿审查；站长批准，或具有单独权限的 Agent 直接确认后，才能生成配音。
3. 点击生成配音。进度保存在项目中；刷新网页不会取消任务。失败时查看具体错误，修复后续做，已有有效音频可复用。
4. 逐拍试听，检查读音、语气和字幕时间。需要重做的拍点单独重新生成。更换声线但讲稿没变时，也需要显式重配，不能只重启模型。
5. 核对讲稿原话绑定的聚焦目标，预览完整节奏，再生成 4K 样片。只改聚焦效果时保留配音；改讲稿或聚焦都建立新版本，需重新审查。
6. 审看实际 MP4，通过后定稿并下载视频与 SRT。字幕与音频共用实际拍点时间轴。

用完可在「工坊设置」点击「释放模型内存」。此操作不会删除已有 WAV 或成片，下次请求由 TTS 服务重新加载模型。
参考音频和模型文件不属于工坊数据卷，备份它们需要遵循自己的配音服务说明。

## 配音 MCP 的接口要求

Studio 当前使用 stdio MCP，不直接兼容任意 HTTP TTS API。接入其他模型时，提供以下两个工具的适配服务即可，
模型的声线与推理参数在服务自身固定或配置。服务的日志应写 stderr，stdout 留给 MCP 协议。

### `generate_voiceover`

Studio 调用参数：

```json
{
  "text": "这一拍要说的讲稿。",
  "output_path": "/absolute/path/assigned-by-studio.wav",
  "subtitle_max_chars": 20
}
```

服务必须把有效 WAV 写入 `output_path`。Docker 模式下，此路径由宿主机配音连接生成，是 **Mac 路径**；
连接把音频字节传回容器，TTS 不需要访问 `/data` 或 Docker 卷。

工具返回 `structuredContent`，或一段包含以下 JSON 的文本内容：

```json
{
  "duration_seconds": 2.4,
  "subtitle_cues": [
    { "start": 0, "end": 1.2, "text": "这一拍要说的" },
    { "start": 1.2, "end": 2.4, "text": "讲稿" }
  ]
}
```

时长须为正数；字幕使用相对于这份 WAV 的秒数，开始和结束有效且不超出音频时长。
没有字幕段时无法提供这拍对应的字幕，讲解聚焦也失去可靠的配音定位依据；应返回真实字幕时间，不能伪造成功。
长任务可发送 MCP 进度通知；失败用 MCP 错误结果说明原因。Studio 不会把失败结果缓存成可用配音。

### `unload_voice_model`

接受空参数 `{}`，释放服务持有的模型内存，成功返回工具结果。释放后再次调用 `generate_voiceover` 应能重新加载模型。

## 排错

| 现象 | 检查与处理 |
|---|---|
| 没有找到本机配音 MCP | 确认服务名、绝对命令路径与参数；`STUDIO_TTS_COMMAND` 非空时会覆盖配置文件 |
| 容器正常，无法生成配音 | 运行 `pnpm studio:docker status`；查看 `~/.galley-studio-tts/service.log`，再检查 TTS 自己的模型和依赖 |
| 连接密钥无效 / `.tts-token` 不存在 | 重新运行 `pnpm studio:docker up`，让脚本重新同步当前连接密钥；不要使用博客或 Agent 密钥替代 |
| 第一次配音很慢 | 查看项目进度和模型加载情况；“服务运行中”不等于模型已就绪 |
| 更换声线后仍是旧声音 | 对相应拍点重新生成配音；相同服务名和文字默认复用缓存 |
| 配音已生成但不能导出 | 检查当前讲稿审查状态、来源文章版本与配音是否齐全；失败的导出记录提供具体原因 |
| `4322` 被占用 | 停止原先手动启动的 `pnpm studio:tts`，或设置其他 `STUDIO_TTS_PORT` 后重新运行部署脚本 |

手动诊断时可用 `pnpm studio:tts` 在终端运行连接服务。不要与已经占用同一端口的 LaunchAgent 同时启动。
自动配置与宿主机回环连接已在 Mac + OrbStack 验证；Linux 的宿主机网络配置需要另行安排，不能把 Mac 命令直接视为可用的 GPU 部署方案。
