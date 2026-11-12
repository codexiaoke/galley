"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Actor } from "@/core/actor";
import { getDb, type Db } from "@/core/db/client";
import { GalleyError } from "@/core/errors";
import { createAgent, regenerateAgentToken, setAgentDisabled, setAgentDisabledTools } from "@/core/services/agents";
import type { MarkupIssue } from "@/core/markup/parse";
import { confirmBlockVerified, editBlockAsOwner, editDraftBlock, markBlockStale, setBlockVisibility } from "@/core/services/blocks";
import { createCategory, deleteCategory, updateCategory } from "@/core/services/categories";
import { decideChangeSet } from "@/core/services/changeSets";
import { addComment, deleteComment, reopenComment, resolveComment } from "@/core/services/comments";
import { createDocumentAsOwner, editDocumentAsOwner, previewDocumentBody, saveDocument, setDocumentPublished } from "@/core/services/documents";
import { deleteMessage, setMessageStatus } from "@/core/services/messages";
import { addMaterial, deleteMaterial, setMaterialStatus } from "@/core/services/materials";
import { deleteMedia, saveMedia, updateMediaAlt } from "@/core/services/media";
import { updateSiteSettings } from "@/core/services/settings";
import { clearMailSettings, resolveMailConfig, saveMailSettings } from "@/core/services/mail";
import { smtpSender } from "@/core/services/notify";
import { setHiddenFromLog } from "@/core/services/oplog";
import { resetSkill, resolveSkillSuggestion, saveSkill } from "@/core/services/skills";
import { renameTag } from "@/core/services/tags";
import { TOOLS } from "@/core/tools";
import { createTopic, decideTopic, updateTopic } from "@/core/services/topics";
import { PUBLIC_CONTENT_TAG } from "../data";
import { endSession, loginAllowed, passwordMatches, recordFailedLogin, requireOwner, startSession } from "./auth";

/**
 * 表单操作的结果。ok 表示成功；token 只在接入 Agent 或重新生成密钥时返回，供弹框显示一次；
 * issues 是保存正文时检查出的问题（有错误时不会保存）。
 */
export type FormState = { ok?: boolean; error?: string; token?: string; agentName?: string; issues?: MarkupIssue[] };

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/**
 * 后台操作的统一外壳：确认是站长、执行、把可预期的错误变成提示、刷新当前页面。
 * touchesPublic 表示这个操作会改变读者看到的内容，需要同时刷新前台的缓存。
 */
async function run(
  fn: (db: Db, actor: Actor) => FormState | void,
  options: { touchesPublic?: boolean } = {},
): Promise<FormState> {
  const actor = await requireOwner();
  let result: FormState | void;
  try {
    result = fn(getDb(), actor);
  } catch (e) {
    if (e instanceof GalleyError) return { error: e.message };
    throw e;
  }
  // 操作本身没出错、但也没有做成（比如正文有错误没能保存）：原样把原因交回去，不刷新页面。
  if (result?.error) return result;
  if (options.touchesPublic) updateTag(PUBLIC_CONTENT_TAG);
  refresh();
  return { ok: true, ...result };
}

// ---- 登录 ----

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!loginAllowed()) return { error: "尝试次数过多，请一分钟后再试。" };
  if (!passwordMatches(text(formData, "password"))) {
    recordFailedLogin();
    return { error: "密码不正确。" };
  }
  await startSession();
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}

// ---- 审阅 ----

/** 批准或打回一个变更集。这是内容上线的唯一入口。 */
export async function decide(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireOwner();
  const decision = formData.get("decision") === "approve" ? "approve" : "reject";
  try {
    decideChangeSet(getDb(), actor, text(formData, "changeSetId"), decision, text(formData, "note"));
  } catch (e) {
    if (e instanceof GalleyError) return { error: e.message };
    throw e;
  }
  if (decision === "approve") updateTag(PUBLIC_CONTENT_TAG);
  redirect("/admin");
}

// ---- 批注 ----

