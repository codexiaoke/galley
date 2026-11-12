"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Actor } from "@/core/actor";
import { getDb, type Db } from "@/core/db/client";
import { GalleyError } from "@/core/errors";
import { createAgent, regenerateAgentToken, setAgentDisabled } from "@/core/services/agents";
import { confirmBlockVerified, markBlockStale, setBlockVisibility } from "@/core/services/blocks";
import { createCategory, deleteCategory, updateCategory } from "@/core/services/categories";
import { decideChangeSet } from "@/core/services/changeSets";
import { setDocumentPublished } from "@/core/services/documents";
import { PUBLIC_CONTENT_TAG } from "../data";
import { endSession, loginAllowed, passwordMatches, recordFailedLogin, requireOwner, startSession } from "./auth";

/** 表单操作的结果。ok 表示成功；token 只在接入 Agent 或重新生成密钥时返回，供弹框显示一次。 */
export type FormState = { ok?: boolean; error?: string; token?: string; agentName?: string };

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

// ---- 文章 ----

export async function setDocumentStatus(_prev: FormState, formData: FormData) {
  return run((db, actor) => void setDocumentPublished(db, actor, text(formData, "id"), text(formData, "published") === "true"), {
    touchesPublic: true,
  });
}

// ---- 知识块 ----

export async function changeBlockVisibility(_prev: FormState, formData: FormData) {
  return run((db, actor) => setBlockVisibility(db, actor, text(formData, "id"), text(formData, "visibility") === "private" ? "private" : "public"));
}

export async function flagBlockStale(_prev: FormState, formData: FormData) {
  return run((db, actor) => void markBlockStale(db, actor, text(formData, "id")));
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
