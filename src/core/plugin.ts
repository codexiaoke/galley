/**
 * Codex 插件（需求文档 5.7 的"Agent 插件"）。
 *
 * 插件让站长在 Codex 里不用手动配置就能运营站点，也能在任何项目里说一句"记到博客素材"。
 * 几条原则：
 * - 插件里的技能很薄，只说"这是什么、怎么开始"。完整的运营要求以站点上的技能为准：
 *   插件是一次性导入的静态文件，站点上的技能随时会改，两边各存一份会不一致。
 * - 访问密钥不写进插件，从环境变量 GALLEY_TOKEN 读，避免密钥随文件被分享或提交到代码仓库。
 * - 用 Codex 的兼容格式（.codex-plugin/plugin.json 和 .mcp.json），这是当前 Codex 命令行实际读取的格式。
 *
 * 产出的是一个"插件市场"目录：Codex 先把整个目录登记成一个市场，再从里面安装插件。
 */

import { gzipSync } from "node:zlib";
import { packTar } from "./tar";

export type PluginFile = { path: string; content: string };

export type PluginOptions = {
  /** MCP 服务的完整地址，例如 https://blog.example.com/mcp */
  mcpUrl: string;
  /** 网站名，写进插件的说明里 */
  siteName: string;
};

export const PLUGIN_NAME = "galley";
export const MARKETPLACE_NAME = "galley-site";
export const PLUGIN_VERSION = "0.1.0";
export const TOKEN_ENV = "GALLEY_TOKEN";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function skill(name: string, description: string, body: string): PluginFile {
  return { path: `plugins/${PLUGIN_NAME}/skills/${name}/SKILL.md`, content: `---\nname: ${name}\ndescription: ${description}\n---\n\n${body.trim()}\n` };
}

