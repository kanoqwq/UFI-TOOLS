# Agent runbook: ZTE U30 Pro (MU5358 B23) on macOS → UFI-TOOLS

Machine-oriented. Humans: see [`U30-Pro-macOS.md`](U30-Pro-macOS.md).
Scripts: [`scripts/macos-u30pro/`](../scripts/macos-u30pro/).

## Tested device

```text
Model: ZTE U30 Pro / MU5358
Firmware: V1.0.0B23
Modem HW: ums9632_modem
Modem project: QogirN5_PS
Modem version: 5G_MODEM_V2_24A_W25.15.1_P13.19
```

Do **not** treat U30 Air / F50 / 畅行60 images as interchangeable with MU5358.

---

## Goal

1. Backup `init_boot` + `trustos` from the live device.
2. Write community B23 `tos.bin` + Magisk `init_boot` (same fingerprint as stock).
3. `adb connect 192.168.0.1:5555`, install UFI-TOOLS full APK + Magisk 28103 APK.
4. User enables 高级功能 in http://192.168.0.1:2333. TTYD = :1146.

Success: `network ADB :5555` open, `http://192.168.0.1:2333` HTTP 200, Magisk APK installed. Root in TTYD is `uid=0`; adb `su` may stay denied until Magisk policy grants shell.

---

## Invariants (never violate)

- Own device only. No password brute force. No IMEI/IMSI/ICCID/Wi-Fi PSK/cookie/serial in notes or git.
- Do not write `uboot`, `splloader*`, NV, EFS, calibration.
- Do not send `SET_NV` or `CHANGE_MODE=2`.
- Do not reimplement CVE-2022-38694 / `exec_addr` payloads. If short-circuit is required, invoke **existing** `spd_dump exec_addr` with the **user-supplied** `custom_exec_no_verify_*.bin` already in their pack CWD. Prefer `--kickto 2` (no short) first.
- Do not commit `magisk.img`, `tos.bin`, FDL, or `custom_exec`.
- Do not flash unless stock `init_boot` and pack `magisk.img` contain the same complete fingerprint.
- Magisk APK must be **28103** from the same pack.
- Backup must use a new/empty output directory. `init_boot.bin` must be a non-trivial Android bootimg and `trustos.bin` must be a non-trivial DHTB image **before** any `w` / `w_force`.
- Image arguments to `spd_dump` must be **absolute paths**. Never `path ./flash w trustos tos.bin`.
- Physical power-off + unplug/replug is required for kick. Agents cannot short test points. Ask the human.
- Stop after one failed write that might have partially landed; do not retry overlapping writes blind.

---

## Preconditions

| Need | Check |
|---|---|
| macOS + Homebrew libusb | `brew --prefix` has `include/libusb-1.0/libusb.h` |
| `spd_dump` | `scripts/macos-u30pro/build-spd_dump.sh` → binary `--help` contains `kickto` |
| B23 pack | env `TOS`, `MAGISK_IMG` files exist; `file magisk.img` is Android bootimg |
| UFI APK | env `UFI_APK` |
| Magisk APK | env `MAGISK_APK` (28103) |
| Device | human confirms own U30 Pro, firmware B23 |

ARM64 Windows / Parallels Win11 + pack `spd_dump.exe` is a **known dead end** (`hotplug unsupported`). Do not spend time there.

---

## USB state machine (poll `ioreg -p IOUSB -l -w 0`)

| State | How to recognize | What to do |
|---|---|---|
| `ABSENT` | no `0x19d2` / `0x1782` | start `spd_dump --wait`, ask human: power off, unplug, plug |
| `GADGET_1354` | `idVendor=0x19d2` `idProduct=0x1354`, often `en*` 192.168.0.0/24 | WebUI/RNDIS. Kick wait will **ignore** this. Need power-off replug |
| `GADGET_0246` | `0x19d2:0x0246` | often no RNDIS on macOS. Not download mode |
| `DOWNLOAD` | `0x1782:0x4d00` (`Sprd Gadget Serial`) | `spd_dump` must **already be waiting**; claiming late often `NO_DEVICE` |
| `ADB` | TCP `192.168.0.1:5555` connect_ex == 0 | install APKs |

