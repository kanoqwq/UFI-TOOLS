#!/bin/bash
# 设备端控制脚本的配置逻辑测试（在普通 Linux 上跑，不需要真机）
# 运行：bash test/device.test.sh
set -u
cd "$(dirname "$0")/.."

SH="device/ufisync.sh"
TMP="$(mktemp -d)"
export UFISYNC_ROOT="$TMP/ufisync"
mkdir -p "$UFISYNC_ROOT/backup" "$UFISYNC_ROOT/config"

fails=0
ok()   { echo "  ✅ $1"; }
bad()  { echo "  ❌ $1${2:+  → $2}"; fails=$((fails+1)); }
check(){ if [ "$1" = "0" ]; then ok "$2"; else bad "$2" "${3:-}"; fi; }

b64() { printf '%s' "$1" | base64 -w0 2>/dev/null || printf '%s' "$1" | base64; }

echo "配置读写"

# 首次读取应创建空配置；开放版本不得带开发者的仓库或设备身份
out="$(sh "$SH" get-config 2>&1)"
[ -f "$UFISYNC_ROOT/sync.conf" ] && ok "首次读取创建配置文件" || bad "首次读取创建配置文件"
if echo "$out" | grep -qE '^(F|D)\|'; then
  bad "新安装默认为空配置" "$out"
else
  ok "新安装默认为空配置"
fi

out="$(sh "$SH" init 2>&1)"
echo "$out" | grep -q '配置尚未完成' \
  && ok "空配置不会被误初始化" || bad "空配置不会被误初始化" "$out"

# 合法配置
GOOD='F|notes|我的笔记
F|photos.2024|相册
D|AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA|Mac 笔记本
D|BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN|Windows 台式机
D|CCCCCCC-CCCCCC2-CCCCCCC-CCCCCC2-CCCCCCC-CCCCCC2-CCCCCCC-CCCCCC2|Linux 小主机'
b64 "$GOOD" > "$UFISYNC_ROOT/sync.conf.b64"
out="$(sh "$SH" set-config 2>&1)"
echo "$out" | grep -q '2 个仓库' && ok "接受合法配置（含中文名称）" || bad "接受合法配置" "$out"

# 非法仓库 ID：带分号想注入命令
BAD1='F|notes; rm -rf /|x
D|AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA|pc'
b64 "$BAD1" > "$UFISYNC_ROOT/sync.conf.b64"
out="$(sh "$SH" set-config 2>&1)"
echo "$out" | grep -q '仓库 ID 非法' && ok "拒绝含 shell 元字符的仓库 ID" || bad "拒绝含 shell 元字符的仓库 ID" "$out"

# 非法设备 ID
BAD2='F|notes|x
D|NOT-A-DEVICE-ID|pc'
b64 "$BAD2" > "$UFISYNC_ROOT/sync.conf.b64"
out="$(sh "$SH" set-config 2>&1)"
echo "$out" | grep -q '设备 ID 非法' && ok "拒绝格式错误的设备 ID" || bad "拒绝格式错误的设备 ID" "$out"

# 长度和分组都像 Device ID，但最后一个 Luhn32 校验位是伪造的
BAD_CHECKSUM='F|notes|x
D|BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBNA|pc'
b64 "$BAD_CHECKSUM" > "$UFISYNC_ROOT/sync.conf.b64"
out="$(sh "$SH" set-config 2>&1)"
echo "$out" | grep -q '设备 ID 非法' && ok "拒绝校验位错误的伪设备 ID" || bad "拒绝校验位错误的伪设备 ID" "$out"

DUPLICATE_DEVICE='F|notes|x
D|BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN|pc-1
D|BBBBBBBBBBBBBNBBBBBBBBBBBBBNBBBBBBBBBBBBBNBBBBBBBBBBBBBN|pc-2'
b64 "$DUPLICATE_DEVICE" > "$UFISYNC_ROOT/sync.conf.b64"
out="$(sh "$SH" set-config 2>&1)"
echo "$out" | grep -q '设备 ID 重复' \
  && ok "设备端拒绝同一 Device ID 的不同分组表示" \
  || bad "设备端未拒绝重复 Device ID" "$out"

