#!/system/bin/sh
# =============================================================================
# UFI Sync Node — 设备端控制脚本（同步内核由本脚本独占管理）
#
# 由 UFI-TOOLS 插件在安装阶段写入设备，用户不直接调用。
# 只接受固定动作枚举，不接受任意命令拼接。
#
# 重要：Android 用 bionic libc，没有 glibc 动态链接器。
# Syncthing 2.x 因为换成 CGO 版 SQLite，官方 linux-arm64 二进制动态链接 glibc，
# 在 device 上无法执行。所以默认安装 1.30.0——最后一个纯 Go 静态构建。
# v1 与 v2 协议兼容，可以和 Mac / Windows 上的 2.x 组成集群。
#
# 第三方组件：Syncthing 依 MPL-2.0 分发。本安装器会把上游发布包
# 中的 LICENSE 保留到 licenses/Syncthing-MPL-2.0.txt；旧安装缺失时
# 使用内嵌且固定 SHA256 的完整上游原文离线补齐。
# =============================================================================

set -u

SYNCTHING_VERSION="${SYNCTHING_VERSION:-1.30.0}"

# --- 路径 ---------------------------------------------------------------------
APP_FILES="/data/data/com.minikano.f50_sms/files"
# UFISYNC_ROOT 只用于离线自测；设备上不会设置这个变量
ROOT="${UFISYNC_ROOT:-$APP_FILES/ufisync}"

# UFI-TOOLS 的 Root Shell 不保证定义 HOME。Syncthing 即使只执行 --version，
# 也会在初始化 locations 包时读取 HOME；缺失时会直接 panic。
# 本插件独占管理内核，因此所有动作统一使用插件目录作为 HOME。
HOME="$ROOT"
export HOME

BIN_DIR="$ROOT/bin"
BIN="$BIN_DIR/syncthing"
STHOME="$ROOT/config"
STDATA_DEFAULT="$ROOT/db"
RUN_DIR="$ROOT/run"
LOG_DIR="$ROOT/log"
LOG="$LOG_DIR/syncthing.log"
OPLOG="$LOG_DIR/ufisync.log"
PIDF="$RUN_DIR/syncthing.pid"
LOCK="$RUN_DIR/ufisync.lock"
STATE="$ROOT/state.env"
CONF="$ROOT/sync.conf"
CONF_B64="$ROOT/sync.conf.b64"
CONF_ROLLBACK="$RUN_DIR/sync.conf.rollback"
CONF_ROLLBACK_STATE="$RUN_DIR/sync.conf.rollback.state"
APPLY_LOCK="$RUN_DIR/apply.lock"
INSTALL_STATE="$RUN_DIR/install.state"
INSTALL_LOCK="$RUN_DIR/install.lock"
INSTALL_LOG="$LOG_DIR/install.log"
TGZ="$ROOT/syncthing.tar.gz"
KERNEL_VERSION_CACHE="$ROOT/kernel.version"
LICENSE_DIR="$ROOT/licenses"
SYNCTHING_LICENSE="$LICENSE_DIR/Syncthing-MPL-2.0.txt"
# 设备使用真实 /proc；可替换路径仅用于离线复现进程管理行为。
PROC_ROOT="${UFISYNC_PROC_ROOT:-/proc}"

GUI_ADDR="127.0.0.1:8384"
DISCO_PORT="21027"

DATA_ROOT_DEFAULT="/sdcard/ufisync/vaults"
MIN_FREE_MB=1024
INSTALL_FREE_MB=3072
MIN_AVAIL_MEM_MB=200
LOG_MAX_KB=2048
MAX_FOLDERS=20
MAX_DEVICES=10
# 单次下载最长 900 秒，四个镜像各两次的理论总时长略超两小时；默认三小时
# 才进入“核验身份→终止整棵安装进程树→确认退出”的超时恢复流程。
INSTALL_LOCK_MAX_AGE="${UFISYNC_INSTALL_LOCK_MAX_AGE:-10800}"
case "$INSTALL_LOCK_MAX_AGE" in ''|*[!0-9]*) INSTALL_LOCK_MAX_AGE=10800 ;; esac

GH_PATH="syncthing/syncthing/releases/download"
MIRRORS="https://ghproxy.net/https://github.com https://mirror.ghproxy.com/https://github.com https://gitproxy.click/https://github.com https://github.com"

[ -f "$STATE" ] && . "$STATE" 2>/dev/null
# state.env 记录安装时状态，升级后可能带旧 UFISYNC_VERSION；代码版本必须
# 始终以当前已部署脚本为准，不能被历史状态覆盖。
UFISYNC_VERSION="2.3.1"
DATA_ROOT="${DATA_ROOT:-$DATA_ROOT_DEFAULT}"
STDATA="${STDATA:-$STDATA_DEFAULT}"
SYNC_PORT="${SYNC_PORT:-22000}"

# --- 工具函数 -----------------------------------------------------------------
log() {
    mkdir -p "$LOG_DIR" 2>/dev/null
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >>"$OPLOG" 2>/dev/null
    echo "$*"
}

die() { log "FATAL: $*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
free_mb() { df -k "$1" 2>/dev/null | awk 'NR==2 {print int($4/1024)}'; }
avail_mem_mb() { awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo 2>/dev/null; }

# 官方 1.30.0 是静态 Linux/Go 二进制，不使用 Android/bionic 的证书查找
# 逻辑。device 上 curl 能验证 HTTPS，但 Syncthing 默认只找 Linux 常见路径，
# 因而访问 relays.syncthing.net 时会报 x509 unknown authority。把设备上实际
# 存在的系统 CA 目录显式交给 Go；保留调用方明确设置的证书环境。
configure_tls_roots() {
    [ -n "${SSL_CERT_FILE:-}" ] && return 0
    [ -n "${SSL_CERT_DIR:-}" ] && return 0

    _ca_candidates="${UFISYNC_CA_DIRS:-/apex/com.android.conscrypt/cacerts:/system/etc/security/cacerts:/product/etc/security/cacerts:/etc/security/cacerts:/etc/ssl/certs}"
    _ca_joined=""
    _ca_old_ifs="$IFS"
    IFS=:
    for _ca_dir in $_ca_candidates; do
        [ -d "$_ca_dir" ] || continue
        if [ -z "$_ca_joined" ]; then _ca_joined="$_ca_dir"
        else _ca_joined="$_ca_joined:$_ca_dir"; fi
    done
    IFS="$_ca_old_ifs"

    if [ -n "$_ca_joined" ]; then
        SSL_CERT_DIR="$_ca_joined"
        export SSL_CERT_DIR
    fi
}

configure_tls_roots

# device 只有约 1.5 GB 内存。给 Go 运行时一个软预算，并降低并行度与堆增长阈值，
# 以减少索引和并发传输时的峰值；三项均允许部署环境显式覆盖。
GOMEMLIMIT="${GOMEMLIMIT:-256MiB}"
GOGC="${GOGC:-60}"
GOMAXPROCS="${GOMAXPROCS:-2}"
# device 已由 ufi_tools_schedule.sh 的外部看门狗负责故障拉起。
# STNORESTART 只禁止 Syncthing monitor 在子进程退出后内部重启；它不会
# 绕过 monitor。这里使用公开支持的参数，不依赖隐藏的 STMONITORED 实现细节。
STNORESTART="${STNORESTART:-1}"
export GOMEMLIMIT GOGC GOMAXPROCS STNORESTART

# Android/toybox 使用 -d，macOS/BSD 使用 -D；兼容两者，方便离线测试与移植。
decode_base64_file() {
    _in="$1"; _out="$2"
    if have base64; then
        base64 -d <"$_in" >"$_out" 2>/dev/null && return 0
        base64 -D <"$_in" >"$_out" 2>/dev/null && return 0
    fi
    have busybox && busybox base64 -d <"$_in" >"$_out" 2>/dev/null
}

port_busy() {
    if have netstat; then
        netstat -tuln 2>/dev/null | grep -q ":$1 " && return 0 || return 1
    fi
    _hex=$(printf '%04X' "$1")
    grep -qi ":$_hex " /proc/net/tcp /proc/net/tcp6 /proc/net/udp /proc/net/udp6 2>/dev/null
}

pick_sync_port() {
    for _p in 22000 22001 22002 22003 22010 22020; do
        port_busy "$_p" || { echo "$_p"; return 0; }
    done
    echo ""
}

valid_sync_port() {
    case "$1" in ''|*[!0-9]*) return 1 ;; esac
    [ "$1" -ge 1 ] 2>/dev/null && [ "$1" -le 65535 ] 2>/dev/null
}

# config.xml 是 Syncthing 当前真正使用的监听配置，优先于可能被旧版重装
# 错写的 state.env。两者都没有合法记录时，才为全新安装探测空闲端口。
saved_sync_port() {
    _ssp=""
    if [ -f "$STHOME/config.xml" ]; then
        _ssp="$(sed -n 's#.*<listenAddress>tcp://0\.0\.0\.0:\([0-9][0-9]*\)</listenAddress>.*#\1#p' \
            "$STHOME/config.xml" 2>/dev/null | head -n1)"
        valid_sync_port "$_ssp" && { echo "$_ssp"; return 0; }
    fi
    if [ -f "$STATE" ]; then
        _ssp="$(sed -n 's/^SYNC_PORT=\([0-9][0-9]*\)$/\1/p' "$STATE" 2>/dev/null | head -n1)"
        valid_sync_port "$_ssp" && { echo "$_ssp"; return 0; }
    fi
    echo ""; return 1
}

install_sync_port_choice() {
    _ispc_saved="$(saved_sync_port)"
    if [ -n "$_ispc_saved" ]; then echo "$_ispc_saved"; return 0; fi
    pick_sync_port
}

sha256_of() {
    if have sha256sum; then sha256sum "$1" | awk '{print $1}'
    elif have toybox; then toybox sha256sum "$1" | awk '{print $1}'
    else echo ""; fi
}

fetch_once() {
    _url="$1"; _out="$2"; _max="${3:-900}"
    if have curl; then
        curl -fsSL --connect-timeout 20 --max-time "$_max" -o "$_out" "$_url" && return 0
    elif have wget; then
        wget -q -T 20 -O "$_out" "$_url" && return 0
    elif have busybox; then
        busybox wget -q -O "$_out" "$_url" && return 0
    fi
    return 1
}

# 多镜像 + 重试。$1=release 相对路径 $2=输出 $3=最小可接受字节
fetch_release() {
    _rel="$1"; _out="$2"; _minsize="${3:-0}"
    for _base in $MIRRORS; do
        # 取主机名做日志展示。toybox sed 不支持一条表达式里用 ; 分隔多命令，
        # 这里改用纯 POSIX 参数展开，避免 "sed: bad pattern" 。
        _host="${_base#*://}"
        _host="${_host%%/*}"
        _try=0
        while [ "$_try" -lt 2 ]; do
            _try=$((_try+1))
            set_install_state "downloading" "从 ${_host} 下载（第 ${_try} 次尝试）"
            rm -f "$_out"
            if fetch_once "$_base/$GH_PATH/$_rel" "$_out"; then
                _sz=$(stat -c%s "$_out" 2>/dev/null || echo 0)
                if [ "$_sz" -ge "$_minsize" ]; then
                    log "下载成功：${_host}（${_sz} 字节）"
                    return 0
                fi
                log "${_host} 返回的文件过小（${_sz} 字节），丢弃"
            else
                log "${_host} 下载失败"
            fi
            rm -f "$_out"
            sleep 2
        done
    done
    return 1
}

# --- 同步内核二进制的识别 -----------------------------------------------------
# Syncthing 的 tarball 里不止一个叫 syncthing 的文件：
#   syncthing-linux-arm64-vX/syncthing          ← 真正的 ELF 二进制
#   syncthing-linux-arm64-vX/etc/freebsd-rc/syncthing  ← BSD 启动脚本（#!/bin/sh）
# 只按文件名找会抓到后者，装上去一执行就报 /etc/rc.subr 不存在。
# 所以必须按 ELF 魔数 + 体积双重确认。
MIN_BIN_BYTES="${MIN_BIN_BYTES:-5000000}"

is_elf() {
    [ -f "$1" ] || return 1
    [ "$(head -c 4 "$1" 2>/dev/null | od -An -tx1 | tr -d ' \n')" = "7f454c46" ]
}

find_kernel_binary() {
    find "$1" -type f -name syncthing 2>/dev/null | while IFS= read -r _c; do
        _sz=$(stat -c%s "$_c" 2>/dev/null || echo 0)
        [ "$_sz" -lt "$MIN_BIN_BYTES" ] && continue
        is_elf "$_c" || continue
        echo "$_c"
        break
    done | head -n1
}

# 严格判断内核是否可用。注意不能只 grep "syncthing"——
# 执行失败时的错误信息里也含有安装路径，路径里就带 syncthing。
kernel_version_line() { "$BIN" --version 2>&1 | head -n1; }
kernel_ok() {
    is_elf "$BIN" || return 1
    "$BIN" --version 2>&1 | grep -qE 'syncthing +v[0-9]+\.[0-9]+'
}

# 信任根必须随插件发布，不能和 tarball 一起从同一镜像下载。
# 该值已对照 Syncthing v1.30.0 官方 clearsigned 清单与 GitHub Release digest。
trusted_kernel_sha256() {
    case "$1" in
        1.30.0) echo "4655e260e94fa5e0110084040751bd0274acdeb74653933f909036e788a911a1" ;;
        *) return 1 ;;
    esac
}

cache_kernel_version() {
    _ckv_line="$(kernel_version_line)"
    echo "$_ckv_line" | grep -qE 'syncthing +v[0-9]+\.[0-9]+' || return 1
    printf '%s\n' "$_ckv_line" >"$KERNEL_VERSION_CACHE" || return 1
}

cached_kernel_version() {
    [ -s "$KERNEL_VERSION_CACHE" ] || return 1
    head -n1 "$KERNEL_VERSION_CACHE"
}

preserve_syncthing_license() {
    _psl_root="$1"
    _psl_src="$(find "$_psl_root" -type f -name LICENSE 2>/dev/null | head -n1)"
    [ -n "$_psl_src" ] && [ -s "$_psl_src" ] || return 1
    mkdir -p "$LICENSE_DIR" || return 1
    cp -f "$_psl_src" "$SYNCTHING_LICENSE" || return 1
    chmod 644 "$SYNCTHING_LICENSE" 2>/dev/null || true
}

