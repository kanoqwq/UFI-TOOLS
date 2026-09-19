#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-192.168.0.1}"
PORT="${PORT:-5555}"
UFI_APK="${UFI_APK:-}"
MAGISK_APK="${MAGISK_APK:-}"
TARGET="${HOST}:${PORT}"

die() { echo "error: $*" >&2; exit 1; }
command -v adb >/dev/null || die "adb not in PATH (brew install --cask android-platform-tools)"
[[ -n "$UFI_APK" && "$UFI_APK" = /* && -f "$UFI_APK" ]] || die "set UFI_APK=/abs/path/to/UFI-TOOLS_WEB.apk"
[[ -n "$MAGISK_APK" && "$MAGISK_APK" = /* && -f "$MAGISK_APK" ]] || die "set MAGISK_APK=/abs/path/to/Magisk_28103.apk"

adb connect "$TARGET" || die "adb connect failed: $TARGET"
state="$(adb -s "$TARGET" get-state 2>/dev/null || true)"
[[ "$state" == "device" ]] || die "ADB target is not ready: $TARGET (state: ${state:-unknown})"

adb -s "$TARGET" install -r "$UFI_APK"
adb -s "$TARGET" install -r "$MAGISK_APK"
adb -s "$TARGET" shell monkey -p com.minikano.f50_sms -c android.intent.category.LAUNCHER 1 >/dev/null

echo "UFI-TOOLS: http://${HOST}:2333"
echo "Login token default: admin"
echo "Official WebUI password: the stock admin password, not admin"
echo "Then: 高级功能 → 添加高级功能. Do not disable Samba."
echo "TTYD after that: http://${HOST}:1146"