# 路径穿越
BAD3='F|../../../etc|x
D|AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA|pc'
b64 "$BAD3" > "$UFISYNC_ROOT/sync.conf.b64"
out="$(sh "$SH" set-config 2>&1)"
echo "$out" | grep -q '仓库 ID 非法' && ok "拒绝路径穿越的仓库 ID" || bad "拒绝路径穿越的仓库 ID" "$out"

# 正则允许的单个/双个点仍是路径段，必须单独拒绝。
for DOT_ID in . ..; do
  BAD_DOT="F|$DOT_ID|x
D|AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA|pc"
  b64 "$BAD_DOT" > "$UFISYNC_ROOT/sync.conf.b64"
  out="$(sh "$SH" set-config 2>&1)"
  echo "$out" | grep -q '仓库 ID 非法' \
    && ok "拒绝路径点段仓库 ID：$DOT_ID" \
    || bad "拒绝路径点段仓库 ID：$DOT_ID" "$out"
done

# 只有设备没有仓库
BAD4='D|AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA|pc'
b64 "$BAD4" > "$UFISYNC_ROOT/sync.conf.b64"
out="$(sh "$SH" set-config 2>&1)"
echo "$out" | grep -q '至少需要一个仓库' && ok "拒绝没有仓库的配置" || bad "拒绝没有仓库的配置" "$out"

# 上一份合法配置应当仍然生效（失败不能破坏已有配置）
out="$(sh "$SH" get-config 2>&1)"
echo "$out" | grep -q 'F|notes|我的笔记' && ok "非法配置被拒后保留原配置" || bad "非法配置被拒后保留原配置" "$out"

echo
echo "config.xml 生成"

# 恢复合法配置并生成 config.xml
b64 "$GOOD" > "$UFISYNC_ROOT/sync.conf.b64"
sh "$SH" set-config >/dev/null 2>&1

# 直接调 write_config（绕过需要 syncthing 二进制的 init）
cat > "$TMP/gen.sh" <<'GEN'
. "$SH_PATH" version >/dev/null 2>&1
GEN
DATA_ROOT_T="$TMP/vaults"
STHOME_T="$UFISYNC_ROOT/config"
mkdir -p "$DATA_ROOT_T" "$STHOME_T"
sh -c '
  set -e
  # 复用脚本内的函数：抽出定义部分执行
  sed -n "/^valid_folder_id/,/^}/p;/^valid_device_id/,/^}/p;/^canonical_device_id/,/^}/p;/^sanitize_label/,/^}/p;/^write_config/,/^}/p" '"$SH"' > '"$TMP"'/fn.sh
  CONF='"$UFISYNC_ROOT"'/sync.conf
  DATA_ROOT='"$DATA_ROOT_T"'
  STHOME='"$STHOME_T"'
  MIN_FREE_MB=1024
  GUI_ADDR=127.0.0.1:8384
  SYNC_PORT=22001
  DISCO_PORT=21027
  . '"$TMP"'/fn.sh
  write_config testapikey123
'
XML="$STHOME_T/config.xml"
check "$([ -f "$XML" ] && echo 0 || echo 1)" "生成了 config.xml"

grep -q 'id="notes"' "$XML" && ok "包含自定义仓库 notes" || bad "包含自定义仓库 notes"
grep -q 'id="photos.2024"' "$XML" && ok "包含自定义仓库 photos.2024" || bad "包含自定义仓库 photos.2024"
grep -q 'label="我的笔记"' "$XML" && ok "中文名称原样保留" || bad "中文名称原样保留"
grep -q 'developer-default-vault' "$XML" && bad "不应残留开发者默认仓库" || ok "新配置不含开发者默认仓库"
grep -q 'type="receiveonly"' "$XML" && ok "仓库类型是 receiveonly" || bad "仓库类型是 receiveonly"
grep -q '<address>127.0.0.1:8384</address>' "$XML" && ok "GUI 只绑定回环" || bad "GUI 只绑定回环"
grep -q 'tcp://0.0.0.0:22001' "$XML" && ok "使用探测到的同步端口" || bad "使用探测到的同步端口"
grep -q 'dynamic+https://relays.syncthing.net/endpoint' "$XML" \
  && ok "启用公网动态中继监听" || bad "启用公网动态中继监听"