# Syncthing v1.30.0 上游 LICENSE（MPL-2.0）原文的 base64。
# 原文 16726 字节，SHA256 为 3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04。
# 内嵌副本让旧版已装好内核的设备无需联网或重新下载约 10 MB 发布包即可补齐许可。
syncthing_license_b64() {
    printf '%s' 'TW96aWxsYSBQdWJsaWMgTGljZW5zZSBWZXJzaW9uIDIuMAo9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09CgoxLiBEZWZpbml0aW9ucwotLS0tLS0tLS0tLS0tLQoKMS4xLiAiQ29udHJpYnV0b3IiCiAgICBtZWFucyBlYWNoIGluZGl2aWR1YWwgb3IgbGVnYWwgZW50aXR5IHRoYXQgY3JlYXRlcywgY29udHJpYnV0ZXMgdG8KICAgIHRoZSBjcmVhdGlvbiBvZiwgb3Igb3ducyBDb3ZlcmVkIFNvZnR3YXJlLgoKMS4yLiAiQ29udHJpYnV0b3IgVmVyc2lvbiIKICAgIG1lYW5zIHRoZSBjb21iaW5hdGlvbiBvZiB0aGUgQ29udHJpYnV0aW9ucyBvZiBvdGhlcnMgKGlmIGFueSkgdXNlZAogICAgYnkgYSBDb250cmlidXRvciBhbmQgdGhhdCBwYXJ0aWN1bGFyIENvbnRyaWJ1dG9yJ3MgQ29udHJpYnV0aW9uLgoKMS4zLiAiQ29udHJpYnV0aW9uIgogICAgbWVhbnMgQ292ZXJlZCBTb2Z0d2FyZSBvZiBhIHBhcnRpY3VsYXIgQ29udHJpYnV0b3IuCgoxLjQuICJDb3ZlcmVkIFNvZnR3YXJlIgogICAgbWVhbnMgU291cmNlIENvZGUgRm9ybSB0byB3aGljaCB0aGUgaW5pdGlhbCBDb250cmlidXRvciBoYXMgYXR0YWNoZWQKICAgIHRoZSBub3RpY2UgaW4gRXhoaWJpdCBBLCB0aGUgRXhlY3V0YWJsZSBGb3JtIG9mIHN1Y2ggU291cmNlIENvZGUKICAgIEZvcm0sIGFuZCBNb2RpZmljYXRpb25zIG9mIHN1Y2ggU291cmNlIENvZGUgRm9ybSwgaW4gZWFjaCBjYXNlCiAgICBpbmNsdWRpbmcgcG9ydGlvbnMgdGhlcmVvZi4KCjEuNS4gIkluY29tcGF0aWJsZSBXaXRoIFNlY29uZGFyeSBMaWNlbnNlcyIKICAgIG1lYW5zCgogICAgKGEpIHRoYXQgdGhlIGluaXRpYWwgQ29udHJpYnV0b3IgaGFzIGF0dGFjaGVkIHRoZSBub3RpY2UgZGVzY3JpYmVkCiAgICAgICAgaW4gRXhoaWJpdCBCIHRvIHRoZSBDb3ZlcmVkIFNvZnR3YXJlOyBvcgoKICAgIChiKSB0aGF0IHRoZSBDb3ZlcmVkIFNvZnR3YXJlIHdhcyBtYWRlIGF2YWlsYWJsZSB1bmRlciB0aGUgdGVybXMgb2YKICAgICAgICB2ZXJzaW9uIDEuMSBvciBlYXJsaWVyIG9mIHRoZSBMaWNlbnNlLCBidXQgbm90IGFsc28gdW5kZXIgdGhlCiAgICAgICAgdGVybXMgb2YgYSBTZWNvbmRhcnkgTGljZW5zZS4KCjEuNi4gIkV4ZWN1dGFibGUgRm9ybSIKICAgIG1lYW5zIGFueSBmb3JtIG9mIHRoZSB3b3JrIG90aGVyIHRoYW4gU291cmNlIENvZGUgRm9ybS4KCjEuNy4gIkxhcmdlciBXb3JrIgogICAgbWVhbnMgYSB3b3JrIHRoYXQgY29tYmluZXMgQ292ZXJlZCBTb2Z0d2FyZSB3aXRoIG90aGVyIG1hdGVyaWFsLCBpbgogICAgYSBzZXBhcmF0ZSBmaWxlIG9yIGZpbGVzLCB0aGF0IGlzIG5vdCBDb3ZlcmVkIFNvZnR3YXJlLgoKMS44LiAiTGljZW5zZSIKICAgIG1lYW5zIHRoaXMgZG9jdW1lbnQuCgoxLjkuICJMaWNlbnNhYmxlIgogICAgbWVhbnMgaGF2aW5nIHRoZSByaWdodCB0byBncmFudCwgdG8gdGhlIG1heGltdW0gZXh0ZW50IHBvc3NpYmxlLAogICAgd2hldGhlciBhdCB0aGUgdGltZSBvZiB0aGUgaW5pdGlhbCBncmFudCBvciBzdWJzZXF1ZW50bHksIGFueSBhbmQKICAgIGFsbCBvZiB0aGUgcmlnaHRzIGNvbnZleWVkIGJ5IHRoaXMgTGljZW5zZS4KCjEuMTAuICJNb2RpZmljYXRpb25zIgogICAgbWVhbnMgYW55IG9mIHRoZSBmb2xsb3dpbmc6CgogICAgKGEpIGFueSBmaWxlIGluIFNvdXJjZSBDb2RlIEZvcm0gdGhhdCByZXN1bHRzIGZyb20gYW4gYWRkaXRpb24gdG8sCiAgICAgICAgZGVsZXRpb24gZnJvbSwgb3IgbW9kaWZpY2F0aW9uIG9mIHRoZSBjb250ZW50cyBvZiBDb3ZlcmVkCiAgICAgICAgU29mdHdhcmU7IG9yCgogICAgKGIpIGFueSBuZXcgZmlsZSBpbiBTb3VyY2UgQ29kZSBGb3JtIHRoYXQgY29udGFpbnMgYW55IENvdmVyZWQKICAgICAgICBTb2Z0d2FyZS4KCjEuMTEuICJQYXRlbnQgQ2xhaW1zIiBvZiBhIENvbnRyaWJ1dG9yCiAgICBtZWFucyBhbnkgcGF0ZW50IGNsYWltKHMpLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uLCBtZXRob2QsCiAgICBwcm9jZXNzLCBhbmQgYXBwYXJhdHVzIGNsYWltcywgaW4gYW55IHBhdGVudCBMaWNlbnNhYmxlIGJ5IHN1Y2gKICAgIENvbnRyaWJ1dG9yIHRoYXQgd291bGQgYmUgaW5mcmluZ2VkLCBidXQgZm9yIHRoZSBncmFudCBvZiB0aGUKICAgIExpY2Vuc2UsIGJ5IHRoZSBtYWtpbmcsIHVzaW5nLCBzZWxsaW5nLCBvZmZlcmluZyBmb3Igc2FsZSwgaGF2aW5nCiAgICBtYWRlLCBpbXBvcnQsIG9yIHRyYW5zZmVyIG9mIGVpdGhlciBpdHMgQ29udHJpYnV0aW9ucyBvciBpdHMKICAgIENvbnRyaWJ1dG9yIFZlcnNpb24uCgoxLjEyLiAiU2Vjb25kYXJ5IExpY2Vuc2UiCiAgICBtZWFucyBlaXRoZXIgdGhlIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlLCBWZXJzaW9uIDIuMCwgdGhlIEdOVQogICAgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UsIFZlcnNpb24gMi4xLCB0aGUgR05VIEFmZmVybyBHZW5lcmFsCiAgICBQdWJsaWMgTGljZW5zZSwgVmVyc2lvbiAzLjAsIG9yIGFueSBsYXRlciB2ZXJzaW9ucyBvZiB0aG9zZQogICAgbGljZW5zZXMuCgoxLjEzLiAiU291cmNlIENvZGUgRm9ybSIKICAgIG1lYW5zIHRoZSBmb3JtIG9mIHRoZSB3b3JrIHByZWZlcnJlZCBmb3IgbWFraW5nIG1vZGlmaWNhdGlvbnMuCgoxLjE0LiAiWW91IiAob3IgIllvdXIiKQogICAgbWVhbnMgYW4gaW5kaXZpZHVhbCBvciBhIGxlZ2FsIGVudGl0eSBleGVyY2lzaW5nIHJpZ2h0cyB1bmRlciB0aGlzCiAgICBMaWNlbnNlLiBGb3IgbGVnYWwgZW50aXRpZXMsICJZb3UiIGluY2x1ZGVzIGFueSBlbnRpdHkgdGhhdAogICAgY29udHJvbHMsIGlzIGNvbnRyb2xsZWQgYnksIG9yIGlzIHVuZGVyIGNvbW1vbiBjb250cm9sIHdpdGggWW91LiBGb3IKICAgIHB1cnBvc2VzIG9mIHRoaXMgZGVmaW5pdGlvbiwgImNvbnRyb2wiIG1lYW5zIChhKSB0aGUgcG93ZXIsIGRpcmVjdAogICAgb3IgaW5kaXJlY3QsIHRvIGNhdXNlIHRoZSBkaXJlY3Rpb24gb3IgbWFuYWdlbWVudCBvZiBzdWNoIGVudGl0eSwKICAgIHdoZXRoZXIgYnkgY29udHJhY3Qgb3Igb3RoZXJ3aXNlLCBvciAoYikgb3duZXJzaGlwIG9mIG1vcmUgdGhhbgogICAgZmlmdHkgcGVyY2VudCAoNTAlKSBvZiB0aGUgb3V0c3RhbmRpbmcgc2hhcmVzIG9yIGJlbmVmaWNpYWwKICAgIG93bmVyc2hpcCBvZiBzdWNoIGVudGl0eS4KCjIuIExpY2Vuc2UgR3JhbnRzIGFuZCBDb25kaXRpb25zCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCgoyLjEuIEdyYW50cwoKRWFjaCBDb250cmlidXRvciBoZXJlYnkgZ3JhbnRzIFlvdSBhIHdvcmxkLXdpZGUsIHJveWFsdHktZnJlZSwKbm9uLWV4Y2x1c2l2ZSBsaWNlbnNlOgoKKGEpIHVuZGVyIGludGVsbGVjdHVhbCBwcm9wZXJ0eSByaWdodHMgKG90aGVyIHRoYW4gcGF0ZW50IG9yIHRyYWRlbWFyaykKICAgIExpY2Vuc2FibGUgYnkgc3VjaCBDb250cmlidXRvciB0byB1c2UsIHJlcHJvZHVjZSwgbWFrZSBhdmFpbGFibGUsCiAgICBtb2RpZnksIGRpc3BsYXksIHBlcmZvcm0sIGRpc3RyaWJ1dGUsIGFuZCBvdGhlcndpc2UgZXhwbG9pdCBpdHMKICAgIENvbnRyaWJ1dGlvbnMsIGVpdGhlciBvbiBhbiB1bm1vZGlmaWVkIGJhc2lzLCB3aXRoIE1vZGlmaWNhdGlvbnMsIG9yCiAgICBhcyBwYXJ0IG9mIGEgTGFyZ2VyIFdvcms7IGFuZAoKKGIpIHVuZGVyIFBhdGVudCBDbGFpbXMgb2Ygc3VjaCBDb250cmlidXRvciB0byBtYWtlLCB1c2UsIHNlbGwsIG9mZmVyCiAgICBmb3Igc2FsZSwgaGF2ZSBtYWRlLCBpbXBvcnQsIGFuZCBvdGhlcndpc2UgdHJhbnNmZXIgZWl0aGVyIGl0cwogICAgQ29udHJpYnV0aW9ucyBvciBpdHMgQ29udHJpYnV0b3IgVmVyc2lvbi4KCjIuMi4gRWZmZWN0aXZlIERhdGUKClRoZSBsaWNlbnNlcyBncmFudGVkIGluIFNlY3Rpb24gMi4xIHdpdGggcmVzcGVjdCB0byBhbnkgQ29udHJpYnV0aW9uCmJlY29tZSBlZmZlY3RpdmUgZm9yIGVhY2ggQ29udHJpYnV0aW9uIG9uIHRoZSBkYXRlIHRoZSBDb250cmlidXRvciBmaXJzdApkaXN0cmlidXRlcyBzdWNoIENvbnRyaWJ1dGlvbi4KCjIuMy4gTGltaXRhdGlvbnMgb24gR3JhbnQgU2NvcGUKClRoZSBsaWNlbnNlcyBncmFudGVkIGluIHRoaXMgU2VjdGlvbiAyIGFyZSB0aGUgb25seSByaWdodHMgZ3JhbnRlZCB1bmRlcgp0aGlzIExpY2Vuc2UuIE5vIGFkZGl0aW9uYWwgcmlnaHRzIG9yIGxpY2Vuc2VzIHdpbGwgYmUgaW1wbGllZCBmcm9tIHRoZQpkaXN0cmlidXRpb24gb3IgbGljZW5zaW5nIG9mIENvdmVyZWQgU29mdHdhcmUgdW5kZXIgdGhpcyBMaWNlbnNlLgpOb3R3aXRoc3RhbmRpbmcgU2VjdGlvbiAyLjEoYikgYWJvdmUsIG5vIHBhdGVudCBsaWNlbnNlIGlzIGdyYW50ZWQgYnkgYQpDb250cmlidXRvcjoKCihhKSBmb3IgYW55IGNvZGUgdGhhdCBhIENvbnRyaWJ1dG9yIGhhcyByZW1vdmVkIGZyb20gQ292ZXJlZCBTb2Z0d2FyZTsKICAgIG9yCgooYikgZm9yIGluZnJpbmdlbWVudHMgY2F1c2VkIGJ5OiAoaSkgWW91ciBhbmQgYW55IG90aGVyIHRoaXJkIHBhcnR5J3MKICAgIG1vZGlmaWNhdGlvbnMgb2YgQ292ZXJlZCBTb2Z0d2FyZSwgb3IgKGlpKSB0aGUgY29tYmluYXRpb24gb2YgaXRzCiAgICBDb250cmlidXRpb25zIHdpdGggb3RoZXIgc29mdHdhcmUgKGV4Y2VwdCBhcyBwYXJ0IG9mIGl0cyBDb250cmlidXRvcgogICAgVmVyc2lvbik7IG9yCgooYykgdW5kZXIgUGF0ZW50IENsYWltcyBpbmZyaW5nZWQgYnkgQ292ZXJlZCBTb2Z0d2FyZSBpbiB0aGUgYWJzZW5jZSBvZgogICAgaXRzIENvbnRyaWJ1dGlvbnMuCgpUaGlzIExpY2Vuc2UgZG9lcyBub3QgZ3JhbnQgYW55IHJpZ2h0cyBpbiB0aGUgdHJhZGVtYXJrcywgc2VydmljZSBtYXJrcywKb3IgbG9nb3Mgb2YgYW55IENvbnRyaWJ1dG9yIChleGNlcHQgYXMgbWF5IGJlIG5lY2Vzc2FyeSB0byBjb21wbHkgd2l0aAp0aGUgbm90aWNlIHJlcXVpcmVtZW50cyBpbiBTZWN0aW9uIDMuNCkuCgoyLjQuIFN1YnNlcXVlbnQgTGljZW5zZXMKCk5vIENvbnRyaWJ1dG9yIG1ha2VzIGFkZGl0aW9uYWwgZ3JhbnRzIGFzIGEgcmVzdWx0IG9mIFlvdXIgY2hvaWNlIHRvCmRpc3RyaWJ1dGUgdGhlIENvdmVyZWQgU29mdHdhcmUgdW5kZXIgYSBzdWJzZXF1ZW50IHZlcnNpb24gb2YgdGhpcwpMaWNlbnNlIChzZWUgU2VjdGlvbiAxMC4yKSBvciB1bmRlciB0aGUgdGVybXMgb2YgYSBTZWNvbmRhcnkgTGljZW5zZSAoaWYKcGVybWl0dGVkIHVuZGVyIHRoZSB0ZXJtcyBvZiBTZWN0aW9uIDMuMykuCgoyLjUuIFJlcHJlc2VudGF0aW9uCgpFYWNoIENvbnRyaWJ1dG9yIHJlcHJlc2VudHMgdGhhdCB0aGUgQ29udHJpYnV0b3IgYmVsaWV2ZXMgaXRzCkNvbnRyaWJ1dGlvbnMgYXJlIGl0cyBvcmlnaW5hbCBjcmVhdGlvbihzKSBvciBpdCBoYXMgc3VmZmljaWVudCByaWdodHMKdG8gZ3JhbnQgdGhlIHJpZ2h0cyB0byBpdHMgQ29udHJpYnV0aW9ucyBjb252ZXllZCBieSB0aGlzIExpY2Vuc2UuCgoyLjYuIEZhaXIgVXNlCgpUaGlzIExpY2Vuc2UgaXMgbm90IGludGVuZGVkIHRvIGxpbWl0IGFueSByaWdodHMgWW91IGhhdmUgdW5kZXIKYXBwbGljYWJsZSBjb3B5cmlnaHQgZG9jdHJpbmVzIG9mIGZhaXIgdXNlLCBmYWlyIGRlYWxpbmcsIG9yIG90aGVyCmVxdWl2YWxlbnRzLgoKMi43LiBDb25kaXRpb25zCgpTZWN0aW9ucyAzLjEsIDMuMiwgMy4zLCBhbmQgMy40IGFyZSBjb25kaXRpb25zIG9mIHRoZSBsaWNlbnNlcyBncmFudGVkCmluIFNlY3Rpb24gMi4xLgoKMy4gUmVzcG9uc2liaWxpdGllcwotLS0tLS0tLS0tLS0tLS0tLS0tCgozLjEuIERpc3RyaWJ1dGlvbiBvZiBTb3VyY2UgRm9ybQoKQWxsIGRpc3RyaWJ1dGlvbiBvZiBDb3ZlcmVkIFNvZnR3YXJlIGluIFNvdXJjZSBDb2RlIEZvcm0sIGluY2x1ZGluZyBhbnkKTW9kaWZpY2F0aW9ucyB0aGF0IFlvdSBjcmVhdGUgb3IgdG8gd2hpY2ggWW91IGNvbnRyaWJ1dGUsIG11c3QgYmUgdW5kZXIKdGhlIHRlcm1zIG9mIHRoaXMgTGljZW5zZS4gWW91IG11c3QgaW5mb3JtIHJlY2lwaWVudHMgdGhhdCB0aGUgU291cmNlCkNvZGUgRm9ybSBvZiB0aGUgQ292ZXJlZCBTb2Z0d2FyZSBpcyBnb3Zlcm5lZCBieSB0aGUgdGVybXMgb2YgdGhpcwpMaWNlbnNlLCBhbmQgaG93IHRoZXkgY2FuIG9idGFpbiBhIGNvcHkgb2YgdGhpcyBMaWNlbnNlLiBZb3UgbWF5IG5vdAphdHRlbXB0IHRvIGFsdGVyIG9yIHJlc3RyaWN0IHRoZSByZWNpcGllbnRzJyByaWdodHMgaW4gdGhlIFNvdXJjZSBDb2RlCkZvcm0uCgozLjIuIERpc3RyaWJ1dGlvbiBvZiBFeGVjdXRhYmxlIEZvcm0KCklmIFlvdSBkaXN0cmlidXRlIENvdmVyZWQgU29mdHdhcmUgaW4gRXhlY3V0YWJsZSBGb3JtIHRoZW46CgooYSkgc3VjaCBDb3ZlcmVkIFNvZnR3YXJlIG11c3QgYWxzbyBiZSBtYWRlIGF2YWlsYWJsZSBpbiBTb3VyY2UgQ29kZQogICAgRm9ybSwgYXMgZGVzY3JpYmVkIGluIFNlY3Rpb24gMy4xLCBhbmQgWW91IG11c3QgaW5mb3JtIHJlY2lwaWVudHMgb2YKICAgIHRoZSBFeGVjdXRhYmxlIEZvcm0gaG93IHRoZXkgY2FuIG9idGFpbiBhIGNvcHkgb2Ygc3VjaCBTb3VyY2UgQ29kZQogICAgRm9ybSBieSByZWFzb25hYmxlIG1lYW5zIGluIGEgdGltZWx5IG1hbm5lciwgYXQgYSBjaGFyZ2Ugbm8gbW9yZQogICAgdGhhbiB0aGUgY29zdCBvZiBkaXN0cmlidXRpb24gdG8gdGhlIHJlY2lwaWVudDsgYW5kCgooYikgWW91IG1heSBkaXN0cmlidXRlIHN1Y2ggRXhlY3V0YWJsZSBGb3JtIHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGlzCiAgICBMaWNlbnNlLCBvciBzdWJsaWNlbnNlIGl0IHVuZGVyIGRpZmZlcmVudCB0ZXJtcywgcHJvdmlkZWQgdGhhdCB0aGUKICAgIGxpY2Vuc2UgZm9yIHRoZSBFeGVjdXRhYmxlIEZvcm0gZG9lcyBub3QgYXR0ZW1wdCB0byBsaW1pdCBvciBhbHRlcgogICAgdGhlIHJlY2lwaWVudHMnIHJpZ2h0cyBpbiB0aGUgU291cmNlIENvZGUgRm9ybSB1bmRlciB0aGlzIExpY2Vuc2UuCgozLjMuIERpc3RyaWJ1dGlvbiBvZiBhIExhcmdlciBXb3JrCgpZb3UgbWF5IGNyZWF0ZSBhbmQgZGlzdHJpYnV0ZSBhIExhcmdlciBXb3JrIHVuZGVyIHRlcm1zIG9mIFlvdXIgY2hvaWNlLApwcm92aWRlZCB0aGF0IFlvdSBhbHNvIGNvbXBseSB3aXRoIHRoZSByZXF1aXJlbWVudHMgb2YgdGhpcyBMaWNlbnNlIGZvcgp0aGUgQ292ZXJlZCBTb2Z0d2FyZS4gSWYgdGhlIExhcmdlciBXb3JrIGlzIGEgY29tYmluYXRpb24gb2YgQ292ZXJlZApTb2Z0d2FyZSB3aXRoIGEgd29yayBnb3Zlcm5lZCBieSBvbmUgb3IgbW9yZSBTZWNvbmRhcnkgTGljZW5zZXMsIGFuZCB0aGUKQ292ZXJlZCBTb2Z0d2FyZSBpcyBub3QgSW5jb21wYXRpYmxlIFdpdGggU2Vjb25kYXJ5IExpY2Vuc2VzLCB0aGlzCkxpY2Vuc2UgcGVybWl0cyBZb3UgdG8gYWRkaXRpb25hbGx5IGRpc3RyaWJ1dGUgc3VjaCBDb3ZlcmVkIFNvZnR3YXJlCnVuZGVyIHRoZSB0ZXJtcyBvZiBzdWNoIFNlY29uZGFyeSBMaWNlbnNlKHMpLCBzbyB0aGF0IHRoZSByZWNpcGllbnQgb2YKdGhlIExhcmdlciBXb3JrIG1heSwgYXQgdGhlaXIgb3B0aW9uLCBmdXJ0aGVyIGRpc3RyaWJ1dGUgdGhlIENvdmVyZWQKU29mdHdhcmUgdW5kZXIgdGhlIHRlcm1zIG9mIGVpdGhlciB0aGlzIExpY2Vuc2Ugb3Igc3VjaCBTZWNvbmRhcnkKTGljZW5zZShzKS4KCjMuNC4gTm90aWNlcwoKWW91IG1heSBub3QgcmVtb3ZlIG9yIGFsdGVyIHRoZSBzdWJzdGFuY2Ugb2YgYW55IGxpY2Vuc2Ugbm90aWNlcwooaW5jbHVkaW5nIGNvcHlyaWdodCBub3RpY2VzLCBwYXRlbnQgbm90aWNlcywgZGlzY2xhaW1lcnMgb2Ygd2FycmFudHksCm9yIGxpbWl0YXRpb25zIG9mIGxpYWJpbGl0eSkgY29udGFpbmVkIHdpdGhpbiB0aGUgU291cmNlIENvZGUgRm9ybSBvZgp0aGUgQ292ZXJlZCBTb2Z0d2FyZSwgZXhjZXB0IHRoYXQgWW91IG1heSBhbHRlciBhbnkgbGljZW5zZSBub3RpY2VzIHRvCnRoZSBleHRlbnQgcmVxdWlyZWQgdG8gcmVtZWR5IGtub3duIGZhY3R1YWwgaW5hY2N1cmFjaWVzLgoKMy41LiBBcHBsaWNhdGlvbiBvZiBBZGRpdGlvbmFsIFRlcm1zCgpZb3UgbWF5IGNob29zZSB0byBvZmZlciwgYW5kIHRvIGNoYXJnZSBhIGZlZSBmb3IsIHdhcnJhbnR5LCBzdXBwb3J0LAppbmRlbW5pdHkgb3IgbGlhYmlsaXR5IG9ibGlnYXRpb25zIHRvIG9uZSBvciBtb3JlIHJlY2lwaWVudHMgb2YgQ292ZXJlZApTb2Z0d2FyZS4gSG93ZXZlciwgWW91IG1heSBkbyBzbyBvbmx5IG9uIFlvdXIgb3duIGJlaGFsZiwgYW5kIG5vdCBvbgpiZWhhbGYgb2YgYW55IENvbnRyaWJ1dG9yLiBZb3UgbXVzdCBtYWtlIGl0IGFic29sdXRlbHkgY2xlYXIgdGhhdCBhbnkKc3VjaCB3YXJyYW50eSwgc3VwcG9ydCwgaW5kZW1uaXR5LCBvciBsaWFiaWxpdHkgb2JsaWdhdGlvbiBpcyBvZmZlcmVkIGJ5CllvdSBhbG9uZSwgYW5kIFlvdSBoZXJlYnkgYWdyZWUgdG8gaW5kZW1uaWZ5IGV2ZXJ5IENvbnRyaWJ1dG9yIGZvciBhbnkKbGlhYmlsaXR5IGluY3VycmVkIGJ5IHN1Y2ggQ29udHJpYnV0b3IgYXMgYSByZXN1bHQgb2Ygd2FycmFudHksIHN1cHBvcnQsCmluZGVtbml0eSBvciBsaWFiaWxpdHkgdGVybXMgWW91IG9mZmVyLiBZb3UgbWF5IGluY2x1ZGUgYWRkaXRpb25hbApkaXNjbGFpbWVycyBvZiB3YXJyYW50eSBhbmQgbGltaXRhdGlvbnMgb2YgbGlhYmlsaXR5IHNwZWNpZmljIHRvIGFueQpqdXJpc2RpY3Rpb24uCgo0LiBJbmFiaWxpdHkgdG8gQ29tcGx5IER1ZSB0byBTdGF0dXRlIG9yIFJlZ3VsYXRpb24KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCgpJZiBpdCBpcyBpbXBvc3NpYmxlIGZvciBZb3UgdG8gY29tcGx5IHdpdGggYW55IG9mIHRoZSB0ZXJtcyBvZiB0aGlzCkxpY2Vuc2Ugd2l0aCByZXNwZWN0IHRvIHNvbWUgb3IgYWxsIG9mIHRoZSBDb3ZlcmVkIFNvZnR3YXJlIGR1ZSB0bwpzdGF0dXRlLCBqdWRpY2lhbCBvcmRlciwgb3IgcmVndWxhdGlvbiB0aGVuIFlvdSBtdXN0OiAoYSkgY29tcGx5IHdpdGgKdGhlIHRlcm1zIG9mIHRoaXMgTGljZW5zZSB0byB0aGUgbWF4aW11bSBleHRlbnQgcG9zc2libGU7IGFuZCAoYikKZGVzY3JpYmUgdGhlIGxpbWl0YXRpb25zIGFuZCB0aGUgY29kZSB0aGV5IGFmZmVjdC4gU3VjaCBkZXNjcmlwdGlvbiBtdXN0CmJlIHBsYWNlZCBpbiBhIHRleHQgZmlsZSBpbmNsdWRlZCB3aXRoIGFsbCBkaXN0cmlidXRpb25zIG9mIHRoZSBDb3ZlcmVkClNvZnR3YXJlIHVuZGVyIHRoaXMgTGljZW5zZS4gRXhjZXB0IHRvIHRoZSBleHRlbnQgcHJvaGliaXRlZCBieSBzdGF0dXRlCm9yIHJlZ3VsYXRpb24sIHN1Y2ggZGVzY3JpcHRpb24gbXVzdCBiZSBzdWZmaWNpZW50bHkgZGV0YWlsZWQgZm9yIGEKcmVjaXBpZW50IG9mIG9yZGluYXJ5IHNraWxsIHRvIGJlIGFibGUgdG8gdW5kZXJzdGFuZCBpdC4KCjUuIFRlcm1pbmF0aW9uCi0tLS0tLS0tLS0tLS0tCgo1LjEuIFRoZSByaWdodHMgZ3JhbnRlZCB1bmRlciB0aGlzIExpY2Vuc2Ugd2lsbCB0ZXJtaW5hdGUgYXV0b21hdGljYWxseQppZiBZb3UgZmFpbCB0byBjb21wbHkgd2l0aCBhbnkgb2YgaXRzIHRlcm1zLiBIb3dldmVyLCBpZiBZb3UgYmVjb21lCmNvbXBsaWFudCwgdGhlbiB0aGUgcmlnaHRzIGdyYW50ZWQgdW5kZXIgdGhpcyBMaWNlbnNlIGZyb20gYSBwYXJ0aWN1bGFyCkNvbnRyaWJ1dG9yIGFyZSByZWluc3RhdGVkIChhKSBwcm92aXNpb25hbGx5LCB1bmxlc3MgYW5kIHVudGlsIHN1Y2gKQ29udHJpYnV0b3IgZXhwbGljaXRseSBhbmQgZmluYWxseSB0ZXJtaW5hdGVzIFlvdXIgZ3JhbnRzLCBhbmQgKGIpIG9uIGFuCm9uZ29pbmcgYmFzaXMsIGlmIHN1Y2ggQ29udHJpYnV0b3IgZmFpbHMgdG8gbm90aWZ5IFlvdSBvZiB0aGUKbm9uLWNvbXBsaWFuY2UgYnkgc29tZSByZWFzb25hYmxlIG1lYW5zIHByaW9yIHRvIDYwIGRheXMgYWZ0ZXIgWW91IGhhdmUKY29tZSBiYWNrIGludG8gY29tcGxpYW5jZS4gTW9yZW92ZXIsIFlvdXIgZ3JhbnRzIGZyb20gYSBwYXJ0aWN1bGFyCkNvbnRyaWJ1dG9yIGFyZSByZWluc3RhdGVkIG9uIGFuIG9uZ29pbmcgYmFzaXMgaWYgc3VjaCBDb250cmlidXRvcgpub3RpZmllcyBZb3Ugb2YgdGhlIG5vbi1jb21wbGlhbmNlIGJ5IHNvbWUgcmVhc29uYWJsZSBtZWFucywgdGhpcyBpcyB0aGUKZmlyc3QgdGltZSBZb3UgaGF2ZSByZWNlaXZlZCBub3RpY2Ugb2Ygbm9uLWNvbXBsaWFuY2Ugd2l0aCB0aGlzIExpY2Vuc2UKZnJvbSBzdWNoIENvbnRyaWJ1dG9yLCBhbmQgWW91IGJlY29tZSBjb21wbGlhbnQgcHJpb3IgdG8gMzAgZGF5cyBhZnRlcgpZb3VyIHJlY2VpcHQgb2YgdGhlIG5vdGljZS4KCjUuMi4gSWYgWW91IGluaXRpYXRlIGxpdGlnYXRpb24gYWdhaW5zdCBhbnkgZW50aXR5IGJ5IGFzc2VydGluZyBhIHBhdGVudAppbmZyaW5nZW1lbnQgY2xhaW0gKGV4Y2x1ZGluZyBkZWNsYXJhdG9yeSBqdWRnbWVudCBhY3Rpb25zLApjb3VudGVyLWNsYWltcywgYW5kIGNyb3NzLWNsYWltcykgYWxsZWdpbmcgdGhhdCBhIENvbnRyaWJ1dG9yIFZlcnNpb24KZGlyZWN0bHkgb3IgaW5kaXJlY3RseSBpbmZyaW5nZXMgYW55IHBhdGVudCwgdGhlbiB0aGUgcmlnaHRzIGdyYW50ZWQgdG8KWW91IGJ5IGFueSBhbmQgYWxsIENvbnRyaWJ1dG9ycyBmb3IgdGhlIENvdmVyZWQgU29mdHdhcmUgdW5kZXIgU2VjdGlvbgoyLjEgb2YgdGhpcyBMaWNlbnNlIHNoYWxsIHRlcm1pbmF0ZS4KCjUuMy4gSW4gdGhlIGV2ZW50IG9mIHRlcm1pbmF0aW9uIHVuZGVyIFNlY3Rpb25zIDUuMSBvciA1LjIgYWJvdmUsIGFsbAplbmQgdXNlciBsaWNlbnNlIGFncmVlbWVudHMgKGV4Y2x1ZGluZyBkaXN0cmlidXRvcnMgYW5kIHJlc2VsbGVycykgd2hpY2gKaGF2ZSBiZWVuIHZhbGlkbHkgZ3JhbnRlZCBieSBZb3Ugb3IgWW91ciBkaXN0cmlidXRvcnMgdW5kZXIgdGhpcyBMaWNlbnNlCnByaW9yIHRvIHRlcm1pbmF0aW9uIHNoYWxsIHN1cnZpdmUgdGVybWluYXRpb24uCgoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioKKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqCiogIDYuIERpc2NsYWltZXIgb2YgV2FycmFudHkgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKgoqICAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICoKKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqCiogIENvdmVyZWQgU29mdHdhcmUgaXMgcHJvdmlkZWQgdW5kZXIgdGhpcyBMaWNlbnNlIG9uIGFuICJhcyBpcyIgICAgICAgKgoqICBiYXNpcywgd2l0aG91dCB3YXJyYW50eSBvZiBhbnkga2luZCwgZWl0aGVyIGV4cHJlc3NlZCwgaW1wbGllZCwgb3IgICoKKiAgc3RhdHV0b3J5LCBpbmNsdWRpbmcsIHdpdGhvdXQgbGltaXRhdGlvbiwgd2FycmFudGllcyB0aGF0IHRoZSAgICAgICAqCiogIENvdmVyZWQgU29mdHdhcmUgaXMgZnJlZSBvZiBkZWZlY3RzLCBtZXJjaGFudGFibGUsIGZpdCBmb3IgYSAgICAgICAgKgoqICBwYXJ0aWN1bGFyIHB1cnBvc2Ugb3Igbm9uLWluZnJpbmdpbmcuIFRoZSBlbnRpcmUgcmlzayBhcyB0byB0aGUgICAgICoKKiAgcXVhbGl0eSBhbmQgcGVyZm9ybWFuY2Ugb2YgdGhlIENvdmVyZWQgU29mdHdhcmUgaXMgd2l0aCBZb3UuICAgICAgICAqCiogIFNob3VsZCBhbnkgQ292ZXJlZCBTb2Z0d2FyZSBwcm92ZSBkZWZlY3RpdmUgaW4gYW55IHJlc3BlY3QsIFlvdSAgICAgKgoqICAobm90IGFueSBDb250cmlidXRvcikgYXNzdW1lIHRoZSBjb3N0IG9mIGFueSBuZWNlc3Nhcnkgc2VydmljaW5nLCAgICoKKiAgcmVwYWlyLCBvciBjb3JyZWN0aW9uLiBUaGlzIGRpc2NsYWltZXIgb2Ygd2FycmFudHkgY29uc3RpdHV0ZXMgYW4gICAqCiogIGVzc2VudGlhbCBwYXJ0IG9mIHRoaXMgTGljZW5zZS4gTm8gdXNlIG9mIGFueSBDb3ZlcmVkIFNvZnR3YXJlIGlzICAgKgoqICBhdXRob3JpemVkIHVuZGVyIHRoaXMgTGljZW5zZSBleGNlcHQgdW5kZXIgdGhpcyBkaXNjbGFpbWVyLiAgICAgICAgICoKKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqCioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKgoKKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqCiogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKgoqICA3LiBMaW1pdGF0aW9uIG9mIExpYWJpbGl0eSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICoKKiAgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqCiogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKgoqICBVbmRlciBubyBjaXJjdW1zdGFuY2VzIGFuZCB1bmRlciBubyBsZWdhbCB0aGVvcnksIHdoZXRoZXIgdG9ydCAgICAgICoKKiAgKGluY2x1ZGluZyBuZWdsaWdlbmNlKSwgY29udHJhY3QsIG9yIG90aGVyd2lzZSwgc2hhbGwgYW55ICAgICAgICAgICAqCiogIENvbnRyaWJ1dG9yLCBvciBhbnlvbmUgd2hvIGRpc3RyaWJ1dGVzIENvdmVyZWQgU29mdHdhcmUgYXMgICAgICAgICAgKgoqICBwZXJtaXR0ZWQgYWJvdmUsIGJlIGxpYWJsZSB0byBZb3UgZm9yIGFueSBkaXJlY3QsIGluZGlyZWN0LCAgICAgICAgICoKKiAgc3BlY2lhbCwgaW5jaWRlbnRhbCwgb3IgY29uc2VxdWVudGlhbCBkYW1hZ2VzIG9mIGFueSBjaGFyYWN0ZXIgICAgICAqCiogIGluY2x1ZGluZywgd2l0aG91dCBsaW1pdGF0aW9uLCBkYW1hZ2VzIGZvciBsb3N0IHByb2ZpdHMsIGxvc3Mgb2YgICAgKgoqICBnb29kd2lsbCwgd29yayBzdG9wcGFnZSwgY29tcHV0ZXIgZmFpbHVyZSBvciBtYWxmdW5jdGlvbiwgb3IgYW55ICAgICoKKiAgYW5kIGFsbCBvdGhlciBjb21tZXJjaWFsIGRhbWFnZXMgb3IgbG9zc2VzLCBldmVuIGlmIHN1Y2ggcGFydHkgICAgICAqCiogIHNoYWxsIGhhdmUgYmVlbiBpbmZvcm1lZCBvZiB0aGUgcG9zc2liaWxpdHkgb2Ygc3VjaCBkYW1hZ2VzLiBUaGlzICAgKgoqICBsaW1pdGF0aW9uIG9mIGxpYWJpbGl0eSBzaGFsbCBub3QgYXBwbHkgdG8gbGlhYmlsaXR5IGZvciBkZWF0aCBvciAgICoKKiAgcGVyc29uYWwgaW5qdXJ5IHJlc3VsdGluZyBmcm9tIHN1Y2ggcGFydHkncyBuZWdsaWdlbmNlIHRvIHRoZSAgICAgICAqCiogIGV4dGVudCBhcHBsaWNhYmxlIGxhdyBwcm9oaWJpdHMgc3VjaCBsaW1pdGF0aW9uLiBTb21lICAgICAgICAgICAgICAgKgoqICBqdXJpc2RpY3Rpb25zIGRvIG5vdCBhbGxvdyB0aGUgZXhjbHVzaW9uIG9yIGxpbWl0YXRpb24gb2YgICAgICAgICAgICoKKiAgaW5jaWRlbnRhbCBvciBjb25zZXF1ZW50aWFsIGRhbWFnZXMsIHNvIHRoaXMgZXhjbHVzaW9uIGFuZCAgICAgICAgICAqCiogIGxpbWl0YXRpb24gbWF5IG5vdCBhcHBseSB0byBZb3UuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKgoqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICoKKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqCgo4LiBMaXRpZ2F0aW9uCi0tLS0tLS0tLS0tLS0KCkFueSBsaXRpZ2F0aW9uIHJlbGF0aW5nIHRvIHRoaXMgTGljZW5zZSBtYXkgYmUgYnJvdWdodCBvbmx5IGluIHRoZQpjb3VydHMgb2YgYSBqdXJpc2RpY3Rpb24gd2hlcmUgdGhlIGRlZmVuZGFudCBtYWludGFpbnMgaXRzIHByaW5jaXBhbApwbGFjZSBvZiBidXNpbmVzcyBhbmQgc3VjaCBsaXRpZ2F0aW9uIHNoYWxsIGJlIGdvdmVybmVkIGJ5IGxhd3Mgb2YgdGhhdApqdXJpc2RpY3Rpb24sIHdpdGhvdXQgcmVmZXJlbmNlIHRvIGl0cyBjb25mbGljdC1vZi1sYXcgcHJvdmlzaW9ucy4KTm90aGluZyBpbiB0aGlzIFNlY3Rpb24gc2hhbGwgcHJldmVudCBhIHBhcnR5J3MgYWJpbGl0eSB0byBicmluZwpjcm9zcy1jbGFpbXMgb3IgY291bnRlci1jbGFpbXMuCgo5LiBNaXNjZWxsYW5lb3VzCi0tLS0tLS0tLS0tLS0tLS0KClRoaXMgTGljZW5zZSByZXByZXNlbnRzIHRoZSBjb21wbGV0ZSBhZ3JlZW1lbnQgY29uY2VybmluZyB0aGUgc3ViamVjdAptYXR0ZXIgaGVyZW9mLiBJZiBhbnkgcHJvdmlzaW9uIG9mIHRoaXMgTGljZW5zZSBpcyBoZWxkIHRvIGJlCnVuZW5mb3JjZWFibGUsIHN1Y2ggcHJvdmlzaW9uIHNoYWxsIGJlIHJlZm9ybWVkIG9ubHkgdG8gdGhlIGV4dGVudApuZWNlc3NhcnkgdG8gbWFrZSBpdCBlbmZvcmNlYWJsZS4gQW55IGxhdyBvciByZWd1bGF0aW9uIHdoaWNoIHByb3ZpZGVzCnRoYXQgdGhlIGxhbmd1YWdlIG9mIGEgY29udHJhY3Qgc2hhbGwgYmUgY29uc3RydWVkIGFnYWluc3QgdGhlIGRyYWZ0ZXIKc2hhbGwgbm90IGJlIHVzZWQgdG8gY29uc3RydWUgdGhpcyBMaWNlbnNlIGFnYWluc3QgYSBDb250cmlidXRvci4KCjEwLiBWZXJzaW9ucyBvZiB0aGUgTGljZW5zZQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0KCjEwLjEuIE5ldyBWZXJzaW9ucwoKTW96aWxsYSBGb3VuZGF0aW9uIGlzIHRoZSBsaWNlbnNlIHN0ZXdhcmQuIEV4Y2VwdCBhcyBwcm92aWRlZCBpbiBTZWN0aW9uCjEwLjMsIG5vIG9uZSBvdGhlciB0aGFuIHRoZSBsaWNlbnNlIHN0ZXdhcmQgaGFzIHRoZSByaWdodCB0byBtb2RpZnkgb3IKcHVibGlzaCBuZXcgdmVyc2lvbnMgb2YgdGhpcyBMaWNlbnNlLiBFYWNoIHZlcnNpb24gd2lsbCBiZSBnaXZlbiBhCmRpc3Rpbmd1aXNoaW5nIHZlcnNpb24gbnVtYmVyLgoKMTAuMi4gRWZmZWN0IG9mIE5ldyBWZXJzaW9ucwoKWW91IG1heSBkaXN0cmlidXRlIHRoZSBDb3ZlcmVkIFNvZnR3YXJlIHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgdmVyc2lvbgpvZiB0aGUgTGljZW5zZSB1bmRlciB3aGljaCBZb3Ugb3JpZ2luYWxseSByZWNlaXZlZCB0aGUgQ292ZXJlZCBTb2Z0d2FyZSwKb3IgdW5kZXIgdGhlIHRlcm1zIG9mIGFueSBzdWJzZXF1ZW50IHZlcnNpb24gcHVibGlzaGVkIGJ5IHRoZSBsaWNlbnNlCnN0ZXdhcmQuCgoxMC4zLiBNb2RpZmllZCBWZXJzaW9ucwoKSWYgeW91IGNyZWF0ZSBzb2Z0d2FyZSBub3QgZ292ZXJuZWQgYnkgdGhpcyBMaWNlbnNlLCBhbmQgeW91IHdhbnQgdG8KY3JlYXRlIGEgbmV3IGxpY2Vuc2UgZm9yIHN1Y2ggc29mdHdhcmUsIHlvdSBtYXkgY3JlYXRlIGFuZCB1c2UgYQptb2RpZmllZCB2ZXJzaW9uIG9mIHRoaXMgTGljZW5zZSBpZiB5b3UgcmVuYW1lIHRoZSBsaWNlbnNlIGFuZCByZW1vdmUKYW55IHJlZmVyZW5jZXMgdG8gdGhlIG5hbWUgb2YgdGhlIGxpY2Vuc2Ugc3Rld2FyZCAoZXhjZXB0IHRvIG5vdGUgdGhhdApzdWNoIG1vZGlmaWVkIGxpY2Vuc2UgZGlmZmVycyBmcm9tIHRoaXMgTGljZW5zZSkuCgoxMC40LiBEaXN0cmlidXRpbmcgU291cmNlIENvZGUgRm9ybSB0aGF0IGlzIEluY29tcGF0aWJsZSBXaXRoIFNlY29uZGFyeQpMaWNlbnNlcwoKSWYgWW91IGNob29zZSB0byBkaXN0cmlidXRlIFNvdXJjZSBDb2RlIEZvcm0gdGhhdCBpcyBJbmNvbXBhdGlibGUgV2l0aApTZWNvbmRhcnkgTGljZW5zZXMgdW5kZXIgdGhlIHRlcm1zIG9mIHRoaXMgdmVyc2lvbiBvZiB0aGUgTGljZW5zZSwgdGhlCm5vdGljZSBkZXNjcmliZWQgaW4gRXhoaWJpdCBCIG9mIHRoaXMgTGljZW5zZSBtdXN0IGJlIGF0dGFjaGVkLgoKRXhoaWJpdCBBIC0gU291cmNlIENvZGUgRm9ybSBMaWNlbnNlIE5vdGljZQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCgogIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWMKICBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzCiAgZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHBzOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uCgpJZiBpdCBpcyBub3QgcG9zc2libGUgb3IgZGVzaXJhYmxlIHRvIHB1dCB0aGUgbm90aWNlIGluIGEgcGFydGljdWxhcgpmaWxlLCB0aGVuIFlvdSBtYXkgaW5jbHVkZSB0aGUgbm90aWNlIGluIGEgbG9jYXRpb24gKHN1Y2ggYXMgYSBMSUNFTlNFCmZpbGUgaW4gYSByZWxldmFudCBkaXJlY3RvcnkpIHdoZXJlIGEgcmVjaXBpZW50IHdvdWxkIGJlIGxpa2VseSB0byBsb29rCmZvciBzdWNoIGEgbm90aWNlLgoKWW91IG1heSBhZGQgYWRkaXRpb25hbCBhY2N1cmF0ZSBub3RpY2VzIG9mIGNvcHlyaWdodCBvd25lcnNoaXAuCgpFeGhpYml0IEIgLSAiSW5jb21wYXRpYmxlIFdpdGggU2Vjb25kYXJ5IExpY2Vuc2VzIiBOb3RpY2UKLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCgogIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyAiSW5jb21wYXRpYmxlIFdpdGggU2Vjb25kYXJ5IExpY2Vuc2VzIiwgYXMKICBkZWZpbmVkIGJ5IHRoZSBNb3ppbGxhIFB1YmxpYyBMaWNlbnNlLCB2LiAyLjAuCg=='
}

