// 大模型训练之旅：作者内容稿，不是播放器组件。时间单位毫秒。
// 小词表、四个示意层和概率变化用于教学，不执行或宣称真实模型训练。
world({ background: "#060f1d", environment: "studio", environmentIntensity: 0.32,
  exposure: 1, fog: { color: "#060f1d", near: 65, far: 180 },
  bloom: { strength: 0.2, threshold: 1.8, radius: 0.35 } });

const cube = geometry("cube", { kind: "box" });
const cell = geometry("cell", { kind: "box", size: [0.64, 0.64, 0.64], bevel: 0.055 });
const cylinder = geometry("cylinder", { kind: "cylinder", segments: 24 });
const orb = geometry("orb", { kind: "sphere", radius: 0.18, segments: 16 });
const plane = geometry("plane", { kind: "plane" });
const ring = geometry("ring", { kind: "torus", radius: 2.5, tube: 0.045, segments: 64 });
const casing = material("casing", { color: "#17334a", metalness: 0.65, roughness: 0.38,
  normalMap: "__PAINT_NORMAL__", normalScale: [0.15, 0.15], clearcoat: 0.6, clearcoatRoughness: 0.25 });
const metal = material("metal", { color: "#6f899d", metalness: 0.93, roughness: 0.45,
  normalMap: "__BRUSHED_NORMAL__", normalScale: [0.2, 0.2], anisotropy: 0.45 });
const floor = material("floor", { color: "#23384c", metalness: 0.25, roughness: 0.55,
  map: "__FLOOR_COLOR__", normalMap: "__FLOOR_NORMAL__", repeat: [20, 12], normalScale: [0.15, 0.15] });
const dark = material("dark", { color: "#091724", roughness: 0.7, metalness: 0.3 });
const blue = material("blue", { color: "#259fd2", metalness: 0.5, roughness: 0.3, clearcoat: 0.6 });
const violet = material("violet", { color: "#6b62d4", metalness: 0.4, roughness: 0.32 });
const glow = (id, color, strength) => material(id, { color, emissive: color, emissiveIntensity: strength, metalness: 0.2, roughness: 0.3 });
const cyan = glow("cyan", "#39c9ed", 1.3);
const amber = glow("amber", "#ff962e", 1.5);
const mint = glow("mint", "#47e0af", 1.1);
const dim = glow("dim", "#214c68", 0.2);

let serial = 0;
const group = (id, position = [0, 0, 0]) => node(id, { kind: "group", position });
const mesh = (parent, shape, surface, position, scale = [1, 1, 1]) => node("part" + (++serial), {
  kind: "mesh", parent: parent ? parent.id : undefined, geometry: shape, material: surface, position, scale
});
const box = (parent, surface, position, scale) => mesh(parent, cube, surface, position, scale);
const pipe = (parent, surface, a, b, radius = 0.04) => {
  const delta = b.map((v, i) => v - a[i]), length = Math.hypot(...delta);
  const d = delta.map(v => v / length), q = [d[2], 0, -d[0], 1 + d[1]], norm = Math.hypot(...q);
  const item = mesh(parent, cylinder, surface, a.map((v, i) => (v + b[i]) / 2), [radius, length, radius]);
  item.quaternion = norm < 0.0001 ? [1, 0, 0, 0] : q.map(v => v / norm);
  return item;
};
const sign = (id, image, position, width, parent) => {
  const ink = material(id + "Ink", { map: image, unlit: true, side: "double" });
  const item = node(id, { kind: "mesh", geometry: plane, material: ink, position,
    scale: [width, width * 0.3, 1], parent: parent ? parent.id : undefined, castShadow: false });
  return item;
};
const hideUntil = (item, time) => track(item, "visible", [[0, false], [time, true]], "step");
const onlyDuring = (item, start, end) => track(item, "visible", [[0, false], [start, true], [end, false]], "step");

