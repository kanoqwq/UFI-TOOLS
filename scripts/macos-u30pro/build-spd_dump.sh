#!/usr/bin/env bash
# Build TomKing062/spreadtrum_flash spd_dump (libusb) on macOS.
# Apple clang rejects gcc-style -s; do not use the upstream Makefile as-is.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD="$ROOT/build"
SRC="$BUILD/spreadtrum_flash"
BREW="$(brew --prefix)"

mkdir -p "$BUILD"
if [[ ! -d "$SRC/.git" ]]; then
  git clone --depth 1 https://github.com/TomKing062/spreadtrum_flash.git "$SRC"
fi

printf '#define GIT_VER "main"\n#define GIT_SHA1 "ufi-tools-macos"\n' > "$SRC/GITVER.h"

cc -O2 -Wall -std=c99 -DUSE_LIBUSB=1 -I"$BREW/include" \
  -o "$BUILD/spd_dump" \
  "$SRC/spd_dump.c" "$SRC/common.c" \
  -L"$BREW/lib" -lusb-1.0 -lm -lpthread

echo "built $BUILD/spd_dump"
"$BUILD/spd_dump" --help | head -n 5