export function codexPluginFiles({ mcpUrl, siteName }: PluginOptions): PluginFile[] {
  const root = `plugins/${PLUGIN_NAME}`;
  return [
    {
      path: ".agents/plugins/marketplace.json",
      content: json({
        name: MARKETPLACE_NAME,
        interface: { displayName: siteName },
        plugins: [
          {
            name: PLUGIN_NAME,
            // 相对于整个市场目录（也就是解压出来的这个目录），不是相对于 .agents/plugins/。
            source: { source: "local", path: `./${root}` },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Productivity",
          },
        ],
      }),
    },
    {
      path: `${root}/.codex-plugin/plugin.json`,
      content: json({
        name: PLUGIN_NAME,
        version: PLUGIN_VERSION,
        description: `运营博客「${siteName}」：Agent 起草，站长审阅后发布。`,
        author: { name: siteName },
        skills: "./skills/",
        mcpServers: "./.mcp.json",
        interface: {
          displayName: siteName,
          shortDescription: "运营博客、记素材",
          longDescription: `连接博客「${siteName}」的运营接口。可以按站点的待办完成一轮运营，也可以在任何项目里把工作中的经历和结论记进博客的素材箱。所有内容都要站长在后台批准后才会发布。`,
          developerName: siteName,
          category: "Productivity",
          capabilities: ["Read", "Write"],
          defaultPrompt: ["运营一次博客", "把刚才解决问题的过程记到博客素材里"],
        },
      }),
    },
    {
      path: `${root}/.mcp.json`,
      content: json({
        mcpServers: {
          galley: {
            url: mcpUrl,
            // 密钥从环境变量读，不写在这里。
            bearer_token_env_var: TOKEN_ENV,
            // 定时自动运行时没有人能点批准。放行是安全的：这些工具里没有发布的能力，内容仍要站长批准才会上线。
            default_tools_approval_mode: "approve",
          },
        },
      }),
    },
    skill(
      "galley-start",
      `博客「${siteName}」的运营入门。第一次使用 galley 这个 MCP 服务、或者不确定该从哪里开始时读它。`,
      `
# 运营博客「${siteName}」

你通过 galley 这个 MCP 服务运营一个个人博客。你负责准备内容，站长负责审阅。默认所有修改都要站长在后台批准才会上线；站长单独给你开了 publish_change_set 时，你可以自己上线，那是他的一次明确授权，用的时候要更谨慎。

这份说明故意写得很短。完整的运营要求在站点上，而且站长会随时修改，**以站点上的为准**：

1. 调用 \`get_skill\`，读取 \`overview\` 技能。
2. 按它说的做：通常是先调用 \`get_next_tasks\` 查看待办。

如果连不上服务，多半是没有设置环境变量 \`${TOKEN_ENV}\`。访问密钥由站长在博客后台的"MCP 管理"页生成。
`,
    ),
    skill(
      "galley-run",
      `为博客「${siteName}」完成一轮运营：查看待办、按优先级处理、提交审阅，最后汇报。用户说"运营一次""看看博客有什么要做的"时使用。`,
      `
# 运营一次

1. 调用 \`get_skill\` 读取 \`overview\` 技能，按里面的流程来。站点上的技能会更新，每次都重新读，不要凭记忆。
2. 调用 \`get_next_tasks\`，按返回的顺序处理。用到哪个技能读哪个：写文章读 \`writing\`，动正文读 \`markup\`，建或改知识块读 \`knowledge\`，处理素材读 \`materials\`。
3. 结束前确认每个变更集要么已经提交，要么已经撤回，不留半成品。
4. 用几句话告诉用户：处理了哪些待办、提交了什么、有什么需要站长决定的。
`,
    ),
    skill(
      "galley-note",
      `把当前工作中站长的经历、踩过的坑和得出的结论，记进博客「${siteName}」的素材箱。用户说"记到博客素材""这个可以写成文章"时使用。`,
      `
# 记到博客素材

素材是站长本人的经历和看法，之后由运营博客的 Agent 整理成文章。你要做的只是把它准确地记下来。

1. 先回顾这次对话里站长遇到了什么问题、怎么解决的、得出了什么结论。不清楚站长想记哪一部分时，先问他。
2. 用第一人称、站长的口吻写一段素材：背景、过程、结论。写得脱离这次对话也能看懂，不要出现"上面那个""刚才的文件"。
3. 只记站长说过或做过的事，不加你自己的评价，不补充他没说过的细节。
4. 不要把密钥、密码、内部地址、客户信息写进去。涉及公司内部或者站长说了不想公开的内容，调用时设 \`isPrivate: true\`。
5. 调用 galley 服务的 \`add_material\` 保存，有相关链接就一起带上。
6. 告诉站长记好了，并把记下的内容给他看一眼。
`,
    ),
    {
      path: "README.md",
      content: `# 「${siteName}」的 Codex 插件

装上之后，Codex 会自动连接博客的运营接口，并多出三个技能：

- **galley-run**：运营一次博客。
- **galley-note**：在任何项目里，把工作中的经历和结论记进博客的素材箱。
- **galley-start**：入门说明。

## 安装

1. 在博客后台的"MCP 管理"页接入一个 Agent，拿到访问密钥。把它放进环境变量 \`${TOKEN_ENV}\`（比如写进 shell 的配置文件），不要写进任何文件里提交。

2. 把这个目录登记成一个插件市场（下面的路径换成你解压出来的目录）：

   \`\`\`bash
   codex plugin marketplace add ./galley-codex-plugin
   \`\`\`

3. 安装插件：

   \`\`\`bash
   codex plugin add ${PLUGIN_NAME}@${MARKETPLACE_NAME}
   \`\`\`

   用 Codex 桌面应用的话，也可以在插件目录里找到它安装。装完重启 Codex。

## 说明

- 服务地址：${mcpUrl}
- 插件里的技能只是入口，完整的运营要求在站点上，由站长在后台维护。
- 工具调用默认不逐次询问：这些工具里没有发布的能力，内容仍然要站长批准才会上线。想逐次确认，在 Codex 的配置里把这个服务的 \`default_tools_approval_mode\` 改成 \`prompt\`。
`,
    },
  ];
}

/** 打包成一个 .tar.gz，解压出来是一个名为 galley-codex-plugin 的目录。 */
export function codexPluginArchive(options: PluginOptions): { filename: string; archive: Buffer } {
  const entries = codexPluginFiles(options).map((file) => ({ name: `galley-codex-plugin/${file.path}`, data: Buffer.from(file.content) }));
  return { filename: "galley-codex-plugin.tar.gz", archive: gzipSync(packTar(entries)) };
}
