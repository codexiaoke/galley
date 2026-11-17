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
  // 保存时的检查和审阅页的渲染都从这里取结果，被挤掉会误报"尚未编译"。
  // 三维结果比二维大，上限比二维的 200 小，但要容得下一篇文章的全部场景和同时进行的几次保存。
  while (scene3dCache.size > 48) scene3dCache.delete(scene3dCache.keys().next().value!);
}
