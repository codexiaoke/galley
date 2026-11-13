import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 设了 GALLEY_STANDALONE 时生成可以独立运行的产物，Docker 镜像用它。平时不开，否则 pnpm start 用不了。
  output: process.env.GALLEY_STANDALONE ? "standalone" : undefined,
  // 运行演示代码的沙箱（QuickJS，WebAssembly 内嵌在 3 MB 的 JS 文件里）不打包，运行时直接从 node_modules 加载。
  // Mermaid 在服务端只用来检查图的写法（见 core/markup/mermaid.ts），也不打包，好让它和 DOMPurify 用同一份
  // 分享卡片用的 resvg 是原生模块（.node 文件），同样不打包。
  serverExternalPackages: ["quickjs-emscripten-core", "@jitl/quickjs-singlefile-cjs-release-sync", "mermaid", "dompurify", "@resvg/resvg-js"],
  experimental: {
    // 后台上传图片走服务端操作，默认只允许 1 MB。图片的上限是 10 MB，再留一点表单本身的开销。
    serverActions: { bodySizeLimit: "12mb" },
  },
  turbopack: {
    // 读者点「运行」时在浏览器里加载 QuickJS（见 render/client/run-sandbox.ts）。
    // 它的单文件版本里有一段只在 Node.js 下才走到的 require("fs")，打包给浏览器时换成空模块。
    resolveAlias: { fs: { browser: "./src/render/client/empty-module.ts" } },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
