# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate
WORKDIR /app

FROM base AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
ENV npm_config_nodedir=/usr/local
RUN pnpm install --frozen-lockfile

FROM base AS run
LABEL org.opencontainers.image.title="galley-studio"
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
# 浏览器版本由锁文件决定，与 Playwright 一起更新；只安装离线渲染需要的 Chromium。
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
RUN pnpm exec playwright install --with-deps --only-shell chromium \
    && apt-get install -y --no-install-recommends fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /data && chown node:node /data
# Studio 复用后台组件，首次请求时打包；数据库迁移和技能也在运行时读取。
COPY src ./src
COPY integrations/video-studio ./integrations/video-studio
COPY drizzle ./drizzle
COPY skills ./skills
ENV NODE_ENV=production STUDIO_DIR=/data STUDIO_HOST=0.0.0.0 STUDIO_PORT=4321
USER node
VOLUME /data
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.STUDIO_PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "integrations/video-studio/server.ts"]
