import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OWNER, type Actor } from "../actor";
import { openDb, type Db } from "../db/client";
import { StudioProjects, voiceHash, voicesReady } from "../studio-projects";
import { StudioAccess, STUDIO_COOKIE, requireStudioOwner } from "../studio-access";
import { StudioConnection } from "../studio-connection";
import { studioConnection } from "../db/schema";
import { authenticateAgent, createAgent, setAgentCanPublish, setAgentDisabled } from "../services/agents";
import type { StudioSource, Voice } from "../studio-types";
import type { StudioExport } from "../studio-exports";

const source: StudioSource = { galley: "https://blog.example.com", slug: "scene-demo", title: "演示", present: "/posts/scene-demo/present", revisedAt: null, version: "a".repeat(64), beats: [
  { id: "cover", kind: "cover", page: 0, title: "演示", section: null, text: "开头", minMs: 100, suggestedMs: 1000 },
  { id: "p1", kind: "page", page: 1, title: null, section: null, text: "正文", minMs: 100, suggestedMs: 1000 },
] };
const voices: Voice[] = source.beats.map((beat) => ({ id: beat.id, hash: voiceHash(beat.text), audio: `/audio/${beat.id}.wav`, durationMs: 1000, cues: [{ start: 0, end: 1, text: beat.text }] }));
let db: Db, projects: StudioProjects, agent: Extract<Actor, { kind: "agent" }>, other: Extract<Actor, { kind: "agent" }>;
beforeEach(() => { db = openDb(":memory:"); projects = new StudioProjects(db); agent = authenticateAgent(db, createAgent(db, OWNER, "作者").token)!; other = authenticateAgent(db, createAgent(db, OWNER, "其他").token)!; });
afterEach(() => db.$client.close());
const create = () => projects.create(agent, source, "视频", null, voices);
const approve = (id: string, rev: string) => { projects.submit(agent, id, rev, "script"); projects.decide(OWNER, id, rev, "script", "approve", "审查完成"); };
const sample = (id: string, rev: string): StudioExport => ({ id: "sample", projectId: id, revisionId: rev, sourceVersion: source.version, slug: source.slug, title: source.title, name: "样片", state: "done", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), width: 3840, height: 2160, fps: 30, phase: "encoding", frames: 60, timeMs: 2000, estimatedMs: 2000, bytes: 10 });