ensure_syncthing_license() {
    [ -s "$SYNCTHING_LICENSE" ] && return 0
    mkdir -p "$LICENSE_DIR" || return 1
    _esl_b64="$LICENSE_DIR/.Syncthing-LICENSE.b64.$$"
    _esl_txt="$LICENSE_DIR/.Syncthing-LICENSE.txt.$$"
    syncthing_license_b64 >"$_esl_b64" \
        || { rm -f "$_esl_b64" "$_esl_txt"; return 1; }
    decode_base64_file "$_esl_b64" "$_esl_txt" \
        || { rm -f "$_esl_b64" "$_esl_txt"; return 1; }
    _esl_hash="$(sha256_of "$_esl_txt")"
    if [ "$_esl_hash" != "3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04" ]; then
        rm -f "$_esl_b64" "$_esl_txt"; return 1
    fi
    chmod 644 "$_esl_txt" 2>/dev/null || true
    mv -f "$_esl_txt" "$SYNCTHING_LICENSE" \
        || { rm -f "$_esl_b64" "$_esl_txt"; return 1; }
    rm -f "$_esl_b64"
}

api_key() { [ -f "$STHOME/config.xml" ] && sed -n 's:.*<apikey>\(.*\)</apikey>.*:\1:p' "$STHOME/config.xml" | head -n1; }