n=$(grep -c '<device id="AAAAAAA' "$XML")
[ "$n" = "3" ] && ok "Mac 设备在 2 个仓库和全局各出现一次" || bad "Mac 设备引用次数" "实际 $n"
n=$(grep -c '<device id="BBBBBBB' "$XML")
[ "$n" = "3" ] && ok "Windows 设备在 2 个仓库和全局各出现一次" || bad "Windows 设备引用次数" "实际 $n"
n=$(grep -c '<device id="CCCCCCC' "$XML")
[ "$n" = "3" ] && ok "第三台 Linux 主机在 2 个仓库和全局各出现一次" || bad "Linux 设备引用次数" "实际 $n"
[ "$(grep -c '^    <device id=' "$XML")" = "3" ] \
  && ok "生成三台不同的全局可信主机" || bad "全局可信主机数量"
grep -q 'name="Mac 笔记本"' "$XML" && ok "保留 Mac 主机名称" || bad "Mac 主机名称"
grep -q 'name="Windows 台式机"' "$XML" && ok "保留 Windows 主机名称" || bad "Windows 主机名称"
grep -q 'name="Linux 小主机"' "$XML" && ok "保留第三台主机名称" || bad "Linux 主机名称"

# 2.2 及更早的 sync.conf 可能保存 52 位无校验位 ID。升级生成 XML
# 时应规范化为 56 位，绝不能静默跳过并丢掉信任设备。
LEGACY_CONF="$TMP/legacy.conf"
LEGACY_XML="$TMP/legacy.xml"
cat >"$LEGACY_CONF" <<'EOF'
F|legacy-notes|旧版笔记
D|BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB|旧版 & "电脑"
EOF
sh -c '
  set -e
  sed -n "/^valid_folder_id/,/^}/p;/^valid_device_id/,/^}/p;/^canonical_device_id/,/^}/p;/^sanitize_label/,/^}/p;/^write_config/,/^}/p" '"$SH"' > '"$TMP"'/legacy-fn.sh
  CONF='"$LEGACY_CONF"'
  DATA_ROOT='"$DATA_ROOT_T"'
  STHOME='"$STHOME_T"'
  MIN_FREE_MB=1024
  GUI_ADDR=127.0.0.1:8384
  SYNC_PORT=22001
  DISCO_PORT=21027
  . '"$TMP"'/legacy-fn.sh
  write_config testapikey123 '"$LEGACY_XML"'
'
grep -q 'id="BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN"' "$LEGACY_XML" \
  && ok "52 位旧 Device ID 生成 XML 时规范化为 56 位" \
  || bad "52 位旧 Device ID 未被规范化，设备可能丢失"
grep -q 'name="旧版 &amp; &quot;电脑&quot;"' "$LEGACY_XML" \
  && ok "迁移时通过 XML 转义保留设备名称标点" \
  || bad "迁移时静默删除了设备名称标点"

echo
echo "低资源配置"
grep -q '<databaseTuning>small</databaseTuning>' "$XML" && ok "数据库使用小内存模式" || bad "数据库使用小内存模式"
grep -q '<maxFolderConcurrency>1</maxFolderConcurrency>' "$XML" && ok "仓库顺序处理" || bad "仓库顺序处理"
grep -q '<maxConcurrentIncomingRequestKiB>32768</maxConcurrentIncomingRequestKiB>' "$XML" \
  && ok "全局接收缓冲限制为 32 MiB" || bad "全局接收缓冲限制为 32 MiB"
grep -q '<progressUpdateIntervalS>-1</progressUpdateIntervalS>' "$XML" \
  && ok "关闭非必要的进度传输" || bad "关闭非必要的进度传输"
