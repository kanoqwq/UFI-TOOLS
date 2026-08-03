#!/bin/bash
# 任何需要先停服务的维护动作都必须传播 stop 失败，不能继续替换内核或删除数据。
set -eu
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

sed -n '/^cmd_restart()/,/^}/p' device/ufisync.sh >"$TMP/cmd-restart.fn"
if sh -c '
  marker='"$TMP"'/restart-started
  cmd_stop() { return 1; }
  cmd_start() { touch "$marker"; }
  sleep() { :; }
  . '"$TMP"'/cmd-restart.fn
  cmd_restart
'; then
  echo "❌ restart 在 stop 失败后仍返回成功"
  exit 1
fi
[ ! -e "$TMP/restart-started" ] || {
  echo "❌ restart 在 stop 失败后仍调用了 start"
  exit 1
}

UNINSTALL_ROOT="$TMP/uninstall"
mkdir -p "$UNINSTALL_ROOT/bin"
printf '%s\n' old-kernel >"$UNINSTALL_ROOT/bin/syncthing"
sed -n '/^cmd_uninstall()/,/^}/p' device/ufisync.sh >"$TMP/cmd-uninstall.fn"
if sh -c '
  ROOT='"$UNINSTALL_ROOT"'
  BIN="$ROOT/bin/syncthing"
  BIN_DIR="$ROOT/bin"
  DATA_ROOT="$ROOT/vaults"
  cmd_stop() { return 1; }
  log() { :; }
  . '"$TMP"'/cmd-uninstall.fn
  cmd_uninstall
'; then
  echo "❌ uninstall 在 stop 失败后仍返回成功"
  exit 1
fi
[ -f "$UNINSTALL_ROOT/bin/syncthing" ] || {
  echo "❌ uninstall 在 stop 失败后仍删除了内核"
  exit 1
}

UNINSTALL_IO_ROOT="$TMP/uninstall-io"
mkdir -p "$UNINSTALL_IO_ROOT/bin"
printf '%s\n' old-kernel >"$UNINSTALL_IO_ROOT/bin/syncthing"
if sh -c '
  ROOT='"$UNINSTALL_IO_ROOT"'
  BIN="$ROOT/bin/syncthing"
  BIN_DIR="$ROOT/bin"
  DATA_ROOT="$ROOT/vaults"
  cmd_stop() { :; }
  rm() { return 1; }
  log() { printf "%s\n" "$*" >>"$ROOT/uninstall.log"; }
  . '"$TMP"'/cmd-uninstall.fn
  cmd_uninstall
'; then
  echo "❌ uninstall 删除内核失败时仍返回成功"
  exit 1
fi
grep -q 'FATAL' "$UNINSTALL_IO_ROOT/uninstall.log" || {
  echo "❌ uninstall I/O 失败没有给出 FATAL 诊断"
  exit 1
}
if grep -q '已卸载程序' "$UNINSTALL_IO_ROOT/uninstall.log"; then
  echo "❌ uninstall I/O 失败后仍记录成功"
  exit 1
fi

PURGE_ROOT="$TMP/purge"
mkdir -p "$PURGE_ROOT/vaults/notes"
printf '%s\n' keep >"$PURGE_ROOT/vaults/notes/note.md"
printf '%s\n' 'F|notes|Notes' >"$PURGE_ROOT/sync.conf"
sed -n '/^cmd_purge_data()/,/^}/p' device/ufisync.sh >"$TMP/cmd-purge.fn"
if sh -c '
  ROOT='"$PURGE_ROOT"'
  DATA_ROOT="$ROOT/vaults"
  STHOME="$ROOT/config"
  STDATA="$ROOT/db"
  CONF="$ROOT/sync.conf"
  cmd_stop() { return 1; }
  valid_folder_id() { return 0; }
  log() { :; }
  die() { return 1; }
  . '"$TMP"'/cmd-purge.fn
  cmd_purge_data CONFIRM-DELETE-VAULT-COPIES
'; then
  echo "❌ purge-data 在 stop 失败后仍返回成功"
  exit 1
fi
[ -f "$PURGE_ROOT/vaults/notes/note.md" ] || {
  echo "❌ purge-data 在 stop 失败后仍删除了仓库副本"
  exit 1
}

