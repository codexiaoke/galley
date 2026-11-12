import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 设了 GALLEY_STANDALONE 时生成可以独立运行的产物，Docker 镜像用它。平时不开，否则 pnpm start 用不了。
  output: process.env.GALLEY_STANDALONE ? "standalone" : undefined,
  experimental: {
    // 后台上传图片走服务端操作，默认只允许 1 MB。图片的上限是 10 MB，再留一点表单本身的开销。
    serverActions: { bodySizeLimit: "12mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