// 空间骨架与真实材质：镜头始终在同一计算大厅移动。
const hall = group("hall");
box(hall, floor, [0, -0.35, 0], [84, 0.6, 34]);
for (let x = -40; x <= 40; x += 4) box(hall, dark, [x, -0.035, 0], [0.025, 0.02, 34]);
for (let z = -16; z <= 16; z += 4) box(hall, dark, [0, -0.035, z], [84, 0.02, 0.025]);
for (const z of [-5.8, 10]) box(hall, dim, [0, 0.015, z], [76, 0.025, 0.055]);
for (const [x, width] of [[-25, 11], [-14, 9], [1, 22], [21, 11], [32, 8]]) {
  box(hall, casing, [x, 0.25, 0], [width, 0.5, 9]);
  box(hall, cyan, [x, 0.48, 4.45], [width - 0.3, 0.05, 0.045]);
  for (const dx of [-width / 2 + 0.3, width / 2 - 0.3]) box(hall, metal, [x + dx, 0.2, 0], [0.15, 0.4, 9]);
}
sign("title", "__LLM_TITLE__", [-1, 12.6, -5], 23);
sign("dataTitle", "__LLM_DATA__", [-25, 7, 0], 10);
sign("embedTitle", "__LLM_EMBED__", [-14, 7, 0], 9);
sign("layersTitle", "__LLM_LAYERS__", [1, 9.4, -1], 13);
sign("lossTitle", "__LLM_LOSS__", [21, 8.7, 0], 9);
sign("inferenceTitle", "__LLM_INFERENCE__", [33, 7.6, 0], 10);

// 后方 GPU 机柜，散热片、机架、发光状态条都是普通几何体。
for (let x = -18; x <= 18; x += 4.5) {
  const rack = group("rack" + (++serial), [x, 0, -10]);
  box(rack, casing, [0, 3.2, 0], [2.7, 6.4, 1.8]);
  for (let y = 0.65; y < 6; y += 0.8) {
    box(rack, dark, [0, y, 0.94], [2.35, 0.58, 0.12]);
    for (let dx = -0.85; dx <= 0.9; dx += 0.25) box(rack, metal, [dx, y, 1.02], [0.045, 0.42, 0.08]);
    box(rack, mint, [1.02, y, 1.05], [0.08, 0.25, 0.04]);
  }
}
// Blender GPU 和抽象参数矩阵同处一个空间：前者是计算载体，后者是模型表示。
const gpuStation = group("gpuStation", [1, 0, 12.4]);
box(gpuStation, casing, [0, 0.3, 0], [11, 0.6, 5.8]);
box(gpuStation, cyan, [0, 0.58, 2.88], [10.5, 0.045, 0.035]);
node("trainingGpu", { kind: "model", parent: gpuStation.id,
  src: "__GPU_MODEL__", animation: "GPU_Explode", position: [0, 0.65, 0], scale: [1.15, 1.15, 1.15] });
track("trainingGpu", "animationTime", [[0, 0], [32000, 0], [34000, 1400],
  [37000, 4000], [38000, 5500], [40000, 7990], [74000, 7990]]);
sign("gpuTitle", "__LLM_GPU__", [1, 8.8, 11.2], 9.5);

// 01：文档薄片拆为四个示意 Token。
for (let i = 0; i < 5; i++) {
  const paper = group("document" + i, [-29 + i * 0.38, 2 + i * 0.3, -1.8 - i * 0.25]);
  box(paper, casing, [0, 0, 0], [2.4, 2.8, 0.12]);
  for (let row = 0; row < 5; row++) box(paper, row === 0 ? cyan : metal, [-0.1, 0.85 - row * 0.4, 0.08], [1.7 - row * 0.12, 0.08, 0.03]);
}
const tokenImages = ["__LLM_TOKEN_A__", "__LLM_TOKEN_B__", "__LLM_TOKEN_C__", "__LLM_TOKEN_D__"];
tokenImages.forEach((image, i) => {
  const token = group("token" + i, [-28 + i * 2.1, 2.6, 2]);
  box(token, blue, [0, 0, -0.1], [1.9, 0.7, 0.25]);
  sign("tokenLabel" + i, image, [0, 0, 0.04], 1.85, token);
  track(token, "position", [[0, [-29, 2.6 + i * 0.15, -1]], [6500, [-29, 2.6 + i * 0.15, -1]],
    [10000 + i * 250, [-28 + i * 2.1, 2.6, 2]], [14000, [-28 + i * 2.1, 2.6, 2]],
    [19000, [-17 + i * 1.8, 4.8, 0.7]]], "smooth");
  onlyDuring(token, 6200, 22000);
});
sign("targetLabel", "__LLM_TARGET__", [-22, 4.6, 0.3], 3.7);
pipe(hall, amber, [-23.8, 3.5, 0], [-22, 3.5, 0], 0.035);

