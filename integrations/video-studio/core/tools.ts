/**
 * 视频工坊的 MCP 工具清单：有哪些工具、能不能被站长关掉。和博客的清单（src/core/tools.ts）分开：
 * 博客不认识这些工具，工坊也不注册博客的工具。
 */
import type { ToolInfo } from "../../../src/core/tools";

export const STUDIO_TOOLS: ToolInfo[] = [
  { name: "studio_get_skill", group: "视频工坊", label: "读取当前视频制作与审查技能", required: true },
  { name: "studio_list_articles", group: "视频工坊", label: "读取可制作的文章" },
  { name: "studio_list_projects", group: "视频工坊", label: "查看自己的项目和待办", required: true },
  { name: "studio_get_project", group: "视频工坊", label: "读取讲稿版本、审查意见和制作状态", required: true },
  { name: "studio_create_project", group: "视频工坊", label: "从文章创建视频项目" },
  { name: "studio_update_narration", group: "视频工坊", label: "修改逐拍讲稿、讲解指向并保存新版本" },
  { name: "studio_sync_source", group: "视频工坊", label: "同步文章来源并建立待审新版本" },
  { name: "studio_submit_review", group: "视频工坊", label: "提交讲稿或样片审查", required: true },
  { name: "studio_withdraw_review", group: "视频工坊", label: "撤回自己的待审版本", required: true },
  { name: "studio_reply_comment", group: "视频工坊", label: "回复审查批注", required: true },
  { name: "studio_generate_voices", group: "视频工坊", label: "为通过审查的讲稿生成配音" },
  { name: "studio_render_video", group: "视频工坊", label: "生成当前版本的 4K 样片" },
  { name: "studio_get_export", group: "视频工坊", label: "读取导出进度和文件地址" },
  { name: "studio_cancel_export", group: "视频工坊", label: "取消自己的导出任务" },
  { name: "studio_publish_project", group: "视频工坊", label: "直接确认讲稿或定稿（需站长单独授权）" },
];

const BY_NAME = new Map(STUDIO_TOOLS.map((tool) => [tool.name, tool]));

export const findStudioTool = (name: string) => BY_NAME.get(name);