[ "$(grep -c '<copiers>1</copiers>' "$XML")" = "2" ] && ok "每个仓库只用一个 copier" || bad "每个仓库只用一个 copier"
[ "$(grep -c '<hashers>1</hashers>' "$XML")" = "2" ] && ok "每个仓库只用一个 hasher" || bad "每个仓库只用一个 hasher"
[ "$(grep -c '<pullerMaxPendingKiB>16384</pullerMaxPendingKiB>' "$XML")" = "2" ] \
  && ok "每个仓库待处理缓冲限制为 16 MiB" || bad "每个仓库待处理缓冲限制为 16 MiB"
[ "$(grep -c '<numConnections>1</numConnections>' "$XML")" = "3" ] \
  && ok "三台电脑各只建立一个连接" || bad "每台电脑只建立一个连接"

echo
echo "旧配置迁移"
MIG="$TMP/migration"
mkdir -p "$MIG/config" "$MIG/backup"
printf '<configuration><options><listenAddress>dynamic+https://relays.syncthing.net/endpoint</listenAddress></options></configuration>\n' >"$MIG/config/config.xml"
sed -n '/^ensure_managed_config_current()/,/^}/p' "$SH" >"$MIG/function.sh"
sh -c '
  ROOT='"$MIG"'
  STHOME="$ROOT/config"
  RUN_DIR="$ROOT/run"
  CONF_ROLLBACK_STATE="$RUN_DIR/sync.conf.rollback.state"
  mkdir -p "$RUN_DIR"
  acquire_apply_lock() { :; }
  release_apply_lock() { :; }
  running_pid() { [ -f "$ROOT/stopped" ] || echo 1234; }
  stop_service() { : >"$ROOT/stopped"; }
  api_key() { echo testapikey123; }
  make_folder_dirs() { :; }
  write_config() {
    _out="${2:-$STHOME/config.xml}"
    printf "%s\n" "<configuration><options><listenAddress>dynamic+https://relays.syncthing.net/endpoint</listenAddress><databaseTuning>small</databaseTuning></options></configuration>" >"$_out"
  }
  prepare_config_candidate() { write_config "$1" "$2"; }
  write_stignore() { :; }
  log() { printf "%s\n" "$*" >>"$ROOT/migration.log"; }
  die() { printf "%s\n" "$*" >&2; exit 1; }
  . '"$MIG"'/function.sh
  ensure_managed_config_current
'
grep -q 'dynamic+https://relays.syncthing.net/endpoint' "$MIG/config/config.xml" && ok "启动前自动补公网动态中继" || bad "启动前自动补公网动态中继"
grep -q '<databaseTuning>small</databaseTuning>' "$MIG/config/config.xml" \
  && ok "已有中继的旧配置也会迁移到低内存模式" || bad "旧配置低内存迁移"
[ -f "$MIG/stopped" ] && ok "迁移运行中配置时先停止旧进程" || bad "迁移运行中配置时先停止旧进程"
ls "$MIG/backup"/config.xml.* >/dev/null 2>&1 && ok "迁移前备份旧 config.xml" || bad "迁移前备份旧 config.xml"

# 存在 set-config 留下的待应用回滚点时，普通启动迁移不得把
# 草稿 sync.conf 写入仍在生效的旧 XML。
MIGPENDING="$TMP/migration-pending"
mkdir -p "$MIGPENDING/config" "$MIGPENDING/run"
printf '%s\n' '<configuration><options></options></configuration>' >"$MIGPENDING/config/config.xml"
cp "$MIGPENDING/config/config.xml" "$MIGPENDING/expected.xml"
printf '%s\n' present >"$MIGPENDING/run/sync.conf.rollback.state"
sh -c '
  ROOT='"$MIGPENDING"'
  STHOME="$ROOT/config"
  CONF_ROLLBACK_STATE="$ROOT/run/sync.conf.rollback.state"
  log() { :; }
  . '"$MIG"'/function.sh
  ensure_managed_config_current
'
cmp -s "$MIGPENDING/config/config.xml" "$MIGPENDING/expected.xml" \
  && ok "普通启动不会把待应用草稿偷偷迁移到正式 XML" \
  || bad "待应用草稿被普通启动误写入正式 XML"

