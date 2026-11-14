# 「我的博客」的 Codex 插件

装上之后，Codex 会自动连接博客的运营接口，并多出四个技能：

- **galley-run**：运营一次博客。
- **galley-note**：在任何项目里，把工作中的经历和结论记进博客的素材箱。
- **galley-start**：入门说明。
- **galley-studio**：文章视频制作入口，需另接入本机 Studio MCP；支持讲稿、聚焦、配音、4K 样片和审查。

## 安装

1. 在博客后台的"MCP 管理"页接入一个 Agent，拿到访问密钥。把它放进环境变量 `GALLEY_TOKEN`（比如写进 shell 的配置文件），不要写进任何文件里提交。

2. 把这个目录登记成一个插件市场（下面的路径换成你解压出来的目录）：

   ```bash
   codex plugin marketplace add ./galley-codex-plugin
   ```

3. 安装插件：

   ```bash
   codex plugin add galley@galley-site
   ```

   用 Codex 桌面应用的话，也可以在插件目录里找到它安装。装完重启 Codex。

## 说明

- 服务地址：http://localhost:3000/mcp
- 插件里的技能只是入口，完整的运营要求在站点上，由站长在后台维护。
- 视频工坊单独运行并配置，插件不会自动连接你的本机端口。将工坊 Agent 密钥放入 `STUDIO_AGENT_TOKEN` 后，可运行 `codex mcp add galley-studio --url http://localhost:4321/mcp --bearer-token-env-var STUDIO_AGENT_TOKEN`；端口以实际工坊为准。接入后通过 `studio_get_skill` 读取制作要求。
- 工具调用默认不逐次询问；未获直接上线授权的 Agent 仍须提交站长审阅。站长可以单独授权 Agent 发布自己的变更集，操作会标明未经人工审阅。想逐次确认，在 Codex 的配置里把这个服务的 `default_tools_approval_mode` 改成 `prompt`。
