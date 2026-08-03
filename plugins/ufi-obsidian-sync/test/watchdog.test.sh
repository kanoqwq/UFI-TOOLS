#!/bin/bash
# Syncthing 正常包含监督进程和工作进程；看门狗必须把这对进程视为一个健康实例。
set -eu
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ROOT="$TMP/ufisync"
PROC="$TMP/proc"
BIN="$ROOT/bin/syncthing"
mkdir -p "$ROOT/bin" "$ROOT/config" "$ROOT/run" "$ROOT/log" \
  "$PROC/410/task/410" "$PROC/411"

cat >"$BIN" <<'SH'
#!/bin/sh
exit 0
SH
chmod 755 "$BIN"
printf '<configuration></configuration>\n' >"$ROOT/config/config.xml"
printf '%s\n' 410 >"$ROOT/run/syncthing.pid"

# 两个进程的 argv[0] 都是同一个 Syncthing 二进制：这是正常的监督器 + 工作进程。
printf '%s\0%s\0' "$BIN" serve >"$PROC/410/cmdline"
printf '%s\0%s\0' "$BIN" serve >"$PROC/411/cmdline"
cat >"$PROC/410/status" <<'EOF'
Name: syncthing
PPid:	0
EOF
cat >"$PROC/411/status" <<'EOF'
Name: syncthing
PPid:	410
EOF
printf '411\n' >"$PROC/410/task/410/children"

if ! UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" sh device/ufisync.sh watchdog; then
  echo "❌ 看门狗没有把正常的双进程 Syncthing 视为健康实例"
  exit 1
fi

log="$(cat "$ROOT/log/ufisync.log" 2>/dev/null || true)"
if echo "$log" | grep -Eq '检测到 2 个实例|进程缺失|清理多余实例'; then
  echo "❌ 看门狗误判并干预了正常的监督器 + 工作进程"
  echo "$log"
  exit 1
fi
if [ "$(cat "$ROOT/run/syncthing.pid" 2>/dev/null)" != 411 ]; then
  echo "❌ 看门狗未把 monitor PID 一次性修正为 worker PID"
  exit 1
fi

# 用户点「停止」是持久停用意图，看门狗不得在下一轮又拉起。
rm -rf "$PROC/410" "$PROC/411"
rm -f "$ROOT/run/syncthing.pid"
UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" sh device/ufisync.sh stop >/dev/null 2>&1
if [ ! -f "$ROOT/.disabled" ]; then
  echo "❌ 用户停止后没有记录持久停用状态"
  exit 1
fi
before_log="$(cat "$ROOT/log/ufisync.log" 2>/dev/null || true)"
UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" sh device/ufisync.sh watchdog >/dev/null 2>&1
after_log="$(cat "$ROOT/log/ufisync.log" 2>/dev/null || true)"
if [ "$before_log" != "$after_log" ]; then
  echo "❌ 持久停用后看门狗仍尝试拉起服务"
  exit 1
fi

# 配置切换/升级的内部短暂停机不应写成用户的持久停用意图。
rm -f "$ROOT/.disabled"
UFISYNC_TRANSIENT_STOP=1 UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" \
  sh device/ufisync.sh stop >/dev/null 2>&1
if [ -f "$ROOT/.disabled" ]; then
  echo "❌ 内部短暂停机误写了持久停用标记"
  exit 1
fi

# 显式「启动」必须解除卸载/停止留下的 disabled 标记。用已在运行
# 的分支做无副作用单元测试，避免真正启动后台进程。
touch "$ROOT/.disabled"
sed -n '/^cmd_start()/,/^}/p' device/ufisync.sh >"$TMP/cmd_start.fn"
if ! sh -c '
  ROOT='"$ROOT"'; BIN="$ROOT/bin/syncthing"; STHOME="$ROOT/config"
  RUN_DIR="$ROOT/run"; LOCK="$RUN_DIR/start.lock"; DATA_ROOT="$ROOT"; MIN_FREE_MB=1
  apply_lock_active() { return 1; }
  ensure_managed_config_current() { :; }
  running_pid() { echo 777; }
  log() { :; }
  die() { exit 1; }
  . '"$TMP"'/cmd_start.fn
  cmd_start
  [ ! -f "$ROOT/.disabled" ]
