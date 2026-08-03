#!/bin/bash
# Syncthing 发布包里同时存在 ELF 内核和同名 FreeBSD rc 脚本。
# 安装器必须忽略 rc 脚本，避免出现 “/etc/rc.subr: No such file” 的回归。
set -eu
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/unpack/etc/freebsd-rc" "$TMP/unpack/release"

printf '%s\n' '#!/bin/sh' '. /etc/rc.subr' >"$TMP/unpack/etc/freebsd-rc/syncthing"
printf '\177ELFfake-syncthing-kernel\n' >"$TMP/unpack/release/syncthing"

# 只抽取待测函数，避免执行设备脚本末尾的 main。
sed -n '/^is_elf()/,/^}/p;/^find_kernel_binary()/,/^}/p' \
  device/ufisync.sh >"$TMP/functions.sh"

selected="$({
  MIN_BIN_BYTES=0
  . "$TMP/functions.sh"
  find_kernel_binary "$TMP/unpack"
})"

if [ "$selected" != "$TMP/unpack/release/syncthing" ]; then
  echo "❌ 安装器没有选中 ELF 内核：${selected:-（空）}"
  exit 1
fi

echo "✅ 安装器会忽略同名 rc 脚本并选中 ELF 内核"

echo "第三方许可保留"
LICENSE_FIXTURE="$TMP/license-fixture"
LICENSE_ROOT="$TMP/license-root"
mkdir -p "$LICENSE_FIXTURE/release" "$LICENSE_ROOT"
printf '%s\n' 'Mozilla Public License Version 2.0' >"$LICENSE_FIXTURE/release/LICENSE"
sed -n '/^preserve_syncthing_license()/,/^}/p' device/ufisync.sh >"$TMP/license-function.sh"
(
  LICENSE_DIR="$LICENSE_ROOT/licenses"
  SYNCTHING_LICENSE="$LICENSE_DIR/Syncthing-MPL-2.0.txt"
  . "$TMP/license-function.sh"
  preserve_syncthing_license "$LICENSE_FIXTURE"
)
cmp -s "$LICENSE_FIXTURE/release/LICENSE" "$LICENSE_ROOT/licenses/Syncthing-MPL-2.0.txt" || {
  echo "❌ 安装器没有持久保留 Syncthing MPL-2.0 LICENSE"
  exit 1
}
echo "✅ 安装器保留 Syncthing MPL-2.0 LICENSE"

echo "安装包完整性"
grep -q '4655e260e94fa5e0110084040751bd0274acdeb74653933f909036e788a911a1' \
  device/ufisync.sh || {
    echo "❌ 插件未内置 Syncthing v1.30.0 Linux ARM64 的官方 SHA256"
    exit 1
  }
INTEGRITY="$TMP/integrity"
TOOLS="$INTEGRITY/tools"
ROOT="$INTEGRITY/ufisync"
mkdir -p "$TOOLS" "$ROOT"

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
  /usr/bin/stat -c%s "$2" 2>/dev/null && exit 0
  exec /usr/bin/stat -f%z "$2"
fi
exec /usr/bin/stat "$@"
SH
cat >"$TOOLS/sleep" <<'SH'
#!/bin/sh
exit 0
SH
cat >"$TOOLS/tar" <<'SH'
#!/bin/sh
: >"$INTEGRITY_TAR_CALLED"
exit 1
SH
# command -v 能找到但无法产生哈希，等价于设备缺少可用的 SHA256 工具。
cat >"$TOOLS/sha256sum" <<'SH'
#!/bin/sh
if [ "${INTEGRITY_MODE:-}" = missing-tool ]; then exit 127; fi
printf '%s  %s\n' 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' "$1"
SH
cat >"$TOOLS/curl" <<'SH'
#!/bin/sh
_out=""; _take=no
for _arg in "$@"; do
  if [ "$_take" = yes ]; then _out="$_arg"; _take=no; continue; fi
  [ "$_arg" = "-o" ] && _take=yes
done
[ -n "$_out" ] || exit 1
case "${INTEGRITY_MODE:-}" in
  missing-target)
    printf '%s  %s\n%s\n' \
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
      'evil-syncthing-linux-arm64-v1.30.0.tar.gz.bak' \
      'padding-padding-padding-padding-padding-padding-padding-padding' >"$_out"
    ;;
  *)
    printf '%s  %s\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
      'syncthing-linux-arm64-v1.30.0.tar.gz' >"$_out"
    ;;
