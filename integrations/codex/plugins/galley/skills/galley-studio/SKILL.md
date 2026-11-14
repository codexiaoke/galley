---
name: galley-studio
description: 在 Galley 本机视频工坊制作博客「我的博客」的文章视频、修改讲稿与视觉聚焦、处理审查、生成配音和 4K 成片时使用。
---

# 制作文章视频

视频项目使用独立的本机 Studio MCP，博客运营接口不会代替它制作视频。先调用 `studio_get_skill` 读取当前制作技能；已有项目 ID 就 `studio_get_project`，否则 `studio_list_projects` 找到项目。按技能继续讲稿、聚焦、配音、导出与审查。

如果没有 Studio 工具，说明需要在工坊所在电脑接入 `galley-studio`。常用端点为 `http://localhost:4321/mcp`，Agent 密钥由工坊的「Agent 管理」生成，放到 `STUDIO_AGENT_TOKEN` 环境变量；它和博客的 `GALLEY_TOKEN` 分开。已有连接时不要重复配置，不读取站长的管理密钥。完整制作要求由工坊实时返回，不在插件里保留另一份。

只有当前工具和站长授权都允许时，才通过 `studio_publish_project` 直接确认自己的版本；用户要求审查时使用 `studio_submit_review`。本机定稿不等于发布文章或上传视频平台。
