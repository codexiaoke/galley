## 从结构图进入产品

| 层次 | 作用 |
| --- | --- |
| 外壳 | 保护内部结构 |
| 核心 | 执行计算 |
| 底座 | 固定与连接 |

## 进入三维拆解

:::scene3d{title="产品拆解"}
```js
world({ background: "#162334", environment: "studio", exposure: 1.1 });
geometry("plate", { kind: "box", size: [3, 0.25, 2], bevel: 0.05 });
geometry("core", { kind: "box", size: [1.4, 0.5, 1.2], bevel: 0.08 });
material("shell", { color: "#9cb3cc", metalness: 0.85, roughness: 0.25 });
material("chip", { color: "#36b9aa", metalness: 0.45, roughness: 0.3 });
node("product", { kind: "group" });
node("base", { kind: "mesh", parent: "product", geometry: "plate", material: "shell", position: [0, -0.5, 0] });
node("core", { kind: "mesh", parent: "product", geometry: "core", material: "chip" });
node("lid", { kind: "mesh", parent: "product", geometry: "plate", material: "shell", position: [0, 0.5, 0] });
node("key", { kind: "light", light: "directional", position: [4, 6, 5], intensity: 3 });
node("camera", { kind: "camera", position: [5, 4, 6], target: [0, 0, 0] });
shot("overview", "观察整体", 3000);
shot("explode", "拆开层次", 4000);
shot("assemble", "重新组合", 4000);
track("product", "rotation", [[0, [0, -0.4, 0]], [3000, [0, 0.4, 0]], [11000, [0, 0.4, 0]]], "smooth");
track("lid", "position", [[0, [0, 0.5, 0]], [3000, [0, 0.5, 0]], [6500, [0, 2, 0]], [7500, [0, 2, 0]], [11000, [0, 0.5, 0]]], "smooth");
track("base", "position", [[0, [0, -0.5, 0]], [3000, [0, -0.5, 0]], [6500, [0, -2, 0]], [7500, [0, -2, 0]], [11000, [0, -0.5, 0]]], "smooth");
```
:::

## 回到讲解

拆开后可以看到，外壳、核心与底座各有职责。三维画面帮助观察空间关系，这一页把观察结果整理成结论。