esac
SH
chmod 755 "$TOOLS"/*

# 存在足够大的本地安装包，让测试直接进入校验阶段。
dd if=/dev/zero of="$ROOT/syncthing.tar.gz" bs=1000000 count=6 >/dev/null 2>&1
TAR_CALLED="$INTEGRITY/tar.called"
INSTALL_OUT="$INTEGRITY/install.out"
if PATH="$TOOLS:/bin:/usr/bin" INTEGRITY_TAR_CALLED="$TAR_CALLED" \
  INTEGRITY_MODE=missing-tool UFISYNC_ROOT="$ROOT" \
  sh device/ufisync.sh install-run >"$INSTALL_OUT" 2>&1; then
  echo "❌ 缺少可用 SHA256 工具时安装器仍返回成功"
  exit 1
fi
if [ -f "$TAR_CALLED" ]; then
  echo "❌ 缺少可用 SHA256 工具时仍继续解包"
  exit 1
fi
grep -q '^stage=failed$' "$ROOT/run/install.state" || {
  echo "❌ SHA256 工具不可用时未记录安装失败"
  cat "$ROOT/run/install.state" 2>/dev/null || true
  cat "$ROOT/log/ufisync.log" 2>/dev/null || true
  cat "$INSTALL_OUT" 2>/dev/null || true
  exit 1
}
grep -q 'SHA256' "$ROOT/run/install.state" || {
  echo "❌ SHA256 工具不可用时诊断信息不明确"
  exit 1
}
echo "✅ 缺少可用 SHA256 工具时拒绝解包"

ROOT_UNTRUSTED="$INTEGRITY/untrusted-version"
mkdir -p "$ROOT_UNTRUSTED"
dd if=/dev/zero of="$ROOT_UNTRUSTED/syncthing.tar.gz" bs=1000000 count=6 >/dev/null 2>&1
TAR_UNTRUSTED="$INTEGRITY/untrusted-version-tar.called"
OUT_UNTRUSTED="$INTEGRITY/untrusted-version.out"
if PATH="$TOOLS:/bin:/usr/bin" INTEGRITY_TAR_CALLED="$TAR_UNTRUSTED" \
  SYNCTHING_VERSION=1.29.7 UFISYNC_ROOT="$ROOT_UNTRUSTED" \
  sh device/ufisync.sh install-run >"$OUT_UNTRUSTED" 2>&1; then
  echo "❌ 未纳入可信哈希白名单的版本仍返回成功"
  exit 1
fi
if [ -f "$TAR_UNTRUSTED" ]; then
  echo "❌ 未信任版本仍继续解包"
  exit 1
fi
grep -q '^stage=failed$' "$ROOT_UNTRUSTED/run/install.state" || {
  echo "❌ 未信任版本未记录安装失败"
  cat "$ROOT_UNTRUSTED/run/install.state" 2>/dev/null || true
  cat "$OUT_UNTRUSTED" 2>/dev/null || true
  exit 1
}
grep -q '可信哈希白名单' "$ROOT_UNTRUSTED/run/install.state" || {
  echo "❌ 未信任版本诊断信息不明确"
  exit 1
}
echo "✅ 未纳入内置可信哈希白名单的版本在下载前被拒绝"

ROOT_MISMATCH="$INTEGRITY/hash-mismatch"
mkdir -p "$ROOT_MISMATCH"
dd if=/dev/zero of="$ROOT_MISMATCH/syncthing.tar.gz" bs=1000000 count=6 >/dev/null 2>&1
TAR_MISMATCH="$INTEGRITY/hash-mismatch-tar.called"
OUT_MISMATCH="$INTEGRITY/hash-mismatch.out"
if PATH="$TOOLS:/bin:/usr/bin" INTEGRITY_TAR_CALLED="$TAR_MISMATCH" \
  INTEGRITY_MODE=mismatch UFISYNC_ROOT="$ROOT_MISMATCH" \
  sh device/ufisync.sh install-run >"$OUT_MISMATCH" 2>&1; then
  echo "❌ SHA256 不一致时安装器仍返回成功"
  exit 1
fi
[ ! -f "$ROOT_MISMATCH/syncthing.tar.gz" ] || {
  echo "❌ SHA256 不一致时未删除不可信安装包"
  exit 1
}
[ ! -f "$TAR_MISMATCH" ] || {
  echo "❌ SHA256 不一致时仍继续解包"
  exit 1
}
grep -q '^stage=failed$' "$ROOT_MISMATCH/run/install.state" \
  && grep -q 'SHA256 校验失败' "$ROOT_MISMATCH/run/install.state" || {
    echo "❌ SHA256 不一致时未记录明确的安装失败"
    exit 1
  }
echo "✅ SHA256 不一致时删除安装包并拒绝解包"
