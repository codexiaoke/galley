import { z } from "zod";

export const SCENE3D_LIMITS = { nodes: 4000, geometries: 256, materials: 128, tracks: 256, samples: 600_000, duration: 180_000, scriptBytes: 200_000, outputBytes: 16_000_000 };
const number = z.number().finite();
const coordinate = number.min(-100_000).max(100_000);
export const vector3 = z.tuple([coordinate, coordinate, coordinate]);
const quaternion = z.tuple([number, number, number, number]);
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色使用 #RRGGBB");
export const scene3dImage = z.string().regex(/^\/media\/[a-z0-9]+\.(?:png|jpg|webp|avif)$/);
export const scene3dModel = z.string().regex(/^\/media\/[a-z0-9]+\.glb$/);
const positive = number.positive().max(10_000);
const segments = z.number().int().min(3).max(128);
const geometry = z.discriminatedUnion("kind", [
  z.strictObject({ id, kind: z.literal("box"), size: vector3.default([1, 1, 1]), bevel: number.min(0).max(100).default(0) }),
  z.strictObject({ id, kind: z.literal("sphere"), radius: positive.default(1), segments: segments.default(24) }),
  z.strictObject({ id, kind: z.literal("cylinder"), top: number.min(0).max(10000).default(1), bottom: positive.default(1), height: positive.default(1), segments: segments.default(24) }),
  z.strictObject({ id, kind: z.literal("plane"), width: positive.default(1), height: positive.default(1) }),
  z.strictObject({ id, kind: z.literal("torus"), radius: positive.default(1), tube: positive.default(0.1), segments: segments.default(48) }),
  z.strictObject({ id, kind: z.literal("tube"), points: z.array(vector3).min(2).max(128), radius: positive.default(0.1), segments: segments.default(64) }),
  z.strictObject({ id, kind: z.literal("buffer"), positions: z.array(coordinate).min(9).max(300_000), indices: z.array(z.number().int().nonnegative()).max(600_000).optional(), normals: z.array(number).max(300_000).optional(), uv: z.array(number).max(200_000).optional() }),
]);
const material = z.strictObject({
  id, color: color.default("#ffffff"), metalness: number.min(0).max(1).default(0), roughness: number.min(0).max(1).default(0.6),
  emissive: color.default("#000000"), emissiveIntensity: number.min(0).max(20).default(0), opacity: number.min(0).max(1).default(1),
  side: z.enum(["front", "double"]).default("front"), unlit: z.boolean().default(false),
  map: scene3dImage.optional(), normalMap: scene3dImage.optional(), roughnessMap: scene3dImage.optional(), metalnessMap: scene3dImage.optional(),
  emissiveMap: scene3dImage.optional(), aoMap: scene3dImage.optional(), lightMap: scene3dImage.optional(),
  normalScale: z.tuple([number.min(-4).max(4), number.min(-4).max(4)]).default([1, 1]),
  clearcoat: number.min(0).max(1).default(0), clearcoatRoughness: number.min(0).max(1).default(0.1),
  anisotropy: number.min(0).max(1).default(0), anisotropyRotation: number.default(0),
  lightMapIntensity: number.min(0).max(10).default(1), repeat: z.tuple([positive, positive]).default([1, 1]),
});
const node = z.strictObject({
  id, kind: z.enum(["group", "mesh", "model", "camera", "light"]), parent: id.optional(),
  position: vector3.default([0, 0, 0]), rotation: vector3.default([0, 0, 0]), scale: vector3.default([1, 1, 1]), quaternion: quaternion.optional(),
  visible: z.boolean().default(true), castShadow: z.boolean().default(true), receiveShadow: z.boolean().default(true),
  geometry: id.optional(), material: id.optional(), src: scene3dModel.optional(), animation: z.string().min(1).max(100).optional(),
  fov: number.min(5).max(120).default(45), target: vector3.default([0, 0, 0]),
  light: z.enum(["ambient", "hemisphere", "directional", "point"]).optional(), color: color.default("#ffffff"), ground: color.default("#333333"),
  intensity: number.min(0).max(1000).default(1), distance: number.min(0).max(10000).default(0), shadowSpan: positive.default(32),
});
export const SCENE3D_PROPERTIES = ["position", "rotation", "quaternion", "scale", "visible", "target", "fov", "intensity", "animationTime", "opacity", "roughness", "metalness", "emissiveIntensity"] as const;
const sample = z.union([number, z.boolean(), vector3, quaternion]);
const track = z.strictObject({ target: id, property: z.enum(SCENE3D_PROPERTIES), times: z.array(number.min(0)).min(1).max(5402), values: z.array(sample).min(1).max(5402), interpolation: z.enum(["linear", "smooth", "step"]).default("linear") });

