#!/system/bin/sh

LOG_FILE="/sdcard/smb_log.log"
MAX_SIZE=$((4 * 1024 * 1024))  # 4MB = 4 * 1024 * 1024 bytes

FLAG_FILE="/data/local/tmp/boot_once.flag"
THRESHOLD=120  # uptime 120s

SOCKET_DIR="/data/data/com.minikano.f50_sms/files"
SOCKET_FILE="$SOCKET_DIR/kano_root_shell.sock"
SOCAT_PATH="/data/data/com.minikano.f50_sms/files/socat"
TTYD_PATH="/data/data/com.minikano.f50_sms/files/ttyd"
LOGIN_PATH="/data/data/com.minikano.f50_sms/files/login.sh"
BOOTUP_SCRIPT_PATH="/sdcard/ufi_tools_boot.sh"
SCHEDULE_SCRIPT_PATH="/sdcard/ufi_tools_schedule.sh"
KEEP_ALIVE_SCRIPT_PATH="$SOCKET_DIR/ufi_keep_alive.sh"

UNLOCK_SAMBA_CONF='#!/system/bin/sh
chattr -i /data/samba/etc/smb.conf
chmod 777 /data/samba/etc/smb.conf
rm -f /data/samba/etc/smb.conf
sync'

BOOTUP_SH='#!/system/bin/sh
# you script here...
sync'

SCHEDULE_SH='#!/system/bin/sh
# you script here...
'

TASK_SH='#!/system/bin/sh
# you script here...
sync'

check_log_file(){
  # check log file
  if [ -f "$LOG_FILE" ]; then
      # get file size
      FILE_SIZE=$(wc -c < "$LOG_FILE")

      if [ "$FILE_SIZE" -ge "$MAX_SIZE" ]; then
          echo "Log file exceeded 4MB, clearing..." > "$LOG_FILE"
      fi
  fi
}

SG_MAX=20
SG_MAX_AGE=100

_sg_hz() {
    _hz="$(getconf CLK_TCK 2>/dev/null)"
    [ -n "$_hz" ] || _hz=100
    echo "$_hz"
}

_sg_comm() {
    [ -r "/proc/$1/comm" ] || return 1
    IFS= read -r _c < "/proc/$1/comm" || return 1
    echo "$_c"
}

_sg_ppid_start() {
    [ -r "/proc/$1/stat" ] || return 1
    set -- $(cat "/proc/$1/stat" 2>/dev/null) || return 1
    echo "$4 ${22}"
}

_sg_is_child_socat() {
    _pid="$1"
    while :; do
        set -- $(_sg_ppid_start "$_pid") || return 1
        _ppid="$1"

        [ -n "$_ppid" ] || return 1
        [ "$_ppid" -gt 1 ] 2>/dev/null || return 1

        _pcomm="$(_sg_comm "$_ppid" 2>/dev/null)"
        if [ "$_pcomm" = "socat" ]; then
            return 0
        fi

        _pid="$_ppid"
    done
}

_sg_kill_one() {
    _pid="$1"
    [ -n "$_pid" ] || return 1

    echo "kill pid=$_pid"
    kill "$_pid" 2>/dev/null
    sleep 1

    if [ -d "/proc/$_pid" ]; then
        echo "kill -9 pid=$_pid"
        kill -9 "$_pid" 2>/dev/null
        sleep 1
    fi

    if [ -d "/proc/$_pid" ]; then
        echo "still alive pid=$_pid"
        return 1
    fi

    echo "killed pid=$_pid"
    return 0
}

