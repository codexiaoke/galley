import { readFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";

/** 工坊是独立本机服务，直接打包后台共享组件和样式，不再维护另一套 UI。 */
export async function buildStudio(directory: string) {
  const [javascript, compiler] = await Promise.all([
    build({ absWorkingDir: directory, entryPoints: ["client.tsx"], bundle: true, write: false, minify: true,
      platform: "browser", format: "esm", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } }),
    compile(await readFile(path.join(directory, "studio.css"), "utf8"), { base: directory, onDependency: () => {} }),
  ]);
  const scanner = new Scanner({ sources: compiler.sources });
  return { js: javascript.outputFiles[0].contents, css: compiler.build(scanner.scan()) };
}
