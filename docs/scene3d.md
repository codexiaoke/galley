# 三维场景（scene3d）

`scene3d` 是文章里的一个容器组件。作者在正文里写一段场景脚本，定义几何、材质、模型、灯光、镜头和动画；保存后走文章原有的版本、审查和视频工坊流程。换场景只改正文，不改播放器，也不用重新构建。

## 怎么写

1. 需要模型或贴图时，先在后台媒体库上传。图片和自包含 GLB 2.0 都行，单个文件最大 10 MB；GLB 的缓冲和贴图必须内嵌。Agent 用 `upload_image` / `upload_model`。
2. 在文章里插入 `:::scene3d`，里面只放一个 JS 代码块。可用的函数有 `world`、`geometry`、`material`、`node`、`shot`、`track`、`animate`，完整说明在 `src/core/scene3d/doc.ts`，MCP 的 `list_components` 也会返回这份说明。
3. 媒体地址要完整写在脚本里，不能拼接，否则媒体库记不到引用。被引用的资源不能删除。
4. 文章的演示内容只有一个 scene3d 时，`/posts/<slug>/present` 就是全屏三维画面，没有封面和页码。空格暂停，R 重播，F 全屏。
5. 与普通章节混排时，让 `scene3d` 单独占一页（用二级标题或 `---` 分页）。演示自动从 PPT 推近到全屏三维，再拉远返回后续 PPT，不需要额外参数。混合演示用方向键逐步推进，A 暂停/继续自动播放，R 从头重播，`-` / `+` 调速。模型加载完成后才开始自动播放；字幕覆盖在三维画面上。
6. 在视频工坊里按页面和 `shot` 分镜写讲稿、配音和导出。`shot` 的编号要保持稳定，改了场景之后工坊靠它把讲稿对回镜头。升级播放器后先同步项目来源，再审查和导出，以使用新的演示指纹。

最小例子：

````markdown
:::scene3d{title="旋转产品"}
```js
world({ background: "#162334" });
geometry("shape", { kind: "box" });
material("metal", { color: "#44aacc", metalness: 0.8, roughness: 0.25 });
node("product", { kind: "mesh", geometry: "shape", material: "metal" });
node("camera", { kind: "camera", position: [3, 2, 4] });
shot("orbit", "环绕产品", 4000);
track("product", "rotation", [[0, [0, 0, 0]], [4000, [0, 6.28, 0]]]);
```
:::
````

更多例子在 `examples/scenes/`：`tensor.js`（矩阵堆叠成张量、切片）、`journey.js`（一份数据穿过几个空间）和 `hybrid.md`（PPT → 三维拆解 → PPT）。它们不引用媒体资源；JS 放进 `scene3d` 代码块，Markdown 可直接用作文章正文。

## 怎么运行

`正文脚本 → QuickJS 沙箱编译 → 校验场景数据 → Three.js 播放器 → 工坊逐帧导出`

- 作者脚本只在服务端沙箱里运行。读者的浏览器只拿到校验过的 JSON。
- 动画按绝对时间计算，暂停、后退和逐帧导出得到的画面一致。`animate` 写的时间函数在沙箱里按 30 fps 采样成关键帧。
- 不动的网格按材质合并成一个物体；有动画的节点和它的子节点保持独立。
- 代码在 `src/core/scene3d`（编译、校验、求值）和 `src/render/client/scene3d-world.ts`（绘制）。

## 目前不支持

- 可视化编辑器，作者直接写脚本
- 物理仿真和碰撞
- Draco、KTX2 压缩的模型和贴图
- 讲解指向（`guides`）聚焦到三维物体
- 竖屏和 PDF 导出（未验证）

视频工坊导出时，macOS 用完整的 Chromium，可以用 GPU 渲染。Linux 容器里的无头浏览器可能用软件渲染 WebGL，大场景会很慢。