# 候选 XML 校验失败必须在停服前中止，不得覆盖正式配置。
MIGFAIL="$TMP/migration-fail"
mkdir -p "$MIGFAIL/config" "$MIGFAIL/backup"
printf '%s\n' '<configuration><options></options></configuration>' >"$MIGFAIL/config/config.xml"
cp "$MIGFAIL/config/config.xml" "$MIGFAIL/expected.xml"
set +e
sh -c '
  ROOT='"$MIGFAIL"'
  STHOME="$ROOT/config"
  CONF_ROLLBACK_STATE="$ROOT/no-pending-state"
  RUN_DIR="$ROOT/run"
  acquire_apply_lock() { :; }
  release_apply_lock() { :; }
  running_pid() { echo 1234; }
  cmd_stop() { : >"$ROOT/stopped"; }
  api_key() { echo testapikey123; }
  make_folder_dirs() { :; }
  prepare_config_candidate() { return 1; }
  write_stignore() { :; }
  log() { :; }
  die() { printf "%s\n" "$*" >&2; exit 1; }
  . '"$MIG"'/function.sh
  ensure_managed_config_current
' >/dev/null 2>&1
migfail_rc=$?
set +e
[ "$migfail_rc" -ne 0 ] && ok "旧配置迁移候选校验失败会中止" || bad "迁移候选校验失败未中止"
[ ! -f "$MIGFAIL/stopped" ] && ok "候选校验失败时不停止旧服务" || bad "候选校验失败却停止了旧服务"
cmp -s "$MIGFAIL/config/config.xml" "$MIGFAIL/expected.xml" \
  && ok "候选校验失败时保留原 config.xml" || bad "候选校验失败覆盖了原 config.xml"

echo
echo "应用配置回滚"
APPLY="$TMP/apply"
APPLY_ROOT="$APPLY/ufisync"
APPLY_PROC="$APPLY/proc"
mkdir -p "$APPLY_ROOT/bin" "$APPLY_ROOT/config" "$APPLY_ROOT/run" \
  "$APPLY_ROOT/log" "$APPLY_ROOT/backup" "$APPLY_ROOT/vaults" "$APPLY_PROC"

cat >"$APPLY_ROOT/bin/syncthing" <<'SH'
#!/bin/sh
echo 'syncthing v1.30.0 test-build'
SH
chmod 755 "$APPLY_ROOT/bin/syncthing"

OLD_DEVICE='AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA'
NEW_DEVICE='BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN'
cat >"$APPLY_ROOT/sync.conf" <<EOF
F|old-notes|原笔记
D|$OLD_DEVICE|原电脑
EOF
cat >"$APPLY_ROOT/config/config.xml" <<EOF
<configuration version="37">
  <folder id="old-notes" label="原笔记" path="$APPLY_ROOT/vaults/old-notes" type="receiveonly"></folder>
  <device id="$OLD_DEVICE" name="原电脑"></device>
  <gui><apikey>old-api-key</apikey></gui>
  <options><listenAddress>dynamic+https://relays.syncthing.net/endpoint</listenAddress><databaseTuning>small</databaseTuning></options>
</configuration>
EOF
cp "$APPLY_ROOT/config/config.xml" "$APPLY/expected-old.xml"
cp "$APPLY_ROOT/sync.conf" "$APPLY/expected-old.conf"

# 用一个真实休眠进程提供“原服务正在运行”的可观测状态；
# 伪 /proc 只提供脚本需要的 cmdline，不依赖真机 Syncthing。
sleep 300 &
APPLY_OLD_PID=$!
mkdir -p "$APPLY_PROC/$APPLY_OLD_PID"
printf '%s\0serve\0' "$APPLY_ROOT/bin/syncthing" >"$APPLY_PROC/$APPLY_OLD_PID/cmdline"
printf '%s\n' "$APPLY_OLD_PID" >"$APPLY_ROOT/run/syncthing.pid"
(
  while kill -0 "$APPLY_OLD_PID" 2>/dev/null; do sleep 0.05; done
  rm -rf "$APPLY_PROC/$APPLY_OLD_PID"
) &
APPLY_WATCH_PID=$!

