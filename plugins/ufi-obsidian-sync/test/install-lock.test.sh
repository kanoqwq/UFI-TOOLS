#!/bin/bash
# 后台安装只能有一个所有者；陈旧状态/锁不得让安装永久卡死。
set -eu
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
cleanup() {
  for _pid_file in "$TMP"/*/*.pids; do
    [ -f "$_pid_file" ] || continue
    while IFS= read -r _pid; do kill -KILL "$_pid" 2>/dev/null || true; done <"$_pid_file"
  done
  rm -rf "$TMP"
}
trap cleanup EXIT

TOOLS="$TMP/tools"
mkdir -p "$TOOLS"
cat >"$TOOLS/id" <<'SH'
#!/bin/sh
[ "${1:-}" = "-u" ] && { echo 0; exit 0; }
exec /usr/bin/id "$@"
SH
cat >"$TOOLS/getprop" <<'SH'
#!/bin/sh
[ "${1:-}" = "ro.product.cpu.abi" ] && echo arm64
SH
cat >"$TOOLS/df" <<'SH'
#!/bin/sh
printf '%s\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on' '/dev/test 20000000 1 19999999 1% /test'
SH
cat >"$TOOLS/netstat" <<'SH'
#!/bin/sh
exit 0
SH
cat >"$TOOLS/curl" <<'SH'
#!/bin/sh
printf '%s\n' "$$" >>"$INSTALL_LOCK_TEST_CURL_PIDS"
trap 'exit 143' TERM INT HUP
while :; do sleep 1; done
SH
chmod 755 "$TOOLS"/*

wait_for_file() {
  _wf_file="$1"; _wf_tries=0
  while [ ! -s "$_wf_file" ] && [ "$_wf_tries" -lt 100 ]; do
    sleep 0.05
    _wf_tries=$((_wf_tries+1))
  done
  [ -s "$_wf_file" ]
}

wait_for_absent() {
  _wa_path="$1"; _wa_tries=0
  while [ -e "$_wa_path" ] && [ "$_wa_tries" -lt 100 ]; do
    sleep 0.05
    _wa_tries=$((_wa_tries+1))
  done
  [ ! -e "$_wa_path" ]
}

terminate_install() {
  _ti_owner="$1"; _ti_pids="$2"
  kill -TERM "$_ti_owner" 2>/dev/null || true
  # POSIX sh 在等待前台 curl 时可能延迟执行 trap；真实 curl 收到同一服务停止
  # 信号会退出。测试中一并终止这个可控的假下载进程，让 shell 处理挂起信号。
  if [ -f "$_ti_pids" ]; then
    while IFS= read -r _curl_pid; do kill -TERM "$_curl_pid" 2>/dev/null || true; done <"$_ti_pids"
  fi
}

start_root() {
  _sr_root="$1"
  mkdir -p "$_sr_root/run" "$_sr_root/log"
  cp device/ufisync.sh "$_sr_root/ufisync.sh"
  chmod 755 "$_sr_root/ufisync.sh"
}

echo "原子后台安装锁"
ROOT="$TMP/live/ufisync"
start_root "$ROOT"
PIDS="$TMP/live/curl.pids"
OUT1="$TMP/live/install-1.out"
PATH="$TOOLS:/bin:/usr/bin" INSTALL_LOCK_TEST_CURL_PIDS="$PIDS" \
  UFISYNC_ROOT="$ROOT" sh device/ufisync.sh install >"$OUT1" 2>&1

wait_for_file "$ROOT/run/install.lock/pid" || {
  echo "❌ 后台安装没有建立 install.lock/pid"
  cat "$OUT1"; exit 1
}
wait_for_file "$ROOT/run/install.lock/started_at" || {
  echo "❌ install.lock 没有记录开始时间"
  exit 1
}
wait_for_file "$ROOT/run/install.lock/token" || {
  echo "❌ install.lock 没有记录所有权令牌"
  exit 1
}
[ -f "$ROOT/run/install.lock/proc_start" ] || {
  echo "❌ install.lock 没有记录进程启动标识文件"
  exit 1
}
wait_for_file "$PIDS" || {
  echo "❌ 安装任务没有进入可观察的下载阶段"
  cat "$ROOT/log/install.log" 2>/dev/null || true
  exit 1
}
OWNER1="$(cat "$ROOT/run/install.lock/pid")"
case "$OWNER1" in ''|*[!0-9]*) echo "❌ install.lock PID 非法：$OWNER1"; exit 1 ;; esac
kill -0 "$OWNER1" 2>/dev/null || { echo "❌ install.lock 指向的安装任务不存活"; exit 1; }

# 即使进度文件被误改成 done，并发判断也必须以原子锁为准。
printf '%s\n' 'stage=done' 'message=旧状态不可信' >"$ROOT/run/install.state"
OUT2="$TMP/live/install-2.out"
PATH="$TOOLS:/bin:/usr/bin" INSTALL_LOCK_TEST_CURL_PIDS="$PIDS" \
  UFISYNC_ROOT="$ROOT" sh device/ufisync.sh install >"$OUT2" 2>&1
sleep 0.2
[ "$(wc -l <"$PIDS" | tr -d ' ')" = 1 ] || {
  echo "❌ 活跃安装期间又启动了第二个下载任务"
  cat "$OUT2"; exit 1
}
[ "$(cat "$ROOT/run/install.lock/pid")" = "$OWNER1" ] || {
  echo "❌ 并发安装覆盖了现有锁所有者"
  exit 1
}
grep -q '已有安装任务' "$OUT2" || {
  echo "❌ 拒绝并发时没有明确反馈"
  cat "$OUT2"; exit 1
}
echo "✅ 活任务持锁时拒绝并发，锁内记录 PID、时间与所有权"

terminate_install "$OWNER1" "$PIDS"
wait_for_absent "$ROOT/run/install.lock" || {
  echo "❌ install-run 收到信号后没有释放 install.lock"
  exit 1
}
echo "✅ install-run 收到信号后释放锁"

echo "陈旧状态可重试"
ROOT_STALE="$TMP/stale-state/ufisync"
start_root "$ROOT_STALE"
printf '%s\n' 'stage=downloading' 'message=上次异常退出' >"$ROOT_STALE/run/install.state"
PIDS_STALE="$TMP/stale-state/curl.pids"
OUT_STALE="$TMP/stale-state/install.out"
PATH="$TOOLS:/bin:/usr/bin" INSTALL_LOCK_TEST_CURL_PIDS="$PIDS_STALE" \
  UFISYNC_ROOT="$ROOT_STALE" sh device/ufisync.sh install >"$OUT_STALE" 2>&1
grep -q 'install-started' "$OUT_STALE" || {
  echo "❌ 没有锁时，旧 install.state 仍阻塞重试"
  cat "$OUT_STALE"; exit 1
}
wait_for_file "$ROOT_STALE/run/install.lock/pid" || { echo "❌ 重试没有建立新锁"; exit 1; }
STALE_OWNER="$(cat "$ROOT_STALE/run/install.lock/pid")"
wait_for_file "$PIDS_STALE" || { echo "❌ 陈旧状态重试未进入下载"; exit 1; }
terminate_install "$STALE_OWNER" "$PIDS_STALE"
wait_for_absent "$ROOT_STALE/run/install.lock" || { echo "❌ 陈旧状态重试任务未清锁"; exit 1; }
echo "✅ preparing/downloading 旧状态不再永久阻塞安装"

echo "死锁可恢复"
for MODE in dead; do
  ROOT_RECOVER="$TMP/$MODE/ufisync"
  start_root "$ROOT_RECOVER"
  mkdir -p "$ROOT_RECOVER/run/install.lock"
  LOCK_PID=999999; LOCK_TIME="$(date +%s)"; MAX_AGE=7200
  printf '%s\n' "$LOCK_PID" >"$ROOT_RECOVER/run/install.lock/pid"
  printf '%s\n' "$LOCK_TIME" >"$ROOT_RECOVER/run/install.lock/started_at"
  printf '%s\n' old-owner >"$ROOT_RECOVER/run/install.lock/token"
  printf '%s\n' 'stage=preparing' >"$ROOT_RECOVER/run/install.state"
  RECOVER_PIDS="$TMP/$MODE/curl.pids"
  RECOVER_OUT="$TMP/$MODE/install.out"
  PATH="$TOOLS:/bin:/usr/bin" INSTALL_LOCK_TEST_CURL_PIDS="$RECOVER_PIDS" \
    UFISYNC_INSTALL_LOCK_MAX_AGE="$MAX_AGE" UFISYNC_ROOT="$ROOT_RECOVER" \
    sh device/ufisync.sh install >"$RECOVER_OUT" 2>&1
  grep -q 'install-started' "$RECOVER_OUT" || {
    echo "❌ $MODE install.lock 未被清理并重试"
    cat "$RECOVER_OUT"; exit 1
  }
  wait_for_file "$ROOT_RECOVER/run/install.lock/pid" || { echo "❌ $MODE 重试未持锁"; exit 1; }
  NEW_OWNER="$(cat "$ROOT_RECOVER/run/install.lock/pid")"
  [ "$NEW_OWNER" != "$LOCK_PID" ] || { echo "❌ $MODE 锁所有者未更新"; exit 1; }
  wait_for_file "$RECOVER_PIDS" || { echo "❌ $MODE 重试未进入下载"; exit 1; }
  terminate_install "$NEW_OWNER" "$RECOVER_PIDS"
  wait_for_absent "$ROOT_RECOVER/run/install.lock" || { echo "❌ $MODE 重试结束后未清锁"; exit 1; }
done
echo "✅ 死 PID 锁会被原子替换"

echo "超时活锁只终止已核验的安装任务"
ROOT_UNRELATED="$TMP/expired-unrelated/ufisync"
start_root "$ROOT_UNRELATED"
mkdir -p "$ROOT_UNRELATED/run/install.lock"
printf '%s\n' "$$" >"$ROOT_UNRELATED/run/install.lock/pid"
printf '%s\n' 1 >"$ROOT_UNRELATED/run/install.lock/started_at"
printf '%s\n' unrelated >"$ROOT_UNRELATED/run/install.lock/token"
: >"$ROOT_UNRELATED/run/install.lock/proc_start"
UNRELATED_OUT="$TMP/expired-unrelated/install.out"
PATH="$TOOLS:/bin:/usr/bin" INSTALL_LOCK_TEST_CURL_PIDS="$TMP/expired-unrelated/curl.pids" \
  UFISYNC_INSTALL_LOCK_MAX_AGE=5 UFISYNC_ROOT="$ROOT_UNRELATED" \
  sh device/ufisync.sh install >"$UNRELATED_OUT" 2>&1
grep -q '已有安装任务' "$UNRELATED_OUT" \
  && [ "$(cat "$ROOT_UNRELATED/run/install.lock/pid")" = "$$" ] || {
    echo "❌ 超时但无法核验身份的活 PID 被强行抢锁"
    cat "$UNRELATED_OUT"; exit 1
  }

ROOT_EXPIRED="$TMP/expired-install/ufisync"
start_root "$ROOT_EXPIRED"
PROC_EXPIRED="$TMP/expired-install/proc"
mkdir -p "$ROOT_EXPIRED/run/install.lock" "$PROC_EXPIRED"
sh -c 'trap "exit 0" TERM INT HUP; while :; do sleep 1; done' &
EXPIRED_PID=$!
sh -c 'trap "" TERM; while :; do sleep 1; done' &
EXPIRED_CHILD_PID=$!
printf '%s\n' "$EXPIRED_PID" "$EXPIRED_CHILD_PID" >"$TMP/expired-install/manual.pids"
mkdir -p "$PROC_EXPIRED/$EXPIRED_PID"
mkdir -p "$PROC_EXPIRED/$EXPIRED_PID/task/$EXPIRED_PID"
printf '%s\n' "$EXPIRED_CHILD_PID" >"$PROC_EXPIRED/$EXPIRED_PID/task/$EXPIRED_PID/children"
printf 'sh\0%s\0install-run\0' "$ROOT_EXPIRED/ufisync.sh" >"$PROC_EXPIRED/$EXPIRED_PID/cmdline"
printf '%s\n' "$EXPIRED_PID (sh) S 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 424242 0" \
  >"$PROC_EXPIRED/$EXPIRED_PID/stat"
printf '%s\n' "$EXPIRED_PID" >"$ROOT_EXPIRED/run/install.lock/pid"
printf '%s\n' 1 >"$ROOT_EXPIRED/run/install.lock/started_at"
printf '%s\n' expired-install >"$ROOT_EXPIRED/run/install.lock/token"
printf '%s\n' 424242 >"$ROOT_EXPIRED/run/install.lock/proc_start"
EXPIRED_PIDS="$TMP/expired-install/curl.pids"
EXPIRED_OUT="$TMP/expired-install/install.out"
PATH="$TOOLS:/bin:/usr/bin" INSTALL_LOCK_TEST_CURL_PIDS="$EXPIRED_PIDS" \
  UFISYNC_PROC_ROOT="$PROC_EXPIRED" UFISYNC_INSTALL_LOCK_MAX_AGE=5 \
  UFISYNC_ROOT="$ROOT_EXPIRED" sh device/ufisync.sh install >"$EXPIRED_OUT" 2>&1
grep -q 'install-started' "$EXPIRED_OUT" || {
  echo "❌ 超时且身份匹配的安装任务没有被终止后重试"
  cat "$EXPIRED_OUT"; exit 1
}
if kill -0 "$EXPIRED_PID" 2>/dev/null; then
  echo "❌ 超时安装 owner 仍存活却启动了后来者"
  kill -TERM "$EXPIRED_PID" 2>/dev/null || true
  exit 1
fi
if kill -0 "$EXPIRED_CHILD_PID" 2>/dev/null; then
  echo "❌ 超时安装的下载子进程仍存活却启动了后来者"
  exit 1
fi
wait "$EXPIRED_PID" 2>/dev/null || true
wait "$EXPIRED_CHILD_PID" 2>/dev/null || true
wait_for_file "$ROOT_EXPIRED/run/install.lock/pid" || { echo "❌ 超时任务重试未持锁"; exit 1; }
EXPIRED_NEW_OWNER="$(cat "$ROOT_EXPIRED/run/install.lock/pid")"
[ "$EXPIRED_NEW_OWNER" != "$EXPIRED_PID" ] || { echo "❌ 超时锁 PID 未更新"; exit 1; }
wait_for_file "$EXPIRED_PIDS" || { echo "❌ 超时任务重试未进入下载"; exit 1; }
terminate_install "$EXPIRED_NEW_OWNER" "$EXPIRED_PIDS"
wait_for_absent "$ROOT_EXPIRED/run/install.lock" || { echo "❌ 超时任务重试结束后未清锁"; exit 1; }
echo "✅ 超时安装先确认身份并终止退出，再由新任务接管；无关活 PID 不会被杀"

echo "安装成功释放锁"
sed -n '/^cmd_install_run()/,/^}/p' device/ufisync.sh >"$TMP/install-run-wrapper.fn"
SUCCESS_RELEASED="$TMP/success-release.marker"
(
  UFISYNC_INSTALL_LOCK_TOKEN=""
  acquire_install_lock() { INSTALL_LOCK_HELD_TOKEN=success-token; }
  claim_install_lock() { return 1; }
  release_install_lock() { : >"$SUCCESS_RELEASED"; }
  set_install_state() { :; }
  cmd_install_run_locked() { return 0; }
  . "$TMP/install-run-wrapper.fn"
  cmd_install_run
)
[ -f "$SUCCESS_RELEASED" ] || {
  echo "❌ install-run 成功返回后没有通过 EXIT trap 释放锁"
  exit 1
}
echo "✅ install-run 成功后释放锁"

echo "安装失败释放锁"
ROOT_FAIL="$TMP/failure/ufisync"
mkdir -p "$ROOT_FAIL/run" "$ROOT_FAIL/log"
if PATH="$TOOLS:/bin:/usr/bin" SYNCTHING_VERSION=9.9.9 UFISYNC_ROOT="$ROOT_FAIL" \
  sh device/ufisync.sh install-run >"$TMP/failure/install.out" 2>&1; then
  echo "❌ 未信任版本错误返回成功"
  exit 1
fi
[ ! -d "$ROOT_FAIL/run/install.lock" ] || {
  echo "❌ install-run 失败后没有释放 install.lock"
  exit 1
}
echo "✅ install-run 失败后释放锁"