socat_guard_once() {
    echo "[`date`] ------SOCAT_CLEANER_START!!------" >> "$LOG_FILE"
    _hz="$(_sg_hz)"
    _uptime_ticks="$(awk '{print int($1*'"$_hz"')}' /proc/uptime 2>/dev/null)"
    [ -n "$_uptime_ticks" ] || _uptime_ticks=0

    _count=0
    _oldest_pid=
    _oldest_start=
    _newest_pid=
    _newest_start=
    _newest_child_pid=
    _newest_child_start=
    _expired_child_pids=

    for _d in /proc/[0-9]*; do
        [ -r "$_d/comm" ] || continue
        _pid="${_d#/proc/}"

        IFS= read -r _name < "$_d/comm" || continue
        [ "$_name" = "socat" ] || continue

        set -- $(_sg_ppid_start "$_pid") || continue
        _ppid="$1"
        _start="$2"
        [ -n "$_start" ] || continue

        _count=$(( _count + 1 ))
        _age=$(( (_uptime_ticks - _start) / _hz ))

        _child=0
        if _sg_is_child_socat "$_pid"; then
            _child=1
        fi

        echo "found pid=$_pid ppid=$_ppid age=${_age}s child=$_child"

        if [ -z "$_oldest_pid" ] || [ "$_start" -lt "$_oldest_start" ]; then
            _oldest_pid="$_pid"
            _oldest_start="$_start"
        fi

        if [ -z "$_newest_pid" ] || [ "$_start" -gt "$_newest_start" ]; then
            _newest_pid="$_pid"
            _newest_start="$_start"
        fi

        if [ "$_child" = "1" ]; then
            if [ -z "$_newest_child_pid" ] || [ "$_start" -gt "$_newest_child_start" ]; then
                _newest_child_pid="$_pid"
                _newest_child_start="$_start"
            fi

            if [ "$_age" -gt "$SG_MAX_AGE" ]; then
                _expired_child_pids="$_expired_child_pids $_pid"
            fi
        fi
    done

    echo "count=$_count oldest=$_oldest_pid newest=$_newest_pid newest_child=$_newest_child_pid"

    # 先杀超时 child socat
    for _pid in $_expired_child_pids; do
        [ "$_pid" = "$_oldest_pid" ] && continue
        _sg_kill_one "$_pid"
    done

    # 重新统计数量，避免前面已经杀掉后还按旧数量判断
    _count2=0
    for _d in /proc/[0-9]*; do
        [ -r "$_d/comm" ] || continue
        IFS= read -r _name < "$_d/comm" || continue
        [ "$_name" = "socat" ] && _count2=$(( _count2 + 1 ))
    done

    echo "count_after_expired=$_count2"

    # 如果仍然超过上限，只补杀 1 个
    if [ "$_count2" -gt "$SG_MAX" ]; then
        if [ -n "$_newest_child_pid" ] && [ "$_newest_child_pid" != "$_oldest_pid" ]; then
            echo "too many, kill newest child: $_newest_child_pid"
            _sg_kill_one "$_newest_child_pid"
            return
        fi

        if [ -n "$_newest_pid" ] && [ "$_newest_pid" != "$_oldest_pid" ]; then
            echo "too many, no child found, kill newest: $_newest_pid"
            _sg_kill_one "$_newest_pid"
            return
        fi

        echo "too many, but no safe target"
    fi
    echo "[`date`] ------SOCAT_CLEANER_END!!------" >> "$LOG_FILE"
}

check_ttyd_running(){
  # try pgrep to check ttyd running
  if ! pgrep -f "ttyd --writable --port 1146 $LOGIN_PATH" > /dev/null; then
      # fallback to ps -ef if pgrep fails
      if ! ps -ef | grep "ttyd --writable --port 1146 $LOGIN_PATH" | grep -v grep > /dev/null; then
          echo "[`date`] start ttyd..." >> "$LOG_FILE"
          export PATH="/data/data/com.minikano.f50_sms/files:/data/data/com.termux/files/usr/bin:$PATH"
          "$TTYD_PATH" --writable --port 1146 $LOGIN_PATH &
      fi
  fi
}

check_socat_running(){
  # check socat running using pgrep
  mkdir -p "$SOCKET_DIR"
  if ! pgrep -f "$SOCKET_FILE" > /dev/null; then
      # fallback to ps -ef if pgrep fails
      if ! ps -ef | grep "$SOCKET_FILE" | grep -v grep > /dev/null; then
          echo "[`date`] start socat..." >> "$LOG_FILE"
          # run socat unix socket，exec /system/bin/sh
          "$SOCAT_PATH" -d -d UNIX-LISTEN:"$SOCKET_FILE",fork,reuseaddr,unlink-early EXEC:/system/bin/sh &
      fi
  fi
}

start_ufi_keep_alive() {
    if [ ! -f "$KEEP_ALIVE_SCRIPT_PATH" ]; then
        echo "[`date`] $KEEP_ALIVE_SCRIPT_PATH not found, keep-alive not started" >> "$LOG_FILE"
        return 1
    fi

    chmod +x "$KEEP_ALIVE_SCRIPT_PATH"
    echo "[`date`] starting UFI-TOOLS keep-alive..." >> "$LOG_FILE"

    # Disconnect all standard streams so the guard is independent of this
    # Samba request. setsid is preferred when the device provides it.
    if command -v setsid >/dev/null 2>&1; then
        setsid sh "$KEEP_ALIVE_SCRIPT_PATH" </dev/null >/dev/null 2>&1 &
    else
        nohup sh "$KEEP_ALIVE_SCRIPT_PATH" </dev/null >/dev/null 2>&1 &
    fi
}

