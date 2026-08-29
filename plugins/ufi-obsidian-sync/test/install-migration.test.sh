#!/bin/bash
# 重装/升级不得漂移已生效端口；既有内核需补齐第三方许可。
set -eu
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
TOOLS="$TMP/tools"
mkdir -p "$TOOLS"

cat >"$TOOLS/id" <<'SH'
#!/bin/sh
[ "${1:-}" = "-u" ] && { echo 0; exit 0; }
exec /usr/bin/id "$@"
SH
cat >"$TOOLS/getprop" <<'SH'
#!/bin/sh
case "${1:-}" in
  ro.product.cpu.abi) echo arm64 ;;
  ro.product.model) echo test-arm64-device ;;
  ro.build.version.release) echo 13 ;;
  ro.build.version.sdk) echo 33 ;;
esac
SH
cat >"$TOOLS/df" <<'SH'
#!/bin/sh
printf '%s\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on' '/dev/test 20000000 1 19999999 1% /test'
SH
cat >"$TOOLS/netstat" <<'SH'
#!/bin/sh
printf '%s\n' \
  'tcp 0 0 0.0.0.0:22000 0.0.0.0:* LISTEN' \
  'tcp 0 0 0.0.0.0:22002 0.0.0.0:* LISTEN'
SH
cat >"$TOOLS/curl" <<'SH'
#!/bin/sh
echo 200
SH
cat >"$TOOLS/stat" <<'SH'
#!/bin/sh
if [ "${1:-}" = "-c%s" ]; then
  /usr/bin/stat -f%z "$2" 2>/dev/null && exit 0
  exec /usr/bin/stat -c%s "$2"
fi
if [ "${1:-}" = "-c" ] && [ "${2:-}" = "%Y" ]; then
  /usr/bin/stat -f%m "$3" 2>/dev/null && exit 0
