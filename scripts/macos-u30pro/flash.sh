#!/usr/bin/env bash
# Write pack tos.bin + magisk.img using ABSOLUTE paths.
# Refuses to run without a prior backup.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SPD_DUMP="${SPD_DUMP:-$ROOT/build/spd_dump}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/u30-b23-backup}"
WAIT="${WAIT:-300}"
TOS="${TOS:-}"
MAGISK_IMG="${MAGISK_IMG:-}"
FLASH_LOG="${FLASH_LOG:-}"

die() { echo "error: $*" >&2; exit 1; }

[[ "$SPD_DUMP" = /* ]] || die "SPD_DUMP must be an absolute path"
[[ -x "$SPD_DUMP" ]] || die "spd_dump not executable: $SPD_DUMP"
[[ -n "$TOS" && "$TOS" = /* && -f "$TOS" ]] || die "set TOS=/abs/path/tos.bin"
[[ -n "$MAGISK_IMG" && "$MAGISK_IMG" = /* && -f "$MAGISK_IMG" ]] || die "set MAGISK_IMG=/abs/path/magisk.img"

[[ "$BACKUP_DIR" = /* ]] || die "BACKUP_DIR must be an absolute path"
[[ -d "$BACKUP_DIR" ]] || die "backup directory does not exist: $BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
ib="$BACKUP_DIR/init_boot.bin"
tosb="$BACKUP_DIR/trustos.bin"
[[ -s "$ib" && -s "$tosb" ]] || die "backup missing under $BACKUP_DIR (run backup.sh first)"

python3 - "$ib" "$MAGISK_IMG" "$tosb" "$TOS" <<'PY'
import sys
from pathlib import Path

ib = Path(sys.argv[1]).read_bytes()
img = Path(sys.argv[2]).read_bytes()
stock_tos = Path(sys.argv[3]).read_bytes()
tos = Path(sys.argv[4]).read_bytes()

if ib[:8] != b"ANDROID!" or img[:8] != b"ANDROID!":
    raise SystemExit("stock and Magisk files must be Android boot images")
if not 4 * 1024 * 1024 <= len(ib) <= 16 * 1024 * 1024:
    raise SystemExit(f"stock init_boot size is implausible: {len(ib)} bytes")
if len(ib) != len(img):
    raise SystemExit(f"init_boot size mismatch: stock={len(ib)} magisk={len(img)}")
if stock_tos[:4] != b"DHTB" or tos[:4] != b"DHTB":
    raise SystemExit("stock and supplied trustos files must have a DHTB header")
if not 1 * 1024 * 1024 <= len(stock_tos) <= 16 * 1024 * 1024:
    raise SystemExit(f"stock trustos size is implausible: {len(stock_tos)} bytes")
if len(stock_tos) != len(tos):
    raise SystemExit(f"trustos size mismatch: stock={len(stock_tos)} supplied={len(tos)}")

def fp(b):
    i = b.find(b"ZTE/")
    return None if i < 0 else b[i:].split(b"\x00", 1)[0].split()[0]

a, b = fp(ib), fp(img)
print("stock ", a)
print("magisk", b)
if not a or not b:
    raise SystemExit("stock or Magisk fingerprint not found: refusing to write")
if not a.startswith(b"ZTE/MU5358/MU5358:") or not b.startswith(b"ZTE/MU5358/MU5358:"):
    raise SystemExit("stock or Magisk fingerprint is not MU5358: refusing to write")
if a != b:
    raise SystemExit("fingerprint mismatch: refusing to write")
if b"start_adbip" not in img and b"magisk" not in img.lower():
    raise SystemExit("MAGISK_IMG does not look Magisk-patched")
print("fingerprint check OK")
PY

USB_STATE="$(python3 "$ROOT/check-usb.py")" || die "USB state check failed"
echo "USB now: $USB_STATE"
echo "Power OFF, unplug, start wait, then plug."
echo "Writing:"
echo "  trustos  $TOS"
echo "  init_boot $MAGISK_IMG"

if [[ -n "$FLASH_LOG" ]]; then
  [[ "$FLASH_LOG" = /* ]] || die "FLASH_LOG must be an absolute path"
  [[ ! -e "$FLASH_LOG" ]] || die "FLASH_LOG already exists: $FLASH_LOG"
else
  FLASH_LOG="$(mktemp -t u30-flash)"
fi

if ! "$SPD_DUMP" --wait "$WAIT" --kickto 2 --verbose 1 exec \
    w trustos "$TOS" \
    w_force init_boot "$MAGISK_IMG" \
    reset 2>&1 | tee "$FLASH_LOG"; then
  die "spd_dump failed; preserve and inspect log: $FLASH_LOG"
fi

if grep -Eq 'File does not exist\.|part not exist|Partition table not available|w_force is not allowed|blacklist!' "$FLASH_LOG"; then
  die "spd_dump reported an incomplete or rejected write; do not retry blindly. Log: $FLASH_LOG"
fi
if ! grep -Fq 'Write Part Done: trustos_' "$FLASH_LOG"; then
  die "trustos success marker missing; do not retry blindly. Log: $FLASH_LOG"
fi
if ! grep -Fq 'Force Write init_boot_' "$FLASH_LOG"; then
  die "init_boot success marker missing; do not retry blindly. Log: $FLASH_LOG"
fi

echo "Both write success markers verified. Log: $FLASH_LOG"