st_dir_args() {
    if "$BIN" serve --help 2>&1 | grep -q -- '--data'; then
        echo "--config=$STHOME --data=$STDATA"
    else
        echo "--home=$STHOME"
    fi
}

rest() {
    _k="$(api_key)"
    [ -n "$_k" ] || { echo ""; return 1; }
    if have curl; then
        curl -fsS --connect-timeout 1 --max-time 2 -H "X-API-Key: $_k" "http://$GUI_ADDR$1" 2>/dev/null
    else
        wget -q -T 2 --header="X-API-Key: $_k" -O - "http://$GUI_ADDR$1" 2>/dev/null
    fi
}

rest_post() {
    _k="$(api_key)"
    [ -n "$_k" ] || { echo ""; return 1; }
    if have curl; then
        curl -fsS --connect-timeout 1 --max-time 2 -X POST -H "X-API-Key: $_k" "http://$GUI_ADDR$1" 2>/dev/null
    else
        wget -q -T 2 --post-data='' --header="X-API-Key: $_k" -O - "http://$GUI_ADDR$1" 2>/dev/null
    fi
}

proc_is_syncthing() {
    [ -r "$PROC_ROOT/$1/cmdline" ] || return 1
    _exe="$(tr '\0' '\n' <"$PROC_ROOT/$1/cmdline" 2>/dev/null | head -n1)"
    [ "$_exe" = "$BIN" ]
}

proc_parent_pid() {
    [ -r "$PROC_ROOT/$1/status" ] || { echo ""; return 1; }
    while IFS=' 	' read -r _pp_key _pp_value _pp_rest; do
        case "$_pp_key" in
            PPid:)
                case "$_pp_value" in ''|*[!0-9]*) echo "" ;; *) echo "$_pp_value" ;; esac
                return 0 ;;
        esac
    done <"$PROC_ROOT/$1/status"
    echo ""; return 1
}

pidfile_running_pid() {
    if [ -f "$PIDF" ]; then
        _p="$(cat "$PIDF" 2>/dev/null)"
        if [ -n "$_p" ] && [ -d "$PROC_ROOT/$_p" ] && proc_is_syncthing "$_p"; then
            echo "$_p"; return 0
        fi
    fi
    echo ""; return 1
}

write_pidfile_atomic() {
    _wpa_pid="$1"
    mkdir -p "$RUN_DIR" 2>/dev/null
    _wpa_tmp="$PIDF.recovered.$$"
    if printf '%s\n' "$_wpa_pid" >"$_wpa_tmp" 2>/dev/null; then
        mv -f "$_wpa_tmp" "$PIDF" 2>/dev/null || { rm -f "$_wpa_tmp"; return 1; }
    else
        return 1
    fi
}

preferred_worker_pid() {
    _pw_root="$1"
    # PIDF 已指向 worker 时，其 PPid 是同一受管二进制，
    # 无需任何扫描。
    _pw_parent="$(proc_parent_pid "$_pw_root")"
    if [ -n "$_pw_parent" ] && proc_is_syncthing "$_pw_parent"; then
        echo "$_pw_root"; return 0
    fi

    # 优先读 Linux children 列表。部分 Android 内核不暴露该文件，
    # 才在启停/看门狗的低频路径执行一次 /proc 扫描。
    _pw_children_file="$PROC_ROOT/$_pw_root/task/$_pw_root/children"
    _pw_children=""
    [ -r "$_pw_children_file" ] && IFS= read -r _pw_children <"$_pw_children_file" || true
    for _pw_child in $_pw_children; do
        case "$_pw_child" in ''|*[!0-9]*) continue ;; esac
        proc_is_syncthing "$_pw_child" || continue
        echo "$_pw_child"; return 0
    done
    for _pw_dir in "$PROC_ROOT"/[0-9]*; do
        [ -d "$_pw_dir" ] || continue
        _pw_pid="$(basename "$_pw_dir")"
        [ "$_pw_pid" = "$_pw_root" ] && continue
        proc_is_syncthing "$_pw_pid" || continue
        [ "$(proc_parent_pid "$_pw_pid")" = "$_pw_root" ] || continue
        echo "$_pw_pid"; return 0
    done
    return 1
}

running_pid() {
    _p="$(pidfile_running_pid)"
    if [ -n "$_p" ]; then
        _preferred="$(preferred_worker_pid "$_p")"
        if [ -n "$_preferred" ] && [ "$_preferred" != "$_p" ]; then
            write_pidfile_atomic "$_preferred" >/dev/null 2>&1 || true
            echo "$_preferred"; return 0
        fi
        echo "$_p"; return 0
    fi
    # PID 文件丢失或失效时才执行一次恢复扫描。status 的高频轮询
    # 不调用此分支；启动、停止和看门狗仍能找回旧进程，避免重复启动。
    _fallback_pid=""
    for _d in "$PROC_ROOT"/[0-9]*; do
        [ -d "$_d" ] || continue
        _q="$(basename "$_d")"
        if proc_is_syncthing "$_q"; then
            [ -n "$_fallback_pid" ] || _fallback_pid="$_q"
            _q_parent="$(proc_parent_pid "$_q")"
            if [ -n "$_q_parent" ] && proc_is_syncthing "$_q_parent"; then
                write_pidfile_atomic "$_q" >/dev/null 2>&1 || true
                echo "$_q"; return 0
            fi
        fi
    done
    if [ -n "$_fallback_pid" ]; then
        write_pidfile_atomic "$_fallback_pid" >/dev/null 2>&1 || true
        echo "$_fallback_pid"; return 0
    fi
    echo ""; return 1
}

proc_start_token() {
    _pst_pid="$1"
    case "$_pst_pid" in ''|*[!0-9]*) return 1 ;; esac
    [ -r "$PROC_ROOT/$_pst_pid/stat" ] || return 1
    awk '{ line=$0; sub(/^[0-9]+ \(.*\) /, "", line); split(line, f, " "); print f[20] }' \
        "$PROC_ROOT/$_pst_pid/stat" 2>/dev/null
}

apply_lock_owner_alive() {
    [ -f "$APPLY_LOCK/pid" ] || return 1
    _alo_pid="$(cat "$APPLY_LOCK/pid" 2>/dev/null)"
    case "$_alo_pid" in ''|*[!0-9]*) return 1 ;; esac
    kill -0 "$_alo_pid" 2>/dev/null || return 1

    # PID 可能被系统复用。新锁记录 /proc starttime，必须与当前进程一致；
    # 兼容旧锁时再核对 cmdline 是否确实包含本控制脚本。
    _alo_saved="$(cat "$APPLY_LOCK/start" 2>/dev/null)"
    _alo_current="$(proc_start_token "$_alo_pid" 2>/dev/null)"
    if [ -n "$_alo_saved" ] && [ -n "$_alo_current" ]; then
        [ "$_alo_saved" = "$_alo_current" ]
        return
    fi
    if [ -r "$PROC_ROOT/$_alo_pid/cmdline" ]; then
        tr '\000' '\n' <"$PROC_ROOT/$_alo_pid/cmdline" 2>/dev/null | \
            grep -Fxq "$ROOT/ufisync.sh"
        return
    fi
    # /proc 元数据偶发不可读时宁可保留 kill -0 已确认存活的锁，
    # 不在活跃升级中途冒险启动看门狗。
    return 0
}

apply_lock_active() {
    [ -d "$APPLY_LOCK" ] || return 1
    apply_lock_owner_alive && return 0
    _al_age=$(( $(date +%s) - $(date -r "$APPLY_LOCK" +%s 2>/dev/null || echo 0) ))
    if [ "$_al_age" -gt 300 ]; then
        rm -f "$APPLY_LOCK/pid" "$APPLY_LOCK/start" 2>/dev/null
        rmdir "$APPLY_LOCK" 2>/dev/null || return 0
        # 若上次事务在 stop 后异常终止，同时解除它留下的临时
        # 停用状态，让看门狗从原子切换前或切换后的完整 XML 恢复。
        log "已清理超时的配置应用锁"
        return 1
    fi
    return 0
}

acquire_apply_lock() {
    mkdir -p "$RUN_DIR" 2>/dev/null || return 1
    if mkdir "$APPLY_LOCK" 2>/dev/null; then
        printf '%s\n' "$$" >"$APPLY_LOCK/pid" 2>/dev/null || true
        proc_start_token "$$" >"$APPLY_LOCK/start" 2>/dev/null || rm -f "$APPLY_LOCK/start"
        return 0
    fi
    apply_lock_active && return 1
    mkdir "$APPLY_LOCK" 2>/dev/null || return 1
    printf '%s\n' "$$" >"$APPLY_LOCK/pid" 2>/dev/null || true
    proc_start_token "$$" >"$APPLY_LOCK/start" 2>/dev/null || rm -f "$APPLY_LOCK/start"
}

release_apply_lock() {
    rm -f "$APPLY_LOCK/pid" "$APPLY_LOCK/start" 2>/dev/null
    rmdir "$APPLY_LOCK" 2>/dev/null
}