export async function addReviewComment(_prev: FormState, formData: FormData) {
  return run(
    (db, actor) =>
      void addComment(db, actor, {
        changeSetId: text(formData, "changeSetId"),
        targetType: text(formData, "targetType") === "block" ? "block" : "document",
        targetRevisionId: text(formData, "targetRevisionId"),
        quote: text(formData, "quote"),
        prefix: text(formData, "prefix"),
        suffix: text(formData, "suffix"),
        body: text(formData, "body"),
      }),
  );
}

/** 改变一条批注的状态：重新打开、标为已处理，或者删除。 */
export async function changeReviewComment(_prev: FormState, formData: FormData) {
  return run((db, actor) => {
    const id = text(formData, "id");
    const op = text(formData, "op");
    if (op === "reopen") reopenComment(db, actor, id);
    else if (op === "resolve") resolveComment(db, actor, id);
    else deleteComment(db, actor, id);
  });
}

// ---- 文章 ----

export async function setDocumentStatus(_prev: FormState, formData: FormData) {
  return run((db, actor) => void setDocumentPublished(db, actor, text(formData, "id"), text(formData, "published") === "true"), {
    touchesPublic: true,
  });
}

/**
 * 编辑器的实时预览：检查正文，并取出它引用到的知识块。只读，不改任何东西。
 * changeSetId 给出时，是在待审的改动里直接改稿，可以引用那个改动里还没批准的知识块。
 */
export async function previewBody(body: string, changeSetId?: string) {
  await requireOwner();
  return previewDocumentBody(getDb(), body, changeSetId);
}

/**
 * 站长保存一篇文章或页面。三种情况共用这一个操作：
 * - 表单里带 cs：改的是那个待审改动里的稿子，批准后才上线；
 * - 带 id、不带 cs：直接修改已上线的内容，立即生效；
 * - 都不带：站长自己新建，保存后立即上线。
 */
export async function saveDocumentEdit(_prev: FormState, formData: FormData) {
  const changeSetId = text(formData, "cs");
  return run(
    (db, actor) => {
      const input = {
        documentId: text(formData, "id"),
        title: text(formData, "title"),
        summary: text(formData, "summary"),
        category: text(formData, "category") || undefined,
        // 页面没有标签输入框，这时不改标签；有输入框时按逗号、顿号拆开。
        tags: formData.has("tags") ? text(formData, "tags").split(/[,，、]/) : undefined,
        body: text(formData, "body").replace(/\r\n/g, "\n"),
      };
      const result = changeSetId
        ? saveDocument(db, actor, { ...input, changeSetId })
        : input.documentId
          ? editDocumentAsOwner(db, actor, input)
          : createDocumentAsOwner(db, actor, { ...input, kind: text(formData, "kind") === "page" ? "page" : "article", slug: text(formData, "slug") });
      if (!result.saved) {
        const errors = result.issues.filter((i) => i.level === "error").length;
        return { error: `正文里有 ${errors} 处错误，没有保存。改好之后再保存。`, issues: result.issues };
      }
    },
    { touchesPublic: !changeSetId },
  );
}

// ---- 知识块 ----

/** 站长修改知识块。带 cs 时改的是待审改动里的草稿；不带时是直接修改，立即生效。 */
export async function saveBlockEdit(_prev: FormState, formData: FormData) {
  const changeSetId = text(formData, "cs");
  return run(
    (db, actor) => {
      const input = { blockId: text(formData, "id"), title: text(formData, "title"), body: text(formData, "body").replace(/\r\n/g, "\n") };
      if (changeSetId) editDraftBlock(db, actor, { ...input, changeSetId });
      else editBlockAsOwner(db, actor, { ...input, semanticChange: text(formData, "semanticChange") !== "false", reason: text(formData, "reason") });
    },
    { touchesPublic: !changeSetId },
  );
}

export async function changeBlockVisibility(_prev: FormState, formData: FormData) {
  return run((db, actor) => setBlockVisibility(db, actor, text(formData, "id"), text(formData, "visibility") === "private" ? "private" : "public"));
}

export async function flagBlockStale(_prev: FormState, formData: FormData) {
  return run((db, actor) => void markBlockStale(db, actor, text(formData, "id"), text(formData, "reason")));
}

