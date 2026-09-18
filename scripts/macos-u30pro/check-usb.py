#!/usr/bin/env python3
"""Classify the U30 Pro USB gadget. Prints one token. Never prints serials."""
from __future__ import annotations

import subprocess
import sys
import re

VID_ZTE = 0x19D2
VID_SPRD = 0x1782
PID_U30 = 0x1354
PID_ALT = 0x0246
PID_DL = 0x4D00
DEVICE_RE = re.compile(r"\+-o .*<class (?:IOUSBHostDevice|IOUSBDevice)(?:[, >])")
FIELD_RE = re.compile(r'"(idVendor|idProduct)"\s*=\s*(0[xX][0-9a-fA-F]+|[0-9]+)')


def ioreg() -> str:
    return subprocess.check_output(
        ["ioreg", "-p", "IOUSB", "-l", "-w", "0"],
        text=True,
        errors="replace",
    )


def classify(t: str) -> str:
    devices = []
    current = None
    for ln in t.splitlines():
        if DEVICE_RE.search(ln):
            if current is not None:
                devices.append(current)
            current = {}
            continue
        if current is None:
            continue
        match = FIELD_RE.search(ln)
        if match:
            current[match.group(1)] = int(match.group(2), 0)
    if current is not None:
        devices.append(current)

    pairs = {
        (device.get("idVendor"), device.get("idProduct"))
        for device in devices
    }
    vids = {vendor for vendor, _ in pairs}
    if (VID_SPRD, PID_DL) in pairs:
        return "DOWNLOAD"
    if (VID_ZTE, PID_U30) in pairs:
        return "GADGET_1354"
    if (VID_ZTE, PID_ALT) in pairs:
        return "GADGET_0246"
    if VID_ZTE in vids or VID_SPRD in vids:
        return "OTHER"
    return "ABSENT"


def main() -> int:
    try:
        print(classify(ioreg()))
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"ioreg failed: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
