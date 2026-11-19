import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runScene3D } from "../scene3d/execute";
import { runScenes3D } from "../scene3d/run";
import { scene3dFrame } from "../scene3d/frame";
import { scene3dKey } from "../scene3d/shared";
import { scene3dAssets } from "../scene3d/schema";
import { parseMarkup } from "../markup/parse";
import { presentationBeats } from "../../render/beats";
import { structureFingerprint } from "../presentation-version";
import { validateGlb } from "../scene3d/glb";
import { readImmersiveScene3D, readScene3DSlide } from "../../render/scene3d-source";
import { splitSlides } from "../../render/slides";
import { turnKind } from "../../render/turn";

const BASIC=`world({});geometry("box",{kind:"box"});material("metal",{color:"#aabbcc"});node("part",{kind:"mesh",geometry:"box",material:"metal"});node("camera",{kind:"camera",position:[4,3,6]});shot("move","移动",4000);track("part","position",[[0,[0,0,0]],[4000,[4,0,0]]]);`;
const body=(code:string)=>':::scene3d\n```js\n'+code+'\n```\n:::';
const compile=async(code:string)=>{const result=await runScene3D(code);if(!result.ok)throw Error(result.error);return result.scene;};

describe("内容驱动三维",()=>{
  it("混合演示保留 PPT 页面与顺序，只把三维页铺满舞台，并双向切换", async () => {
    const source = `## 原理\n\n先解释计算。\n\n## 观察\n\n${body(BASIC)}\n\n## 总结\n\n回到原理。`;
    const scenes = await runScenes3D(source), pages = splitSlides(source);
    expect(readImmersiveScene3D(source, scenes)).toBeNull();
    const modes = pages.map((page) => ({ ...page, scene3d: readScene3DSlide(page.source, scenes) }));
    expect(modes.map((page) => !!page.scene3d)).toEqual([false, true, false]);
    expect(turnKind(modes, 1, 2)).toBe("scene-enter");
    expect(turnKind(modes, 2, 3)).toBe("scene-exit");
    expect(turnKind(modes, 3, 2)).toBe("scene-enter");
    expect(turnKind(modes, 2, 1)).toBe("scene-exit");
    const beats = presentationBeats(source, {}, scenes);
    expect(beats.map((beat) => beat.kind)).toEqual(["cover", "page", "page", "step", "page", "ending"]);
    expect(beats.filter((beat) => beat.kind === "step")[0]).toMatchObject({ page: 2, minMs: 4000 });
    expect(readImmersiveScene3D(body(BASIC), scenes)?.scene.shots).toHaveLength(1);
  });
  it("从内容生成任意布局；正放、回退、重播使用绝对时间",async()=>{
    const scene=await compile(BASIC);
    expect(scene3dFrame(scene,3000).part.position).toEqual([3,0,0]);
    expect(scene3dFrame(scene,1000).part.position).toEqual([1,0,0]);
    expect(scene3dFrame(scene,3000).part.position).toEqual([3,0,0]);
  });
  it("时间函数复用数组也不会让所有采样变成最后一帧",async()=>{
    const code=BASIC.slice(0,BASIC.indexOf('track('))+`const p=[0,0,0];animate(t=>{p[0]=t/1000;return {part:{position:p}}});`;
    const scene=await compile(code);
    expect(scene3dFrame(scene,1000).part.position).toEqual([1,0,0]);
  });
  it("拒绝未知引用、循环层级、重复轨迹与非法资源",async()=>{
    for(const code of [BASIC.replace('geometry:"box"','geometry:"missing"'),BASIC+'node("cycle",{kind:"group",parent:"cycle"});',BASIC+'track("part","position",[[0,[0,0,0]]]);',BASIC+'node("external",{kind:"model",src:"https://example.com/a.glb"});',BASIC+'track("camera","fov",[[0,180]]);']) expect((await runScene3D(code)).ok).toBe(false);
  });
  it("沙箱没有宿主和网络访问，超时会终止",async()=>{
    for(const code of ['process.exit()','fetch("https://example.com")','window.location','while(true){}']) expect((await runScene3D(code)).ok).toBe(false);
  },10000);
  it("保存正文报告编译错误，资源必须可追踪",async()=>{
    const source=body(BASIC+'node("model",{kind:"model",src:"/media/"+"test.glb"})');
    await runScenes3D(source);
    expect(parseMarkup(source).issues.some((i)=>i.message.includes("不能拼接"))).toBe(true);
  });
  it("改内容会更新工坊结构指纹；稳定镜头编号仍能对应讲稿",async()=>{
    const first=body(BASIC),second=body(BASIC.replace('#aabbcc','#ff8844'));
    const a=presentationBeats(first,{},await runScenes3D(first)),b=presentationBeats(second,{},await runScenes3D(second));
    expect(a).toHaveLength(1);expect(a[0].kind).toBe("step");expect(a[0].targets).toEqual([]);
    expect(a[0].anchor).toBe(b[0].anchor);expect(structureFingerprint(a)).not.toBe(structureFingerprint(b));
    expect(scene3dKey(BASIC)).not.toBe(scene3dKey(BASIC+' '));
  });
  it("物理材质保留贴图与涂层参数，拒绝错误组合和越界倒角",async()=>{
    const code=BASIC.replace('kind:"box"','kind:"box",bevel:0.04').replace('color:"#aabbcc"','color:"#aabbcc",normalMap:"/media/normal.png",roughnessMap:"/media/rough.png",normalScale:[0.2,0.2],clearcoat:0.7,clearcoatRoughness:0.18,anisotropy:0.6');
    const scene=await compile(code);
    expect(scene.materials[0]).toMatchObject({clearcoat:0.7,normalScale:[0.2,0.2],anisotropy:0.6});
    expect(scene3dAssets(scene)).toEqual(["/media/normal.png","/media/rough.png"]);
    for(const invalid of [code.replace('bevel:0.04','bevel:0.8'),code.replace('clearcoat:0.7','clearcoat:2'),code.replace('clearcoat:0.7','unlit:true,clearcoat:0.7')]) expect((await runScene3D(invalid)).ok).toBe(false);
  });
  it("examples 里的场景稿都能编译",async()=>{
    for(const name of ["tensor","journey"]) {
      const scene=await compile(readFileSync(`examples/scenes/${name}.js`,"utf8"));
      expect(scene.nodes.length).toBeGreaterThan(5);
    }
    const source = readFileSync("examples/scenes/hybrid.md", "utf8");
    const scenes = await runScenes3D(source);
    expect(splitSlides(source).map((page) => !!readScene3DSlide(page.source, scenes))).toEqual([false, true, false]);
    expect(presentationBeats(source, {}, scenes).filter((beat) => beat.kind === "step")).toHaveLength(3);
  });
});

function glb(content:object){const json=Buffer.from(JSON.stringify(content));const padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bytes=Buffer.alloc(20+padded.length);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded.length,12);bytes.writeUInt32LE(0x4e4f534a,16);padded.copy(bytes,20);return bytes;}
describe("GLB 媒体入口",()=>{
  it("检查容器版本、长度和外部资源",()=>{
    const valid=glb({asset:{version:"2.0"},scene:0,scenes:[{nodes:[]}]});expect(()=>validateGlb(valid)).not.toThrow();
    const corrupt=Buffer.from(valid);corrupt.writeUInt32LE(1,4);expect(()=>validateGlb(corrupt)).toThrow();
    expect(()=>validateGlb(valid.subarray(0,valid.length-4))).toThrow();
    expect(()=>validateGlb(glb({asset:{version:"2.0"},images:[{uri:"https://example.com/secret.png"}]}))).toThrow();
    expect(()=>validateGlb(glb({asset:{version:"2.0"},buffers:[{byteLength:500}]}))).toThrow();
  });
});
