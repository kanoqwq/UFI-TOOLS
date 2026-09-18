# macos-u30pro scripts

Host-side helpers for [docs/U30-Pro-macOS.md](../../docs/U30-Pro-macOS.md). They wrap a **user-built** `spd_dump` (libusb) and **user-supplied** B23 images. Nothing in this folder is a firmware blob.

```bash
brew install libusb
./scripts/macos-u30pro/build-spd_dump.sh
export SPD_DUMP="$PWD/scripts/macos-u30pro/build/spd_dump"

# 1) power off, unplug, start this, then plug. Use a new/empty directory.
export BACKUP_DIR="$HOME/u30-b23-backup-$(date +%Y%m%d-%H%M%S)"
./scripts/macos-u30pro/backup.sh

# 2) same plug choreography after backup looks right
export TOS=/abs/path/tos.bin MAGISK_IMG=/abs/path/magisk.img
./scripts/macos-u30pro/flash.sh

# 3) after 192.168.0.1:5555 is up. Each variable must name one real file;
# shell wildcards do not expand inside an environment-variable assignment.
export UFI_APK=/abs/path/to/UFI-TOOLS_WEB_V4.0.0.apk
export MAGISK_APK=/abs/path/to/Magisk_28103.apk
./scripts/macos-u30pro/install-ufi.sh
```

`check-usb.py` prints `ABSENT` / `GADGET_1354` / `GADGET_0246` / `DOWNLOAD` / `OTHER` (no serials).