export const scene3dSchema = z.strictObject({
  world: z.strictObject({ background: color.default("#202936"), environment: z.enum(["studio", "none"]).default("studio"), environmentIntensity: number.min(0).max(5).default(0.6), exposure: number.min(0.1).max(5).default(1), fog: z.strictObject({ color, near: number.min(0), far: positive }).optional(), bloom: z.strictObject({ strength: number.min(0).max(2), threshold: number.min(0).max(10).default(1), radius: number.min(0).max(1).default(0.4) }).optional() }),
  geometries: z.array(geometry).max(SCENE3D_LIMITS.geometries), materials: z.array(material).max(SCENE3D_LIMITS.materials),
  nodes: z.array(node).min(1).max(SCENE3D_LIMITS.nodes), tracks: z.array(track).max(SCENE3D_LIMITS.tracks),
  shots: z.array(z.strictObject({ id, title: z.string().min(1).max(80), text: z.string().max(500).default(""), duration: number.min(200).max(60000) })).min(1).max(32),
});
export type Scene3D = z.infer<typeof scene3dSchema>;
export type Scene3DNode = Scene3D["nodes"][number];
export type Scene3DValue = z.infer<typeof sample>;
export type Scene3DResult = { ok: true; scene: Scene3D } | { ok: false; error: string };
export const scene3dDuration = (scene: Scene3D) => scene.shots.reduce((sum, shot) => sum + shot.duration, 0);

