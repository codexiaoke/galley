import { evaluate, loadQuickJS, type Dumped } from "../quickjs";
import { SCENE3D_LIMITS, validateScene3D, type Scene3DResult } from "./schema";
import { SCENE3D_PRELUDE } from "./prelude";

function message(error: Dumped) {
  const value = typeof error === "object" && error ? error : { message: String(error) };
  if (value.message === "interrupted") return "三维场景代码运行超时，请检查循环或减少采样。";
  const line = /scene3d\.js:(\d+)/.exec(value.stack ?? "")?.[1];
  return `${line ? `第 ${line} 行：` : ""}${value.message ?? String(error)}`;
}

export async function runScene3D(code: string): Promise<Scene3DResult> {
  if (new TextEncoder().encode(code).length > SCENE3D_LIMITS.scriptBytes) return { ok: false, error: "三维场景代码不能超过 200 KB。" };
  const runtime = (await loadQuickJS()).newRuntime();
  runtime.setMemoryLimit(128 * 1024 * 1024); runtime.setMaxStackSize(1024 * 1024);
  const deadline = Date.now() + 3000; runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  try {
    for (const [script, name] of [[SCENE3D_PRELUDE, "scene3d-prelude.js"], [code, "scene3d.js"]]) {
      const result = evaluate(vm, script, name); if (!result.ok) return { ok: false, error: message(result.error) };
    }
    const result = evaluate(vm, "__finish3d()", "scene3d-finish.js");
    if (!result.ok) return { ok: false, error: message(result.error) };
    if (typeof result.value !== "string" || result.value.length > SCENE3D_LIMITS.outputBytes) return { ok: false, error: "三维场景输出过大，请减少模型或动画采样。" };
    return { ok: true, scene: validateScene3D(JSON.parse(result.value)) };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  finally { vm.dispose(); runtime.dispose(); }
}
