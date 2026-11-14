import { beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { GalleyError } from "../errors";
import { authenticateAgent, createAgent, disabledToolsOf, listAgents, setAgentCanPublish, setAgentDisabledTools } from "../services/agents";
import { findChangeSet, openChangeSet, publishChangeSet } from "../services/changeSets";
import { createBlock } from "../services/blocks";
import { listOperationLog } from "../services/oplog";
import {
  getDefaultSkill,
  getSkill,
  listSkills,
  listSkillSuggestions,
  resetSkill,
  resolveSkillSuggestion,
  saveSkill,
  skillHistory,
  suggestSkillChange,
} from "../services/skills";
import { toolsFor } from "../tools";
import { createMcpServer, registeredTools } from "../../mcp/server";

const TOOLS = toolsFor("galley");
let db: Db;
let agent: Extract<Actor, { kind: "agent" }>;

function expectError(fn: () => unknown, code: GalleyError["code"], pattern?: RegExp) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GalleyError);
    expect((e as GalleyError).code).toBe(code);
    if (pattern) expect((e as GalleyError).message).toMatch(pattern);
    return;
  }
  throw new Error("预期会抛出错误，但没有");
}

beforeEach(() => {
  db = openDb(":memory:");
  agent = authenticateAgent(db, createAgent(db, OWNER, "测试 Agent").token)!;
});

describe("技能", () => {
  it("没改过时用程序自带的默认技能", () => {
    const names = listSkills(db).map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(["overview", "writing", "markup", "knowledge", "materials"]));
    expect(listSkills(db).every((s) => s.source === "default")).toBe(true);
    expect(getSkill(db, "overview")!.content).toContain("get_next_tasks");
    expect(getSkill(db, "../../etc/passwd")).toBeUndefined();
  });

  it("站长修改后以修改的为准，每次保存留一个版本；Agent 不能改", () => {
    expectError(() => saveSkill(db, agent, { name: "writing", description: "x", body: "被 Agent 改掉" }), "forbidden", /suggest_skill_change/);
    saveSkill(db, OWNER, { name: "writing", description: "写作要求", body: "第一版的要求。", note: "先写个简单的" });
    saveSkill(db, OWNER, { name: "writing", description: "写作要求", body: "第二版的要求。", note: "补了一条" });

    const skill = getSkill(db, "writing")!;
    expect(skill.source).toBe("modified");
    expect(skill.content).toBe("第二版的要求。");
    expect(skillHistory(db, "writing").map((r) => r.note)).toEqual(["补了一条", "先写个简单的"]);
    // 默认版本还在，可以用来对比和恢复。
    expect(getDefaultSkill("writing")!.body).not.toBe("第二版的要求。");
  });

  it("恢复默认会丢掉修改；站长自己新建的技能恢复默认就是删除", () => {
    saveSkill(db, OWNER, { name: "writing", description: "写作要求", body: "改过的。" });
    saveSkill(db, OWNER, { name: "fact-check", description: "核实事实的做法", body: "每个数字都要有来源。" });
    expect(listSkills(db).find((s) => s.name === "fact-check")?.source).toBe("custom");

    expectError(() => resetSkill(db, agent, "writing"), "forbidden");
    resetSkill(db, OWNER, "writing");
    expect(getSkill(db, "writing")!.source).toBe("default");
    resetSkill(db, OWNER, "fact-check");
    expect(getSkill(db, "fact-check")).toBeUndefined();
    expectError(() => resetSkill(db, OWNER, "overview"), "not_found");
    // 历史还在。
    expect(skillHistory(db, "fact-check")).toHaveLength(1);
  });

  it("拒绝不合法的名字、空内容和空说明", () => {
    expectError(() => saveSkill(db, OWNER, { name: "Bad Name", description: "x", body: "x" }), "invalid", /小写字母/);
    expectError(() => saveSkill(db, OWNER, { name: "ok", description: "x", body: "  " }), "invalid");
    expectError(() => saveSkill(db, OWNER, { name: "ok", description: " ", body: "x" }), "invalid", /一句说明/);
  });

  it("技能里由程序生成的部分，站长改过之后仍然会填上", () => {
    saveSkill(db, OWNER, { name: "markup", description: "正文写法", body: "可用的组件：\n\n{{components}}" });
    const skill = getSkill(db, "markup")!;
    expect(skill.body).toContain("{{components}}");
    expect(skill.content).toContain("callout");
    expect(skill.content).not.toContain("{{components}}");
  });
});

