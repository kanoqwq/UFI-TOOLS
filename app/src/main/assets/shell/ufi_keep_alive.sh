#!/system/bin/sh

PKG="com.minikano.f50_sms"
ACT="com.minikano.f50_sms.MainActivity"
CHECK_INTERVAL=30
LOG_FILE="/sdcard/ufi_keep_alive.log"
MAX_LOG_SIZE=$((1024 * 1024))
LOCK_DIR="/data/local/tmp/ufi_keep_alive.lock"
PID_FILE="$LOCK_DIR/pid"

is_ufi_running() {
    pidof "$PKG" >/dev/null 2>&1
}

is_guard_running() {
    _pid="$1"
    [ -n "$_pid" ] || return 1
    [ -r "/proc/$_pid/cmdline" ] || return 1
    tr '\000' ' ' < "/proc/$_pid/cmdline" 2>/dev/null | grep "ufi_keep_alive.sh" >/dev/null 2>&1
}

rotate_log() {
    [ -f "$LOG_FILE" ] || return 0
    _size=$(wc -c < "$LOG_FILE" 2>/dev/null)
    [ -n "$_size" ] || return 0
    if [ "$_size" -ge "$MAX_LOG_SIZE" ]; then
        echo "[`date`] keep-alive log rotated" > "$LOG_FILE"
    fi
}

# mkdir is atomic, so simultaneous Samba requests cannot start multiple guards.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    _old_pid=$(cat "$PID_FILE" 2>/dev/null)
    if is_guard_running "$_old_pid"; then
        exit 0
    fi

    # The recorded process is gone (for example after an unclean shutdown).
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR" 2>/dev/null || exit 0
fi

echo $$ > "$PID_FILE"
trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM HUP

rotate_log
echo "[`date`] UFI-TOOLS keep-alive started, pid=$$" >> "$LOG_FILE"

while :; do
    if ! is_ufi_running; then
        rotate_log
        echo "[`date`] UFI-TOOLS is not running, trying to wake it up" >> "$LOG_FILE"
        am start -n "$PKG/$ACT" --ez silent true >> "$LOG_FILE" 2>&1 || true
    fi
    sleep "$CHECK_INTERVAL"
done