export async function confirmBlock(_prev: FormState, formData: FormData) {
  return run((db, actor) => confirmBlockVerified(db, actor, text(formData, "id")));
}

// ---- 分类 ----

/** 新建或修改分类：表单里带 id 就是修改。 */
export async function saveCategory(_prev: FormState, formData: FormData) {
  return run(
    (db, actor) => {
      const input = { name: text(formData, "name"), slug: text(formData, "slug") };
      const id = text(formData, "id");
      if (id) updateCategory(db, actor, id, { ...input, sortOrder: Number(text(formData, "sortOrder")) });
      else createCategory(db, actor, input);
    },
    { touchesPublic: true },
  );
}

export async function removeCategory(_prev: FormState, formData: FormData) {
  return run((db, actor) => deleteCategory(db, actor, text(formData, "id")), { touchesPublic: true });
}

// ---- 素材箱 ----

export async function saveMaterial(_prev: FormState, formData: FormData) {
  return run(
    (db, actor) =>
      void addMaterial(db, actor, { content: text(formData, "content"), url: text(formData, "url"), isPrivate: text(formData, "isPrivate") === "true" }),
  );
}

export async function changeMaterialStatus(_prev: FormState, formData: FormData) {
  return run((db, actor) => setMaterialStatus(db, actor, text(formData, "id"), text(formData, "status") === "archived" ? "archived" : "new"));
}

export async function removeMaterial(_prev: FormState, formData: FormData) {
  return run((db, actor) => deleteMaterial(db, actor, text(formData, "id")));
}

// ---- 选题池 ----

/** 新建或修改选题：表单里带 id 就是修改。 */
export async function saveTopic(_prev: FormState, formData: FormData) {
  return run((db, actor) => {
    const input = { title: text(formData, "title"), note: text(formData, "note"), priority: Number(text(formData, "priority") || 0) };
    const id = text(formData, "id");
    if (id) updateTopic(db, actor, id, input);
    else createTopic(db, actor, input);
  });
}

export async function decideOnTopic(_prev: FormState, formData: FormData) {
  return run((db, actor) => decideTopic(db, actor, text(formData, "id"), text(formData, "decision") === "accept" ? "accept" : "drop"));
}

// ---- 留言 ----

/** 处理一条留言：标为已读、标回未读，或者删除。 */
export async function changeMessage(_prev: FormState, formData: FormData) {
  return run((db, actor) => {
    const id = text(formData, "id");
    const op = text(formData, "op");
    if (op === "delete") deleteMessage(db, actor, id);
    else setMessageStatus(db, actor, id, op === "unread" ? "new" : "read");
  });
}

// ---- 媒体库 ----

export async function uploadMedia(_prev: FormState, formData: FormData) {
  const file = formData.get("file");
  const bytes = file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();
  return run((db, actor) => void saveMedia(db, actor, { bytes, originalName: file instanceof File ? file.name : "", alt: text(formData, "alt") }));
}

export async function saveMediaAlt(_prev: FormState, formData: FormData) {
  return run((db, actor) => updateMediaAlt(db, actor, text(formData, "id"), text(formData, "alt")), { touchesPublic: true });
}

export async function removeMedia(_prev: FormState, formData: FormData) {
  return run((db, actor) => deleteMedia(db, actor, text(formData, "id")));
}

// ---- 站点设置 ----

export async function saveSettings(_prev: FormState, formData: FormData) {
  return run(
    (db, actor) =>
      void updateSiteSettings(db, actor, {
        name: text(formData, "name"),
        description: text(formData, "description"),
        author: text(formData, "author"),
        url: text(formData, "url"),
        showLog: text(formData, "showLog") === "off" ? "off" : "on",
      }),
    { touchesPublic: true },
  );
}

// ---- MCP ----

export async function addAgent(_prev: FormState, formData: FormData) {
  return run((db, actor) => {
    const { agent, token } = createAgent(db, actor, text(formData, "name"));
    return { token, agentName: agent.name };
  });
}

