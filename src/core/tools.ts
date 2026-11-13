/**
 * MCP 工具的清单：有哪些工具、各自属于哪一类、能不能被站长关掉。
 *
 * 清单放在核心层，因为"哪个 Agent 能用哪些工具"是权限规则。src/mcp 注册工具时以这里为准：
 * 清单里没有的工具注册不上，被站长关掉的工具不会出现在那个 Agent 的工具列表里。
 */

export type ToolInfo = {
  name: string;
  group: string;
  /** 给站长看的一句话说明 */
  label: string;
  /** 运营流程离不开的工具，不能关 */
  required?: boolean;
};

export const TOOLS: ToolInfo[] = [
  { name: "get_next_tasks", group: "入门", label: "查看待办", required: true },
  { name: "list_skills", group: "入门", label: "列出技能", required: true },
  { name: "get_skill", group: "入门", label: "读取技能", required: true },
  { name: "suggest_skill_change", group: "入门", label: "对技能提修改建议" },
  { name: "list_components", group: "入门", label: "查看正文里可用的组件" },
  { name: "get_component", group: "入门", label: "读一个组件的详细说明" },
  { name: "list_categories", group: "入门", label: "查看分类" },
  { name: "list_tags", group: "入门", label: "查看已有的标签" },

  { name: "open_change_set", group: "变更集", label: "开启一个变更集", required: true },
  { name: "get_change_set", group: "变更集", label: "查看变更集的内容和批注", required: true },
  { name: "submit_change_set", group: "变更集", label: "提交审阅", required: true },
  { name: "publish_change_set", group: "变更集", label: "直接上线（还要单独给这个 Agent 开权限）" },
  { name: "withdraw_change_set", group: "变更集", label: "撤回变更集", required: true },
  { name: "reply_comment", group: "变更集", label: "回复批注", required: true },

  { name: "search_blocks", group: "知识块", label: "搜索知识块" },
  { name: "get_block", group: "知识块", label: "读取知识块（包括私密的，会留下读取记录）" },
  { name: "create_block", group: "知识块", label: "新建知识块" },
  { name: "propose_block_update", group: "知识块", label: "提出知识块的更新" },
  { name: "mark_block_stale", group: "知识块", label: "把知识块标记为过期" },

  { name: "list_documents", group: "文章", label: "列出已有的文章" },
  { name: "get_document", group: "文章", label: "读取文章正文" },
  { name: "save_document", group: "文章", label: "保存文章或页面" },
  { name: "edit_document", group: "文章", label: "只改正文里的一小段" },
  { name: "list_media", group: "文章", label: "查看媒体库里的图片" },
  { name: "upload_image", group: "文章", label: "往媒体库传图片" },

  { name: "get_analytics", group: "访问数据", label: "读访问数据（只有汇总数字）" },

  { name: "add_material", group: "素材和选题", label: "替站长记素材" },
  { name: "list_materials", group: "素材和选题", label: "读取素材箱" },
  { name: "mark_material_processed", group: "素材和选题", label: "标记素材已处理" },
  { name: "propose_topic", group: "素材和选题", label: "提出候选选题" },
  { name: "list_topics", group: "素材和选题", label: "查看选题" },
  { name: "claim_topic", group: "素材和选题", label: "领取选题开始写" },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export const findTool = (name: string) => BY_NAME.get(name);

/** 把一组工具名整理成合法的"关掉的工具"清单：去掉不认识的、不能关的和重复的。 */
export function normalizeDisabledTools(names: string[]): string[] {
  return [...new Set(names)].filter((name) => BY_NAME.has(name) && !BY_NAME.get(name)!.required).sort();
}