managed_process_metrics() {
    _mp_root="${1:-}"
    [ -n "$_mp_root" ] || { echo "0 0 0"; return 0; }

    # Android/Linux 在 /proc/<pid>/task/<pid>/children 暴露直接子进程。
    # Syncthing 1.x 的监督器与工作进程因而可从 PID 文件定向遍历，
    # 无需在每次 UI 轮询时枚举整个 /proc。限制三层以防异常树无界扩张。
    _mp_pids=" $_mp_root "

    # `$!` 在不同 Syncthing/Android 组合上可能指向监督器或工作进程。
    # 先沿 PPid 向上寻找同一二进制，再从已知节点向下遍历 children；
    # 这样两种 PID 文件形态都能覆盖，仍无需全量扫描 /proc。
    _mp_ancestor="$_mp_root"
    _mp_up_depth=0
    while [ "$_mp_up_depth" -lt 3 ]; do
        _mp_parent="$(proc_parent_pid "$_mp_ancestor")"
        case "$_mp_parent" in ''|0|*[!0-9]*) break ;; esac
        case "$_mp_pids" in *" $_mp_parent "*) break ;; esac
        proc_is_syncthing "$_mp_parent" || break
        _mp_pids="$_mp_pids$_mp_parent "
        _mp_ancestor="$_mp_parent"
        _mp_up_depth=$((_mp_up_depth+1))
    done

    _mp_frontier="$_mp_pids"
    _mp_depth=0
    while [ "$_mp_depth" -lt 3 ] && [ -n "$_mp_frontier" ]; do
        _mp_next=""
        for _mp_parent in $_mp_frontier; do
            _mp_children=""
            _mp_children_file="$PROC_ROOT/$_mp_parent/task/$_mp_parent/children"
            [ -r "$_mp_children_file" ] && IFS= read -r _mp_children <"$_mp_children_file" || true
            for _mp_child in $_mp_children; do
                case "$_mp_child" in ''|*[!0-9]*) continue ;; esac
                case "$_mp_pids" in *" $_mp_child "*) continue ;; esac
                proc_is_syncthing "$_mp_child" || continue
                _mp_pids="$_mp_pids$_mp_child "
                _mp_next="$_mp_next $_mp_child"
            done
        done
        _mp_frontier="$_mp_next"
        _mp_depth=$((_mp_depth+1))
    done

    _mp_count=0; _mp_rss_kb=0; _mp_threads=0
    for _mp_pid in $_mp_pids; do
        _mp_dir="$PROC_ROOT/$_mp_pid"
        [ -r "$_mp_dir/status" ] || continue
        _mp_rss=0; _mp_thr=0
        # 一次直接读取同时取得 RSS 和线程数，不再为每个 PID 启动两个 awk。
        # Android /proc/status 在冒号后通常使用制表符；显式把空格和
        # tab 作为分隔符，并保留键名后的冒号。
        while IFS=' 	' read -r _mp_key _mp_value _mp_rest; do
            case "$_mp_key" in
                VmRSS:)  case "$_mp_value" in ''|*[!0-9]*) : ;; *) _mp_rss="$_mp_value" ;; esac ;;
                Threads:) case "$_mp_value" in ''|*[!0-9]*) : ;; *) _mp_thr="$_mp_value" ;; esac ;;
            esac
        done <"$_mp_dir/status"
        _mp_count=$((_mp_count+1))
        _mp_rss_kb=$((_mp_rss_kb+_mp_rss))
        _mp_threads=$((_mp_threads+_mp_thr))
    done
    echo "$_mp_count $((_mp_rss_kb/1024)) $_mp_threads"
}

rotate_log() {
    [ -f "$LOG" ] || return 0
    _kb=$(du -k "$LOG" 2>/dev/null | awk '{print $1}')
    [ -n "$_kb" ] && [ "$_kb" -gt "$LOG_MAX_KB" ] && mv -f "$LOG" "$LOG.1" 2>/dev/null
    return 0
}

set_install_state() {
    mkdir -p "$RUN_DIR" 2>/dev/null
    { echo "stage=$1"; echo "message=$2"; echo "at=$(date '+%H:%M:%S')"; } >"$INSTALL_STATE" 2>/dev/null
}

# install.lock 是目录锁：mkdir 是 Android/toybox 与普通 POSIX 文件系统上都
# 可依赖的原子操作。PID 用于判断任务是否仍存活，started_at 给卡死任务一个
# 明确上限；token 防止被判超时的旧任务退出时误删后来者的新锁。
install_lock_mtime() {
    stat -c %Y "$INSTALL_LOCK" 2>/dev/null \
        || stat -f %m "$INSTALL_LOCK" 2>/dev/null \
        || date -r "$INSTALL_LOCK" +%s 2>/dev/null \
        || echo ""
}

install_process_start() {
    _ips_pid="$1"
    [ -r "$PROC_ROOT/$_ips_pid/stat" ] || { echo ""; return 1; }
    _ips_start="$(awk '{ line=$0; sub(/^[0-9]+ \(.*\) /, "", line); split(line, f, " "); print f[20] }' \
        "$PROC_ROOT/$_ips_pid/stat" 2>/dev/null)"
    case "$_ips_start" in ''|*[!0-9]*) echo ""; return 1 ;; esac
    echo "$_ips_start"
}

install_pid_is_our_task() {
    _ipi_pid="$1"; _ipi_recorded_start="$2"
    [ -r "$PROC_ROOT/$_ipi_pid/cmdline" ] || return 1
    tr '\0' '\n' <"$PROC_ROOT/$_ipi_pid/cmdline" 2>/dev/null \
        | grep -Fxq "$ROOT/ufisync.sh" || return 1
    tr '\0' '\n' <"$PROC_ROOT/$_ipi_pid/cmdline" 2>/dev/null \
        | grep -Fxq 'install-run' || return 1
    _ipi_current_start="$(install_process_start "$_ipi_pid")"
    if [ -n "$_ipi_recorded_start" ] && [ -n "$_ipi_current_start" ]; then
        [ "$_ipi_recorded_start" = "$_ipi_current_start" ] || return 1
    fi
}

stop_expired_install_owner() {
    _seio_pid="$1"; _seio_recorded_start="$2"
    install_pid_is_our_task "$_seio_pid" "$_seio_recorded_start" || return 1
    _seio_children_file="$PROC_ROOT/$_seio_pid/task/$_seio_pid/children"
    _seio_children=""
    [ -r "$_seio_children_file" ] && IFS= read -r _seio_children <"$_seio_children_file" || true
    _seio_all="$_seio_pid"
    for _seio_child in $_seio_children; do
        case "$_seio_child" in ''|*[!0-9]*) continue ;; esac
        _seio_all="$_seio_all $_seio_child"
        kill -TERM "$_seio_child" 2>/dev/null || true
    done
    kill -TERM "$_seio_pid" 2>/dev/null || true
    _seio_wait=0
    _seio_alive=yes
    while [ "$_seio_alive" = yes ] && [ "$_seio_wait" -lt 5 ]; do
        _seio_alive=no
        for _seio_check in $_seio_all; do
            kill -0 "$_seio_check" 2>/dev/null && { _seio_alive=yes; break; }
        done
        [ "$_seio_alive" = no ] && break
        sleep 1
        _seio_wait=$((_seio_wait+1))
    done

    # 下载器可能忽略 TERM。此时不能只看 owner 已退出就抢锁，否则孤儿
    # curl/wget 仍会写同一个 TGZ；对刚才从 children 快照确认过的进程升级
    # 为 KILL，再等待所有 PID 消失。
    if [ "$_seio_alive" = yes ]; then
        for _seio_check in $_seio_all; do
            kill -0 "$_seio_check" 2>/dev/null && kill -9 "$_seio_check" 2>/dev/null || true
        done
        _seio_wait=0
        while [ "$_seio_wait" -lt 5 ]; do
            _seio_alive=no
            for _seio_check in $_seio_all; do
                kill -0 "$_seio_check" 2>/dev/null && { _seio_alive=yes; break; }
            done
            [ "$_seio_alive" = no ] && break
            sleep 1
            _seio_wait=$((_seio_wait+1))
        done
    fi
    [ "$_seio_alive" = no ]
}

install_lock_active() {
    [ -d "$INSTALL_LOCK" ] || return 1
    _ila_now="$(date +%s)"
    _ila_pid="$(cat "$INSTALL_LOCK/pid" 2>/dev/null || echo "")"
    _ila_started="$(cat "$INSTALL_LOCK/started_at" 2>/dev/null || echo "")"
    _ila_recorded_start="$(cat "$INSTALL_LOCK/proc_start" 2>/dev/null || echo "")"
    case "$_ila_now" in ''|*[!0-9]*) _ila_now=0 ;; esac
    case "$_ila_started" in
        ''|*[!0-9]*) _ila_started="$(install_lock_mtime)" ;;
    esac
    case "$_ila_started" in
        ''|*[!0-9]*) _ila_started="$_ila_now" ;;
    esac
    _ila_age=$((_ila_now-_ila_started))
    [ "$_ila_age" -lt 0 ] && _ila_age=0

    # mkdir 与三个元数据文件之间存在极短初始化窗口。十秒内的半成品锁
    # 先视为活跃，避免并发调用删除正在写入的目录；超过窗口即可恢复。
    case "$_ila_pid" in
        ''|*[!0-9]*) [ "$_ila_age" -le 10 ] && return 0; return 1 ;;
    esac
    kill -0 "$_ila_pid" 2>/dev/null || return 1
    _ila_current_start="$(install_process_start "$_ila_pid")"
    if [ -n "$_ila_recorded_start" ] && [ -n "$_ila_current_start" ] \
        && [ "$_ila_recorded_start" != "$_ila_current_start" ]; then
        [ "$_ila_age" -le 10 ] && return 0
        return 1
    fi
    [ "$_ila_age" -le "$INSTALL_LOCK_MAX_AGE" ] && return 0

    # 超时不能等同于“可直接删除”：旧任务若仍写同一 TGZ/BIN，会与后来者
    # 并发破坏安装。只对 cmdline 与 /proc starttime 都核验过的本插件安装任务
    # 发 TERM，并确认 PID 已退出；无法确认身份或退出时继续拒绝抢锁。
    stop_expired_install_owner "$_ila_pid" "$_ila_recorded_start" || return 0
    return 1
}

remove_stale_install_lock() {
    [ -d "$INSTALL_LOCK" ] || return 0
    install_lock_active && return 1
    rm -f "$INSTALL_LOCK/pid" "$INSTALL_LOCK/proc_start" "$INSTALL_LOCK/started_at" "$INSTALL_LOCK/token" \
        "$INSTALL_LOCK"/.pid.* "$INSTALL_LOCK"/.proc-start.* 2>/dev/null
    rmdir "$INSTALL_LOCK" 2>/dev/null
}

write_install_lock_pid() {
    _wilp_token="$1"; _wilp_pid="$2"
    [ -d "$INSTALL_LOCK" ] || return 1
    [ "$(cat "$INSTALL_LOCK/token" 2>/dev/null || echo "")" = "$_wilp_token" ] || return 1
    _wilp_start="$(install_process_start "$_wilp_pid")"
    _wilp_start_tmp="$INSTALL_LOCK/.proc-start.$$"
    _wilp_tmp="$INSTALL_LOCK/.pid.$$"
    printf '%s\n' "$_wilp_start" >"$_wilp_start_tmp" 2>/dev/null || return 1
    mv -f "$_wilp_start_tmp" "$INSTALL_LOCK/proc_start" 2>/dev/null \
        || { rm -f "$_wilp_start_tmp"; return 1; }
    printf '%s\n' "$_wilp_pid" >"$_wilp_tmp" 2>/dev/null || return 1
    mv -f "$_wilp_tmp" "$INSTALL_LOCK/pid" 2>/dev/null \
        || { rm -f "$_wilp_tmp"; return 1; }
}

acquire_install_lock() {
    mkdir -p "$RUN_DIR" 2>/dev/null || return 1
    _ail_attempt=0
    while [ "$_ail_attempt" -lt 2 ]; do
        _ail_attempt=$((_ail_attempt+1))
        if mkdir "$INSTALL_LOCK" 2>/dev/null; then
            _ail_now="$(date +%s)"
            _ail_token="$$.${_ail_now}"
            printf '%s\n' "$_ail_now" >"$INSTALL_LOCK/started_at" 2>/dev/null \
                && printf '%s\n' "$_ail_token" >"$INSTALL_LOCK/token" 2>/dev/null \
                && printf '%s\n' "$(install_process_start "$$")" >"$INSTALL_LOCK/proc_start" 2>/dev/null \
                && printf '%s\n' "$$" >"$INSTALL_LOCK/pid" 2>/dev/null \
                || {
                    rm -f "$INSTALL_LOCK/pid" "$INSTALL_LOCK/proc_start" "$INSTALL_LOCK/started_at" "$INSTALL_LOCK/token" 2>/dev/null
                    rmdir "$INSTALL_LOCK" 2>/dev/null
                    return 1
                }
            INSTALL_LOCK_HELD_TOKEN="$_ail_token"
            return 0
        fi
        install_lock_active && return 1
        remove_stale_install_lock || return 1
    done
    return 1
}

claim_install_lock() {
    _cil_token="$1"
    [ -n "$_cil_token" ] || return 1
    [ "$(cat "$INSTALL_LOCK/token" 2>/dev/null || echo "")" = "$_cil_token" ] || return 1
    INSTALL_LOCK_HELD_TOKEN="$_cil_token"
    write_install_lock_pid "$_cil_token" "$$"
}

release_install_lock() {
    _ril_token="${INSTALL_LOCK_HELD_TOKEN:-}"
    [ -n "$_ril_token" ] || return 0
    [ "$(cat "$INSTALL_LOCK/token" 2>/dev/null || echo "")" = "$_ril_token" ] || return 0
    rm -f "$INSTALL_LOCK/pid" "$INSTALL_LOCK/proc_start" "$INSTALL_LOCK/started_at" "$INSTALL_LOCK/token" \
        "$INSTALL_LOCK"/.pid.* "$INSTALL_LOCK"/.proc-start.* 2>/dev/null
    rmdir "$INSTALL_LOCK" 2>/dev/null || true
    INSTALL_LOCK_HELD_TOKEN=""
}

# =============================================================================
# 同步配置：仓库与可信设备
# =============================================================================
valid_folder_id() {
    case "$1" in .|..) return 1 ;; esac
    echo "$1" | grep -qE '^[A-Za-z0-9._-]{1,64}$'
}
valid_device_id() {
    # Syncthing 的新格式 ID 由 52 位 Base32 载荷 + 4 个 Luhn32 校验位组成。
    # 前端会把旧的 52 位格式补成新格式；设备端再独立验证，防止绕过 UI。
    echo "$1" | grep -qE '^([A-Z2-7]{56}|[A-Z2-7]{7}(-[A-Z2-7]{7}){7})$' || return 1
    echo "$1" | awk '
        BEGIN { alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" }
        {
            raw=$0; gsub(/-/, "", raw)
            if (length(raw) != 56) exit 1
            for (block=0; block<4; block++) {
                factor=1; sum=0
                for (j=1; j<=13; j++) {
                    cp=index(alphabet, substr(raw, block*14+j, 1))-1
                    if (cp < 0) exit 1
                    addend=factor*cp
                    factor=(factor==2 ? 1 : 2)
                    addend=int(addend/32)+(addend%32)
                    sum+=addend
                }
                expected=substr(alphabet, ((32-(sum%32))%32)+1, 1)
                if (substr(raw, block*14+14, 1) != expected) exit 1
            }
            exit 0
        }'
}

# 把旧版 52 位载荷 ID 补上 4 个 Luhn32 校验位，并把新旧格式
# 统一输出为 8 组 7 位。只用于读取历史 sync.conf；新的 set-config
# 仍要求前端提交带校验位的 56 位 ID。
canonical_device_id() {
    _cd_raw="$(echo "$1" | tr -d '-' | tr 'a-z' 'A-Z')"
    case "$_cd_raw" in
        *[!A-Z2-7]*) return 1 ;;
    esac
    if [ "${#_cd_raw}" -eq 56 ]; then
        valid_device_id "$_cd_raw" || return 1
        echo "$_cd_raw" | awk '{
            for (i=1; i<=56; i+=7) {
                if (i>1) printf "-"
                printf "%s", substr($0,i,7)
            }
            printf "\n"
        }'
        return 0
    fi
    [ "${#_cd_raw}" -eq 52 ] || return 1
    echo "$_cd_raw" | awk '
        BEGIN { alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" }
        {
            raw=$0; out=""
            for (block=0; block<4; block++) {
                data=substr(raw, block*13+1, 13)
                factor=1; sum=0
                for (j=1; j<=13; j++) {
                    cp=index(alphabet, substr(data,j,1))-1
                    if (cp < 0) exit 1
                    addend=factor*cp
                    factor=(factor==2 ? 1 : 2)
                    addend=int(addend/32)+(addend%32)
                    sum+=addend
                }
                check=substr(alphabet, ((32-(sum%32))%32)+1, 1)
                out=out data check
            }
            for (i=1; i<=56; i+=7) {
                if (i>1) printf "-"
                printf "%s", substr(out,i,7)
            }
            printf "\n"
        }'
}

# 名称允许中文和常见标点；对 XML 属性做实体转义而不是静默删字符。
sanitize_label() {
    printf '%s' "$1" | tr -d '\r\n|' | cut -c1-40 | \
        sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' \
            -e 's/"/\&quot;/g' -e "s/'/\&apos;/g"
}

ensure_conf() {
    [ -f "$CONF" ] || {
        : >"$CONF"
        log "已创建空同步配置，等待用户添加仓库与电脑"
    }
}

cmd_get_config() {
    ensure_conf
    echo "### UFISYNC-CONFIG"
    cat "$CONF"
    echo "### END"
}

