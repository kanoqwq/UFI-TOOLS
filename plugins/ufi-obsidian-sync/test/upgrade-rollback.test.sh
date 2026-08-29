#!/bin/bash
# 升级中的下载/校验失败必须恢复旧内核与版本缓存，并向调用方返回失败。
set -eu
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ROOT="$TMP/ufisync"
PROC="$TMP/proc"
TOOLS="$TMP/tools"
mkdir -p "$ROOT/bin" "$ROOT/run" "$ROOT/backup" "$ROOT/log" "$PROC" "$TOOLS"

BIN="$ROOT/bin/syncthing"
VERSION_CACHE="$ROOT/kernel.version"
printf '#!/bin/sh\necho old-syncthing\n' >"$BIN"
chmod 755 "$BIN"
printf '%s\n' 'syncthing v1.30.0 old-cache' >"$VERSION_CACHE"
cp "$BIN" "$TMP/expected-bin"
cp "$VERSION_CACHE" "$TMP/expected-version"

# 让 install-run 复用一个足够大的缓存包，然后在固定 SHA256 校验处失败。
dd if=/dev/zero of="$ROOT/syncthing.tar.gz" bs=1000000 count=6 >/dev/null 2>&1
cat >"$TOOLS/getprop" <<'SH'
#!/bin/sh
[ "${1:-}" = "ro.product.cpu.abi" ] && echo arm64
SH
cat >"$TOOLS/netstat" <<'SH'
#!/bin/sh
exit 0
SH
cat >"$TOOLS/stat" <<'SH'
#!/bin/sh
if [ "${1:-}" = "-c%s" ]; then
  /usr/bin/stat -f%z "$2" 2>/dev/null && exit 0
  exec /usr/bin/stat -c%s "$2"
fi
exec /usr/bin/stat "$@"
SH
cat >"$TOOLS/sha256sum" <<'SH'
#!/bin/sh
printf '%s  %s\n' '0000000000000000000000000000000000000000000000000000000000000000' "$1"
SH
chmod 755 "$TOOLS"/*

OUT="$TMP/upgrade.out"
if PATH="$TOOLS:/bin:/usr/bin" UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" \
  sh device/ufisync.sh upgrade 1.30.0 >"$OUT" 2>&1; then
  echo "❌ 校验失败的升级错误返回了成功"
  cat "$OUT"
  exit 1
fi

cmp -s "$TMP/expected-bin" "$BIN" || {
  echo "❌ 升级失败后没有恢复旧内核"
  cat "$OUT"
  exit 1
}
cmp -s "$TMP/expected-version" "$VERSION_CACHE" || {
  echo "❌ 升级失败后没有恢复旧版本缓存"
  cat "$OUT"
  exit 1
}
[ ! -d "$ROOT/run/apply.lock" ] || {
  echo "❌ 升级失败后仍残留维护锁"
  exit 1
}
grep -q '升级失败' "$OUT" || {
  echo "❌ 升级失败没有返回明确诊断"
  cat "$OUT"
  exit 1
}

echo "✅ 升级失败会恢复旧内核与版本缓存"

echo "升级后启动失败"
START_ROOT="$TMP/start-failure"
mkdir -p "$START_ROOT/bin" "$START_ROOT/run" "$START_ROOT/backup"
printf '%s\n' old-kernel >"$START_ROOT/bin/syncthing"
printf '%s\n' old-version >"$START_ROOT/kernel.version"
printf '%s\n' 'SYNC_PORT=22001' >"$START_ROOT/state.env"
cp "$START_ROOT/bin/syncthing" "$TMP/start-expected-bin"
cp "$START_ROOT/kernel.version" "$TMP/start-expected-version"
cp "$START_ROOT/state.env" "$TMP/start-expected-state"

sed -n '/^cmd_upgrade()/,/^}/p' device/ufisync.sh >"$TMP/cmd-upgrade.fn"
if (
  ROOT="$START_ROOT"
  BIN="$START_ROOT/bin/syncthing"
  KERNEL_VERSION_CACHE="$START_ROOT/kernel.version"
  STATE="$START_ROOT/state.env"
  acquire_apply_lock() { :; }
  release_apply_lock() { :; }
  trusted_kernel_sha256() { printf '%s\n' trusted; }
  running_pid() { printf '%s\n' 4242; }
  stop_service() { :; }
  log() { printf '%s\n' "$*" >>"$START_ROOT/upgrade.log"; }
  die() { log "FATAL: $*"; exit 1; }
  cmd_install_run() {
    printf '%s\n' new-kernel >"$BIN"
    printf '%s\n' new-version >"$KERNEL_VERSION_CACHE"
    printf '%s\n' 'SYNC_PORT=22002' >"$STATE"
  }
  cmd_start() {
    _starts=0
    [ -f "$START_ROOT/start.count" ] && _starts="$(cat "$START_ROOT/start.count")"
    _starts=$((_starts+1))
    printf '%s\n' "$_starts" >"$START_ROOT/start.count"
    [ "$_starts" -ge 2 ]
  }
  . "$TMP/cmd-upgrade.fn"
  cmd_upgrade 1.30.0
); then
  echo "❌ 新内核启动失败的升级错误返回了成功"
  exit 1
fi

cmp -s "$TMP/start-expected-bin" "$START_ROOT/bin/syncthing" || {
  echo "❌ 新内核启动失败后没有恢复旧内核"
  exit 1
}
cmp -s "$TMP/start-expected-version" "$START_ROOT/kernel.version" || {
  echo "❌ 新内核启动失败后没有恢复旧版本缓存"
  exit 1
}
cmp -s "$TMP/start-expected-state" "$START_ROOT/state.env" || {
  echo "❌ 新内核启动失败后没有恢复旧运行状态"
  exit 1
}
[ "$(cat "$START_ROOT/start.count" 2>/dev/null || echo 0)" = 2 ] || {
  echo "❌ 回滚后没有再次启动旧内核"
  exit 1
}

echo "✅ 新内核启动失败会回滚并恢复旧服务"

echo "升级前无法停止旧服务"
STOP_ROOT="$TMP/stop-failure"
mkdir -p "$STOP_ROOT/bin" "$STOP_ROOT/run" "$STOP_ROOT/backup"
printf '%s\n' old-kernel >"$STOP_ROOT/bin/syncthing"
if (
  ROOT="$STOP_ROOT"
  BIN="$ROOT/bin/syncthing"
  KERNEL_VERSION_CACHE="$ROOT/kernel.version"
  STATE="$ROOT/state.env"
  acquire_apply_lock() { :; }
  release_apply_lock() { :; }
  trusted_kernel_sha256() { printf '%s\n' trusted; }
  running_pid() { printf '%s\n' 4242; }
  stop_service() { return 1; }
  cmd_install_run() { touch "$ROOT/install-was-called"; }
  cmd_start() { :; }
  log() { printf '%s\n' "$*" >>"$ROOT/upgrade.log"; }
  die() { log "FATAL: $*"; return 1; }
  . "$TMP/cmd-upgrade.fn"
  cmd_upgrade 1.30.0
); then
  echo "❌ 无法停止旧服务时 upgrade 仍返回成功"
  exit 1
fi
[ ! -e "$STOP_ROOT/install-was-called" ] || {
  echo "❌ 无法停止旧服务时 upgrade 仍进入安装"
  exit 1
}
grep -q old-kernel "$STOP_ROOT/bin/syncthing" || {
  echo "❌ 无法停止旧服务时 upgrade 改写了旧内核"
  exit 1
}

echo "✅ 升级前无法停止旧服务时不会改写内核"
