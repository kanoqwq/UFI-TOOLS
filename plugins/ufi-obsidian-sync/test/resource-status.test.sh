#!/bin/bash
# 公开 status 动作应沿 PID 文件所指的受管进程树汇总资源，
# 不应在每次 UI 轮询时全扫 /proc 并把其他同名进程算进来。
set -eu
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ROOT="$TMP/ufisync"
PROC="$TMP/proc"
mkdir -p "$ROOT/bin" "$ROOT/config" "$ROOT/vaults" "$ROOT/run" \
  "$PROC/101/task/101" "$PROC/102" "$PROC/999" "$TMP/tools"

cat >"$ROOT/bin/syncthing" <<'SH'
#!/bin/sh
[ -n "${UFISYNC_VERSION_CALL_LOG:-}" ] && printf 'called\n' >>"$UFISYNC_VERSION_CALL_LOG"
echo 'syncthing v1.30.0 test-build'
SH
chmod 755 "$ROOT/bin/syncthing"

cat >"$TMP/tools/curl" <<'SH'
#!/bin/sh
[ -n "${UFISYNC_CURL_CALL_LOG:-}" ] && printf '%s\n' "$*" >>"$UFISYNC_CURL_CALL_LOG"
printf '{}'
SH
chmod 755 "$TMP/tools/curl"
printf '%s\n' '<configuration><gui><apikey>test-key</apikey></gui></configuration>' >"$ROOT/config/config.xml"
export UFISYNC_VERSION_CALL_LOG="$TMP/version.calls"
export UFISYNC_CURL_CALL_LOG="$TMP/curl.calls"

printf '%s\0serve\0' "$ROOT/bin/syncthing" >"$PROC/101/cmdline"
printf '%s\0serve\0' "$ROOT/bin/syncthing" >"$PROC/102/cmdline"
cat >"$PROC/101/status" <<'EOF'
Name: syncthing
PPid:	0
VmRSS:	10240 kB
Threads:	3
EOF
cat >"$PROC/102/status" <<'EOF'
Name: syncthing
PPid:	101
VmRSS:	20480 kB
Threads:	5
EOF
# 102 是 PID 文件所指监督进程 101 的工作子进程。
printf '102\n' >"$PROC/101/task/101/children"

# 999 虽然也是同一个二进制，但不在受管进程树内；全扫 /proc 会错算它。
printf '%s\0serve\0' "$ROOT/bin/syncthing" >"$PROC/999/cmdline"
cat >"$PROC/999/status" <<'EOF'
Name: syncthing
VmRSS: 102400 kB
Threads: 50
EOF
printf '101\n' >"$ROOT/run/syncthing.pid"

out="$(PATH="$TMP/tools:$PATH" UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" sh device/ufisync.sh status 2>&1)"

echo "$out" | grep -q '^process_count=2$' || {
  echo "❌ status 未报告两个受管进程"
  echo "$out"
  exit 1
}
echo "$out" | grep -q '^process_rss_mb=30$' || {
  echo "❌ status 未合计 30 MB RSS"
  echo "$out"
  exit 1
}
echo "$out" | grep -q '^process_threads=8$' || {
  echo "❌ status 未合计线程数"
  echo "$out"
  exit 1
}

# 真机上 PID 文件可能落在工作进程而不是监督进程。此时应沿 PPid
# 向上找到同一受管二进制，再合计整条进程链，仍不能全扫 /proc。
printf '102\n' >"$ROOT/run/syncthing.pid"
out_worker="$(PATH="$TMP/tools:$PATH" UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" sh device/ufisync.sh status 2>&1)"
echo "$out_worker" | grep -q '^process_count=2$' \
  && echo "$out_worker" | grep -q '^process_rss_mb=30$' \
  && echo "$out_worker" | grep -q '^process_threads=8$' || {
    echo "❌ PID 文件指向工作进程时未沿 PPid 找全受管进程链"
    echo "$out_worker"
    exit 1
  }

# PID 文件可能因异常退出丢失，但受管工作进程仍在。低频看门狗
# 找回进程后必须修复 PID 文件，否则高频 status 会永久误报 stopped。
rm -f "$ROOT/run/syncthing.pid"
PATH="$TMP/tools:$PATH" UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" \
  sh device/ufisync.sh watchdog >/dev/null 2>&1
recovered_pid="$(cat "$ROOT/run/syncthing.pid" 2>/dev/null || true)"
if [ "$recovered_pid" != 102 ]; then
  echo "❌ 看门狗找回存活进程后未把 PID 文件定位到 worker：$recovered_pid"
  exit 1
fi
out_recovered="$(PATH="$TMP/tools:$PATH" UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" sh device/ufisync.sh status 2>&1)"
echo "$out_recovered" | grep -q '^process=running$' || {
  echo "❌ PID 恢复后 status 仍误报停止"
  echo "$out_recovered"
  exit 1
}
[ ! -f "$UFISYNC_VERSION_CALL_LOG" ] || {
  echo "❌ status 轮询仍启动 syncthing --version 瞬时进程"
  cat "$UFISYNC_VERSION_CALL_LOG"
  exit 1
}

[ -s "$UFISYNC_CURL_CALL_LOG" ] || {
  echo "❌ status 测试没有观察到本地 REST 调用"
  exit 1
}
if grep -v -- '--connect-timeout 1 --max-time 2' "$UFISYNC_CURL_CALL_LOG" >/dev/null; then
  echo "❌ 本地 REST 调用没有使用 2 秒有界超时"
  cat "$UFISYNC_CURL_CALL_LOG"
  exit 1
fi

echo "✅ status 会报告受管 Syncthing 的合计 RSS、进程数与线程数"
echo "✅ status 的串行本地 REST 调用有 2 秒上限"
