import variant from "@jitl/quickjs-singlefile-cjs-release-sync";
import { newQuickJSWASMModuleFromVariant, type QuickJSContext, type QuickJSWASMModule } from "quickjs-emscripten-core";

/**
 * 服务端运行作者代码用的沙箱（QuickJS：用 WebAssembly 编译的独立 JavaScript 解释器）。
 * 算法演示（algo/trace.ts）和场景动画（scene/run.ts）共用同一份，不用各自加载一遍。
 */

let quickjs: Promise<QuickJSWASMModule> | undefined;
export const loadQuickJS = () => (quickjs ??= newQuickJSWASMModuleFromVariant(variant as never));

export type Dumped = { name?: string; message?: string; stack?: string } | string | undefined;

/** 运行一段代码，返回它的值；出错时返回错误对象。 */
export function evaluate(vm: QuickJSContext, code: string, filename: string): { ok: true; value: unknown } | { ok: false; error: Dumped } {
  const r = vm.evalCode(code, filename);
  if (r.error) {
    const error = vm.dump(r.error) as Dumped;
    r.error.dispose();
    return { ok: false, error };
  }
  const value = vm.dump(r.value);
  r.value.dispose();
  return { ok: true, value };
}
