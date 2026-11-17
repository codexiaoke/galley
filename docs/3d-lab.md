# 本地内容驱动 3D 实验

三维场景是文章内容，不是项目里按案例分支的页面。`scene3d` 是通用容器；作者在正文脚本中定义模型引用、几何、材质、布局、镜头和动作。更换或修改场景通过现有文章编辑、保存和版本流程完成，无需修改播放器或重新构建。

## 隔离环境

| 用途 | 配置 |
| --- | --- |
| 实验工作树 | `/Users/xiaoke/code/project/blog-3d-lab`，分支 `codex/3d-video-lab` |
| 博客 | `localhost:3431`，数据 `.lab/blog`，本目录 `.env.local` |
| 原生实验工坊 | `127.0.0.1:4441`，数据 `.lab/native-studio` |
| 早期容器实验 | `compose.3d-lab.yml`，项目 `galley-3d-lab`，端口 4431，独立卷 |

正式站点和原有 4321 工坊不参与；没有修改、部署或复用原容器。浏览器用 127.0.0.1 进入实验工坊，避免覆盖 localhost 上原工坊的登录 Cookie。

## 作者怎么用

1. 在后台媒体库上传图片、PBR 贴图或自包含 GLB 2.0。Agent 使用 `upload_image` / `upload_model`。单个文件最大 10 MB，模型内嵌缓冲和贴图，不引用外部资源。
2. 在文章中插入 `:::scene3d`，里面放一个 JS 代码块。调用 `world`、`geometry`、`material`、`node`、`shot`、`track` 或 `animate`。完整接口在 `src/core/scene3d/doc.ts`，也由 MCP `list_components` 提供。
3. 后台编辑器会编译并显示预览。保存进入文章原有版本流程。模型和贴图的媒体库地址必须完整写在内容里，引用中的资源不能删除。
4. 唯一演示内容是 scene3d 时，打开 `/posts/<slug>/present` 就是纯全屏三维画面，没有封面、章节栏和文字叠层；说明文字可写在 `:::article`。空格暂停，R 重播，F 浏览器全屏。
5. 在独立视频工坊导入文章，按镜头写讲稿、配音、审查和导出。内容改动改变结构指纹，工坊要求同步来源；稳定的 shot 编号帮助对应讲稿。

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

## 通用链路

`文章正文 → QuickJS 沙箱编译 → 校验场景图/资源/轨迹 → 通用 Three.js 播放器 → 工坊时钟 → 逐帧视频`

核心层在 `src/core/scene3d`，浏览器渲染在 `src/render/client/scene3d-world.ts`。作者代码不在宿主或读者浏览器里求值；浏览器只接收经过验证的数据。动画直接按绝对时间求值，后退、暂停和导出不依赖前一帧。复杂联动用时间函数在沙箱按 30 fps 编译，简单运动直接用关键帧。

静态零件自动按材质合批，动画节点及其后代保留独立变换。GLB 模型、内嵌动画、PBR 材质贴图、环境光、阴影、雾和 bloom 均由内容选择。资源就绪后才通知工坊 ready；资源失败会明确报错并阻止导出。

曾经的 tensor3d、journey3d、factory3d 专用引擎已移除。实验文章迁成 scene3d；早期视频仅作为历史产物保留。

## 可运行的内容样例

| 内容 | 源稿 | 预览 |
| --- | --- | --- |
| 自动化工厂，917 节点、7 工序 | `examples/scenes/factory.js` | <http://localhost:3431/posts/factory-automation-3d-lab/present> |
| 产品拆解，GLB 模型与媒体库贴图 | `examples/scenes/product.js` | <http://localhost:3431/posts/product-assembly-3d-lab/present> |
| 矩阵、堆叠、旋转、切片 | `examples/scenes/tensor.js` | <http://localhost:3431/posts/tensor-3d-lab/present> |
| 数据在四个空间中移动与聚合 | `examples/scenes/journey.js` | <http://localhost:3431/posts/data-journey-3d-lab/present> |
| 大模型训练之旅，九镜头贯穿训练与推理 | `examples/scenes/training.js` | <http://localhost:3431/posts/llm-training-3d-lab/present> |
| Blender GPU 模型，曲面、材质与内嵌拆解动画 | `examples/scenes/gpu.js` | <http://localhost:3431/posts/blender-gpu-3d-lab/present> |

这些文件只是内容示例。初始化脚本将它们存成正文，页面运行时不读取 examples，也没有案例名称开关。

```sh
pnpm exec tsx scripts/seed-3d-lab.ts factory
pnpm exec tsx scripts/seed-3d-lab.ts product
GALLEY_DATA_DIR="$PWD/.lab/blog" pnpm dev --port 3431
```

seed 只写 `.lab/blog`，已有同名实验文章则保存新版本。product 示例的资源占位符由脚本替换为通过正常媒体入口上传得到的地址。随后可在后台直接编辑正文。

原生工坊启动：

```sh
STUDIO_DIR="$PWD/.lab/native-studio" STUDIO_PORT=4441 STUDIO_HOST=127.0.0.1 GALLEY_URL=http://localhost:3431 STUDIO_TTS_SERVER=lab-system-voice pnpm studio
pnpm exec tsx scripts/voice-3d-lab.ts product
cp .lab/voice-assets/* .lab/native-studio/voice-assets/
pnpm exec tsx scripts/render-3d-lab.ts product --native
pnpm exec tsx scripts/open-3d-lab.ts --native
```

