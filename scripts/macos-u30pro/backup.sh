#!/usr/bin/env bash
# Partition-read-only dump of init_boot + trustos. Kick/reset still change device state.
# Start this BEFORE plugging a powered-off U30 Pro.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SPD_DUMP="${SPD_DUMP:-$ROOT/build/spd_dump}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/u30-b23-backup}"
WAIT="${WAIT:-300}"

die() { echo "error: $*" >&2; exit 1; }

if [[ ! -x "$SPD_DUMP" ]]; then
  die "spd_dump not found: $SPD_DUMP (run ./build-spd_dump.sh or set SPD_DUMP=)"
fi

mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
IB_PATH="$BACKUP_DIR/init_boot.bin"
TOS_PATH="$BACKUP_DIR/trustos.bin"

for output in "$IB_PATH" "$TOS_PATH"; do
  [[ ! -e "$output" && ! -L "$output" ]] || die "backup output already exists: $output (use a new BACKUP_DIR)"
done

USB_STATE="$(python3 "$ROOT/check-usb.py")" || die "USB state check failed"
echo "USB now: $USB_STATE"
echo "Power the U30 Pro OFF, unplug, then plug it in while this waits."
echo "Waiting ${WAIT}s for 1782:4d00 ..."

# no `path` rewrite surprises: write dumps into BACKUP_DIR via path
"$SPD_DUMP" --wait "$WAIT" --kickto 2 --verbose 1 \
  path "$BACKUP_DIR" r init_boot r trustos reset

echo "---- result ----"
ls -lh "$IB_PATH" "$TOS_PATH"
file "$IB_PATH" "$TOS_PATH"
python3 - "$IB_PATH" "$TOS_PATH" <<'PY'
import sys
from pathlib import Path

ib = Path(sys.argv[1]).read_bytes()
tos = Path(sys.argv[2]).read_bytes()

if ib[:8] != b"ANDROID!":
    raise SystemExit("init_boot is not an Android bootimg")
if tos[:4] != b"DHTB":
    raise SystemExit("trustos missing DHTB header")
if not 4 * 1024 * 1024 <= len(ib) <= 16 * 1024 * 1024:
    raise SystemExit(f"init_boot size is implausible: {len(ib)} bytes")
if not 1 * 1024 * 1024 <= len(tos) <= 16 * 1024 * 1024:
    raise SystemExit(f"trustos size is implausible: {len(tos)} bytes")

fp = ib.find(b"ZTE/")
if fp < 0:
    raise SystemExit("stock init_boot fingerprint not found")
fingerprint = ib[fp:].split(b"\x00", 1)[0].split()[0]
if not fingerprint.startswith(b"ZTE/MU5358/MU5358:"):
    raise SystemExit(f"unexpected device fingerprint: {fingerprint!r}")
print("init_boot", len(ib), "trustos", len(tos), "OK")
print("fingerprint", fingerprint.decode("ascii", "replace"))
PY
echo "Backup verified. Keep these files and compare the Magisk image fingerprint before flashing."