PURGE_IO_ROOT="$TMP/purge-io"
mkdir -p "$PURGE_IO_ROOT/vaults/notes"
printf '%s\n' keep >"$PURGE_IO_ROOT/vaults/notes/note.md"
printf '%s\n' 'F|notes|Notes' >"$PURGE_IO_ROOT/sync.conf"
if sh -c '
  ROOT='"$PURGE_IO_ROOT"'
  DATA_ROOT="$ROOT/vaults"
  STHOME="$ROOT/config"
  STDATA="$ROOT/db"
  CONF="$ROOT/sync.conf"
  cmd_stop() { :; }
  valid_folder_id() { return 0; }
  rm() { return 1; }
  log() { printf "%s\n" "$*" >>"$ROOT/purge.log"; }
  die() { return 1; }
  . '"$TMP"'/cmd-purge.fn
  cmd_purge_data CONFIRM-DELETE-VAULT-COPIES
'; then
  echo "❌ purge-data 删除失败时仍返回成功"
  exit 1
fi
grep -q 'FATAL' "$PURGE_IO_ROOT/purge.log" || {
  echo "❌ purge-data I/O 失败没有给出 FATAL 诊断"
  exit 1
}
if grep -q '已删除 device' "$PURGE_IO_ROOT/purge.log"; then
  echo "❌ purge-data I/O 失败后仍记录成功"
  exit 1
fi

INSTALL_ROOT="$TMP/install"
mkdir -p "$INSTALL_ROOT/bin" "$INSTALL_ROOT/run" "$INSTALL_ROOT/log" "$INSTALL_ROOT/unpack"
printf '#!/bin/sh\necho old-kernel\n' >"$INSTALL_ROOT/bin/syncthing"
chmod 755 "$INSTALL_ROOT/bin/syncthing"
printf '#!/bin/sh\necho "syncthing v1.30.0 test"\n' >"$TMP/new-syncthing"
chmod 755 "$TMP/new-syncthing"
truncate -s 6000000 "$INSTALL_ROOT/syncthing.tar.gz"
sed -n '/^cmd_install_run_locked()/,/^}/p' device/ufisync.sh >"$TMP/cmd-install-run-locked.fn"
if (
  ROOT="$INSTALL_ROOT"
  BIN_DIR="$ROOT/bin"
  BIN="$BIN_DIR/syncthing"
  STHOME="$ROOT/config"
  RUN_DIR="$ROOT/run"
  LOG_DIR="$ROOT/log"
  TGZ="$ROOT/syncthing.tar.gz"
  STDATA_DEFAULT="$ROOT/db"
  STDATA="$STDATA_DEFAULT"
  STATE="$ROOT/state.env"
  DATA_ROOT="$ROOT/vaults"
  SYNCTHING_VERSION=1.30.0
  INSTALL_FREE_MB=1
  getprop() { printf '%s\n' arm64; }
  trusted_kernel_sha256() { printf '%064d\n' 0; }
  free_mb() { printf '%s\n' 9999; }
  set_install_state() { :; }
  log() { :; }
  ensure_conf() { :; }
  make_folder_dirs() { :; }
  install_sync_port_choice() { printf '%s\n' 22001; }
  is_elf() { return 0; }
  kernel_ok() { return 1; }
  sha256_of() { printf '%064d\n' 0; }
  tar() { :; }
  preserve_syncthing_license() { :; }
  find_kernel_binary() { printf '%s\n' "$TMP/new-syncthing"; }
  stop_service() { touch "$TMP/install-stop-called"; return 1; }
  ensure_syncthing_license() { :; }
  cache_kernel_version() { :; }
  install_hooks() { :; }
  stat() { printf '%s\n' 6000000; }
  . "$TMP/cmd-install-run-locked.fn"
  cmd_install_run_locked
); then
  echo "❌ install-run 在 stop 失败后仍返回成功"
  exit 1
fi
[ -e "$TMP/install-stop-called" ] || {
  echo "❌ install-run 回归没有真正执行到 stop_service"
  exit 1
}
grep -q old-kernel "$INSTALL_ROOT/bin/syncthing" || {
  echo "❌ install-run 在 stop 失败后仍替换了内核"
  exit 1
}

echo "✅ restart/uninstall/purge-data 会传播 stop 失败"
echo "✅ uninstall/purge-data 会传播物质删除失败"
echo "✅ install-run 不会在 stop 失败后替换内核"