describe("Studio 讲稿、审查与成片", () => {
  it("只改指向也建立待审版本，保留声音和历史指向，目标同步后不误指", () => {
    const withTargets = { ...source, beats: source.beats.map((beat) => ({ ...beat, targets: [{ id: "title", label: "标题" }] })) };
    const p = projects.create(agent, withTargets, "带指向的视频", null, voices);
    approve(p.id, p.currentRevisionId);
    const next = projects.revise(agent, p.id, p.currentRevisionId, [{ id: "p1", guides: [{ targetId: "title", phrase: "正文" }] }], "添加指向");
    expect(next.revision.voices).toEqual(voices);
    expect(next.revision.scriptStatus).toBe("draft");
    expect(projects.revision(p.currentRevisionId).beats[1].guides).toBeUndefined();
    expect(() => projects.revise(agent, p.id, next.currentRevisionId, [{ id: "p1", text: "修改后的文字" }], "只改稿")).toThrow("唯一出现");
    projects.submit(agent, p.id, next.currentRevisionId, "script");
    expect(() => projects.revise(agent, p.id, next.currentRevisionId, [{ id: "p1", guides: [] }], "改指向")).toThrow("撤回");
    projects.withdraw(agent, p.id, next.currentRevisionId, "script");
    const synced = projects.synchronize(agent, p.id, next.currentRevisionId, { ...source, version: "b".repeat(64) });
    expect(synced.revision.beats[1].guides).toEqual([]);
    expect(projects.revision(next.currentRevisionId).beats[1].guides).toHaveLength(1);
  });
  it("隔离 Agent 项目，只有站长可分配或批准", () => {
    const project = create();
    expect(project.assignedAgentId).toBe(agent.id);
    expect(projects.list(other)).toEqual([]);
    expect(() => projects.get(other, project.id)).toThrow("可以操作");
    expect(() => projects.configure(agent, project.id, "改名", other.id)).toThrow("只有站长");
    projects.submit(agent, project.id, project.currentRevisionId, "script");
    expect(() => projects.decide(agent, project.id, project.currentRevisionId, "script", "approve", "")).toThrow("只有站长");
    projects.configure(OWNER, project.id, "重新分配", other.id);
    expect(() => projects.get(agent, project.id)).toThrow("可以操作");
    expect(projects.get(other, project.id).name).toBe("重新分配");
    expect(() => requireStudioOwner(agent)).toThrow("站长");
  });
  it("待审锁定，打回后逐条回复，新版本保留未改声音且拒绝过期修改", () => {
    const p = create(), rev = p.currentRevisionId;
    expect(() => projects.beginVoices(agent, p.id, rev)).toThrow("先让讲稿");
    projects.submit(agent, p.id, rev, "script");
    expect(() => projects.revise(agent, p.id, rev, [], "")).toThrow("撤回");
    const commented = projects.addComment(OWNER, p.id, rev, { stage: "script", beatId: "p1", body: "正文应明确一点" });
    expect(() => projects.decide(OWNER, p.id, rev, "script", "approve", "")).toThrow("批注没有回复");
    projects.decide(OWNER, p.id, rev, "script", "reject", "请按批注调整");
    const updated = projects.revise(agent, p.id, rev, [{ id: "p1", text: "更清楚的正文" }], "改正文");
    expect(updated.revision.number).toBe(2); expect(updated.revision.voices.map((voice) => voice.id)).toEqual(["cover"]);
    expect(projects.revision(rev).beats[1].text).toBe("正文");
    expect(() => projects.submit(agent, p.id, updated.currentRevisionId, "script")).toThrow("批注没有回复");
    projects.reply(agent, p.id, commented.comments[0].id, "已在 v2 修改正文");
    projects.submit(agent, p.id, updated.currentRevisionId, "script");
    expect(() => projects.revise(agent, p.id, rev, [], "过期写入")).toThrow("项目已更新");
  });
  it("定稿绑定准确样片，后续修订不改变历史定稿", () => {
    const p = create(), rev = p.currentRevisionId; approve(p.id, rev);
    expect(voicesReady(projects.prepareRender(agent, p.id, rev))).toBe(true);
    const job = sample(p.id, rev); projects.attachRender(agent, p.id, rev, job.id);
    expect(() => projects.submit(agent, p.id, rev, "video", { ...job, sourceVersion: "b".repeat(64) })).toThrow("完整样片");
    expect(() => projects.submit(agent, p.id, rev, "video", { ...job, state: "running" })).toThrow("完整样片");
    projects.submit(agent, p.id, rev, "video", job);
    expect(() => projects.beginVoices(agent, p.id, rev, ["p1"])).toThrow("送审或定稿");
    projects.decide(OWNER, p.id, rev, "video", "approve", "声画审查完成", job);
    expect(() => projects.checkExportRemoval(OWNER, job)).toThrow("不能删除");
    const next = projects.revise(agent, p.id, rev, [], "重新制作");
    expect(next.revision).toMatchObject({ scriptStatus: "draft", videoStatus: "draft", sampleExportId: null });
    expect(projects.revision(rev)).toMatchObject({ videoStatus: "approved", sampleExportId: job.id });
    expect(() => projects.checkExportRemoval(OWNER, job)).toThrow("不能删除");
  });
  it("直接定稿默认关闭、即时撤权，只能确认自己的版本并留明显记录", () => {
    const p = create(), rev = p.currentRevisionId;
    expect(() => projects.publish(agent, p.id, rev, "script", "")).toThrow("没有直接定稿权限");
    setAgentCanPublish(db, OWNER, agent.id, true);
    const confirmed = projects.publish(agent, p.id, rev, "script", "站长已授权");
    expect(confirmed.revision.scriptDirect).toBe(true);
    expect(confirmed.events.some((event) => event.action.includes("未经人工审阅"))).toBe(true);
    const job = sample(p.id, rev); projects.attachRender(agent, p.id, rev, job.id);
    setAgentCanPublish(db, OWNER, agent.id, false);
    expect(() => projects.publish(agent, p.id, rev, "video", "", job)).toThrow("没有直接定稿权限");
    setAgentCanPublish(db, OWNER, agent.id, true);
    expect(projects.publish(agent, p.id, rev, "video", "检查完成", job).revision.videoDirect).toBe(true);
    const next = projects.revise(agent, p.id, rev, [], "修订"); setAgentDisabled(db, OWNER, agent.id, true);
    expect(() => projects.publish(agent, p.id, next.currentRevisionId, "script", "")).toThrow("没有直接定稿权限");
  });
  it("重新配音清除样片引用，错误内容不能入库，重启标明配音中断", () => {
    const p = create(), rev = p.currentRevisionId; approve(p.id, rev);
    projects.attachRender(agent, p.id, rev, "old-sample");
    const pending = projects.beginVoices(agent, p.id, rev, ["p1"]);
    expect(pending.voices.map((voice) => voice.id)).toEqual(["cover"]); expect(pending.sampleExportId).toBeNull();
    expect(() => projects.saveVoice(rev, { ...voices[1], hash: "bad" })).toThrow("不一致");
    expect(() => projects.prepareRender(agent, p.id, rev)).toThrow("全部生成");
    projects.recover(); expect(projects.revision(rev).voiceJob.state).toBe("failed");
    projects.beginVoices(agent, p.id, rev); projects.saveVoice(rev, voices[1]); projects.endVoices(agent, rev);
    expect(voicesReady(projects.revision(rev))).toBe(true);
  });
  it("来源同步不能偷偷切换文章，来源变化使审查重新开始", () => {
    const p = create(); approve(p.id, p.currentRevisionId);
    expect(() => projects.revise(agent, p.id, p.currentRevisionId, [], "同步", { ...source, slug: "other" })).toThrow("所属");
    const next = projects.revise(agent, p.id, p.currentRevisionId, [], "来源变化", { ...source, version: "b".repeat(64) });
    expect(next.revision.source.version).toBe("b".repeat(64)); expect(next.revision.scriptStatus).toBe("draft");
  });
});

