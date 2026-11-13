#!/usr/bin/env bash
#
# 在自己电脑上构建好 Galley 的镜像，上传到服务器并启动。服务器上不用下载依赖、也不用构建。
#
#   ./release.sh 用户名@服务器地址            第一次部署和以后每次更新都用这一条
#   ./release.sh 用户名@服务器地址 目录名      服务器上放配置的目录，默认是用户主目录下的 galley
#
# 需要：本机装好 Docker；能用 ssh 免密码登录服务器（或者到时候输入密码）；服务器上装好 Docker。
# 第一次部署时会在服务器上问你端口、域名、后台密码，和直接在服务器上运行 deploy.sh 一样。
#
# 上传的只有镜像和几个配置文件（docker-compose.yml、deploy.sh、deploy/Caddyfile、.env.example），不上传源代码；
# 服务器上的 .env 和数据都不会被覆盖。

set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
fail() {
  printf '\n\033[31m%s\033[0m\n' "$*" >&2
  exit 1
}

HOST=${1:-}
DIR=${2:-galley}
[ -n "$HOST" ] || fail "用法：./release.sh 用户名@服务器地址 [服务器上的目录，默认 galley]"
[[ "$DIR" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "目录名只能用字母、数字和 . _ / -。"

command -v docker >/dev/null 2>&1 || fail "本机没有找到 docker。"
docker info >/dev/null 2>&1 || fail "本机连不上 Docker，确认 Docker 已经启动。"
docker buildx version >/dev/null 2>&1 || fail "本机的 Docker 没有 buildx，没法为服务器的处理器构建镜像。请升级 Docker。"

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

say "在本机构建镜像（${PLATFORM}）"
# 本机和服务器的处理器不一样时（比如 Mac 是 ARM、服务器是 x86），Docker 会模拟服务器的处理器来构建，会慢一些。
docker buildx build --platform "$PLATFORM" --load -t galley:latest .

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
tar czf - docker-compose.yml deploy.sh deploy/Caddyfile .env.example | remote "mkdir -p '$DIR' && tar xzf - -C '$DIR'"

say "在服务器上启动"
# -t：第一次部署时要在服务器上回答几个问题（端口、域名、后台密码）。
ssh -t "$HOST" "cd '$DIR' && GALLEY_PREBUILT=1 ./deploy.sh"
