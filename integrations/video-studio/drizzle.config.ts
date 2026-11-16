import { defineConfig } from "drizzle-kit";

/** 工坊自己的迁移：pnpm db:generate:studio。博客的迁移见仓库根目录的 drizzle.config.ts。 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./integrations/video-studio/core/schema.ts",
  out: "./integrations/video-studio/drizzle",
});
