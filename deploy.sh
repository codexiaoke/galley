#!/usr/bin/env bash
#
# Galley 一键部署脚本。在服务器上项目的根目录运行：
#
#   ./deploy.sh          第一次部署，或者改了配置之后重新启动
#   ./deploy.sh update   下载最新的镜像并重新启动（数据不受影响）
#   ./deploy.sh status   看看运行状态
#   ./deploy.sh logs     看日志（Ctrl+C 退出）
#   ./deploy.sh stop     停止（数据保留）
#
# 镜像有三种来源，平时用第一种：
#   - 默认：下载 GitHub 上自动构建好的镜像（ghcr.io/codexiaoke/galley），服务器上不构建。
#   - 自己构建：在 .env 里写 GALLEY_BUILD=1，用这个目录里的源代码在服务器上构建。
#   - 本地构建上传：在自己电脑上运行 ./release.sh，镜像由它传上来。
#
# 配置都在同一目录的 .env 里。第一次运行时会问你几个问题并生成它；之后想改端口、域名，直接改 .env 再运行一次。
# 不想回答问题（比如在自动化脚本里）：先自己写好 .env，或者设置环境变量 GALLEY_PORT、GALLEY_DOMAIN、GALLEY_ADMIN_PASSWORD 再运行。

set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=.env
INTERACTIVE=0
[ -t 0 ] && INTERACTIVE=1

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
fail() {
  printf '\n\033[31m%s\033[0m\n' "$*" >&2
  exit 1
}

# ---- 检查环境 -----------------------------------------------------------------

command -v docker >/dev/null 2>&1 || fail "没有找到 docker。先安装 Docker：https://docs.docker.com/engine/install/"
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  fail "没有找到 docker compose。新版 Docker 自带它；旧版请安装 docker-compose。"
fi
docker info >/dev/null 2>&1 || fail "连不上 Docker。确认 Docker 已经启动，并且当前用户有权限使用它（或者用 sudo 运行这个脚本）。"

# ---- 读写 .env --------------------------------------------------------------

# 读取 .env 里某一项的值（没有就是空）。
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true
}

# 写入或替换 .env 里的某一项。
env_set() {
  local key=$1 value=$2
  touch "$ENV_FILE"
  if grep -qE "^$key=" "$ENV_FILE"; then
    local tmp
    tmp=$(mktemp)
    grep -vE "^$key=" "$ENV_FILE" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
    cat "$tmp" >"$ENV_FILE"
    rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

ask() {
  # ask 提示 默认值：交互时读一行输入，回车用默认值；不交互时直接用默认值。
  local prompt=$1 default=${2:-} answer=""
  if [ "$INTERACTIVE" = 1 ]; then
    read -r -p "  $prompt${default:+（直接回车用 ${default}）}：" answer
  fi
  printf '%s' "${answer:-$default}"
}

random_password() {
  # 20 位，只用字母和数字，免得在 .env 里需要转义。
  # head 取够了就关掉管道，tr 会因此退出并报错，这是正常的，所以要 || true。
  local p
  p=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c 20 || true)
  printf '%s' "$p"
}

GENERATED_PASSWORD=""

