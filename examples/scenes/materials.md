# 用场景脚本配置材质

作者在同一份 `:::scene3d` 稿件里定义材质并引用它。纹理先上传媒体库，脚本内写完整地址；新增材质无需修改播放器。

```js
// 将地址换成媒体库实际返回的图片地址。
material("brushedSteel", {
  color: "#829aab",
  metalness: 0.98,
  roughness: 0.48,
  normalMap: "/media/abc123.png",
  roughnessMap: "/media/def456.png",
  normalScale: [0.25, 0.25],
  repeat: [2, 8],
  anisotropy: 0.65,
  anisotropyRotation: Math.PI / 2
});

material("orangePaint", {
  color: "#ef762b",
  metalness: 0.25,
  roughness: 0.5,
  clearcoat: 0.65,
  clearcoatRoughness: 0.22
});

geometry("cabinetShape", {
  kind: "box", size: [1.2, 2.7, 0.8], bevel: 0.04
});
node("cabinet", {
  kind: "mesh", geometry: "cabinetShape", material: "orangePaint",
  position: [0, 1.35, 0]
});
```

| 参数 | 作用与常见取值 |
| --- | --- |
| `metalness` | 裸金属约 0.9–1；橡胶、塑料约 0；漆面按表现调整 |
| `roughness` | 越低高光越集中；机加工金属约 0.2–0.5，橡胶约 0.8–1 |
| `map` | 基础色贴图，与 `color` 相乘；播放器按 sRGB 读取 |
| `normalMap` / `normalScale` | 表面凹凸和强度；微纹理通常用 0.1–0.3，避免像大颗粒砂纸 |
| `roughnessMap` | 不同区域的粗糙度；绿通道与 `roughness` 相乘 |
| `metalnessMap` | 金属与非金属区域；蓝通道与 `metalness` 相乘 |
| `clearcoat` / `clearcoatRoughness` | 漆面外层透明涂层的强度与粗糙度 |
| `anisotropy` / `anisotropyRotation` | 拉丝金属方向性高光的强度与旋转角，弧度 |
| `repeat` | 贴图平铺次数，按物体尺寸调整；不能把小纹理无限拉伸到整座厂房 |
| `bevel` | box 几何倒角半径，最大为最短边的一半；建议以实际物体尺寸创建几何，节点 scale 保持 1 |

`unlit:true` 用于不受灯光影响的纯色或贴片，不接受物理涂层、方向性反光或法线等 PBR 参数。

现成工厂示例在 `factory.js`。其中 `__FLOOR_COLOR__` 等是例稿导入占位符，由实验种子脚本换成真实媒体地址；这不是播放器支持的特殊地址。正式内容直接使用 `/media/...` 即可。