实验配音来自 macOS Tingting。已有项目来源更新后，render 命令加 `--sync`，或者在工坊中正常同步。最新项目/版本/导出标识写入 `.lab/<slug>/result.json`。本轮产品成片 `.lab/outputs/product-authored-3d.mp4` 为 3840×2160、30 fps、约 15.1 秒。

## 当前边界

作者直接编写场景脚本，不建设专用可视化编辑器。模型精度取决于上传资产；当前工厂仍使用程序几何，材质和灯光已经独立升级，高精度设备造型可以通过 GLB 资源继续完善。尚未实现工业碰撞/刚体仿真、Draco/KTX2 解码、三维对象级讲解聚焦；本轮验证桌面横屏与 4K 导出，未验证竖屏或 PDF。

## 本轮验证

- 四份不同场景稿通过同一编译器；没有案例专用渲染分支。
- 后台实际编辑产品材质颜色，保存为新版本后全屏显示新颜色；恢复后再次保存。此过程中未更改渲染代码、重新构建或重启服务。
- 产品拆解与工厂均完成 4K / 30 fps 导出，已从实际视频抽帧核对。工厂新产物为 `.lab/outputs/factory-authored-3d.mp4`，与早期硬编码视频分开保留。
- `pnpm test`（367 项）、`pnpm typecheck`、`pnpm lint` 通过，原工作目录保持干净。

## 材质版本（2026-11-17）

- 工厂场景稿新增拉丝钢、喷漆涂层、橡胶、混凝土地面和防滑钢板。使用 13 张独立纹理，原始文件共约 6.5 MB，写入媒体库后随文章版本引用。
- 通用材质增加 `normalScale`、`clearcoat`、`clearcoatRoughness`、`anisotropy`、`anisotropyRotation`；使用 MeshPhysicalMaterial。基础 box 支持按实际尺寸指定 `bevel`，小倒角捕捉边缘高光。
- 颜色贴图使用 sRGB，法线、粗糙度和金属度使用线性数据；倾斜表面的纹理启用各向异性过滤。静态合批保留 UV 和法线，动画设备仍独立更新。
- 工厂内容负责冷暖灯光、环境反射强度和 bloom 设置。无工厂专用渲染分支，作者仍只写脚本。资源来源与许可见 `examples/assets/materials/README.md`，用法见 `examples/scenes/materials.md`。
- 独立工坊完成材质版 3840×2160 / 30 fps 导出，1589 帧、约 53 秒；产物为 `.lab/outputs/factory-materials-3d.mp4`，字幕为同名 `.srt`。从实际成片抽查全景、压装近景和运输镜头，确认材质与本地预览一致。
- 本轮 `pnpm test`（368 项）、`pnpm typecheck`、`pnpm lint` 通过；原工作目录和原工坊保持不变。

## 大模型训练演示（2026-11-17）

新增 `training` 例稿，通过现有场景脚本、媒体库、PBR 材质与工坊链路制作。镜头从语料词元、向量与位置、因果注意力进入多层计算，再展示预测损失、反向梯度、参数更新与推理生成。讲解采用缩小的教学数值，不连接真实训练任务。镜头、原理依据、表达边界与本地命令见 `examples/scenes/training.md`。

已完成独立工坊 4K / 30 fps 导出，3013 帧、100.43 秒，包含中文配音；成片 `.lab/outputs/llm-training-3d.mp4`，字幕 `.lab/outputs/llm-training-3d.srt`。从实际成片抽查注意力、损失、更新和生成镜头。可直接复用的已绑定媒体地址正文为 `.lab/outputs/llm-training.scene3d.md`。

编译结果为 1072 节点、10 种几何、39 种材质、191 条轨迹、9 个镜头。`pnpm test`（368 项，覆盖第五份独立场景稿）、`pnpm typecheck`、`pnpm lint` 均通过。原工作目录保持干净，原工坊未修改。

## Blender 建模实验（2026-11-17）

本机通过 Homebrew 官方 cask 安装 Blender 5.3.0（Apple Silicon），应用位于 `/Applications/Blender.app`。使用 Blender Python 制作独立 GPU 样机，保留可编辑 `.blend`，导出带物理材质与拆解动画的 GLB，并用正常媒体入口导入新实验文章。Blender 源文件已在本机界面打开。

资源、渲染图和测试方法见 `examples/assets/gpu/README.md`。网页已检查装配、拆解、复原状态；没有修改通用播放器。`pnpm test`（368 项，覆盖第六份场景稿）、`pnpm typecheck`、`pnpm lint` 通过。此次用于本地建模与模型加载测试，没有重新导出训练演示视频。

### GPU 接入原训练场景

`training.js` 已通过通用 `model` 节点加载同一个 GPU GLB，放在训练大厅前方。32–40 秒前向计算镜头靠近样机，并用 `animationTime` 控制拆解与复原，随后继续预测、损失与反向传播。标牌和旁白明确区分计算硬件与抽象参数矩阵。场景仍为 74 秒、9 个镜头，未增加专用播放器逻辑。

本地预览仍为 <http://localhost:3431/posts/llm-training-3d-lab/present>。已检查注意力、GPU 装配/拆解和损失镜头；`.lab/outputs/llm-training.scene3d.md` 保存资源地址绑定后的当前正文。网页更新已验证；旧 MP4 未重新导出。
