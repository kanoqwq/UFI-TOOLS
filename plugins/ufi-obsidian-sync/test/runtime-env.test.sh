#!/bin/bash
# 设备端公共命令即使由不带 HOME 的 UFI-TOOLS Root Shell 启动，
# 也必须为 Syncthing 提供插件托管的 HOME。
set -eu
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ROOT="$TMP/ufisync"
CA_SYSTEM="$TMP/system-cacerts"
CA_APEX="$TMP/apex-cacerts"
mkdir -p "$ROOT/bin" "$CA_SYSTEM" "$CA_APEX"

cat >"$ROOT/bin/syncthing" <<'SH'
#!/bin/sh
if [ -z "${HOME:-}" ]; then
  echo '$HOME is not defined'
  echo 'panic: Failed to get user home dir'
  exit 2
fi
echo "syncthing v1.30.0 HOME=$HOME SSL_CERT_DIR=${SSL_CERT_DIR:-} GOMEMLIMIT=${GOMEMLIMIT:-} GOGC=${GOGC:-} GOMAXPROCS=${GOMAXPROCS:-} STNORESTART=${STNORESTART:-}"
SH
chmod 755 "$ROOT/bin/syncthing"

out="$(env -u HOME -u SSL_CERT_DIR -u SSL_CERT_FILE -u GOMEMLIMIT -u GOGC -u GOMAXPROCS \
  UFISYNC_ROOT="$ROOT" \
  UFISYNC_CA_DIRS="$CA_APEX:$CA_SYSTEM:$TMP/missing-cacerts" \
  sh device/ufisync.sh diag 2>&1)"

if echo "$out" | grep -q '\$HOME is not defined'; then
  echo "❌ diag 在无 HOME 的 Root Shell 环境下仍触发 Syncthing panic"
  exit 1
fi

if ! echo "$out" | grep -q "syncthing v1.30.0 HOME=$ROOT"; then
  echo "❌ diag 没有把插件目录作为 Syncthing HOME"
  echo "$out"
  exit 1
fi

if ! echo "$out" | grep -q "SSL_CERT_DIR=$CA_APEX:$CA_SYSTEM"; then
  echo "❌ 未把实际存在的 Android CA 目录传给静态 Syncthing"
  echo "$out"
  exit 1
fi

if ! echo "$out" | grep -q 'GOMEMLIMIT=256MiB GOGC=60 GOMAXPROCS=2 STNORESTART=1'; then
  echo "❌ 未向 Syncthing 注入 device 低资源运行预算"
  echo "$out"
  exit 1
fi

# 升级设备的 state.env 可能保存旧脚本版本。运行状态可以从 state.env 读取，
# 但代码版本必须以当前已部署脚本为准，不能被历史状态覆盖。
cat >"$ROOT/state.env" <<'EOF'
UFISYNC_VERSION=1.0.0
SYNCTHING_VERSION=1.30.0
EOF
version_out="$(UFISYNC_ROOT="$ROOT" sh device/ufisync.sh version 2>&1)"
if ! echo "$version_out" | grep -q '^ufisync 2\.3\.1 /'; then
  echo "❌ 历史 state.env 覆盖了当前控制脚本版本：$version_out"
  exit 1
fi

echo "✅ 无 HOME 的 Root Shell 环境可运行 Syncthing，历史状态不会覆盖当前脚本版本"