describe("Studio 管理身份与连接配置", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "studio-access-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  it("站长会话持久验证，Agent 密钥不能登录，损坏 cookie 不抛异常", () => {
    const access = new StudioAccess(dir), key = readFileSync(path.join(dir, ".owner-key"), "utf8");
    expect(access.login("gly_agent")).toBeNull();
    const cookie = `${STUDIO_COOKIE}=${access.login(key)}`;
    expect(new StudioAccess(dir).isOwner(cookie)).toBe(true);
    expect(access.isOwner(`${STUDIO_COOKIE}=9999999999999.${"中".repeat(64)}`)).toBe(false);
    expect(access.isOwner(cookie.replace(/.$/, "x"))).toBe(false);
  });
  it("站点密钥加密且不返回浏览器，切换站点不能沿用旧密钥", () => {
    const connection = new StudioConnection(db, dir, { url: "https://blog.example.com", token: "secret-original" });
    expect(connection.public()).toEqual({ galley: source.galley, hasToken: true });
    expect(db.select().from(studioConnection).get()!.token).not.toContain("secret-original");
    expect(connection.candidate(OWNER, source.galley, "").token).toBe("secret-original");
    expect(() => connection.candidate(OWNER, "https://other.example.com", "")).toThrow("新站点");
    expect(() => connection.candidate(agent, source.galley, "stolen")).toThrow("只有站长");
    const candidate = connection.candidate(OWNER, "https://other.example.com", "new-secret"); connection.save(OWNER, candidate);
    expect(new StudioConnection(db, dir, { url: source.galley, token: "old-env" }).read()).toEqual(candidate);
  });
  it("密码登录保留本机快捷入口，修改密码后旧会话失效", () => {
    const password = "studio-test-password", access = new StudioAccess(dir, password);
    const key = readFileSync(path.join(dir, ".owner-key"), "utf8");
    expect(access.passwordEnabled).toBe(true);
    expect(access.login("wrong-password")).toBeNull();
    expect(access.login(agent.id)).toBeNull();
    expect(access.login("")).toBeNull();
    expect(access.login(key)).not.toBeNull();
    const cookie = `${STUDIO_COOKIE}=${access.login(password)}`;
    expect(new StudioAccess(dir, password).isOwner(cookie)).toBe(true);
    const changed = new StudioAccess(dir, "changed-test-password");
    expect(changed.isOwner(cookie)).toBe(false);
    expect(changed.login(password)).toBeNull();
    expect(new StudioAccess(dir).isOwner(cookie)).toBe(false);
    expect(readFileSync(path.join(dir, ".owner-key"), "utf8")).toBe(key);
    expect(() => new StudioAccess(dir, "short")).toThrow("8–200");
  });
  it("未配置时不连接本地调试站点，可从界面保存线上连接", () => {
    expect(() => new StudioConnection(db, dir, { url: "", token: "orphan-token" })).toThrow("站点根地址");
    const connection = new StudioConnection(db, dir, { url: "", token: "" });
    expect(connection.public()).toEqual({ galley: "", hasToken: false });
    const candidate = connection.candidate(OWNER, "https://blog.example.com", "online-token");
    connection.save(OWNER, candidate);
    expect(new StudioConnection(db, dir, { url: "", token: "" }).read()).toEqual(candidate);
  });
});