describe("技能的修改建议", () => {
  it("Agent 提建议不会改变技能；站长处理后从待处理里消失", () => {
    const before = getSkill(db, "writing")!.content;
    const { suggestionId } = suggestSkillChange(db, agent, { skill: "writing", suggestion: "加一条：开头不要铺垫。", reason: "连续两次因为开头被打回" });
    expect(getSkill(db, "writing")!.content).toBe(before);

    const [open] = listSkillSuggestions(db);
    expect(open).toMatchObject({ skillName: "writing", suggestion: "加一条：开头不要铺垫。", agentName: "测试 Agent" });
    expectError(() => resolveSkillSuggestion(db, agent, suggestionId, "done"), "forbidden");
    resolveSkillSuggestion(db, OWNER, suggestionId, "done");
    expect(listSkillSuggestions(db)).toHaveLength(0);
    expect(listSkillSuggestions(db, "done")).toHaveLength(1);
  });

  it("只有 Agent 能提；技能要存在；内容不能为空；不能刷屏", () => {
    expectError(() => suggestSkillChange(db, OWNER, { skill: "writing", suggestion: "x" }), "forbidden");
    expectError(() => suggestSkillChange(db, agent, { skill: "nope", suggestion: "x" }), "not_found", /可用的技能/);
    expectError(() => suggestSkillChange(db, agent, { skill: "writing", suggestion: "  " }), "invalid");
    for (let i = 0; i < 10; i++) suggestSkillChange(db, agent, { skill: "writing", suggestion: `建议 ${i}` });
    expectError(() => suggestSkillChange(db, agent, { skill: "writing", suggestion: "第 11 条" }), "invalid", /先不要再提/);
  });
});

describe("按 Agent 开关工具", () => {
  it("清单和实际注册的工具一致，没有重复", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(registeredTools(createMcpServer(db, agent)).sort()).toEqual([...names].sort());
  });

  it("关掉的工具不会注册；离不开的工具关不掉；不认识的名字被忽略", () => {
    expectError(() => setAgentDisabledTools(db, agent, agent.id, ["add_material"]), "forbidden");
    const saved = setAgentDisabledTools(db, OWNER, agent.id, ["add_material", "get_block", "get_next_tasks", "no_such_tool", "add_material"]);
    expect(saved).toEqual(["add_material", "get_block"]);
    expect([...disabledToolsOf(db, agent.id)].sort()).toEqual(["add_material", "get_block"]);
    expect(listAgents(db)[0].disabledTools).toEqual(["add_material", "get_block"]);

    const tools = registeredTools(createMcpServer(db, agent));
    expect(tools).not.toContain("add_material");
    expect(tools).not.toContain("get_block");
    expect(tools).toContain("get_next_tasks");
    expect(tools).toHaveLength(TOOLS.length - 2);

    // 别的 Agent 不受影响。
    const other = authenticateAgent(db, createAgent(db, OWNER, "另一个").token)!;
    expect(registeredTools(createMcpServer(db, other))).toHaveLength(TOOLS.length);

    setAgentDisabledTools(db, OWNER, agent.id, []);
    expect(registeredTools(createMcpServer(db, agent))).toHaveLength(TOOLS.length);
  });

  it("MCP 里没有批准、下线、读取留言、修改技能这类工具；能让内容上线的只有一个，而且要单独授权", () => {
    const forbidden = /approve|unpublish|decide|message|save_skill|update_skill|delete|permission|token/;
    expect(TOOLS.filter((t) => forbidden.test(t.name)).map((t) => t.name)).toEqual([]);
    expect(TOOLS.filter((t) => t.name.includes("publish")).map((t) => t.name)).toEqual(["publish_change_set"]);
    // 不能是必需工具：站长要能关掉它
    expect(TOOLS.find((t) => t.name === "publish_change_set")?.required).toBeUndefined();
  });
});

describe("直接上线", () => {
  const writeSomething = () => {
    const cs = openChangeSet(db, agent, { kind: "knowledge", title: "整理" });
    const made = createBlock(db, agent, { changeSetId: cs.id, type: "opinion", title: "观点", body: "我认为这样更好。" });
    if (!made.created) throw new Error("没建成");
    return cs.id;
  };

  it("默认不行，提示去提交审阅", () => {
    expect(listAgents(db)[0].canPublish).toBe(false);
    expectError(() => publishChangeSet(db, agent, writeSomething()), "forbidden", /submit_change_set/);
  });

  it("站长开了之后可以，内容真的上线，并且标出没经过审阅", () => {
    setAgentCanPublish(db, OWNER, agent.id, true);
    const id = writeSomething();
    const result = publishChangeSet(db, agent, id, "上线一条观点");
    expect(result.changeSet.status).toBe("approved");
    expect(result.affected.blockIds).toHaveLength(1);
    expect(findChangeSet(db, id).publishedWithoutReview).toBe(true);
    expect(listOperationLog(db)[0]).toMatchObject({ withoutReview: true, title: "整理" });
  });

  it("只能上线自己的；站长收回后立刻失效", () => {
    setAgentCanPublish(db, OWNER, agent.id, true);
    const other = authenticateAgent(db, createAgent(db, OWNER, "另一个").token)!;
    setAgentCanPublish(db, OWNER, other.id, true);
    const mine = writeSomething();
    expectError(() => publishChangeSet(db, other, mine), "forbidden", /不是你创建的/);

    setAgentCanPublish(db, OWNER, agent.id, false);
    expectError(() => publishChangeSet(db, agent, mine), "forbidden", /没有直接上线的权限/);
  });

  it("空的变更集上线不了；Agent 自己不能给自己开权限", () => {
    setAgentCanPublish(db, OWNER, agent.id, true);
    const empty = openChangeSet(db, agent, { kind: "knowledge", title: "空的" });
    expectError(() => publishChangeSet(db, agent, empty.id), "invalid", /还没有任何内容/);
    expectError(() => setAgentCanPublish(db, agent, agent.id, true), "forbidden");
  });
});
