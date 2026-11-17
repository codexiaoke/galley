import { contentHash } from "../content-hash";
import { SCENE3D_PRELUDE } from "./prelude";
import type { Scene3DResult } from "./schema";
// 场景契约或画面语义改变时升级，避免旧缓存和已审工坊版本继续复用。
const engine = contentHash(`physical-materials-v2\0${SCENE3D_PRELUDE}`);
export const scene3dKey = (code: string) => contentHash(`scene3d\0${engine}\0${code}`);
const store = globalThis as unknown as { __galleyScenes3D?: Map<string, Scene3DResult> };
export const scene3dCache = store.__galleyScenes3D ??= new Map<string, Scene3DResult>();
export function rememberScene3D(key: string, result: Scene3DResult) {
  scene3dCache.delete(key); scene3dCache.set(key, result);
  // 三维轨迹比二维结果大，只保留少量最近使用的内容。
  while (scene3dCache.size > 12) scene3dCache.delete(scene3dCache.keys().next().value!);
}
