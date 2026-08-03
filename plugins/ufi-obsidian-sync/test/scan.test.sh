#!/bin/bash
# “立即同步”必须通过 Syncthing 要求的 POST /rest/db/scan 触发仓库扫描。
set -eu
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ROOT="$TMP/ufisync"
PROC="$TMP/proc"
BIN="$ROOT/bin/syncthing"
mkdir -p "$ROOT/bin" "$ROOT/config" "$ROOT/run" "$ROOT/log" "$PROC/510" "$TMP/mock-bin"

cat >"$BIN" <<'SH'
#!/bin/sh
exit 0
SH
chmod 755 "$BIN"
printf '%s\0%s\0' "$BIN" serve >"$PROC/510/cmdline"
printf '%s\n' 510 >"$ROOT/run/syncthing.pid"
printf '%s\n' 'F|notes-main|我的笔记' >"$ROOT/sync.conf"
printf '%s\n' '<configuration><gui><apikey>test-key</apikey></gui></configuration>' >"$ROOT/config/config.xml"

cat >"$TMP/mock-bin/curl" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >>"$UFISYNC_CURL_LOG"
[ "${UFISYNC_SCAN_FAIL:-no}" = yes ] && exit 22
exit 0
SH
chmod 755 "$TMP/mock-bin/curl"

UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" UFISYNC_CURL_LOG="$TMP/curl.log" \
  PATH="$TMP/mock-bin:$PATH" sh device/ufisync.sh scan >/dev/null

if ! grep -q -- '-X POST' "$TMP/curl.log"; then
  echo "❌ 立即同步没有使用 POST 请求 Syncthing 扫描接口"
  cat "$TMP/curl.log"
  exit 1
fi
if ! grep -q '/rest/db/scan?folder=notes-main' "$TMP/curl.log"; then
  echo "❌ 立即同步没有扫描配置中的仓库"
  exit 1
fi

if UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" UFISYNC_CURL_LOG="$TMP/curl-fail.log" \
  UFISYNC_SCAN_FAIL=yes PATH="$TMP/mock-bin:$PATH" \
  sh device/ufisync.sh scan >"$TMP/scan-fail.out" 2>&1; then
  echo "❌ Syncthing REST 扫描失败时「立即同步」仍返回成功"
  exit 1
fi
grep -q '未能触发扫描' "$TMP/scan-fail.out" || {
  echo "❌ 扫描失败没有给出可操作的诊断"
  cat "$TMP/scan-fail.out"
  exit 1
}

echo "✅ 立即同步通过 POST 触发全部配置仓库扫描"