# apply-config 通过设备上同路径的控制脚本执行启停。这个替身让新配置
# 启动失败，并记录是否又用原配置进行了恢复启动。
cat >"$APPLY_ROOT/ufisync.sh" <<'SH'
#!/bin/sh
case "${1:-}" in
  stop)
    : >"$UFISYNC_ROOT/run/stop.called"
    _pid="$(cat "$UFISYNC_ROOT/run/syncthing.pid" 2>/dev/null)"
    [ -n "$_pid" ] && kill "$_pid" 2>/dev/null || true
    [ -n "$_pid" ] && rm -rf "$UFISYNC_PROC_ROOT/$_pid"
    rm -f "$UFISYNC_ROOT/run/syncthing.pid"
    [ -f "$UFISYNC_ROOT/run/stop-fails" ] && exit 1
    :
    ;;
  init)
    # 模拟旧实现将新配置直接写到正式 XML。
    printf '%s\n' '<configuration><folder id="new-notes"></folder></configuration>' \
      >"$UFISYNC_ROOT/config/config.xml"
    ;;
  start)
    _calls=0
    [ -f "$UFISYNC_ROOT/run/start.calls" ] && _calls="$(cat "$UFISYNC_ROOT/run/start.calls")"
    _calls=$((_calls+1))
    printf '%s\n' "$_calls" >"$UFISYNC_ROOT/run/start.calls"
    if grep -q 'id="new-notes"' "$UFISYNC_ROOT/config/config.xml"; then
      echo '模拟：新配置无法启动' >&2
      exit 1
    fi
    grep -q 'id="old-notes"' "$UFISYNC_ROOT/config/config.xml" || {
      echo '模拟：原配置不完整' >&2
      exit 1
    }
    : >"$UFISYNC_ROOT/run/old-config-restarted"
    ;;
  *) exit 2 ;;
esac
SH
chmod 755 "$APPLY_ROOT/ufisync.sh"

NEW_CONF="F|new-notes|新笔记
D|$NEW_DEVICE|新电脑"
b64 "$NEW_CONF" >"$APPLY_ROOT/sync.conf.b64"
UFISYNC_ROOT="$APPLY_ROOT" UFISYNC_PROC_ROOT="$APPLY_PROC" sh "$SH" set-config >/dev/null 2>&1
out="$(UFISYNC_ROOT="$APPLY_ROOT" UFISYNC_PROC_ROOT="$APPLY_PROC" sh "$SH" apply-config 2>&1)"
apply_rc=$?

[ "$apply_rc" -ne 0 ] && ok "新配置启动失败会返回错误" || bad "新配置启动失败会返回错误" "$out"
cmp -s "$APPLY_ROOT/config/config.xml" "$APPLY/expected-old.xml" \
  && ok "失败后恢复原 config.xml" || bad "失败后恢复原 config.xml" "$out"
cmp -s "$APPLY_ROOT/sync.conf" "$APPLY/expected-old.conf" \
  && ok "失败后恢复原产品配置" || bad "失败后恢复原产品配置" "$out"
[ -f "$APPLY_ROOT/run/old-config-restarted" ] \
  && ok "失败后重新启动原配置" || bad "失败后重新启动原配置" "$out"
[ "$(cat "$APPLY_ROOT/run/start.calls" 2>/dev/null || echo 0)" = "2" ] \
  && ok "新配置失败后只进行一次恢复启动" || bad "新配置失败后启动次数" "$out"
kill "$APPLY_OLD_PID" 2>/dev/null || true
wait "$APPLY_WATCH_PID" 2>/dev/null || true
wait "$APPLY_OLD_PID" 2>/dev/null || true