// 02：四个词元映射为四列向量；细杆表示数值维度，并不冒充真实 embedding。
for (let token = 0; token < 4; token++) for (let dimension = 0; dimension < 8; dimension++) {
  const h = 0.4 + ((token * 11 + dimension * 7) % 13) / 8;
  const vectorCell = mesh(hall, cell, [blue, cyan, violet, mint][token], [-17 + token * 1.8, 0.85 + h / 2, -2.5 + dimension * 0.65], [0.8, h, 0.7]);
  track(vectorCell, "scale", [[0, [0.8, 0.03, 0.7]], [14500 + dimension * 100, [0.8, 0.03, 0.7]], [18500 + dimension * 100, [0.8, h, 0.7]]], "smooth");
}
for (let i = 0; i < 4; i++) box(hall, amber, [-17 + i * 1.8, 0.6, 3.3], [1.2, 0.08, 0.12]);

// 03/04：四层参数矩阵、跨层计算通路及残差旁路。
const weightChanges = [];
for (let layer = 0; layer < 4; layer++) {
  const x = -6.5 + layer * 5;
  const parent = group("layer" + layer, [x, 0, 0]);
  const surface = glow("weights" + layer, ["#257bb1", "#398ea8", "#626bc1", "#32998d"][layer], 0.1);
  box(parent, dark, [0, 3.7, -0.5], [3.8, 6.3, 0.35]);
  for (const dx of [-1.95, 1.95]) box(parent, metal, [dx, 3.7, 0], [0.13, 6.7, 0.7]);
  for (const y of [0.4, 7]) box(parent, metal, [0, y, 0], [4, 0.14, 0.7]);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 5; col++) {
    const depth = 0.35 + ((row * 5 + col * 3 + layer) % 7) * 0.11;
    const weight = mesh(parent, cell, surface, [(col - 2) * 0.69, 1.1 + row * 0.73, 0.05], [0.8, 0.8, depth]);
    if (row % 2 === 0 && col % 2 === 0) weightChanges.push({ weight, depth, layer });
  }
  const loop = geometry("residual" + layer, { kind: "tube", radius: 0.035, segments: 40,
    points: [[x - 2.3, 3.6, 0], [x - 2.1, 7.7, -0.2], [x + 2.1, 7.7, -0.2], [x + 2.3, 3.6, 0]] });
  mesh(hall, loop, dim, [0, 0, 0]);
  for (let z = -2; z <= 2; z += 2) pipe(hall, dim, [x - 2.3, 0.6, z], [x + 2.3, 0.6, z], 0.025);
  track(surface, "emissiveIntensity", [[0, 0.1], [32000 + layer * 1400, 0.1], [33000 + layer * 1400, 1.1],
    [34500 + layer * 1400, 0.18], [57000, 0.18], [59000 + layer * 900, 1.1], [65000, 0.22]], "smooth");
}
weightChanges.forEach(({ weight, depth, layer }, i) => {
  const next = Math.max(0.2, depth + Math.sin(i * 2.1) * 0.26);
  track(weight, "scale", [[0, [0.8, 0.8, depth]], [58000 + layer * 800, [0.8, 0.8, depth]], [63000 + layer * 500, [0.8, 0.8, next]]], "smooth");
});
pipe(hall, dim, [-19, 3.5, 1.2], [16, 3.5, 1.2], 0.045);
pipe(hall, dim, [16, 1.3, 3.7], [-19, 1.3, 3.7], 0.045);

const attention = group("attention", [-5.5, 0, 6.5]);
sign("attentionTitle", "__LLM_ATTENTION__", [0, 7.1, 0], 8, attention);
sign("maskTitle", "__LLM_MASK__", [0, 1.1, 0.1], 6.2, attention);
box(attention, casing, [0, 4.15, -0.45], [5.3, 4.3, 0.3]);
for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
  const tile = mesh(attention, cell, col <= row ? cyan : dark, [-1.65 + col * 1.1, 5.65 - row * 1.05, 0], [1.35, 1.2, col <= row ? 0.5 : 0.12]);
  if (col <= row) track(tile, "scale", [[0, [1.35, 1.2, 0.12]], [23000 + row * 900, [1.35, 1.2, 0.12]], [25000 + row * 900, [1.35, 1.2, 0.9]]], "smooth");
}
onlyDuring(attention, 21500, 32500);