export async function resetAgentToken(_prev: FormState, formData: FormData) {
  return run((db, actor) => {
    const { agent, token } = regenerateAgentToken(db, actor, text(formData, "id"));
    return { token, agentName: agent.name };
  });
}

export async function setAgentStatus(_prev: FormState, formData: FormData) {
  return run((db, actor) => setAgentDisabled(db, actor, text(formData, "id"), text(formData, "disabled") === "true"));
}

/** 调整一个 Agent 能用哪些工具。表单里勾选的是"可以用"的，没勾的就是关掉的。 */
export async function saveAgentTools(_prev: FormState, formData: FormData) {
  return run((db, actor) => {
    const enabled = new Set(formData.getAll("tool").map(String));
    const disabled = TOOLS.filter((tool) => !tool.required && !enabled.has(tool.name)).map((tool) => tool.name);
    setAgentDisabledTools(db, actor, text(formData, "id"), disabled);
  });
}

// ---- 技能 ----

export async function saveSkillEdit(_prev: FormState, formData: FormData) {
  return run(
    (db, actor) =>
      void saveSkill(db, actor, {
        name: text(formData, "name"),
        description: text(formData, "description"),
        body: text(formData, "body").replace(/\r\n/g, "\n"),
        note: text(formData, "note"),
      }),
  );
}

/** 丢掉站长对一个技能的修改：自带的技能恢复默认，自己新建的技能删除。 */
export async function restoreSkill(_prev: FormState, formData: FormData) {
  return run((db, actor) => resetSkill(db, actor, text(formData, "name")));
}

export async function handleSkillSuggestion(_prev: FormState, formData: FormData) {
  return run((db, actor) => resolveSkillSuggestion(db, actor, text(formData, "id"), text(formData, "status") === "done" ? "done" : "dismissed"));
}

// ---- 标签 ----

/** 改名或合并标签（带 to），或者删掉它（不带 to）。会修改所有用到它的已发布文章。 */
export async function changeTag(_prev: FormState, formData: FormData) {
  return run(
    (db, actor) => {
      const to = text(formData, "op") === "delete" ? null : text(formData, "to");
      renameTag(db, actor, text(formData, "from"), to);
    },
    { touchesPublic: true },
  );
}

// ---- 运营日志 ----

export async function toggleLogEntry(_prev: FormState, formData: FormData) {
  return run((db, actor) => setHiddenFromLog(db, actor, text(formData, "id"), text(formData, "hidden") === "true"), { touchesPublic: true });
}

// ---- 邮件通知 ----

/** 保存邮件设置，以及要通知哪些事。密码留空表示沿用已经存的。 */
export async function saveMail(_prev: FormState, formData: FormData) {
  return run((db, actor) => {
    // 由环境变量配置时表单里没有服务器这些项，只保存通知哪些事。
    if (formData.has("host")) {
      saveMailSettings(db, actor, {
        host: text(formData, "host"),
        port: text(formData, "port"),
        security: text(formData, "security"),
        user: text(formData, "user"),
        password: text(formData, "password"),
        to: text(formData, "to"),
        from: text(formData, "from"),
      });
    }
    updateSiteSettings(db, actor, {
      notifyReview: text(formData, "notifyReview") === "off" ? "off" : "on",
      notifyMessages: text(formData, "notifyMessages") === "off" ? "off" : "on",
    });
  });
}

export async function removeMailSettings() {
  return run((db, actor) => clearMailSettings(db, actor));
}

/** 发一封测试邮件，确认 SMTP 的配置能用。失败时把服务器给的原因告诉站长。 */
export async function sendTestMail(): Promise<FormState> {
  await requireOwner();
  const config = resolveMailConfig(getDb());
  if (!config) return { error: "还没有可用的邮件设置。先填好并保存，再发测试邮件。" };
  try {
    await smtpSender(config)({ subject: "Galley 测试邮件", text: "收到这封邮件，说明你的站点能正常发出通知。" });
    return { ok: true };
  } catch (e) {
    return { error: `没有发出去：${e instanceof Error ? e.message : String(e)}` };
  }
}