# 停止命令也可能在已经结束原进程后返回失败。此时候选 XML 尚未切换，
# apply-config 仍应保留原配置并尝试恢复原服务，避免留下停机状态。
rm -f "$APPLY_ROOT/run/start.calls" "$APPLY_ROOT/run/old-config-restarted"
sleep 300 &
APPLY_STOP_PID=$!
mkdir -p "$APPLY_PROC/$APPLY_STOP_PID"
printf '%s\0serve\0' "$APPLY_ROOT/bin/syncthing" >"$APPLY_PROC/$APPLY_STOP_PID/cmdline"
printf '%s\n' "$APPLY_STOP_PID" >"$APPLY_ROOT/run/syncthing.pid"
(
  while kill -0 "$APPLY_STOP_PID" 2>/dev/null; do sleep 0.05; done
  rm -rf "$APPLY_PROC/$APPLY_STOP_PID"
) &
APPLY_STOP_WATCH_PID=$!
touch "$APPLY_ROOT/run/stop-fails"
b64 "$NEW_CONF" >"$APPLY_ROOT/sync.conf.b64"
UFISYNC_ROOT="$APPLY_ROOT" UFISYNC_PROC_ROOT="$APPLY_PROC" sh "$SH" set-config >/dev/null 2>&1
out="$(UFISYNC_ROOT="$APPLY_ROOT" UFISYNC_PROC_ROOT="$APPLY_PROC" sh "$SH" apply-config 2>&1)"
apply_rc=$?

[ "$apply_rc" -ne 0 ] && ok "停止失败会中止新配置切换" || bad "停止失败会中止新配置切换" "$out"
cmp -s "$APPLY_ROOT/config/config.xml" "$APPLY/expected-old.xml" \
  && ok "停止失败时保留原 config.xml" || bad "停止失败时保留原 config.xml" "$out"
cmp -s "$APPLY_ROOT/sync.conf" "$APPLY/expected-old.conf" \
  && ok "停止失败时恢复原产品配置" || bad "停止失败时恢复原产品配置" "$out"
[ -f "$APPLY_ROOT/run/old-config-restarted" ] \
  && ok "停止失败后尝试恢复原服务" || bad "停止失败后尝试恢复原服务" "$out"
rm -f "$APPLY_ROOT/run/stop-fails"
kill "$APPLY_STOP_PID" 2>/dev/null || true
wait "$APPLY_STOP_WATCH_PID" 2>/dev/null || true
wait "$APPLY_STOP_PID" 2>/dev/null || true

# 候选 XML 在切换前验证；验证失败时不得触发 stop，原服务应持续运行。
rm -f "$APPLY_ROOT/run/stop.called" "$APPLY_ROOT/run/start.calls" "$APPLY_ROOT/run/old-config-restarted"
sleep 300 &
APPLY_PREP_PID=$!
mkdir -p "$APPLY_PROC/$APPLY_PREP_PID" "$APPLY/tools"
printf '%s\0serve\0' "$APPLY_ROOT/bin/syncthing" >"$APPLY_PROC/$APPLY_PREP_PID/cmdline"
printf '%s\n' "$APPLY_PREP_PID" >"$APPLY_ROOT/run/syncthing.pid"
REAL_GREP="$(command -v grep)"
cat >"$APPLY/tools/grep" <<SH
#!/bin/sh
for _arg in "\$@"; do
  case "\$_arg" in *config.xml.pending.*) exit 1 ;; esac
done
exec "$REAL_GREP" "\$@"
SH
chmod 755 "$APPLY/tools/grep"
b64 "$NEW_CONF" >"$APPLY_ROOT/sync.conf.b64"
UFISYNC_ROOT="$APPLY_ROOT" UFISYNC_PROC_ROOT="$APPLY_PROC" sh "$SH" set-config >/dev/null 2>&1
out="$(PATH="$APPLY/tools:$PATH" UFISYNC_ROOT="$APPLY_ROOT" UFISYNC_PROC_ROOT="$APPLY_PROC" sh "$SH" apply-config 2>&1)"
apply_rc=$?

[ "$apply_rc" -ne 0 ] && ok "候选 XML 验证失败会中止应用" || bad "候选 XML 验证失败会中止应用" "$out"
[ ! -f "$APPLY_ROOT/run/stop.called" ] \
  && ok "候选 XML 验证失败时不停止原服务" || bad "候选 XML 验证失败时不停止原服务" "$out"
kill -0 "$APPLY_PREP_PID" 2>/dev/null \
  && ok "候选 XML 验证失败后原进程仍存活" || bad "候选 XML 验证失败后原进程仍存活" "$out"
