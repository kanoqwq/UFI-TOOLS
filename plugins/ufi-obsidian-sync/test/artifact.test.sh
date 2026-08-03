#!/bin/bash
# 发布产物回归：dist 内嵌的设备脚本必须与源码逐字节一致。
# 这能防止修复只留在 device/ufisync.sh，而实际安装的单文件插件仍携带旧脚本。
set -u
cd "$(dirname "$0")/.."

python3 - "device/ufisync.sh" "dist/ufi-obsidian-sync.js" <<'PY'
import base64
import re
import sys

source_path, dist_path = sys.argv[1:]
source = open(source_path, "rb").read()
dist = open(dist_path, encoding="utf-8").read()

match = re.search(r"const SH_B64 = '([^']+)';", dist)
if not match:
    raise SystemExit("❌ 发布产物中找不到内嵌设备脚本")

try:
    embedded = base64.b64decode(match.group(1), validate=True)
except Exception as exc:
    raise SystemExit(f"❌ 发布产物中的设备脚本不是有效 base64：{exc}")

if embedded != source:
    raise SystemExit(
        "❌ dist 内嵌脚本与 device/ufisync.sh 不一致；请重新运行 build.sh"
    )

if "MPL-2.0" not in dist or b"MPL-2.0" not in embedded:
    raise SystemExit("❌ 发布产物缺少 Syncthing MPL-2.0 第三方声明")

print("✅ dist 内嵌脚本与设备端源码一致")
print("✅ dist 与内嵌安装器均携带 MPL-2.0 声明")
PY

grep -q 'Syncthing.*MPL-2.0' THIRD_PARTY_NOTICES.md || {
  echo "❌ 源码发布树缺少 Syncthing 第三方声明"
  exit 1
}
