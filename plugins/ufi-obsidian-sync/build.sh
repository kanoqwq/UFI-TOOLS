#!/bin/bash
# 把设备端控制脚本 base64 内联进插件 JS，产出单文件插件。
set -euo pipefail
cd "$(dirname "$0")"

SRC="plugin/ufi-obsidian-sync.src.js"
SH="device/ufisync.sh"
OUT="dist/ufi-obsidian-sync.js"
LIMIT=1145000   # UFI-TOOLS /api/set_custom_head 上限 1145KB

mkdir -p dist

command -v python3 >/dev/null || { echo "需要 python3"; exit 1; }

python3 - "$SRC" "$SH" "$OUT" <<'PY'
import base64, sys
src, sh, out = sys.argv[1], sys.argv[2], sys.argv[3]
js = open(src, encoding='utf-8').read()
b64 = base64.b64encode(open(sh, 'rb').read()).decode()
assert '__UFISYNC_SH_B64__' in js, 'JS 里找不到占位符'
open(out, 'w', encoding='utf-8').write(js.replace('__UFISYNC_SH_B64__', b64))
print('内联 %s (%d bytes → %d bytes base64)' % (sh, len(open(sh,'rb').read()), len(b64)))
PY

# UFI-TOOLS 要求插件文件用 //<script> ... //</script> 包裹，否则不会被注入执行
head -n1 "$OUT" | grep -q '^//<script>' || { echo "❌ 缺少首行 //<script> 包裹标记"; exit 1; }
tail -n1 "$OUT" | grep -q '^//</script>' || { echo "❌ 缺少末行 //</script> 包裹标记"; exit 1; }
echo "✅ UFI-TOOLS 注入标记检查通过"

SIZE=$(wc -c <"$OUT" | tr -d ' ')
echo "产物：$OUT  (${SIZE} bytes)"
if [ "$SIZE" -gt "$LIMIT" ]; then
  echo "❌ 超过 UFI-TOOLS 插件上限 ${LIMIT} bytes"; exit 1
fi
echo "✅ 体积检查通过（上限 ${LIMIT} bytes）"

# 语法检查
if command -v sh >/dev/null; then sh -n "$SH" && echo "✅ shell 语法检查通过"; fi
if command -v node >/dev/null; then node --check "$OUT" && echo "✅ JS 语法检查通过"; fi

# 设备端逻辑测试（不需要真机）
if [ -f test/device.test.sh ]; then
  bash test/device.test.sh >/dev/null 2>&1 \
    && echo "✅ 设备端配置逻辑测试通过" \
    || { echo "❌ 设备端测试失败，运行 bash test/device.test.sh 看详情"; exit 1; }
fi

if [ -f test/kernel-selection.test.sh ]; then
  bash test/kernel-selection.test.sh
fi

if [ -f test/install-lock.test.sh ]; then
  bash test/install-lock.test.sh
fi

if [ -f test/install-migration.test.sh ]; then
  bash test/install-migration.test.sh
fi

if [ -f test/upgrade-rollback.test.sh ]; then
  bash test/upgrade-rollback.test.sh
fi

if [ -f test/stop-propagation.test.sh ]; then
  bash test/stop-propagation.test.sh
fi

if [ -f test/runtime-env.test.sh ]; then
  bash test/runtime-env.test.sh
fi

if [ -f test/watchdog.test.sh ]; then
  bash test/watchdog.test.sh
fi

if [ -f test/resource-status.test.sh ]; then
  bash test/resource-status.test.sh
fi

if [ -f test/scan.test.sh ]; then
  bash test/scan.test.sh
fi

# 发布产物必须确实携带当前设备脚本，避免安装旧构建产物。
if [ -f test/artifact.test.sh ]; then
  bash test/artifact.test.sh
fi