# 从 $CONF_B64 读取前端分段写入的 base64 配置，校验后落盘
cmd_set_config() {
    [ -f "$CONF_B64" ] || die "没有待写入的配置"
    _tmp="$ROOT/sync.conf.new"
    decode_base64_file "$CONF_B64" "$_tmp" || true
    rm -f "$CONF_B64"
    [ -s "$_tmp" ] || { rm -f "$_tmp"; die "配置解码失败或为空"; }

    _nf=0; _nd=0; _seen_folders="|"; _seen_devices="|"
    while IFS='|' read -r _k _id _label || [ -n "${_k:-}" ]; do
        [ -z "${_k:-}" ] && continue
        case "$_k" in
            F)
                valid_folder_id "$_id" || { rm -f "$_tmp"; die "仓库 ID 非法：$_id"; }
                case "$_seen_folders" in
                    *"|$_id|"*) rm -f "$_tmp"; die "仓库 ID 重复：$_id" ;;
                esac
                _seen_folders="$_seen_folders$_id|"
                _nf=$((_nf+1)) ;;
            D)
                valid_device_id "$_id" || { rm -f "$_tmp"; die "设备 ID 非法：$_id"; }
                _canonical_input_id="$(canonical_device_id "$_id")" \
                    || { rm -f "$_tmp"; die "设备 ID 非法：$_id"; }
                case "$_seen_devices" in
                    *"|$_canonical_input_id|"*) rm -f "$_tmp"; die "设备 ID 重复：$_id" ;;
                esac
                _seen_devices="$_seen_devices$_canonical_input_id|"
                _nd=$((_nd+1)) ;;
            *) rm -f "$_tmp"; die "未知配置行：$_k" ;;
        esac
    done <"$_tmp"

    [ "$_nf" -ge 1 ] || { rm -f "$_tmp"; die "至少需要一个仓库"; }
    [ "$_nd" -ge 1 ] || { rm -f "$_tmp"; die "至少需要一台可信设备"; }
    [ "$_nf" -le "$MAX_FOLDERS" ] || { rm -f "$_tmp"; die "仓库数量超过 $MAX_FOLDERS"; }
    [ "$_nd" -le "$MAX_DEVICES" ] || { rm -f "$_tmp"; die "设备数量超过 $MAX_DEVICES"; }

    mkdir -p "$RUN_DIR" "$ROOT/backup" 2>/dev/null || { rm -f "$_tmp"; die "无法创建配置备份目录"; }
    # 第一次 set-config 时记住当前正在生效的产品配置。用户在应用前
    # 可以反复编辑，但回滚基线不应被后续草稿覆盖。
    if [ ! -f "$CONF_ROLLBACK_STATE" ]; then
        if [ -f "$CONF" ]; then
            cp -f "$CONF" "$CONF_ROLLBACK" || { rm -f "$_tmp"; die "无法保存原配置回滚点"; }
            echo present >"$CONF_ROLLBACK_STATE"
        else
            : >"$CONF_ROLLBACK"
            echo absent >"$CONF_ROLLBACK_STATE"
        fi
    fi

    [ -f "$CONF" ] && cp -f "$CONF" "$ROOT/backup/sync.conf.$(date +%Y%m%d%H%M%S)" 2>/dev/null
    mv -f "$_tmp" "$CONF" || die "无法写入同步配置"
    log "配置已保存：$_nf 个仓库，$_nd 台可信设备"
    log "需要执行「重新初始化配置」并重启同步内核才会生效"
}

restore_product_config() {
    [ -f "$CONF_ROLLBACK_STATE" ] || return 0
    _cr_state="$(cat "$CONF_ROLLBACK_STATE" 2>/dev/null)"
    case "$_cr_state" in
        present)
            [ -f "$CONF_ROLLBACK" ] || return 1
            cp -f "$CONF_ROLLBACK" "$CONF" || return 1
            ;;
        absent) rm -f "$CONF" ;;
        *) return 1 ;;
    esac
    rm -f "$CONF_ROLLBACK" "$CONF_ROLLBACK_STATE"
}

clear_product_config_rollback() {
    rm -f "$CONF_ROLLBACK" "$CONF_ROLLBACK_STATE"
}

# =============================================================================
# preflight
# =============================================================================
cmd_preflight() {
    echo "### UFISYNC-PREFLIGHT v$UFISYNC_VERSION"
    echo "abi=$(getprop ro.product.cpu.abi 2>/dev/null)"
    echo "model=$(getprop ro.product.model 2>/dev/null)"
    echo "android_release=$(getprop ro.build.version.release 2>/dev/null)"
    echo "android_sdk=$(getprop ro.build.version.sdk 2>/dev/null)"
    echo "kernel=$(uname -srm 2>/dev/null)"
    echo "is_root=$([ "$(id -u 2>/dev/null)" = "0" ] && echo yes || echo no)"
    echo "selinux=$(getenforce 2>/dev/null)"
    echo "libc=bionic"
    echo "mem_total_mb=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null)"
    echo "mem_avail_mb=$(avail_mem_mb)"
    echo "uptime_s=$(awk '{print int($1)}' /proc/uptime 2>/dev/null)"
    echo "free_data_mb=$(free_mb /data)"
    echo "free_sdcard_mb=$(free_mb /sdcard)"
    echo "target_version=$SYNCTHING_VERSION"
    echo "tls_cert_dir=${SSL_CERT_DIR:-none}"

    for _p in "$APP_FILES" /data/local/tmp /sdcard; do
        _t="$_p/.ufisync_exec_test"
        if mkdir -p "$_p" 2>/dev/null && printf '#!/system/bin/sh\necho ok\n' >"$_t" 2>/dev/null; then
            chmod 755 "$_t" 2>/dev/null
            if [ "$("$_t" 2>/dev/null)" = "ok" ]; then echo "exec:$_p=yes"; else echo "exec:$_p=no"; fi
            rm -f "$_t" 2>/dev/null
        else
            echo "exec:$_p=unwritable"
        fi
    done

    for _t in curl wget busybox tar sha256sum base64 netstat nohup stat; do
        echo "tool:$_t=$(have "$_t" && echo yes || echo no)"
    done

    for _port in 8384 22000 22001 21027; do
        if port_busy "$_port"; then echo "port:$_port=busy"; else echo "port:$_port=free"; fi
    done
    _sp="$(install_sync_port_choice)"
    echo "sync_port_choice=${_sp:-none}"

    echo "boot_script=$([ -f /sdcard/ufi_tools_boot.sh ] && echo present || echo missing)"
    echo "schedule_script=$([ -f /sdcard/ufi_tools_schedule.sh ] && echo present || echo missing)"
    echo "installed=$(is_elf "$BIN" && echo yes || echo no)"
    if [ -f "$BIN" ]; then
        _preflight_kernel_version="$(kernel_version_line)"
        echo "kernel_version=$_preflight_kernel_version"
        if is_elf "$BIN" && echo "$_preflight_kernel_version" | grep -qE 'syncthing +v[0-9]+\.[0-9]+'; then
            printf '%s\n' "$_preflight_kernel_version" >"$KERNEL_VERSION_CACHE" 2>/dev/null || true
            echo "kernel_ok=yes"
        else
            echo "kernel_ok=no"
        fi
    fi

    if have curl; then
        echo "net_discovery=$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' https://discovery.syncthing.net/v2/ 2>/dev/null)"
        echo "net_relays=$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' https://relays.syncthing.net/endpoint 2>/dev/null)"
        echo "net_github=$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' https://github.com 2>/dev/null)"
        echo "net_ghproxy=$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' https://ghproxy.net 2>/dev/null)"
    else
        echo "net_discovery=unknown"; echo "net_relays=unknown"
        echo "net_github=unknown"; echo "net_ghproxy=unknown"
    fi

    _ok=1; _why=""
    case "$(getprop ro.product.cpu.abi 2>/dev/null)" in
        arm64*|aarch64) : ;;
        *) _ok=0; _why="$_why CPU 非 arm64;" ;;
    esac
    [ "$(id -u 2>/dev/null)" = "0" ] || { _ok=0; _why="$_why 非 root;"; }
    _fs="$(free_mb /sdcard)"
    [ -n "$_fs" ] && [ "$_fs" -lt "$INSTALL_FREE_MB" ] && { _ok=0; _why="$_why 可写空间不足 ${INSTALL_FREE_MB}MB;"; }
    _am="$(avail_mem_mb)"
    [ -n "$_am" ] && [ "$_am" -lt "$MIN_AVAIL_MEM_MB" ] && { _ok=0; _why="$_why 可用内存不足 ${MIN_AVAIL_MEM_MB}MB;"; }
    have curl || have wget || have busybox || { _ok=0; _why="$_why 无 curl/wget;"; }
    have tar || { _ok=0; _why="$_why 无 tar;"; }
    have base64 || have busybox || { _ok=0; _why="$_why 无 base64;"; }
    [ -n "$_sp" ] || { _ok=0; _why="$_why 22000-22020 全部被占用;"; }
    case "$SYNCTHING_VERSION" in
        2.*) _ok=0; _why="$_why Syncthing 2.x 依赖 glibc，Android 无法执行，请用 1.30.0;" ;;
    esac
    echo "verdict=$([ "$_ok" = 1 ] && echo pass || echo fail)"
    echo "verdict_reason=${_why:-ok}"
    echo "### END"
}

# =============================================================================
# diag — 二进制无法执行时的详细诊断
# =============================================================================
cmd_diag() {
    echo "### UFISYNC-DIAG"
    echo "target_version=$SYNCTHING_VERSION"
    echo "tls_cert_dir=${SSL_CERT_DIR:-none}"
    echo "bin=$BIN"
    echo "bin_exists=$([ -f "$BIN" ] && echo yes || echo no)"
    if [ -f "$BIN" ]; then
        echo "bin_size=$(stat -c%s "$BIN" 2>/dev/null)"
        echo "bin_perm=$(ls -l "$BIN" 2>/dev/null)"
        echo "elf_magic=$(head -c 4 "$BIN" 2>/dev/null | od -An -tx1 | tr -d ' ')"
        if grep -aq 'ld-linux' "$BIN" 2>/dev/null; then
            echo "linkage=dynamic-glibc"
            echo "linkage_note=该二进制需要 glibc 动态链接器，Android 的 bionic libc 无法执行。请改用 Syncthing 1.30.0。"
        else
            echo "linkage=static"
        fi
        echo "--- 执行输出 ---"
        "$BIN" --version 2>&1 | head -n 5
        echo ""
    fi
    echo "tarball_bytes=$([ -f "$TGZ" ] && stat -c%s "$TGZ" 2>/dev/null || echo 0)"
    echo "exec_appfiles=$([ -x "$BIN" ] && echo yes || echo no)"
    echo "--- install.log ---"
    tail -n 30 "$INSTALL_LOG" 2>/dev/null
    echo ""
    echo "### END"
}

# =============================================================================
# install
# =============================================================================
cmd_install() {
    [ "$(id -u)" = "0" ] || die "需要 root 权限（UFI-TOOLS 高级功能）"
    mkdir -p "$RUN_DIR" "$LOG_DIR"
    if ! acquire_install_lock; then
        echo "已有安装任务在进行中"; return 0
    fi
    _install_token="$INSTALL_LOCK_HELD_TOKEN"
    : >"$INSTALL_LOG"
    set_install_state "preparing" "安装任务已启动"
    UFISYNC_INSTALL_LOCK_TOKEN="$_install_token" \
        nohup sh "$ROOT/ufisync.sh" install-run >>"$INSTALL_LOG" 2>&1 &
    _install_child=$!
    if ! write_install_lock_pid "$_install_token" "$_install_child"; then
        release_install_lock
        set_install_state "failed" "无法登记后台安装任务"
        die "无法登记后台安装任务"
    fi
    echo "install-started"
}

cmd_install_status() {
    echo "### UFISYNC-INSTALL"
    if [ -f "$INSTALL_STATE" ]; then cat "$INSTALL_STATE"; else echo "stage=idle"; echo "message="; fi
    echo "downloaded_bytes=$([ -f "$TGZ" ] && stat -c%s "$TGZ" 2>/dev/null || echo 0)"
    echo "installed=$([ -x "$BIN" ] && echo yes || echo no)"
    echo "--- install.log ---"
    tail -n 25 "$INSTALL_LOG" 2>/dev/null
    echo ""
    echo "### END"
}

cmd_install_run() {
    if [ -n "${UFISYNC_INSTALL_LOCK_TOKEN:-}" ]; then
        claim_install_lock "$UFISYNC_INSTALL_LOCK_TOKEN" \
            || { set_install_state "failed" "后台安装锁所有权已失效，请重试"; return 1; }
    else
        acquire_install_lock \
            || { echo "已有安装任务在进行中"; return 1; }
    fi
    trap 'release_install_lock' 0
    trap 'set_install_state "failed" "安装任务被信号中断"; release_install_lock; trap - 0 1 2 15; exit 1' 1 2 15
    cmd_install_run_locked
}

cmd_install_run_locked() {
    case "$(getprop ro.product.cpu.abi 2>/dev/null)" in
        arm64*|aarch64) : ;;
        *) set_install_state "failed" "CPU 架构不是 arm64"; exit 1 ;;
    esac
    case "$SYNCTHING_VERSION" in
        2.*) set_install_state "failed" "Syncthing 2.x 官方 linux-arm64 依赖 glibc，Android 无法执行。请安装 1.30.0。"; exit 1 ;;
    esac
    _trusted_hash="$(trusted_kernel_sha256 "$SYNCTHING_VERSION")"
    if [ -z "$_trusted_hash" ]; then
        mkdir -p "$RUN_DIR" "$LOG_DIR" 2>/dev/null
        set_install_state "failed" "版本 $SYNCTHING_VERSION 未纳入可信哈希白名单，拒绝下载"
        log "安装已拒绝：只能安装经本版插件预先验证的 Syncthing 1.30.0"
        exit 1
    fi

    _fs="$(free_mb /sdcard)"
    if [ -n "$_fs" ] && [ "$_fs" -lt "$INSTALL_FREE_MB" ]; then
        set_install_state "failed" "可写空间 ${_fs}MB < ${INSTALL_FREE_MB}MB"; exit 1
    fi

    set_install_state "preparing" "创建目录"
    mkdir -p "$BIN_DIR" "$STHOME" "$RUN_DIR" "$LOG_DIR" "$ROOT/backup" \
        || { set_install_state "failed" "无法创建插件目录"; exit 1; }
    ensure_conf
    make_folder_dirs

    SYNC_PORT="$(install_sync_port_choice)"
    [ -n "$SYNC_PORT" ] || { set_install_state "failed" "找不到可用的同步端口"; exit 1; }
    log "同步端口选定：$SYNC_PORT"

    _fd="$(free_mb /data)"
    if [ -n "$_fd" ] && [ "$_fd" -lt 1024 ]; then STDATA="$(dirname "$DATA_ROOT")/db"; else STDATA="$STDATA_DEFAULT"; fi
    mkdir -p "$STDATA" || { set_install_state "failed" "无法创建数据库目录"; exit 1; }

    # 上一轮可能装进了错误的文件（例如 tarball 里的 BSD rc 脚本），先清掉
    if [ -f "$BIN" ] && ! is_elf "$BIN"; then
        log "检测到 $BIN 不是 ELF 二进制（很可能是上一轮装错的脚本），已删除"
        rm -f "$BIN" "$KERNEL_VERSION_CACHE"
    fi

    if kernel_ok && kernel_version_line | grep -q "v$SYNCTHING_VERSION"; then
        log "同步内核 v$SYNCTHING_VERSION 已存在，跳过下载"
    else
        _name="syncthing-linux-arm64-v$SYNCTHING_VERSION"
        # 已有可用的 tarball 就复用（上次失败时特意保留）
        if [ -f "$TGZ" ] && [ "$(stat -c%s "$TGZ" 2>/dev/null || echo 0)" -ge 5000000 ]; then
            log "复用已下载的安装包"
        elif ! fetch_release "v$SYNCTHING_VERSION/$_name.tar.gz" "$TGZ" 5000000; then
            set_install_state "failed" "所有下载源都失败。可手动把 $_name.tar.gz 放到 $TGZ 后重试安装"
            exit 1
        fi

        set_install_state "verifying" "校验 SHA256"
        _actual="$(sha256_of "$TGZ")"
        if ! echo "$_actual" | grep -qE '^[0-9A-Fa-f]{64}$'; then
            log "安装已拒绝：设备缺少可用的 SHA256 校验工具"
            set_install_state "failed" "无法计算安装包 SHA256，未进行解包"
            exit 1
        fi
        _actual="$(echo "$_actual" | tr 'A-F' 'a-f')"
        if [ "$_trusted_hash" != "$_actual" ]; then
            rm -f "$TGZ"
            set_install_state "failed" "SHA256 校验失败，已丢弃下载文件"; exit 1
        fi
        log "SHA256 校验通过"

        set_install_state "unpacking" "解包"
        rm -rf "$ROOT/unpack"; mkdir -p "$ROOT/unpack"
        tar -xzf "$TGZ" -C "$ROOT/unpack" || { set_install_state "failed" "解包失败"; exit 1; }

        if ! preserve_syncthing_license "$ROOT/unpack"; then
            set_install_state "failed" "发布包缺少 Syncthing LICENSE，已拒绝安装"
            exit 1
        fi

        # 按 ELF 魔数 + 体积挑出真正的二进制，别抓到 etc/freebsd-rc/syncthing
        _src="$(find_kernel_binary "$ROOT/unpack")"
        if [ -z "$_src" ]; then
            log "解包内容里没找到 ELF 格式的 syncthing。同名文件清单："
            find "$ROOT/unpack" -name syncthing -exec ls -l {} \; 2>/dev/null | while IFS= read -r _l; do log "  $_l"; done
            set_install_state "failed" "解包结果里没有可执行的 syncthing 二进制"
            exit 1
        fi
        log "选中二进制：${_src}（$(stat -c%s "$_src" 2>/dev/null) 字节）"

        if ! stop_service >/dev/null 2>&1; then
            set_install_state "failed" "无法停止现有同步内核，未替换程序文件"
            log "FATAL: 安装中止：无法停止现有同步内核，旧内核保持不变"
            exit 1
        fi
        cp -f "$_src" "$BIN" || { set_install_state "failed" "无法写入 $BIN"; exit 1; }
        chmod 755 "$BIN"

        # 验证：必须在删掉 tarball 之前做，且要把真实错误留下来
        set_install_state "verifying" "验证二进制可执行"
        _vout="$("$BIN" --version 2>&1)"
        if ! echo "$_vout" | grep -qE 'syncthing +v[0-9]+\.[0-9]+'; then
            log "二进制验证失败。执行输出："
            log "$_vout"
            log "文件大小：$(stat -c%s "$BIN" 2>/dev/null) 字节"
            log "ELF 魔数：$(head -c 4 "$BIN" 2>/dev/null | od -An -tx1 | tr -d ' ')"
            if grep -aq 'ld-linux' "$BIN" 2>/dev/null; then
                log "诊断：该二进制动态链接 glibc，Android 的 bionic libc 无法执行"
                set_install_state "failed" "二进制依赖 glibc，Android 跑不了。请安装 1.30.0（纯 Go 静态构建）。"
            else
                set_install_state "failed" "二进制无法执行：$(echo "$_vout" | head -n1)"
            fi
            log "安装包已保留在 $TGZ，重试时不必重新下载"
            exit 1
        fi
        rm -rf "$ROOT/unpack" "$TGZ"
        log "同步内核安装完成：$(echo "$_vout" | head -n1)"
    fi

    # 2.3.0 及更早版本可能已安装内核但未持久保留发布包 LICENSE。
    # 使用脚本内嵌的固定上游副本补齐；已有文件绝不覆盖。
    if ! ensure_syncthing_license; then
        set_install_state "failed" "无法写入 Syncthing MPL-2.0 LICENSE"
        exit 1
    fi

    cache_kernel_version || { set_install_state "failed" "无法缓存同步内核版本"; exit 1; }

    {
        echo "DATA_ROOT=$DATA_ROOT"
        echo "STDATA=$STDATA"
        echo "SYNC_PORT=$SYNC_PORT"
        echo "SYNCTHING_VERSION=$SYNCTHING_VERSION"
        echo "INSTALLED_AT=$(date '+%Y-%m-%d %H:%M:%S')"
        echo "UFISYNC_VERSION=$UFISYNC_VERSION"
    } >"$STATE"

    set_install_state "hooks" "挂钩开机脚本与看门狗"
    install_hooks
    set_install_state "done" "安装完成（同步端口 ${SYNC_PORT}）"
    log "install 完成"
}