first_time_setup() {
  say "第一次部署，先生成配置文件 .env"

  local port domain password
  port=${GALLEY_PORT:-$(ask "对外开放的端口" 3000)}
  [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || fail "端口要是 1 到 65535 之间的数字。"

  domain=${GALLEY_DOMAIN:-$(ask "绑定的域名（有域名就填，会自动配置 HTTPS；没有就直接回车）" "")}

  password=${GALLEY_ADMIN_PASSWORD:-}
  if [ -z "$password" ] && [ "$INTERACTIVE" = 1 ]; then
    local again=""
    read -r -s -p "  后台管理员密码，至少 8 位（直接回车自动生成一个）：" password
    echo
    if [ -n "$password" ]; then
      read -r -s -p "  再输一次：" again
      echo
      [ "$password" = "$again" ] || fail "两次输入的密码不一样。"
    fi
  fi
  if [ -z "$password" ]; then
    password=$(random_password)
    GENERATED_PASSWORD=$password
  fi
  [ "${#password}" -ge 8 ] || fail "后台密码至少要 8 位。"

  env_set GALLEY_ADMIN_PASSWORD "$password"
  env_set GALLEY_PORT "$port"
  env_set GALLEY_DOMAIN "$domain"

  # 在服务器上构建时，国内的服务器连国外的软件源很慢，可以换成国内的镜像源。本地构建上传时用不到。
  if [ "$(image_source)" = build ] && [ -z "${GALLEY_NPM_REGISTRY:-}" ] && [ "$(ask "服务器在中国大陆吗？输入 y 用国内镜像源下载依赖，会快很多" n)" = y ]; then
    env_set GALLEY_NPM_REGISTRY https://registry.npmmirror.com
    env_set GALLEY_APT_MIRROR mirrors.aliyun.com
  fi
  chmod 600 "$ENV_FILE"
  info "已写入 .env（只有你能读）。之后想改端口、域名或密码，直接改这个文件再运行 ./deploy.sh。"
}

# ---- 防火墙 -----------------------------------------------------------------

# 本机防火墙开着时，问一下要不要放行端口。云服务器的"安全组"在控制台里，脚本改不了，只能提醒。
open_firewall() {
  local ports=("$@") p
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    for p in "${ports[@]}"; do
      if [ "$INTERACTIVE" = 1 ] && [ "$(ask "本机防火墙（ufw）开着，要放行 $p 端口吗？输入 y 放行" n)" = y ]; then
        sudo ufw allow "$p/tcp" && info "已放行 $p 端口。"
      else
        info "没有放行 $p 端口。需要的话运行：sudo ufw allow $p/tcp"
      fi
    done
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    for p in "${ports[@]}"; do
      if [ "$INTERACTIVE" = 1 ] && [ "$(ask "本机防火墙（firewalld）开着，要放行 $p 端口吗？输入 y 放行" n)" = y ]; then
        sudo firewall-cmd --permanent --add-port="$p/tcp" && sudo firewall-cmd --reload && info "已放行 $p 端口。"
      else
        info "没有放行 $p 端口。需要的话运行：sudo firewall-cmd --permanent --add-port=$p/tcp && sudo firewall-cmd --reload"
      fi
    done
  fi
  info "如果用的是云服务器（阿里云、腾讯云、AWS 等），还要在控制台的「安全组」或「防火墙」里放行 ${ports[*]} 端口，外面才访问得到。"
}

# ---- 启动 -------------------------------------------------------------------

# 镜像从哪里来：prebuilt（release.sh 传上来的）、build（在服务器上构建）、pull（下载 GitHub 上构建好的，默认）。
image_source() {
  if [ "${GALLEY_PREBUILT:-}" = 1 ] || [ "$(env_get GALLEY_PREBUILT)" = 1 ] || [ -f galley-image.tar.gz ]; then
    echo prebuilt
  elif [ "${GALLEY_BUILD:-}" = 1 ] || [ "$(env_get GALLEY_BUILD)" = 1 ]; then
    echo build
  else
    echo pull
  fi
}
prebuilt() { [ "$(image_source)" = prebuilt ]; }

# 从 .env 里删掉某一项。
env_del() {
  [ -f "$ENV_FILE" ] || return 0
  local tmp
  tmp=$(mktemp)
  grep -vE "^$1=" "$ENV_FILE" >"$tmp" || true
  cat "$tmp" >"$ENV_FILE"
  rm -f "$tmp"
}

compose() {
  if [ -n "$(env_get GALLEY_DOMAIN)" ]; then
    "${COMPOSE[@]}" --profile https "$@"
  else
    "${COMPOSE[@]}" "$@"
  fi
}

wait_until_healthy() {
  local port=$1 i
  for i in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

server_address() {
  # 用本机网卡的地址。不去问外部的服务查公网 IP：那样会把这台服务器的地址告诉第三方。
  # 云服务器的网卡上往往是内网地址，这时要换成控制台里看到的公网 IP。
  local ip=""
  ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  [ -n "$ip" ] || ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}' || true)
  printf '%s' "${ip:-服务器的公网IP}"
}

up() {
  [ -f "$ENV_FILE" ] && [ -n "$(env_get GALLEY_ADMIN_PASSWORD)" ] || first_time_setup

  local port domain
  port=$(env_get GALLEY_PORT)
  port=${port:-3000}
  domain=$(env_get GALLEY_DOMAIN)

  # 用域名时，Galley 的端口只让本机（也就是 Caddy）访问，读者统一从 80/443 进来。
  if [ -n "$domain" ]; then env_set GALLEY_BIND 127.0.0.1; else env_set GALLEY_BIND 0.0.0.0; fi

  # 部署包里带着镜像文件：先导入，导入完改个名，下次运行不再重复导入。
  if [ -f galley-image.tar.gz ]; then
    say "导入镜像（一两分钟）"
    docker load -i galley-image.tar.gz
    mv -f galley-image.tar.gz galley-image.loaded.tar.gz
  fi
  case "$(image_source)" in
    prebuilt)
      env_set GALLEY_PREBUILT 1
      env_set GALLEY_IMAGE galley:latest
      docker image inspect galley:latest >/dev/null 2>&1 || fail "服务器上还没有 galley 镜像。请在自己电脑上运行 ./release.sh，它会构建好镜像传上来。"
      say "启动（用本地构建好传上来的镜像）"
      compose up -d --no-build --pull never --remove-orphans
      ;;
    build)
      env_set GALLEY_IMAGE galley:latest
      say "构建并启动（第一次要下载依赖、编译，可能需要几分钟）"
      compose up -d --build --remove-orphans
      ;;
    pull)
      # 以前用过别的方式部署时留下的设置，换回默认的 GitHub 镜像。自己填的其他镜像地址（比如国内的镜像仓库）保留。
      [ "$(env_get GALLEY_IMAGE)" = galley:latest ] && env_del GALLEY_IMAGE
      say "下载镜像（第一次一百多 MB，之后只下载有变化的部分）"
      compose pull || fail "镜像下载失败。服务器连 ghcr.io 太慢或者连不上的话，可以在自己电脑上运行 ./release.sh 把镜像传上来。"
      say "启动"
      compose up -d --no-build --remove-orphans
      ;;
  esac
  # 清理被新镜像替换下来的旧镜像，只清理 Galley 自己的。
  docker image prune -f --filter "label=org.opencontainers.image.title=galley" >/dev/null 2>&1 || true

  say "等待服务就绪"
  if wait_until_healthy "$port"; then
    info "服务已经启动。"
  else
    fail "等了两分钟还没启动好。运行 ./deploy.sh logs 看看日志。"
  fi

  if [ -n "$domain" ]; then
    open_firewall 80 443
    say "部署完成"
    info "网站：https://$domain"
    info "后台：https://$domain/admin"
    info "第一次访问时 Caddy 会去申请 HTTPS 证书，需要域名已经解析到这台服务器，并且 80、443 端口能从外面访问。"
    info "登录后台后，在「站点设置」里把网站地址填成 https://${domain}，订阅源和站点地图里的链接才是对的。"
  else
    open_firewall "$port"
    local addr
    addr=$(server_address)
    say "部署完成"
    info "网站：http://$addr:$port"
    info "后台：http://$addr:$port/admin"
    info "（上面是这台机器网卡上的地址。云服务器上它可能是内网地址，外面访问要用控制台里的公网 IP。）"
    info "现在是直接开放端口、没有 HTTPS。正式对外的话，建议在 .env 里填上 GALLEY_DOMAIN 再运行一次，自动配置 HTTPS。"
  fi
  if [ -n "$GENERATED_PASSWORD" ]; then
    info ""
    info "后台密码是自动生成的：$GENERATED_PASSWORD"
    info "它也保存在 .env 里。请记下来，或者改成你自己的。"
  fi
}

case "${1:-up}" in
  up) up ;;
  update)
    if prebuilt; then
      fail "这台服务器用的是本地构建好传上来的镜像。要更新，请在自己电脑上拉取最新代码，重新运行 ./release.sh（直接上传或者 --pack 打包）。"
    fi
    # 部署脚本和 docker-compose.yml 也可能更新了，用 git 拿到的就一起拉一下。
    if [ -d .git ]; then
      say "拉取最新代码"
      git pull --ff-only
    fi
    up
    ;;
  status)
    compose ps
    port=$(env_get GALLEY_PORT)
    if curl -fsS "http://127.0.0.1:${port:-3000}/healthz" >/dev/null 2>&1; then info "健康检查：正常"; else info "健康检查：没有响应"; fi
    ;;
  logs) compose logs -f --tail=100 ;;
  stop)
    compose down
    info "已停止。数据还在，运行 ./deploy.sh 可以重新启动。"
    ;;
  *) fail "不认识的命令：$1。可用的有：up、update、status、logs、stop。" ;;
esac