lock_smb_conf(){
    #lock samba conf
    chmod 777 /data/samba/etc/smb.conf
    chattr +i /data/samba/etc/smb.conf
}

permission_keep(){
    pm grant com.minikano.f50_sms android.permission.READ_SMS >/dev/null 2>&1 || true
    pm grant com.minikano.f50_sms android.permission.RECEIVE_SMS >/dev/null 2>&1 || true
    pm grant com.minikano.f50_sms android.permission.SEND_SMS >/dev/null 2>&1 || true
    pm grant com.minikano.f50_sms android.permission.READ_EXTERNAL_STORAGE >/dev/null 2>&1 || true
    pm grant com.minikano.f50_sms android.permission.WRITE_EXTERNAL_STORAGE >/dev/null 2>&1 || true
    pm grant com.minikano.f50_sms android.permission.READ_PHONE_STATE >/dev/null 2>&1 || true
    pm grant com.minikano.f50_sms android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true

    appops set com.minikano.f50_sms GET_USAGE_STATS allow >/dev/null 2>&1 || true
    appops set com.minikano.f50_sms android:get_usage_stats allow >/dev/null 2>&1 || true
    appops set com.minikano.f50_sms POST_NOTIFICATION allow >/dev/null 2>&1 || true
    appops set com.minikano.f50_sms AUTO_REVOKE_PERMISSIONS_IF_UNUSED ignore >/dev/null 2>&1 || true
    appops set --uid $(dumpsys package com.minikano.f50_sms 2>/dev/null | grep -m1 userId= | cut -d= -f2) AUTO_REVOKE_PERMISSIONS_IF_UNUSED ignore
    settings put secure enabled_notification_listeners com.minikano.f50_sms/com.minikano.f50_sms.MyListenerService >/dev/null 2>&1 || true
    dumpsys deviceidle whitelist +com.minikano.f50_sms >/dev/null 2>&1 || true
    cmd app_hibernation set-state com.minikano.f50_sms false >/dev/null 2>&1 || true
    settings put global stay_on_while_plugged_in 0
    echo "[`date`] permission_keep done!" >> "$LOG_FILE"
}

#net accelerate
net_accelerate() {
    iptables -D INPUT -j zte_fw_net_limit 2>/dev/null
    iptables -F zte_fw_net_limit 2>/dev/null
    iptables -X zte_fw_net_limit 2>/dev/null

    tc qdisc del dev sipa_eth0 clsact 2>/dev/null

    for dev in $(ls /sys/class/net); do
        tc qdisc del dev "$dev" root 2>/dev/null
        tc qdisc del dev "$dev" ingress 2>/dev/null
    done
}

disable_fota(){
  pm disable com.zte.zdm
  pm uninstall -k --user 0 com.zte.zdm
  pm uninstall -k --user 0 cn.zte.aftersale
  pm uninstall -k --user 0 com.zte.zdmdaemon
  pm uninstall -k --user 0 com.zte.zdmdaemon.install
  pm uninstall -k --user 0 com.zte.analytics
  pm uninstall -k --user 0 com.zte.neopush
}

samba_path(){
  SRC_LIST="/sdcard/DCIM /mnt/media_rw /storage/sdcard0"
  TGT_LIST="/data/SAMBA_SHARE/机内存储 /data/SAMBA_SHARE/外部存储 /data/SAMBA_SHARE/SD卡"

  i=1
  for src in $SRC_LIST; do
      tgt=$(echo $TGT_LIST | cut -d' ' -f$i)
      i=$((i + 1))

      [ ! -d "$tgt" ] && mkdir -p "$tgt"

      mount | grep " $tgt " >/dev/null 2>&1
      if [ $? -ne 0 ]; then
          mount --bind "$src" "$tgt"
          echo "[`date`] Mounted $src -> $tgt" >> "$LOG_FILE"
      else
          echo "[`date`] $tgt already mounted" >> "$LOG_FILE"
      fi
  done
}

close_thread_killer() {
  settings put global settings_enable_monitor_phantom_procs false
  settings put global max_phantom_processes 2147483647
}

