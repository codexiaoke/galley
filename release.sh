#!/usr/bin/env bash
#
# 在自己电脑上构建好 Galley 的镜像，交给服务器运行。服务器上不用下载依赖、也不用构建。两种用法：
#
#   ./release.sh 用户名@服务器地址 [目录名]
#       直接通过 ssh 上传到服务器并启动。目录名是服务器上放配置的地方，默认是用户主目录下的 galley。
#       第一次部署和以后每次更新都用这一条。需要本机能 ssh 登录服务器。
#
#   ./release.sh --pack [amd64|arm64]
#       只打包，不连服务器：生成 dist/galley-deploy.tar，你自己传到服务器上（用 scp、宝塔、FTP 都行），
#       解开后运行里面的 ./deploy.sh。处理器类型默认 amd64（大多数云服务器）；服务器上运行 uname -m，
#       显示 aarch64 的选 arm64。
#
# 交给服务器的只有镜像和几个配置文件（docker-compose.yml、deploy.sh、deploy/Caddyfile、.env.example），不含源代码；
# 服务器上的 .env 和数据都不会被覆盖。

set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
fail() {
  printf '\n\033[31m%s\033[0m\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "本机没有找到 docker。"
docker info >/dev/null 2>&1 || fail "本机连不上 Docker，确认 Docker 已经启动。"
docker buildx version >/dev/null 2>&1 || fail "本机的 Docker 没有 buildx，没法为服务器的处理器构建镜像。请升级 Docker。"

# 部署时要交给服务器的配置文件。
DEPLOY_FILES=(docker-compose.yml deploy.sh deploy/Caddyfile .env.example)

build_image() {
  say "在本机构建镜像（$1）"
  # 本机和服务器的处理器不一样时（比如 Mac 是 ARM、服务器是 x86），Docker 会模拟服务器的处理器来构建，会慢一些。
  # 默认用国内软件源；从本机环境变量读取覆盖值，不读取或上传本机的 .env。显式传空值时使用官方源。
  docker buildx build --platform "$1" \
    --build-arg "NPM_REGISTRY=${GALLEY_NPM_REGISTRY-https://registry.npmmirror.com}" \
    --build-arg "APT_MIRROR=${GALLEY_APT_MIRROR-mirrors.aliyun.com}" \
    --load -t galley:latest .
}

# ---- 只打包：生成一个自己上传的部署包 ----------------------------------------
if [ "${1:-}" = "--pack" ]; then
  case "${2:-amd64}" in
    amd64 | x86_64) PLATFORM=linux/amd64 ;;
    arm64 | aarch64) PLATFORM=linux/arm64 ;;
    *) fail "处理器类型只能是 amd64 或 arm64。" ;;
  esac
  build_image "$PLATFORM"

  say "打包"
  OUT=dist/galley-deploy
  rm -rf "$OUT" dist/galley-deploy.tar
  mkdir -p "$OUT/deploy"
  for f in "${DEPLOY_FILES[@]}"; do cp "$f" "$OUT/$f"; done
  docker save galley:latest | gzip -1 >"$OUT/galley-image.tar.gz"
  cat >"$OUT/部署说明.txt" <<TXT
Galley 部署包（${PLATFORM}，$(date '+%Y-%m-%d %H:%M') 打包）

第一次部署：
  1. 把 galley-deploy.tar 传到服务器上，比如：scp dist/galley-deploy.tar 用户名@服务器地址:~
  2. 在服务器上解开并运行：
       tar xf galley-deploy.tar && cd galley-deploy && ./deploy.sh
     它会导入镜像，问你端口、域名、后台密码，然后启动。

以后更新：
  在自己电脑上重新打包，传到服务器的同一个位置，再运行同样的命令。
  解包不会覆盖服务器上的 .env（配置）和数据。

服务器上只需要装好 Docker。
TXT
  tar cf dist/galley-deploy.tar -C dist galley-deploy
  rm -rf "$OUT"
  say "打包完成"
  info "部署包：$(pwd)/dist/galley-deploy.tar（$(du -h dist/galley-deploy.tar | cut -f1)）"
  info "传到服务器后运行：tar xf galley-deploy.tar && cd galley-deploy && ./deploy.sh"
  exit 0
fi

# ---- 直接上传到服务器 ----------------------------------------------------------
HOST=${1:-}
DIR=${2:-galley}
[ -n "$HOST" ] || fail "用法：./release.sh 用户名@服务器地址 [服务器上的目录，默认 galley]，或者 ./release.sh --pack [amd64|arm64] 只打包"
[[ "$DIR" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "目录名只能用字母、数字和 . _ / -。"

remote() { ssh "$HOST" "$@"; }

say "检查服务器"
ARCH=$(remote uname -m) || fail "连不上 ${HOST}。先确认 ssh $HOST 能登录。"
case "$ARCH" in
  x86_64 | amd64) PLATFORM=linux/amd64 ;;
  aarch64 | arm64) PLATFORM=linux/arm64 ;;
  *) fail "不认识服务器的处理器类型：$ARCH" ;;
esac
remote "docker info >/dev/null 2>&1" || fail "服务器上的 Docker 用不了：没装，或者当前用户没有权限（可以把用户加进 docker 组：sudo usermod -aG docker \${USER}，然后重新登录）。"
info "服务器是 ${PLATFORM}，Docker 正常。"

build_image "$PLATFORM"

say "上传镜像（压缩后一百多 MB，取决于你的上传带宽）"
if command -v pv >/dev/null 2>&1; then
  docker save galley:latest | gzip -1 | pv | remote "gunzip | docker load"
else
  docker save galley:latest | gzip -1 | remote "gunzip | docker load"
fi

# 用域名加 HTTPS 时还需要 Caddy 的镜像。服务器上没有的话也从本机传过去，免得服务器去 Docker Hub 下载。
if remote "grep -qE '^GALLEY_DOMAIN=.+' '$DIR/.env' 2>/dev/null && ! docker image inspect caddy:2 >/dev/null 2>&1"; then
  say "上传 Caddy 镜像（HTTPS 用）"
  docker pull --platform "$PLATFORM" caddy:2 >/dev/null
  docker save caddy:2 | gzip -1 | remote "gunzip | docker load"
fi

say "上传部署配置到服务器的 ~/$DIR"
tar czf - "${DEPLOY_FILES[@]}" | remote "mkdir -p '$DIR' && tar xzf - -C '$DIR'"

say "在服务器上启动"
# -t：第一次部署时要在服务器上回答几个问题（端口、域名、后台密码）。
ssh -t "$HOST" "cd '$DIR' && GALLEY_PREBUILT=1 ./deploy.sh"
