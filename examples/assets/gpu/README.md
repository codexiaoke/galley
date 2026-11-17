# Blender GPU 建模实验

原创虚构样机 GX / 01，用于测试 Blender → GLB → Galley 场景稿链路，不对应具体硬件产品或工程尺寸。

- `gpu-module.blend`：Blender 5.3.0 源文件，包含独立零件、修改器、材质、已打包贴图、摄影灯光和相机。
- `gpu-module.glb`：自包含 GLB 2.0，约 3.4 MiB；9 种材质，282 个网格，内嵌 8 秒 `GPU_Explode` 动画。仅导出样机，不带摄影地面、灯光或相机。
- `gpu-assembled.png` / `gpu-exploded.png`：Blender Cycles 实际渲染图。
- `manifest.json`：生成时记录的 Blender 版本、对象/网格数量、文件大小与动画名。

## 在 Blender 中测试

双击 `gpu-module.blend` 打开。空格播放或暂停；时间轴第 1 帧为完整模型，第 136 帧为拆解状态，第 241 帧回到完整模型。中键拖动旋转视角、滚轮缩放；选择某个零件后可进入编辑模式修改网格。

三个顶层对象组织模型：`01_PCB_and_components`、`02_Heatsink_and_heatpipes`、`03_Shroud_and_fans`。风扇是外壳下的独立子对象。拆解位移在后两个顶层对象上，旋转关键帧在风扇上。

手工编辑后直接保存 `.blend`。如需导出，选择这三个对象及其子对象，通过 File → Export → glTF 2.0 导出 GLB，启用 Selected Objects、Apply Modifiers 和动画，动画模式选择 Scene、关闭按对象拆分动画。保存为新 GLB 后通过媒体库上传，在场景稿中替换 `src` 即可；动画名以导出文件为准。

## 重建初始样机

在独立实验工作目录执行：

```sh
blender --background --factory-startup --python scripts/blender/build-gpu.py
pnpm exec tsx scripts/seed-3d-lab.ts gpu
```

生成脚本会重写此目录内的 `.blend`、`.glb` 和渲染图；它用于重建初始样机，手工编辑后的文件应另存。

预览：<http://localhost:3431/posts/blender-gpu-3d-lab/present>。网页的 27 秒镜头由 `examples/scenes/gpu.js` 控制，零件和拆解轨迹来自 GLB。空间几何、媒体引用和动画仍由通用播放器解释，没有 GPU 专用渲染逻辑。

本模型通过 Blender Python 建模，使用布尔开孔、边缘倒角、曲面叶片、曲线热管和独立网格零件。拉丝微表面使用本实验原创 `brushed-normal.png`；贴图打包进 Blender 和 GLB。Blender 离线渲染与网页实时渲染的灯光、阴影和反射算法不同，因此画面不保证逐像素一致。