#boot_script
boot_up_script() {
  start_ufi_keep_alive

  if [ -f "$BOOTUP_SCRIPT_PATH" ]; then
      echo "[`date`] exec $BOOTUP_SCRIPT_PATH ..." >> "$LOG_FILE"
      sh "$BOOTUP_SCRIPT_PATH"
  else
      echo "$BOOTUP_SH" > /sdcard/ufi_tools_boot.sh
      chmod +x /sdcard/ufi_tools_boot.sh
      echo "[`date`] $BOOTUP_SCRIPT_PATH not found，skip" >> "$LOG_FILE"
  fi

  #Drop port for ipv6
  ip6tables -A INPUT -p tcp --dport 8080 -j DROP
  ip6tables -A INPUT -p tcp --dport 1146 -j DROP
  ip6tables -A INPUT -p tcp --dport 139 -j DROP
  ip6tables -A INPUT -p tcp --dport 445 -j DROP
  ip6tables -A INPUT -p tcp --dport 5555 -j DROP
  ip6tables -A INPUT -p tcp --dport 5201 -j DROP
  ip6tables -A INPUT -p tcp --dport 5001 -j DROP
  ip6tables -A INPUT -p tcp --dport 5002 -j DROP
  ip6tables -A INPUT -p udp --dport 8080 -j DROP
  ip6tables -A INPUT -p udp --dport 1146 -j DROP
  ip6tables -A INPUT -p udp --dport 139 -j DROP
  ip6tables -A INPUT -p udp --dport 445 -j DROP
  ip6tables -A INPUT -p udp --dport 5555 -j DROP
  ip6tables -A INPUT -p udp --dport 5201 -j DROP
  ip6tables -A INPUT -p udp --dport 5001 -j DROP
  ip6tables -A INPUT -p udp --dport 5002 -j DROP
  iptables -I INPUT 1 -i lo -j ACCEPT

  echo "$UNLOCK_SAMBA_CONF" > /cache/unlock_samba.sh
  echo "$UNLOCK_SAMBA_CONF" > /sdcard/unlock_samba.sh

  samba_path
  lock_smb_conf
  check_log_file
  check_ttyd_running
  check_socat_running
  net_accelerate
  disable_fota
  permission_keep
  close_thread_killer
}

#schedule_script(30s per time)
schedule_script() {
  # Also repair the guard after an app update or if the guard itself was killed.
  start_ufi_keep_alive

  if [ -f "$SCHEDULE_SCRIPT_PATH" ]; then
      sh "$SCHEDULE_SCRIPT_PATH"
  else
      echo "$SCHEDULE_SH" > /sdcard/ufi_tools_schedule.sh
      chmod +x /sdcard/ufi_tools_schedule.sh
      echo "[`date`] $SCHEDULE_SCRIPT_PATH not found，skip" >> "$LOG_FILE"
  fi

  lock_smb_conf
  check_log_file
  check_ttyd_running
  check_socat_running
  socat_guard_once >> "$LOG_FILE" 2>&1 &
}

uptime_seconds=$(cut -d. -f1 /proc/uptime)
now_ts=$(date +%s)
boot_time=$((now_ts - uptime_seconds))

if [ -f "$FLAG_FILE" ]; then
    last_boot_time=$(cat "$FLAG_FILE" 2>/dev/null)
else
    last_boot_time=0
fi

echo "[`date`] samba_exec.sh start running..." >> "$LOG_FILE"
echo "[`date`] uptime_seconds=$uptime_seconds, now_ts=$now_ts, boot_time=$boot_time, last_boot_time=$last_boot_time" >> "$LOG_FILE"

if [ "$uptime_seconds" -lt "$THRESHOLD" ]; then
    echo "[`date`] boot window (<${THRESHOLD}s) detected." >> "$LOG_FILE"

    if [ "$boot_time" -ne "$last_boot_time" ]; then
        echo "[`date`] detected new boot, running boot_up_script..." >> "$LOG_FILE"
        boot_up_script
        echo "$boot_time" > "$FLAG_FILE"; sync
    else
        echo "[`date`] same boot_time detected, skipping boot_up_script. Running schedule_script instead..." >> "$LOG_FILE"
        schedule_script
    fi
else
    echo "[`date`] outside boot window (>${THRESHOLD}s), running schedule_script..." >> "$LOG_FILE"
    schedule_script
fi