'; then
  echo "❌ 显式启动没有解除持久停用状态"
  exit 1
fi

# 配置事务的停机窗口内，看门狗不得把旧 XML 重新拉起。
mkdir -p "$ROOT/run/apply.lock"
before_log="$(cat "$ROOT/log/ufisync.log" 2>/dev/null || true)"
UFISYNC_ROOT="$ROOT" UFISYNC_PROC_ROOT="$PROC" sh device/ufisync.sh watchdog >/dev/null 2>&1
after_log="$(cat "$ROOT/log/ufisync.log" 2>/dev/null || true)"
if [ "$before_log" != "$after_log" ]; then
  echo "❌ 配置应用锁存在时看门狗仍干预服务"
  exit 1
fi

# SIGTERM/SIGKILL 都无法结束受管进程时，stop 必须失败并保留 PIDF，
# 否则 apply-config 会在旧进程仍运行时切换正式 XML。
STUB_ROOT="$TMP/stubborn-stop"
mkdir -p "$STUB_ROOT/run" "$STUB_ROOT/proc/999"
printf '%s\n' 999 >"$STUB_ROOT/run/syncthing.pid"
sed -n '/^stop_service()/,/^}/p' device/ufisync.sh >"$TMP/stop-service.fn"
if sh -c '
  ROOT='"$STUB_ROOT"'
  RUN_DIR="$ROOT/run"
  PIDF="$RUN_DIR/syncthing.pid"
  PROC_ROOT="$ROOT/proc"
  running_pid() { printf "%s\n" 999; }
  write_pidfile_atomic() { printf "%s\n" "$1" >"$PIDF"; }
  kill() { return 1; }
  sleep() { :; }
  log() { printf "%s\n" "$*" >>"$ROOT/stop.log"; }
  . '"$TMP"'/stop-service.fn
  stop_service
'; then
  echo "❌ 无法结束受管进程时 stop 仍返回成功"
  exit 1
fi
if [ "$(cat "$STUB_ROOT/run/syncthing.pid" 2>/dev/null || true)" != 999 ]; then
  echo "❌ stop 失败后删除或破坏了 PID 文件"
  exit 1
fi
if grep -q '^已停止$' "$STUB_ROOT/stop.log" 2>/dev/null; then
  echo "❌ stop 失败却仍记录已停止"
  exit 1
fi

# 超过 5 分钟的事务不一定已死：合法升级可因多镜像下载持续更久。
# owner 仍活着时看门狗必须保留锁；owner 已死时才清理陈旧锁。
LOCK_ROOT="$TMP/apply-owner"
mkdir -p "$LOCK_ROOT/run/apply.lock"
printf '%s\n' 777 >"$LOCK_ROOT/run/apply.lock/pid"
touch -t 200001010000 "$LOCK_ROOT/run/apply.lock"
sed -n '/^apply_lock_active()/,/^}/p' device/ufisync.sh >"$TMP/apply-lock-active.fn"
if ! sh -c '
  ROOT='"$LOCK_ROOT"'
  RUN_DIR="$ROOT/run"
  APPLY_LOCK="$RUN_DIR/apply.lock"
  apply_lock_owner_alive() { return 0; }
  log() { :; }
  . '"$TMP"'/apply-lock-active.fn
  apply_lock_active
  [ -d "$APPLY_LOCK" ]
'; then
  echo "❌ 活跃 owner 的旧事务锁被误删"
  exit 1
fi
if ! sh -c '
  ROOT='"$LOCK_ROOT"'
  RUN_DIR="$ROOT/run"
  APPLY_LOCK="$RUN_DIR/apply.lock"
  apply_lock_owner_alive() { return 1; }
  log() { :; }
  . '"$TMP"'/apply-lock-active.fn
  ! apply_lock_active
  [ ! -d "$APPLY_LOCK" ]
'; then
  echo "❌ owner 已死的陈旧事务锁没有清理"
  exit 1
fi

echo "✅ 看门狗保留正常的 Syncthing 双进程"
echo "✅ 停止失败会保留可恢复的运行状态"
echo "✅ 事务锁按 owner 存活状态安全清理"