/** 沙箱输出也是不可信输入；引用、拓扑和轨迹都在进入播放器之前检查。 */
export function validateScene3D(raw: unknown): Scene3D {
  const scene = scene3dSchema.parse(raw), duration = scene3dDuration(scene);
  const fail = (message: string): never => { throw new Error(message); };
  if (duration > SCENE3D_LIMITS.duration) fail("三维场景最长 180 秒，请分成独立作品。");
  const unique = <T extends { id: string }>(items: T[]) => { const map = new Map(items.map((item) => [item.id, item])); if (map.size !== items.length) fail("场景内有重复编号。"); return map; };
  const nodes = unique(scene.nodes), materials = unique(scene.materials), geometries = unique(scene.geometries); unique(scene.shots);
  if (scene.nodes.filter((item) => item.kind === "camera").length !== 1) fail("三维场景必须有且只有一台相机。");
  for (const n of scene.nodes) {
    if (n.quaternion && Math.hypot(...n.quaternion) < 0.001) fail(`${n.id} 的四元数不能为零。`);
    if (materials.has(n.id)) fail(`物体与材质编号重复：${n.id}`);
    if (n.kind === "mesh" && (!geometries.has(n.geometry ?? "") || !materials.has(n.material ?? ""))) fail(`${n.id} 引用了不存在的几何体或材质。`);
    if (n.kind === "model" && !n.src) fail(`${n.id} 缺少媒体库 GLB 模型地址。`);
    if (n.kind === "light" && !n.light) fail(`${n.id} 缺少灯光类型。`);
    if ((n.kind === "camera" || n.kind === "light") && n.parent) fail("相机和灯光需要放在场景根节点。");
    const seen = new Set([n.id]); let parent = n.parent;
    while (parent) { if (seen.has(parent)) fail(`父子关系形成循环：${n.id}`); seen.add(parent); const p = nodes.get(parent); if (!p || p.kind !== "group") fail(`${n.id} 的父节点必须是存在的 group。`); parent = p!.parent; }
  }
  for (const g of scene.geometries) if (g.kind === "box" && (g.size.some((v) => v <= 0) || g.bevel > Math.min(...g.size) / 2)) fail(`${g.id} 的尺寸必须为正，倒角不能超过最短边的一半。`);
  for (const g of scene.geometries) if (g.kind === "buffer") {
    if ((!g.indices && g.positions.length % 9) || g.positions.length % 3 || (g.normals && g.normals.length !== g.positions.length) || (g.uv && g.uv.length !== g.positions.length / 3 * 2)) fail(`${g.id} 的顶点属性长度不匹配。`);
    if (g.indices && (g.indices.length % 3 || g.indices.some((i) => i >= g.positions.length / 3))) fail(`${g.id} 的三角形索引越界。`);
  }
  for (const m of scene.materials) if (m.unlit && (m.normalMap || m.roughnessMap || m.metalnessMap || m.emissiveMap || m.clearcoat || m.anisotropy)) fail(`无光照材质 ${m.id} 不支持法线、金属、粗糙度、自发光贴图或物理涂层参数。`);
  const seenTracks = new Set<string>(); let samples = 0;
  for (const tr of scene.tracks) {
    const n = nodes.get(tr.target), m = materials.get(tr.target), key = `${tr.target}.${tr.property}`;
    if (!n && !m) fail(`动画目标不存在：${tr.target}`);
    if (seenTracks.has(key)) fail(`同一属性只能有一条轨迹：${key}`); seenTracks.add(key);
    if ((tr.property === "rotation" && seenTracks.has(`${tr.target}.quaternion`)) || (tr.property === "quaternion" && seenTracks.has(`${tr.target}.rotation`))) fail(`${tr.target} 不能同时动画欧拉角和四元数。`);
    if (tr.property === "animationTime" && !n?.animation) fail(`${tr.target} 需要先指定 GLB 动画片段。`);
    samples += tr.times.length;
    if (tr.times.length !== tr.values.length || tr.times.some((t, i) => t > duration || (i > 0 && t <= tr.times[i - 1]))) fail(`${key} 的关键帧时间不合法。`);
    const vector = ["position", "rotation", "scale", "target"].includes(tr.property);
    const allowed = m ? ["opacity", "roughness", "metalness", "emissiveIntensity"] : ["position", "rotation", "quaternion", "scale", "visible", ...(n?.kind === "camera" ? ["target", "fov"] : []), ...(n?.kind === "light" ? ["intensity"] : []), ...(n?.kind === "model" ? ["animationTime"] : [])];
    if (!allowed.includes(tr.property)) fail(`${key} 不是这个目标可动画的属性。`);
    for (const value of tr.values) {
      if (vector ? !Array.isArray(value) || value.length !== 3 : tr.property === "quaternion" ? !Array.isArray(value) || value.length !== 4 || Math.hypot(...value) < 0.001 : tr.property === "visible" ? typeof value !== "boolean" : typeof value !== "number") fail(`${key} 的关键帧值类型不正确。`);
      if (typeof value === "number" && (["opacity", "roughness", "metalness"].includes(tr.property) ? value < 0 || value > 1 : tr.property === "fov" ? value < 5 || value > 120 : value < 0 || value > (tr.property === "emissiveIntensity" ? 20 : tr.property === "intensity" ? 1000 : 100000))) fail(`${key} 的关键帧值超出范围。`);
    }
  }
  if (samples > SCENE3D_LIMITS.samples) fail("动画采样点过多，请减少动态物体或改用关键帧。");
  if (scene.world.fog && scene.world.fog.far <= scene.world.fog.near) fail("雾的 far 必须大于 near。");
  return scene;
}

export function scene3dAssets(scene: Scene3D): string[] {
  return [...new Set([...scene.nodes.flatMap((n) => n.src ? [n.src] : []), ...scene.materials.flatMap((m) => [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.aoMap, m.lightMap].filter((value): value is string => !!value))])];
}