install_hooks() {
    _boot="/sdcard/ufi_tools_boot.sh"
    _sched="/sdcard/ufi_tools_schedule.sh"
    _mark="# >>> ufisync >>>"
    for _f in "$_boot" "$_sched"; do
        [ -f "$_f" ] || { printf '#!/system/bin/sh\n' >"$_f"; chmod 755 "$_f"; }
        [ -f "$ROOT/backup/$(basename "$_f").orig" ] || cp -f "$_f" "$ROOT/backup/$(basename "$_f").orig" 2>/dev/null
        if grep -q "$_mark" "$_f" 2>/dev/null; then
            log "$(basename "$_f") 已挂钩，跳过"
        else
            {
                echo ""
                echo "$_mark"
                if [ "$_f" = "$_boot" ]; then
                    echo "nohup sh $ROOT/ufisync.sh boot >/dev/null 2>&1 &"
                else
                    echo "sh $ROOT/ufisync.sh watchdog >/dev/null 2>&1"
                fi
                echo "# <<< ufisync <<<"
            } >>"$_f"
            log "已挂钩 $(basename "$_f")"
        fi
    done
}

# =============================================================================
# init — 按 sync.conf 生成 config.xml
# =============================================================================
ensure_device_identity() {
    if [ ! -f "$STHOME/cert.pem" ]; then
        log "生成设备证书与初始配置"
        if "$BIN" serve --help 2>&1 | grep -q -- '--data'; then
            "$BIN" generate --config="$STHOME" --no-default-folder >/dev/null 2>&1 || return 1
        else
            "$BIN" generate --home="$STHOME" --no-default-folder >/dev/null 2>&1 || return 1
        fi
    else
        log "已存在设备证书，保留现有身份"
    fi
    return 0
}

cmd_init() {
    ensure_conf
    [ -s "$CONF" ] || die "配置尚未完成：至少添加一个 Obsidian 笔记库和一台电脑"
    [ -x "$BIN" ] || die "同步内核未安装，请先执行 install"
    mkdir -p "$STHOME" "$RUN_DIR" "$ROOT/backup"

    acquire_apply_lock || die "另一项配置/维护事务正在进行"
    trap 'release_apply_lock' 0
    trap 'release_apply_lock; exit 1' 1 2 15

    ensure_device_identity || die "generate 失败"

    # 保留已有 apikey，避免每次 init 都换
    _key="$(api_key)"
    if [ -z "$_key" ]; then
        _key="$(head -c 24 /dev/urandom 2>/dev/null | od -An -tx1 | tr -d ' \n')"
        [ -n "$_key" ] || _key="$(date +%s%N)$$"
    fi
    make_folder_dirs
    _pending="$RUN_DIR/config.xml.pending.$$"
    if ! prepare_config_candidate "$_key" "$_pending"; then
        rm -f "$_pending"
        die "生成的托管配置验证失败"
    fi
    [ -f "$STHOME/config.xml" ] && cp -f "$STHOME/config.xml" "$ROOT/backup/config.xml.$(date +%Y%m%d%H%M%S)"
    mv -f "$_pending" "$STHOME/config.xml" || { rm -f "$_pending"; die "无法切换托管配置"; }
    write_stignore
    clear_product_config_rollback
    release_apply_lock
    trap - 0 1 2 15
    log "已按当前配置写入 config.xml（GUI 仅绑定 $GUI_ADDR，同步端口 $SYNC_PORT）"
    log "init 完成"
}

# 面向普通用户的一次性应用入口。配置内容已由 set-config 完成严格校验；这里把
# 原先需要手工依次执行的停止、初始化和启动收拢为一个固定动作。
cmd_apply_config() {
    [ -x "$BIN" ] || die "同步内核未安装，请先执行安装"
    [ -s "$CONF" ] || die "配置尚未完成：至少添加一个 Obsidian 仓库和一台电脑"

    mkdir -p "$STHOME" "$RUN_DIR" "$ROOT/backup" || die "无法创建配置事务目录"
    acquire_apply_lock || die "另一次配置应用正在进行"
    trap 'release_apply_lock' 0
    trap 'release_apply_lock; exit 1' 1 2 15
    _old_xml="$RUN_DIR/config.xml.rollback.$$"
    _pending="$RUN_DIR/config.xml.pending.$$"
    _old_xml_state=absent
    if [ -f "$STHOME/config.xml" ]; then
        cp -f "$STHOME/config.xml" "$_old_xml" || die "无法保存原 config.xml 回滚点"
        _old_xml_state=present
    fi
    _was_running="$(running_pid)"

    # 先在旧进程仍运行时生成并校验候选 XML，只把真正的停机窗口留给原子切换。
    if ! ensure_device_identity; then
        [ "$_old_xml_state" = present ] && cp -f "$_old_xml" "$STHOME/config.xml"
        [ "$_old_xml_state" = absent ] && rm -f "$STHOME/config.xml"
        restore_product_config >/dev/null 2>&1 || true
        rm -f "$_old_xml" "$_pending"
        log "FATAL: 应用配置失败（生成设备身份未完成）"
        return 1
    fi
    _key="$(api_key)"
    [ -n "$_key" ] || _key="$(head -c 24 /dev/urandom 2>/dev/null | od -An -tx1 | tr -d ' \n')"
    [ -n "$_key" ] || _key="$(date +%s)$$"
    make_folder_dirs
    if ! prepare_config_candidate "$_key" "$_pending"; then
        [ "$_old_xml_state" = present ] && cp -f "$_old_xml" "$STHOME/config.xml"
        [ "$_old_xml_state" = absent ] && rm -f "$STHOME/config.xml"
        restore_product_config >/dev/null 2>&1 || true
        rm -f "$_old_xml" "$_pending"
        log "FATAL: 应用配置失败（候选 XML 验证未通过）"
        return 1
    fi

    if ! UFISYNC_APPLY_CHILD=1 UFISYNC_TRANSIENT_STOP=1 sh "$ROOT/ufisync.sh" stop; then
        if [ "$_old_xml_state" = present ]; then
            cp -f "$_old_xml" "$STHOME/config.xml" || log "FATAL: 无法恢复原 config.xml"
        else
            rm -f "$STHOME/config.xml"
        fi
        restore_product_config >/dev/null 2>&1 || true
        # stop 可能在已经结束进程后才返回错误；start 本身幂等，
        # 因此对原本运行的服务总是尝试恢复，不会留下停机状态。
        if [ -n "$_was_running" ] && ! UFISYNC_APPLY_CHILD=1 sh "$ROOT/ufisync.sh" start >/dev/null 2>&1; then
            log "FATAL: 停止原同步内核失败，且原服务恢复启动失败"
        fi
        rm -f "$_old_xml" "$_pending"
        log "FATAL: 应用配置失败（无法停止原同步内核）"
        return 1
    fi
    if ! mv -f "$_pending" "$STHOME/config.xml"; then
        restore_product_config >/dev/null 2>&1 || true
        [ -n "$_was_running" ] && UFISYNC_APPLY_CHILD=1 sh "$ROOT/ufisync.sh" start >/dev/null 2>&1 || true
        rm -f "$_old_xml" "$_pending"
        log "FATAL: 应用配置失败（无法切换托管配置）"
        return 1
    fi
    write_stignore
    if ! UFISYNC_APPLY_CHILD=1 sh "$ROOT/ufisync.sh" start; then
        # 先清理新配置可能留下的半启动进程，再恢复两层配置。
        UFISYNC_APPLY_CHILD=1 UFISYNC_TRANSIENT_STOP=1 sh "$ROOT/ufisync.sh" stop >/dev/null 2>&1 || true
        if [ "$_old_xml_state" = present ]; then
            cp -f "$_old_xml" "$STHOME/config.xml" || log "FATAL: 无法恢复原 config.xml"
        else
            rm -f "$STHOME/config.xml"
        fi
        restore_product_config || log "FATAL: 无法恢复原产品配置"
        _restart_ok=yes
        if [ -n "$_was_running" ] && ! UFISYNC_APPLY_CHILD=1 sh "$ROOT/ufisync.sh" start; then
            _restart_ok=no
            log "FATAL: 原配置已恢复，但原同步内核重新启动失败"
        fi
        rm -f "$_old_xml" "$_pending"
        [ "$_restart_ok" = yes ] \
            && log "FATAL: 新配置启动失败，已回滚并恢复原服务" \
            || log "FATAL: 新配置启动失败，回滚后需手动启动原服务"
        return 1
    fi
    clear_product_config_rollback
    [ "$_old_xml_state" = present ] && cp -f "$_old_xml" "$ROOT/backup/config.xml.$(date +%Y%m%d%H%M%S)" 2>/dev/null
    rm -f "$_old_xml" "$_pending"
    log "配置已应用并启动"
}

make_folder_dirs() {
    ensure_conf
    while IFS='|' read -r _k _id _label || [ -n "${_k:-}" ]; do
        [ "${_k:-}" = "F" ] || continue
        valid_folder_id "$_id" || continue
        mkdir -p "$DATA_ROOT/$_id" 2>/dev/null
    done <"$CONF"
}