Poll every 1–2s while waiting. Do not dump USB serial strings into logs you will commit.

---

## Command sequences

### A. Build spd_dump (once)

```bash
./scripts/macos-u30pro/build-spd_dump.sh
export SPD_DUMP="$PWD/scripts/macos-u30pro/build/spd_dump"
"$SPD_DUMP" --help | grep kickto
```

### B. Backup (read only)

Ask human: device powered **off**, cable unplugged. Then:

```bash
export SPD_DUMP=/abs/path/to/spd_dump
export BACKUP_DIR="$HOME/u30-b23-backup-$(date +%Y%m%d-%H%M%S)"
./scripts/macos-u30pro/backup.sh
# human plugs while script prints Waiting for boot_diag
```

Pass only if `BACKUP_DIR/init_boot.bin` is Android bootimg ~8MiB and `trustos.bin` starts with `DHTB`. Compare the complete fingerprint in `init_boot.bin` vs `MAGISK_IMG` (`ZTE/MU5358/...`). Missing or mismatched fingerprint → **abort write**.

Device will `reset` to gadget. Wait for human if `DOWNLOAD` never appears within `--wait` (default 300s).

### C. Write

Same plug choreography. Script refuses if backup missing.

```bash
export SPD_DUMP TOS MAGISK_IMG
./scripts/macos-u30pro/flash.sh
```

Pass only if the preserved log contains both `Write Part Done: trustos_` and `Force Write init_boot_`, with no rejected-write message. `EXIT:0` alone is not proof of a write.
If the log contains `File does not exist.`, `part not exist`, `Partition table not available`, or either success marker is missing, stop and preserve the log. **Do not retry blindly.**

### D. Install UFI-TOOLS

Wait until ping `192.168.0.1` and TCP 5555 open (can take ~20–60s after reset).

```bash
export UFI_APK MAGISK_APK
./scripts/macos-u30pro/install-ufi.sh
```

Then tell the human (do not automate Magisk Superuser GUI on a headless MiFi):

1. Browser http://192.168.0.1:2333
2. Token default `admin` + official WebUI password
3. 高级功能 → 添加高级功能 → reboot
4. Do not disable Samba
5. TTYD http://192.168.0.1:1146

---

## Failure table

| Log / symptom | Action |
|---|---|
| `find port failed` | Ask replug while wait is **already running**. Do not start a second spd_dump in parallel |
| `libusb_claim_interface` / `libusb_open_device failed` | Device left brom. Restart wait, ask immediate replug |
| `hotplug unsupported` | You are not on Darwin libusb build. Stop Windows-on-ARM attempts |
| `File does not exist.` | Absolute paths; do not use `path DIR` with relative names |
| `FDL2: incompatible partition` | Continue; documented on B23 |
| `kick reboot timeout` (Windows pack wording) | Human short-circuit path; agent must ask, not invent exec_addr payloads |
| WebUI `USB_PORT_SETTING` `failure` | Expected on B23. Ignore |
| TCP 5555 closed after 2 min | Fingerprint mismatch or write skipped. Do not re-write without reading backup hashes |

---

## Aftercare (optional, ask first)

- Grant Magisk root to `shell` / `com.minikano.f50_sms` via TTYD or scrcpy — not via guessing `magisk --sqlite` unless the human asks.
- Do not disable official FOTA from random modules; pack overlay + UFI 「禁用固件更新」 is enough.
- Do not enable performance_mode / SET_NV “just in case”. B23 `PERFORMANCE_MODE_SETTING` was an empty leftover POST on the stock WebUI.

---

## Report template (for the human)

- Firmware `wa_inner_version` / `cr_version` (from goform GET, no secrets)
- USB states observed (`DOWNLOAD` yes/no)
- Backup paths + sha256 of `init_boot.bin` / `trustos.bin`
- Write log lines `Write Part Done` / `Force Write`
- `adb devices` model only (redact serial)
- `curl -s -o /dev/null -w '%{http_code}' http://192.168.0.1:2333`
- Ports: 80, 2333, 1146, 5555