fi
exec /usr/bin/stat "$@"
SH
cat >"$TOOLS/sha256sum" <<'SH'
#!/bin/sh
printf '%s  %s\n' '0000000000000000000000000000000000000000000000000000000000000000' "$1"
SH
chmod 755 "$TOOLS"/*

write_saved_config() {
  _wsc_root="$1"; _wsc_state_port="$2"; _wsc_xml_port="$3"
  mkdir -p "$_wsc_root/config" "$_wsc_root/run" "$_wsc_root/log"
  printf '%s\n' "SYNC_PORT=$_wsc_state_port" >"$_wsc_root/state.env"
  printf '%s\n' \
    '<configuration version="37">' \
    "  <options><listenAddress>tcp://0.0.0.0:$_wsc_xml_port</listenAddress></options>" \
    '</configuration>' >"$_wsc_root/config/config.xml"
}

echo "保留已生效同步端口"
ROOT_PORT="$TMP/saved-port/ufisync"
# state.env 曾被上一轮错误重装写成 22003；config.xml 的 22002 才是当前生效端口。
write_saved_config "$ROOT_PORT" 22003 22002
PREFLIGHT_OUT="$TMP/saved-port/preflight.out"
PATH="$TOOLS:/bin:/usr/bin" UFISYNC_ROOT="$ROOT_PORT" \
  sh device/ufisync.sh preflight >"$PREFLIGHT_OUT" 2>&1
grep -q '^sync_port_choice=22002$' "$PREFLIGHT_OUT" || {
  echo "❌ preflight 没有报告会保留的现有端口"
  grep -E '^(port:|sync_port_choice=|verdict=|verdict_reason=)' "$PREFLIGHT_OUT" || true
  exit 1
}
echo "✅ preflight 即使看到端口 busy，也报告保留 config.xml 的 22002"

# 让 install-run 在端口选择之后进入固定的哈希失败，不修改设备或下载网络文件。
dd if=/dev/zero of="$ROOT_PORT/syncthing.tar.gz" bs=1000000 count=6 >/dev/null 2>&1
INSTALL_OUT="$TMP/saved-port/install.out"
if PATH="$TOOLS:/bin:/usr/bin" UFISYNC_ROOT="$ROOT_PORT" \
  sh device/ufisync.sh install-run >"$INSTALL_OUT" 2>&1; then
  echo "❌ 哈希不匹配的测试安装错误返回成功"
  exit 1
fi
grep -q '同步端口选定：22002' "$INSTALL_OUT" || {
  echo "❌ install-run 重选了端口，没有保留 config.xml 的 22002"
  cat "$INSTALL_OUT"; exit 1
}
grep -q '^SYNC_PORT=22003$' "$ROOT_PORT/state.env" || {
  echo "❌ 失败安装不应改写既有 state.env"
  exit 1
}
echo "✅ 重装保留当前 config.xml 的合法端口"

ROOT_STATE_ONLY="$TMP/state-only/ufisync"
mkdir -p "$ROOT_STATE_ONLY/run" "$ROOT_STATE_ONLY/log"
printf '%s\n' 'SYNC_PORT=22002' >"$ROOT_STATE_ONLY/state.env"
dd if=/dev/zero of="$ROOT_STATE_ONLY/syncthing.tar.gz" bs=1000000 count=6 >/dev/null 2>&1
if PATH="$TOOLS:/bin:/usr/bin" UFISYNC_ROOT="$ROOT_STATE_ONLY" \
  sh device/ufisync.sh install-run >"$TMP/state-only/install.out" 2>&1; then
  echo "❌ state-only 哈希测试错误返回成功"; exit 1
fi
grep -q '同步端口选定：22002' "$TMP/state-only/install.out" || {
  echo "❌ 缺少 config.xml 时没有保留 state.env 的合法端口"
  exit 1
}
echo "✅ 缺少 config.xml 时保留 state.env 的合法端口"

ROOT_FRESH="$TMP/fresh/ufisync"
mkdir -p "$ROOT_FRESH/run" "$ROOT_FRESH/log"
dd if=/dev/zero of="$ROOT_FRESH/syncthing.tar.gz" bs=1000000 count=6 >/dev/null 2>&1
if PATH="$TOOLS:/bin:/usr/bin" UFISYNC_ROOT="$ROOT_FRESH" \
  sh device/ufisync.sh install-run >"$TMP/fresh/install.out" 2>&1; then
  echo "❌ fresh 哈希测试错误返回成功"; exit 1
fi
grep -q '同步端口选定：22001' "$TMP/fresh/install.out" || {
  echo "❌ 全新安装没有选择第一个空闲端口 22001"
  cat "$TMP/fresh/install.out"; exit 1
}
echo "✅ 仅全新安装且无保存端口时自动选空闲端口"

echo "既有内核补齐第三方许可"
LICENSE_ROOT="$TMP/existing-kernel/ufisync"
mkdir -p "$LICENSE_ROOT/bin" "$LICENSE_ROOT/config" "$LICENSE_ROOT/run" \
  "$LICENSE_ROOT/log" "$LICENSE_ROOT/backup" "$LICENSE_ROOT/db"
printf '%s\n' existing-kernel >"$LICENSE_ROOT/bin/syncthing"
chmod 755 "$LICENSE_ROOT/bin/syncthing"

sed -n '/^cmd_install_run_locked()/,/^}/p' device/ufisync.sh >"$TMP/cmd-install-run-locked.fn"
sed -n \
  '/^decode_base64_file()/,/^}/p;/^sha256_of()/,/^}/p;/^syncthing_license_b64()/,/^}/p;/^ensure_syncthing_license()/,/^}/p' \
  device/ufisync.sh >"$TMP/license-functions.fn"

run_existing_kernel_install() (
  PATH="$TOOLS:/bin:/usr/bin"
  export PATH
  ROOT="$LICENSE_ROOT"
  BIN_DIR="$ROOT/bin"; BIN="$BIN_DIR/syncthing"; STHOME="$ROOT/config"
  RUN_DIR="$ROOT/run"; LOG_DIR="$ROOT/log"; STATE="$ROOT/state.env"
  KERNEL_VERSION_CACHE="$ROOT/kernel.version"; TGZ="$ROOT/syncthing.tar.gz"
  LICENSE_DIR="$ROOT/licenses"; SYNCTHING_LICENSE="$LICENSE_DIR/Syncthing-MPL-2.0.txt"
  DATA_ROOT="$ROOT/vaults"; STDATA_DEFAULT="$ROOT/db"; STDATA="$STDATA_DEFAULT"
  SYNCTHING_VERSION=1.30.0; UFISYNC_VERSION=2.3.1; INSTALL_FREE_MB=3072; SYNC_PORT=22002
  have() { command -v "$1" >/dev/null 2>&1; }
  trusted_kernel_sha256() { printf '%s\n' trusted; }
  free_mb() { echo ""; }
  set_install_state() { printf '%s|%s\n' "$1" "$2" >"$RUN_DIR/install.state"; }
  ensure_conf() { :; }
  make_folder_dirs() { :; }
  install_sync_port_choice() { echo 22002; }
  log() { printf '%s\n' "$*" >>"$LOG_DIR/ufisync.log"; }
  is_elf() { return 0; }
  kernel_ok() { return 0; }
  kernel_version_line() { echo 'syncthing v1.30.0 existing'; }
  cache_kernel_version() { kernel_version_line >"$KERNEL_VERSION_CACHE"; }
  install_hooks() { :; }
  fetch_release() { : >"$TMP/unexpected-license-download"; return 1; }
  . "$TMP/license-functions.fn"
  sha256_of() {
    if [ -x /usr/bin/shasum ]; then /usr/bin/shasum -a 256 "$1" | awk '{print $1}'
    else /usr/bin/sha256sum "$1" | awk '{print $1}'; fi
  }
  . "$TMP/cmd-install-run-locked.fn"
  cmd_install_run_locked
)

run_existing_kernel_install
LICENSE_FILE="$LICENSE_ROOT/licenses/Syncthing-MPL-2.0.txt"
[ -s "$LICENSE_FILE" ] || {
  echo "❌ 已有 v1.30.0 内核缺 LICENSE 时，install-run 没有补齐许可"
  exit 1
}
[ ! -f "$TMP/unexpected-license-download" ] || {
  echo "❌ 仅补许可却重新下载了内核安装包"
  exit 1
}
if command -v sha256sum >/dev/null 2>&1; then
  LICENSE_SHA="$(sha256sum "$LICENSE_FILE" | awk '{print $1}')"
else
  LICENSE_SHA="$(shasum -a 256 "$LICENSE_FILE" | awk '{print $1}')"
fi
[ "$LICENSE_SHA" = '3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04' ] || {
  echo "❌ 内嵌 LICENSE 与 Syncthing v1.30.0 上游文件不一致：$LICENSE_SHA"
  exit 1
}
echo "✅ 已有内核无需下载即可原子补齐完整上游 LICENSE"

printf '%s\n' 'keep-existing-license-verbatim' >"$LICENSE_FILE"
cp "$LICENSE_FILE" "$TMP/license-before"
run_existing_kernel_install
cmp -s "$TMP/license-before" "$LICENSE_FILE" || {
  echo "❌ 已有 LICENSE 被安装迁移覆盖"
  exit 1
}
echo "✅ 已有 LICENSE 保持原样"