// 05：四项教学词表，概率和交叉熵对应同一个目标，不展示虚假的大模型精度。
const before = [0.20, 0.35, 0.25, 0.20], after = [0.46, 0.23, 0.18, 0.13];
for (let i = 0; i < 4; i++) {
  const bar = box(hall, i === 0 ? mint : blue, [18 + i * 1.7, 0.6, 0], [1.05, 1, 1.5]);
  track(bar, "scale", [[0, [1.05, before[i] * 9, 1.5]], [59500, [1.05, before[i] * 9, 1.5]], [65000, [1.05, after[i] * 9, 1.5]]], "smooth");
  track(bar, "position", [[0, [18 + i * 1.7, 0.65 + before[i] * 4.5, 0]], [59500, [18 + i * 1.7, 0.65 + before[i] * 4.5, 0]], [65000, [18 + i * 1.7, 0.65 + after[i] * 4.5, 0]]], "smooth");
}
const wordImages = ["__LLM_TARGET__", "__LLM_WORD_COLD__", "__LLM_WORD_HIGH__", "__LLM_WORD_FAR__"];
wordImages.forEach((image, i) => {
  const label = sign("probWord" + i, image, [18 + i * 1.7, 0.85, 1.6], 1.55);
  // 标签中的数值只对应更新之前；更新后只保留正确目标。
  if (i > 0) track(label, "visible", [[0, true], [59500, false]], "step");
});
const beforeLabel = sign("beforeLabel", "__LLM_BEFORE__", [21, 5.8, 0.5], 8);
track(beforeLabel, "visible", [[0, true], [59500, false]], "step");
const afterLabel = sign("afterLabel", "__LLM_AFTER__", [21, 6.1, 0.5], 8);
hideUntil(afterLabel, 65000);
const backTitle = sign("backTitle", "__LLM_BACKWARD__", [1, 10, 3], 14);
onlyDuring(backTitle, 48000, 57000);
const updateTitle = sign("updateTitle", "__LLM_UPDATE__", [1, 9, 4], 13);
onlyDuring(updateTitle, 57000, 66000);
const repeatTitle = sign("repeatTitle", "__LLM_REPEAT__", [1, 1.2, 6], 13);
onlyDuring(repeatTitle, 57000, 66000);

const gradientBranches = group("gradientBranches");
for (let layer = 0; layer < 4; layer++) {
  const x = -6.5 + layer * 5;
  pipe(gradientBranches, amber, [x, 1.3, 3.7], [x, 3.5, 1.2], 0.035);
}
onlyDuring(gradientBranches, 48000, 57000);

// 发光粒子沿不同通路移动：蓝色前向，橙色反向，绿色推理。
const forward = [], backward = [];
for (let i = 0; i < 12; i++) {
  forward.push(mesh(null, orb, cyan, [-18, 3.5, 1.2], [1, 1, 1]));
  backward.push(mesh(null, orb, amber, [21, 1.3, 3.7], [1.2, 1.2, 1.2]));
}
const coreRing = mesh(hall, ring, metal, [33, 3.4, 0]);
const innerRing = mesh(hall, ring, mint, [33, 3.4, 0.1], [0.94, 0.94, 0.94]);
sign("resultTitle", "__LLM_RESULT__", [33, 3.3, 0.25], 7.5);
const generated = group("generated", [33, 3.3, 1]);
sign("generatedToken", "__LLM_TARGET__", [0, 0, 0], 3.1, generated);
onlyDuring(generated, 66500, 73500);
track(generated, "position", [[0, [33, 3.3, 1]], [66500, [24, 3.3, 1]], [70000, [33, 3.3, 1]], [73500, [33, 1.2, 3]]], "smooth");
// 输出文字只在生成阶段出现。
track("resultTitle", "visible", [[0, false], [71000, true]], "step");
track(innerRing, "scale", [[0, [0.94, 0.94, 0.94]], [66000, [0.94, 0.94, 0.94]], [70000, [1.04, 1.04, 1.04]], [74000, [0.94, 0.94, 0.94]]], "smooth");
for (let i = 0; i < 4; i++) {
  const pulse = mesh(null, orb, mint, [-19, 3.5, 1.2], [1.5, 1.5, 1.5]);
  onlyDuring(pulse, 66000 + i * 300, 71000 + i * 300);
  track(pulse, "position", [[0, [-19, 3.5, 1.2]], [66000 + i * 300, [-19, 3.5, 1.2]], [71000 + i * 300, [33, 3.5, 1.2]]], "smooth");
}
// 标牌位于三维空间中，只在相应镜头显现，避免遮挡其他工序。
track("title", "visible", [[0, true], [6000, false]], "step");
for (const [id, start, end] of [["dataTitle", 6000, 14000], ["embedTitle", 14000, 22000],
  ["layersTitle", 32000, 34000], ["lossTitle", 40000, 48000], ["inferenceTitle", 66000, 74000]]) {
  track(id, "visible", [[0, true], [5900, false], [start, true], [end, false]], "step");
}
onlyDuring("gpuTitle", 32000, 40000);
onlyDuring("targetLabel", 6000, 14000);