write_stignore() {
    while IFS='|' read -r _k _id _label || [ -n "${_k:-}" ]; do
        [ "${_k:-}" = "F" ] || continue
        valid_folder_id "$_id" || continue
        cat >"$DATA_ROOT/$_id/.stignore" <<'IGN'
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.git
.git/**
.DS_Store
Thumbs.db
desktop.ini
IGN
    done <"$CONF"
}

write_config() {
    _apikey="$1"
    _out="${2:-$STHOME/config.xml}"
    {
        echo '<configuration version="37">'
        echo '    <!-- ufisync-managed: 由 device 同步插件生成，请勿手工编辑 -->'
    } >"$_out"

    while IFS='|' read -r _k _id _label || [ -n "${_k:-}" ]; do
        [ "${_k:-}" = "F" ] || continue
        valid_folder_id "$_id" || continue
        _lbl="$(sanitize_label "${_label:-$_id}")"
        cat >>"$_out" <<FOLDER
    <folder id="$_id" label="$_lbl" path="$DATA_ROOT/$_id" type="receiveonly" rescanIntervalS="3600" fsWatcherEnabled="false" ignorePerms="true" autoNormalize="true">
FOLDER
        while IFS='|' read -r _k2 _id2 _l2 || [ -n "${_k2:-}" ]; do
            [ "${_k2:-}" = "D" ] || continue
            _canonical_id2="$(canonical_device_id "$_id2")" || continue
            echo "        <device id=\"$_canonical_id2\"></device>" >>"$_out"
        done <"$CONF"
        cat >>"$_out" <<FEND
        <minDiskFree unit="MB">$MIN_FREE_MB</minDiskFree>
        <versioning></versioning>
        <copiers>1</copiers>
        <pullerMaxPendingKiB>16384</pullerMaxPendingKiB>
        <hashers>1</hashers>
        <scanProgressIntervalS>-1</scanProgressIntervalS>
        <weakHashThresholdPct>101</weakHashThresholdPct>
        <maxConflicts>10</maxConflicts>
        <maxConcurrentWrites>2</maxConcurrentWrites>
    </folder>
FEND
    done <"$CONF"

    while IFS='|' read -r _k _id _label || [ -n "${_k:-}" ]; do
        [ "${_k:-}" = "D" ] || continue
        _canonical_id="$(canonical_device_id "$_id")" || continue
        _lbl="$(sanitize_label "${_label:-$_id}")"
        cat >>"$_out" <<DEVICE
    <device id="$_canonical_id" name="$_lbl" compression="metadata" introducer="false" autoAcceptFolders="false">
        <address>dynamic</address>
        <numConnections>1</numConnections>
    </device>
DEVICE
    done <"$CONF"

    cat >>"$_out" <<TAIL
    <gui enabled="true" tls="false" debugging="false">
        <address>$GUI_ADDR</address>
        <apikey>$_apikey</apikey>
        <theme>default</theme>
    </gui>
    <options>
        <listenAddress>tcp://0.0.0.0:$SYNC_PORT</listenAddress>
        <listenAddress>quic://0.0.0.0:$SYNC_PORT</listenAddress>
        <listenAddress>dynamic+https://relays.syncthing.net/endpoint</listenAddress>
        <globalAnnounceEnabled>true</globalAnnounceEnabled>
        <localAnnounceEnabled>true</localAnnounceEnabled>
        <localAnnouncePort>$DISCO_PORT</localAnnouncePort>
        <relaysEnabled>true</relaysEnabled>
        <natEnabled>true</natEnabled>
        <progressUpdateIntervalS>-1</progressUpdateIntervalS>
        <maxFolderConcurrency>1</maxFolderConcurrency>
        <databaseTuning>small</databaseTuning>
        <maxConcurrentIncomingRequestKiB>32768</maxConcurrentIncomingRequestKiB>
        <startBrowser>false</startBrowser>
        <urAccepted>-1</urAccepted>
        <autoUpgradeIntervalH>0</autoUpgradeIntervalH>
        <crashReportingEnabled>false</crashReportingEnabled>
    </options>
    <defaults>
        <folder type="receiveonly" path="$DATA_ROOT"></folder>
    </defaults>
</configuration>
TAIL
}

validate_config_candidate() {
    _vc_file="$1"
    [ -s "$_vc_file" ] || return 1
    grep -q '^<configuration version="[0-9][0-9]*">$' "$_vc_file" || return 1
    grep -q '^</configuration>$' "$_vc_file" || return 1
    grep -q '<apikey>[^<][^<]*</apikey>' "$_vc_file" || return 1

    _vc_expected_folders="$(awk -F'|' '$1=="F"{n++} END{print n+0}' "$CONF")"
    _vc_expected_devices="$(awk -F'|' '$1=="D"{n++} END{print n+0}' "$CONF")"
    _vc_actual_folders="$(grep -c '^    <folder id=' "$_vc_file")"
    _vc_actual_devices="$(grep -c '^    <device id=' "$_vc_file")"
    [ "$_vc_actual_folders" = "$_vc_expected_folders" ] || return 1
    [ "$_vc_actual_devices" = "$_vc_expected_devices" ] || return 1
}

prepare_config_candidate() {
    _pc_key="$1"; _pc_out="$2"
    rm -f "$_pc_out"
    write_config "$_pc_key" "$_pc_out" || return 1
    validate_config_candidate "$_pc_out" || return 1
    chmod 600 "$_pc_out" || return 1
}

ensure_managed_config_current() {
    [ -f "$STHOME/config.xml" ] || return 0
    # set-config 已写入草稿但 apply-config 尚未完成时，正式 XML 仍是
    # 上一份可运行配置。普通 start 不得借自动迁移之名偷偷应用草稿。
    if [ -f "$CONF_ROLLBACK_STATE" ]; then
        log "检测到待应用配置，本次启动保留当前正式 XML"
        return 0
    fi
    _has_relay=no
    _has_lowmem=no
    grep -qF '<listenAddress>dynamic+https://relays.syncthing.net/endpoint</listenAddress>' \
        "$STHOME/config.xml" 2>/dev/null && _has_relay=yes
    grep -qF '<databaseTuning>small</databaseTuning>' \
        "$STHOME/config.xml" 2>/dev/null && _has_lowmem=yes
    [ "$_has_relay" = yes ] && [ "$_has_lowmem" = yes ] && return 0

    acquire_apply_lock || die "配置迁移失败：另一项配置/维护事务正在进行"
    trap 'release_apply_lock' 0
    trap 'release_apply_lock; exit 1' 1 2 15
    _key="$(api_key)"
    [ -n "$_key" ] || die "配置迁移失败：无法读取 API key"
    mkdir -p "$RUN_DIR" "$ROOT/backup" || die "配置迁移失败：无法创建事务目录"
    make_folder_dirs
    _migration_pending="$RUN_DIR/config.xml.migrate.$$"
    if ! prepare_config_candidate "$_key" "$_migration_pending"; then
        rm -f "$_migration_pending"
        die "配置迁移失败：候选 XML 验证未通过，原配置未改动"
    fi

    _was_running="$(running_pid)"
    if [ -n "$_was_running" ]; then
        stop_service
        if [ -n "$(running_pid)" ]; then
            rm -f "$_migration_pending"
            die "配置迁移失败：无法停止原服务，原配置未改动"
        fi
    fi
    cp -f "$STHOME/config.xml" "$ROOT/backup/config.xml.$(date +%Y%m%d%H%M%S)" \
        || { rm -f "$_migration_pending"; die "配置迁移失败：无法备份原配置"; }
    mv -f "$_migration_pending" "$STHOME/config.xml" \
        || { rm -f "$_migration_pending"; die "配置迁移失败：无法原子切换配置"; }
    write_stignore
    release_apply_lock
    trap - 0 1 2 15
    log "配置已迁移：启用公网动态中继与低内存模式（原配置已备份）"
}

# =============================================================================
# 启停
# =============================================================================
cmd_start() {
    [ -x "$BIN" ] || die "同步内核未安装"
    [ -f "$STHOME/config.xml" ] || die "尚未初始化，请先执行 init"
    if [ "${UFISYNC_APPLY_CHILD:-0}" != 1 ] && apply_lock_active; then
        die "配置应用正在进行，请稍后启动"
    fi

    # 旧配置只有 TCP/QUIC 监听。device 位于对称 NAT 时，离开局域网
    # 必须另有动态中继监听。启动时自动幂等迁移旧配置。
    ensure_managed_config_current

    # 用户明确要求启动，解除 stop/uninstall 留下的持久停用标记。
    rm -f "$ROOT/.disabled"

    _p="$(running_pid)"
    if [ -n "$_p" ]; then
        [ -s "$KERNEL_VERSION_CACHE" ] || cache_kernel_version >/dev/null 2>&1 || true
        log "已在运行（PID ${_p}）"; return 0
    fi

    mkdir -p "$RUN_DIR"
    if ! mkdir "$LOCK" 2>/dev/null; then
        _age=$(( $(date +%s) - $(date -r "$LOCK" +%s 2>/dev/null || echo 0) ))
        if [ "$_age" -gt 120 ]; then rmdir "$LOCK" 2>/dev/null; mkdir "$LOCK" 2>/dev/null || true
        else log "另一次启动正在进行中，放弃本次"; return 0; fi
    fi

    _free="$(free_mb "$DATA_ROOT")"
    if [ -n "$_free" ] && [ "$_free" -lt "$MIN_FREE_MB" ]; then
        rmdir "$LOCK" 2>/dev/null
        die "剩余 ${_free}MB < ${MIN_FREE_MB}MB，拒绝启动（不会自动清理任何数据）"
    fi

    rotate_log
    mkdir -p "$STDATA"
    export STNODEFAULTFOLDER=1 STNOUPGRADE=1 HOME="$ROOT"
    # shellcheck disable=SC2046
    nohup "$BIN" serve $(st_dir_args) --no-browser --no-default-folder >>"$LOG" 2>&1 &
    echo $! >"$PIDF"
    sleep 3
    rmdir "$LOCK" 2>/dev/null
    _p="$(running_pid)"
    if [ -n "$_p" ]; then
        [ -s "$KERNEL_VERSION_CACHE" ] || cache_kernel_version >/dev/null 2>&1 || true
        log "已启动（PID ${_p}）"
    else
        log "启动失败，最后 15 行日志："
        tail -n 15 "$LOG" 2>/dev/null
        exit 1
    fi
}

stop_service() {
    _p="$(running_pid)"
    if [ -z "$_p" ]; then log "未在运行"; rm -f "$PIDF"; return 0; fi
    kill "$_p" 2>/dev/null
    _i=0
    while [ "$_i" -lt 15 ]; do
        _remaining="$(running_pid)"
        [ -z "$_remaining" ] && break
        sleep 1; _i=$((_i+1))
    done

    # worker 退出后 monitor 通常会自行结束；若任一受管进程仍在，
    # 以有界循环逐个 SIGKILL，避免只杀 worker 却漏掉 monitor。
    _remaining="$(running_pid)"
    _kill_round=0
    while [ -n "$_remaining" ] && [ "$_kill_round" -lt 4 ]; do
        kill -9 "$_remaining" 2>/dev/null || true
        sleep 1
        _kill_round=$((_kill_round+1))
        _remaining="$(running_pid)"
    done
    if [ -n "$_remaining" ]; then
        write_pidfile_atomic "$_remaining" >/dev/null 2>&1 \
            || printf '%s\n' "$_remaining" >"$PIDF" 2>/dev/null
        log "FATAL: 无法停止受管进程（PID ${_remaining}），运行状态已保留"
        return 1
    fi
    rm -f "$PIDF"
    log "已停止"
}

cmd_stop() {
    if [ "${UFISYNC_TRANSIENT_STOP:-0}" != 1 ]; then
        apply_lock_active && die "配置应用正在进行，请稍后停止"
        mkdir -p "$ROOT" 2>/dev/null
        touch "$ROOT/.disabled" 2>/dev/null || die "无法记录停用状态"
    fi
    stop_service
}

cmd_restart() { cmd_stop || return 1; sleep 1; cmd_start; }
cmd_boot() { sleep 25; [ -f "$ROOT/.disabled" ] && exit 0; cmd_start; }

cmd_watchdog() {
    [ -x "$BIN" ] || exit 0
    [ -f "$STHOME/config.xml" ] || exit 0
    apply_lock_active && exit 0
    [ -f "$ROOT/.disabled" ] && exit 0
    _p="$(running_pid)"
    # Syncthing 正常包含监督进程和工作进程。只要任一受管进程存活就视为健康，
    # 不能按进程数量清理，否则会杀掉工作进程并触发整个服务退出。
    [ -n "$_p" ] && exit 0
    log "看门狗：进程缺失，重新启动"
    cmd_start
}

# =============================================================================
# status
# =============================================================================
cmd_status() {
    ensure_conf
    echo "### UFISYNC-STATUS v$UFISYNC_VERSION"
    echo "installed=$([ -x "$BIN" ] && echo yes || echo no)"
    echo "initialized=$([ -f "$STHOME/config.xml" ] && echo yes || echo no)"
    if [ -x "$BIN" ]; then
        _cached_version="$(cached_kernel_version 2>/dev/null)"
        echo "kernel_version=${_cached_version:-已安装（待下次启动缓存版本）}"
    fi
    # status 是 UI 的高频公开接口，只信任本插件维护的 PID 文件，
    # PID 恢复扫描交由低频的启停与看门狗路径处理。
    _p="$(pidfile_running_pid)"
    echo "pid=${_p:-}"
    echo "process=$([ -n "$_p" ] && echo running || echo stopped)"
    _pm="$(managed_process_metrics "$_p")"
    set -- $_pm
    echo "process_count=${1:-0}"
    echo "process_rss_mb=${2:-0}"
    echo "process_threads=${3:-0}"
    echo "data_root=$DATA_ROOT"
    echo "sync_port=$SYNC_PORT"
    echo "tls_cert_dir=${SSL_CERT_DIR:-none}"
    echo "free_mb=$(free_mb "$DATA_ROOT")"
    echo "min_free_mb=$MIN_FREE_MB"
    echo "mem_avail_mb=$(avail_mem_mb)"
    echo "boot_hook=$(grep -q 'ufisync' /sdcard/ufi_tools_boot.sh 2>/dev/null && echo yes || echo no)"
    echo "watchdog_hook=$(grep -q 'ufisync' /sdcard/ufi_tools_schedule.sh 2>/dev/null && echo yes || echo no)"

    echo "--- config ---"
    cat "$CONF"
    echo ""

    if [ -n "$_p" ]; then
        echo "--- system/status ---";      rest /rest/system/status; echo ""
        echo "--- system/version ---";     rest /rest/system/version; echo ""
        echo "--- system/connections ---"; rest /rest/system/connections; echo ""
        echo "--- system/error ---";       rest /rest/system/error; echo ""
        while IFS='|' read -r _k _id _label || [ -n "${_k:-}" ]; do
            [ "${_k:-}" = "F" ] || continue
            valid_folder_id "$_id" || continue
            echo "--- db/$_id ---"; rest "/rest/db/status?folder=$_id"; echo ""
        done <"$CONF"
    fi
    echo "### END"
}

cmd_scan() {
    [ -n "$(running_pid)" ] || die "未在运行"
    _scan_total=0; _scan_failed=0
    while IFS='|' read -r _k _id _label || [ -n "${_k:-}" ]; do
        [ "${_k:-}" = "F" ] || continue
        valid_folder_id "$_id" || continue
        _scan_total=$((_scan_total+1))
        rest_post "/rest/db/scan?folder=$_id" >/dev/null || _scan_failed=$((_scan_failed+1))
    done <"$CONF"
    [ "$_scan_total" -gt 0 ] || die "没有可扫描的有效仓库"
    [ "$_scan_failed" -eq 0 ] \
        || die "有 $_scan_failed/$_scan_total 个仓库未能触发扫描，请稍后重试"
    log "已触发 $_scan_total 个仓库的重新扫描"
}

cmd_tail_log() {
    _n="${1:-120}"
    case "$_n" in ''|*[!0-9]*) _n=120 ;; esac
    [ "$_n" -gt 500 ] && _n=500
    echo "--- syncthing.log ---"
    tail -n "$_n" "$LOG" 2>/dev/null || echo "(无日志)"
    echo "--- install.log ---"
    tail -n 30 "$INSTALL_LOG" 2>/dev/null || echo "(无日志)"
    echo "--- ufisync.log ---"
    tail -n 40 "$OPLOG" 2>/dev/null || echo "(无日志)"
}

cmd_upgrade() {
    _ver="${1:-}"
    case "$_ver" in ''|*[!0-9.]*) die "版本号非法" ;; esac
    case "$_ver" in 2.*) die "Syncthing 2.x 依赖 glibc，Android 无法执行，拒绝升级" ;; esac
    trusted_kernel_sha256 "$_ver" >/dev/null 2>&1 \
        || die "版本 $_ver 未纳入可信哈希白名单，拒绝升级"
    acquire_apply_lock || die "另一项配置/维护事务正在进行"
    trap 'release_apply_lock' 0
    trap 'release_apply_lock; exit 1' 1 2 15
    mkdir -p "$ROOT/backup" || die "无法创建升级回滚目录"
    _was_running=""; [ -n "$(running_pid)" ] && _was_running=1
    if ! stop_service; then
        log "FATAL: 升级中止：无法停止当前同步内核，程序文件保持不变"
        return 1
    fi

    _old_bin_state=absent
    _old_version_state=absent
    _old_state_state=absent
    rm -f "$ROOT/backup/syncthing.prev" "$ROOT/backup/kernel.version.prev" "$ROOT/backup/state.env.prev"
    if [ -f "$BIN" ]; then
        cp -f "$BIN" "$ROOT/backup/syncthing.prev" || die "无法备份当前同步内核"
        _old_bin_state=present
    fi
    if [ -f "$KERNEL_VERSION_CACHE" ]; then
        cp -f "$KERNEL_VERSION_CACHE" "$ROOT/backup/kernel.version.prev" || die "无法备份内核版本缓存"
        _old_version_state=present
    fi
    if [ -f "$STATE" ]; then
        cp -f "$STATE" "$ROOT/backup/state.env.prev" || die "无法备份运行状态"
        _old_state_state=present
    fi
    rm -f "$BIN" "$KERNEL_VERSION_CACHE"
    SYNCTHING_VERSION="$_ver"

    # install-run 的公开入口会用 exit 终止后台安装进程。升级必须把它放进
    # 独立子 shell 才能捕获失败并执行回滚；同时清除子 shell 的 EXIT trap，
    # 避免它提前释放父事务持有的 apply.lock。
    _upgrade_failed=no
    if ! ( trap - 0 1 2 15; cmd_install_run ); then
        _upgrade_failed=yes
        log "升级失败，回滚到上一版本"
        if [ "$_old_bin_state" = present ]; then
            cp -f "$ROOT/backup/syncthing.prev" "$BIN" && chmod 755 "$BIN" \
                || log "FATAL: 无法恢复上一版同步内核"
        else
            rm -f "$BIN"
        fi
        if [ "$_old_version_state" = present ]; then
            cp -f "$ROOT/backup/kernel.version.prev" "$KERNEL_VERSION_CACHE" \
                || log "FATAL: 无法恢复上一版内核缓存"
        else
            rm -f "$KERNEL_VERSION_CACHE"
        fi
        if [ "$_old_state_state" = present ]; then
            cp -f "$ROOT/backup/state.env.prev" "$STATE" \
                || log "FATAL: 无法恢复上一版运行状态"
        else
            rm -f "$STATE"
        fi
    elif [ -f "$STATE" ]; then
        # install-run 在子 shell 中选择端口并写入 state.env；成功后把这些
        # 持久结果重新载入父事务，供随后的启动使用。
        . "$STATE" 2>/dev/null || true
        UFISYNC_VERSION="2.3.1"
    fi

    _restart_failed=no
    if [ -n "$_was_running" ] && ! UFISYNC_APPLY_CHILD=1 cmd_start; then
        _restart_failed=yes
        log "FATAL: 升级事务结束后无法恢复同步服务"
    fi
    if [ "$_restart_failed" = yes ] && [ "$_upgrade_failed" = no ]; then
        log "新内核启动失败，回滚到上一版本"
        # 新内核可能留下半启动进程；必须先停止，再替换磁盘上的 ELF。
        if ! stop_service >/dev/null 2>&1; then
            log "FATAL: 新内核启动失败且无法停止残留进程，未覆盖磁盘内核；旧内核备份仍保留"
            return 1
        fi
        if [ "$_old_bin_state" = present ]; then
            cp -f "$ROOT/backup/syncthing.prev" "$BIN" && chmod 755 "$BIN" \
                || log "FATAL: 无法恢复上一版同步内核"
        else
            rm -f "$BIN"
        fi
        if [ "$_old_version_state" = present ]; then
            cp -f "$ROOT/backup/kernel.version.prev" "$KERNEL_VERSION_CACHE" \
                || log "FATAL: 无法恢复上一版内核缓存"
        else
            rm -f "$KERNEL_VERSION_CACHE"
        fi
        if [ "$_old_state_state" = present ]; then
            cp -f "$ROOT/backup/state.env.prev" "$STATE" \
                || log "FATAL: 无法恢复上一版运行状态"
            . "$STATE" 2>/dev/null || true
            UFISYNC_VERSION="2.3.1"
        else
            rm -f "$STATE"
        fi
        if [ "$_old_bin_state" = present ] && ! UFISYNC_APPLY_CHILD=1 cmd_start; then
            log "FATAL: 已恢复上一版内核，但旧服务重新启动失败"
        fi
    fi
    if [ "$_upgrade_failed" = yes ] || [ "$_restart_failed" = yes ]; then
        log "FATAL: 升级未完成，已尽力恢复升级前状态"
        return 1
    fi
    log "升级完成"
}

cmd_uninstall() {
    cmd_stop || return 1
    touch "$ROOT/.disabled" || { log "FATAL: 无法保留停用标记，卸载中止"; return 1; }
    _uninstall_failed=no
    for _f in /sdcard/ufi_tools_boot.sh /sdcard/ufi_tools_schedule.sh; do
        [ -f "$_f" ] || continue
        if ! sed -i '/# >>> ufisync >>>/,/# <<< ufisync <<</d' "$_f" 2>/dev/null; then
            log "FATAL: 无法从 $_f 移除 UFI Sync Node 自启挂钩"
            _uninstall_failed=yes
        fi
    done
    if ! rm -rf "$BIN_DIR"; then
        log "FATAL: 无法删除同步内核目录 $BIN_DIR"
        _uninstall_failed=yes
    fi
    [ "$_uninstall_failed" = no ] || return 1
    log "已卸载程序与自启挂钩。仓库副本保留在 $DATA_ROOT（未删除）。"
}

cmd_purge_data() {
    [ "${1:-}" = "CONFIRM-DELETE-VAULT-COPIES" ] || die "拒绝执行：缺少确认串"
    cmd_stop || return 1
    _purge_failed=no
    while IFS='|' read -r _k _id _label || [ -n "${_k:-}" ]; do
        [ "${_k:-}" = "F" ] || continue
        valid_folder_id "$_id" || continue
        if ! rm -rf "${DATA_ROOT:?}/$_id"; then
            log "FATAL: 无法完整删除仓库副本 $_id"
            _purge_failed=yes
        fi
    done <"$CONF"
    if ! rm -rf "$STHOME" "$STDATA"; then
        log "FATAL: 无法完整删除同步身份或索引数据"
        _purge_failed=yes
    fi
    [ "$_purge_failed" = no ] || return 1
    log "已删除 device 上的仓库副本与同步身份。其它设备数据不受影响。"
}

# =============================================================================
main() {
    _action="${1:-status}"; shift 2>/dev/null || true
    case "$_action" in
        preflight)      cmd_preflight ;;
        diag)           cmd_diag ;;
        install)        cmd_install ;;
        install-run)    cmd_install_run ;;
        install-status) cmd_install_status ;;
        init)           cmd_init ;;
        get-config)     cmd_get_config ;;
        set-config)     cmd_set_config ;;
        apply-config)   cmd_apply_config ;;
        start)          cmd_start ;;
        stop)           cmd_stop ;;
        restart)        cmd_restart ;;
        status)         cmd_status ;;
        scan)           cmd_scan ;;
        tail-log)       cmd_tail_log "${1:-120}" ;;
        upgrade)        cmd_upgrade "${1:-}" ;;
        uninstall)      cmd_uninstall ;;
        purge-data)     cmd_purge_data "${1:-}" ;;
        watchdog)       cmd_watchdog ;;
        boot)           cmd_boot ;;
        version)        echo "ufisync $UFISYNC_VERSION / syncthing target v$SYNCTHING_VERSION" ;;
        *)              echo "不支持的动作: $_action"; exit 2 ;;
    esac
}

main "$@"
