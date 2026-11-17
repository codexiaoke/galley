# 工厂演示的 PBR 资源

资源只作为文章内容示例。`scripts/3d-lab-materials.ts` 将实际使用的图片上传到隔离媒体库，再把例稿占位符替换为完整 `/media/...` 地址。浏览器从媒体库加载，不访问原始下载站点。

- `smooth_concrete_floor_*`：[Poly Haven / Smooth Concrete Floor](https://polyhaven.com/a/smooth_concrete_floor)，1K 原始 JPG。
- `metal_plate_02_*`：[Poly Haven / Metal Plate 02](https://polyhaven.com/a/metal_plate_02)，1K 原始 JPG。
- 上述资产按 [Poly Haven CC0 许可](https://polyhaven.com/license) 使用；原始下载地址和校验值在 `sources.json`。
- `brushed-*`、`paint-*`、`rubber-*`：本实验程序生成的原创无缝数据贴图，生成器为 `scripts/generate-3d-materials.mjs`。

`map` 是 sRGB 颜色；`normalMap` 使用 OpenGL 法线；`roughnessMap` 和 `metalnessMap` 是线性数据，读取绿、蓝通道。本文原始粗糙度和金属度贴图为灰度，所以可直接引用，不需额外通道打包。纹理平铺、法线强度、金属度、涂层和方向性反光均在场景脚本的 `material()` 中配置。