node("camera", { kind: "camera", fov: 48, position: [-29, 20, 43], target: [-4, 3, 0] });
node("sky", { kind: "light", light: "hemisphere", color: "#a9cde9", ground: "#0b1020", intensity: 0.7, castShadow: false });
node("key", { kind: "light", light: "directional", color: "#c5dff4", position: [-12, 28, 18], target: [0, 0, 0], intensity: 2.2, shadowSpan: 44 });
node("rim", { kind: "light", light: "directional", color: "#5696dc", position: [5, 12, -15], intensity: 1.6, castShadow: false });
node("warm", { kind: "light", light: "directional", color: "#ffb875", position: [22, 10, 15], intensity: 0.7, castShadow: false });

const shots = [
  ["overview", "进入训练空间", 6000], ["tokens", "文本与训练目标", 8000],
  ["embedding", "向量与位置", 8000], ["attention", "因果注意力", 10000],
  ["forward", "前向计算与 GPU 硬件", 8000], ["loss", "预测与交叉熵", 8000],
  ["backward", "梯度反向传播", 9000], ["update", "参数更新与重复训练", 9000],
  ["inference", "固定参数生成", 8000]
];
shots.forEach(([id, title, duration]) => shot(id, title, duration));
const cameraKeys = [
  [0, [-29, 20, 43]], [6000, [-28, 7.5, 14]], [14000, [-23, 7, 14]],
  [21000, [-15, 8.5, 16]], [24500, [-7, 8, 19]], [30500, [-4, 7, 18]],
  [34000, [9, 10, 29]], [37000, [7, 10, 28]], [39000, [9, 10, 29]],
  [42000, [24, 8.5, 18]], [47000, [23, 7, 17]],
  [51500, [13, 13, 30]], [56500, [-6, 11, 26]], [60500, [1, 9, 21]],
  [65000, [11, 11, 26]], [70000, [34, 8, 18]], [74000, [38, 17, 37]]
];
const targetKeys = [
  [0, [-4, 3, 0]], [6000, [-25, 3.5, 0]], [14000, [-23, 3.5, 0]],
  [21000, [-14, 3, 0]], [24500, [-5.5, 4.4, 6.5]], [30500, [-5.5, 4.4, 6.5]],
  [34000, [1, 4.2, 12.4]], [37000, [1, 4.2, 12.4]], [39000, [1, 4.2, 12.4]],
  [42000, [21, 3.7, 0]], [47000, [21, 3.7, 0]],
  [51500, [2, 4, 0]], [56500, [-1, 4, 0]], [60500, [1, 4.3, 0]],
  [65000, [7, 4, 0]], [70000, [33, 4, 0]], [74000, [18, 4, 0]]
];
track("camera", "position", cameraKeys, "smooth");
track("camera", "target", targetKeys, "smooth");
const clamp = t => Math.max(0, Math.min(1, t));
animate(t => {
  const changes = {};
  forward.forEach((item, i) => {
    const p = ((t - 18000) / 8500 + i / 12) % 1;
    changes[item.id] = { position: [-19 + clamp(p) * 43, 3.5 + Math.sin(i * 1.9) * 0.28, 1.2], visible: t >= 18000 && t < 48000 };
  });
  backward.forEach((item, i) => {
    const p = ((t - 48000) / 5500 + i / 12) % 1;
    changes[item.id] = { position: [23 - clamp(p) * 42, 1.3 + Math.sin(i) * 0.15, 3.7], visible: t >= 48000 && t < 57000 };
  });
  changes[coreRing.id] = { rotation: [0, 0, t / 7000] };
  return changes;
});
