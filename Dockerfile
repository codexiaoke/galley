# syntax=docker/dockerfile:1

# Galley 的镜像：分三步，最后的镜像里只有运行需要的文件。
# 数据（数据库和上传的图片）不在镜像里，在 /data 这个卷里。

FROM node:22-bookworm-slim AS base
# 国内服务器上构建时可以换成国内的镜像源，下载会快很多（deploy.sh 第一次运行时会问）。
#   NPM_REGISTRY 例如 https://registry.npmmirror.com
#   APT_MIRROR   例如 mirrors.aliyun.com
ARG NPM_REGISTRY=
ARG APT_MIRROR=
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# 先把 pnpm 下载好放进这一层，后面几步都用它，不用每一步再下载一次。
RUN corepack enable \
  && COREPACK_NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}" corepack prepare pnpm@10.33.3 --activate \
  && if [ -n "$NPM_REGISTRY" ]; then pnpm config set registry "$NPM_REGISTRY" --global; fi

# ---- 安装依赖 ----
FROM base AS deps
WORKDIR /app
# better-sqlite3 是原生模块。当前平台没有现成的预编译包时要现场编译，需要这些工具。
ARG APT_MIRROR
RUN if [ -n "$APT_MIRROR" ]; then sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; fi \
  && apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# 现场编译时用镜像里自带的 Node 头文件（/usr/local/include/node），不去 nodejs.org 下载。
# 预编译包和头文件都要从国外下载，服务器的网络不通时安装会直接失败。
ENV npm_config_nodedir=/usr/local
RUN pnpm install --frozen-lockfile

# ---- 构建 ----
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# GALLEY_STANDALONE 让 Next.js 产出可以独立运行的目录（.next/standalone）。
# 构建过程会打开一次数据库，给它一个临时目录，不带进最后的镜像。
RUN GALLEY_STANDALONE=1 GALLEY_DATA_DIR=/tmp/galley-build pnpm build

# ---- 运行 ----
FROM node:22-bookworm-slim AS run
# 给镜像打个标记：更新后清理旧镜像时，只清理 Galley 自己的，不碰服务器上别的东西。
LABEL org.opencontainers.image.title="galley"
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV GALLEY_DATA_DIR=/data
# 分享卡片（文章转发到别处时的那张图）要用中文字体画标题。装 Debian 自带的思源宋体和思源黑体（Noto CJK），
# 运行时不去网上下载字体：国内的服务器多半连不上谷歌字体。
ARG APT_MIRROR
RUN if [ -n "$APT_MIRROR" ]; then sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; fi \
  && apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# 数据库迁移和默认技能是运行时从磁盘读的，不在构建产物里，要单独带上。
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/skills ./skills
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