cmp -s "$APPLY_ROOT/config/config.xml" "$APPLY/expected-old.xml" \
  && ok "候选 XML 验证失败时保留原 config.xml" || bad "候选 XML 验证失败时保留原 config.xml" "$out"
cmp -s "$APPLY_ROOT/sync.conf" "$APPLY/expected-old.conf" \
  && ok "候选 XML 验证失败时恢复原产品配置" || bad "候选 XML 验证失败时恢复原产品配置" "$out"
kill "$APPLY_PREP_PID" 2>/dev/null || true
wait "$APPLY_PREP_PID" 2>/dev/null || true
rm -rf "$APPLY_PROC/$APPLY_PREP_PID"

echo
echo "动作枚举"
if sed -n '/^cmd_start()/,/^}/p' "$SH" | grep -q 'clear_product_config_rollback'; then
  bad "通用 start 不应提交可能尚未应用的产品配置"
else
  ok "通用 start 不会清理待应用配置的回滚点"
fi
sed -n '/^cmd_init()/,/^}/p' "$SH" | grep -q 'clear_product_config_rollback' \
  && ok "显式重新初始化成功后提交产品配置" \
  || bad "重新初始化成功后未提交产品配置"
init_body="$(sed -n '/^cmd_init()/,/^}/p' "$SH")"
init_lock_line="$(printf '%s\n' "$init_body" | grep -n 'acquire_apply_lock' | head -n1 | cut -d: -f1)"
init_write_line="$(printf '%s\n' "$init_body" | grep -n 'ensure_device_identity' | head -n1 | cut -d: -f1)"
if [ -n "$init_lock_line" ] && [ -n "$init_write_line" ] && [ "$init_lock_line" -lt "$init_write_line" ]; then
  ok "重新初始化在写设备身份与 XML 前取得事务锁"
else
  bad "重新初始化未与配置应用/升级互斥"
fi
apply_body="$(sed -n '/^cmd_apply_config()/,/^}/p' "$SH")"
lock_line="$(printf '%s\n' "$apply_body" | grep -n 'acquire_apply_lock' | head -n1 | cut -d: -f1)"
stop_line="$(printf '%s\n' "$apply_body" | grep -n 'ufisync.sh.*stop' | head -n1 | cut -d: -f1)"
if [ -n "$lock_line" ] && [ -n "$stop_line" ] && [ "$lock_line" -lt "$stop_line" ]; then
  ok "应用配置在停机前取得看门狗互斥锁"
else
  bad "应用配置未在停机前取得看门狗互斥锁"
fi
sh "$SH" bogus-action >/dev/null 2>&1
check "$([ $? = 2 ] && echo 0 || echo 1)" "未知动作以退出码 2 拒绝"
sh "$SH" version | grep -q 'ufisync' && ok "version 可用" || bad "version 可用"
sh "$SH" version | grep -q '1.30.0' && ok "默认内核版本是 1.30.0（纯 Go 静态）" || bad "默认内核版本是 1.30.0"

echo
echo "删除边界"
PURGE_ROOT="$TMP/purge-root"
PURGE_PARENT="$TMP/purge-parent"
mkdir -p "$PURGE_ROOT/config" "$PURGE_ROOT/db" "$PURGE_PARENT/vaults"
printf '%s\n' keep >"$PURGE_PARENT/KEEP"
cat >"$PURGE_ROOT/sync.conf" <<'EOF'
F|..|越界仓库
D|AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA-AAAAAAA|pc
EOF
UFISYNC_ROOT="$PURGE_ROOT" DATA_ROOT="$PURGE_PARENT/vaults" STDATA="$PURGE_ROOT/db" \
  sh "$SH" purge-data CONFIRM-DELETE-VAULT-COPIES >/dev/null 2>&1
[ -f "$PURGE_PARENT/KEEP" ] \
  && ok "历史恶意点段配置不会使 purge-data 越出仓库根目录" \
  || bad "purge-data 被点段配置诱导删除了仓库根目录外的文件"

rm -rf "$TMP"
echo
if [ "$fails" = "0" ]; then echo "全部通过 ✅"; else echo "$fails 项失败 ❌"; exit 1; fi
