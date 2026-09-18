# U30 Pro（MU5358）macOS：Root → 无线 ADB → 安装 UFI-TOOLS 完整版

> 对象：中兴 **U30 Pro / MU5358**（不是 U30 Air）。
> 本机验证固件：`U30ProV1.0.0B23` / `MU5358V1.0.0B23`，Apple Silicon + Homebrew `libusb`。
> 作者在 [#97](https://github.com/kanoqwq/UFI-TOOLS/issues/97) 的说明仍然成立：U30 Pro **支持**，但要先刷带无线 ADB 的 Root 包，之后流程与 F50 相同。
> B23 出厂 **没有** WebUI 能打开的 ADB。`USB_PORT_SETTING` 在开发者登录后仍会 `failure`。不要在 WebUI 里空转。

本仓库是 Android 后台，**不托管** Magisk 镜像、`tos.bin`、FDL、`custom_exec`。刷写器用开源 [TomKing062/spreadtrum_flash](https://github.com/TomKing062/spreadtrum_flash)（已归档，libusb 版 CLI 与社区「一键 Root」`.bat` 同族）。镜像请用与 **当前固件字母数字完全一致** 的社区 B23 包（本机验证指纹 `ZTE/MU5358/MU5358:15/AP3A.240905.015.A2/20260529.101320`）。

配套脚本：[`scripts/macos-u30pro/`](../scripts/macos-u30pro/)。给 agent 的操作说明：[`AGENT-U30-Pro-macOS.md`](AGENT-U30-Pro-macOS.md)。

## Tested device

| Field | Value |
|---|---|
| Model | `ZTE U30 Pro / MU5358` |
| Firmware | `V1.0.0B23` |
| Modem HW | `ums9632_modem` |
| Modem project | `QogirN5_PS` |
| Modem version | `5G_MODEM_V2_24A_W25.15.1_P13.19` |

---

## 0. 不要做

| 禁止 | 原因 |
|---|---|
| 把 F50 / U30 Air / 畅行 60 的系统镜像刷进 MU5358 | 注意事项写过：版本不对会出现 WiFi5 变 WiFi4 |
| 写 `uboot` / `splloader` / NV / 校准 / EFS | 砖机且难救 |
| `SET_NV`、原厂 `CHANGE_MODE=2` | 无界 NV 写入 / 旧工厂口 |
| 把 `boot_b.img` 当 Magisk 刷进 `init_boot` | `boot` 是 kernel 分区；Magisk 在 `init_boot` |
| 换非 **28103** 的面具 | 社区包写明：乱换会把「永久禁 OTA」弄坏 |
| 在 ARM64 Windows 虚机里跑原厂 SPD `rdavcom.sys` | 驱动只有 x86/amd64；libusb 还报 `hotplug unsupported`，`--kickto` 不可用 |
| 把 magisk.img / tos / custom_exec 推进 git | 固件 payload，不是本仓库该收的东西 |
| 关 Samba（文件共享） | 高级功能依赖它 |

---

## 1. 原理（为什么必须走下载模式）

B23 WebUI 是 mu3351 模板，残留 `usb_port.js`，但后端拒绝 `USB_PORT_SETTING`。社区 Root 包用展锐下载模式写两个分区：

- `trustos`（实际写当前槽，本机是 **`trustos_b`**）
- `init_boot`（`w_force`，本机是 **`init_boot_b`**）

`init_boot` 里的 overlay 会开 USB 调试 + **网络 ADB TCP 5555**，并停一批 FOTA。起来之后：

```text
adb connect 192.168.0.1:5555
adb install UFI-TOOLS_WEB_*.apk
```

浏览器：`http://192.168.0.1:2333`。高级功能要在后台里点「添加高级功能」，TTYD 默认 `http://192.168.0.1:1146`。

下载模式 USB：**VID `0x1782` PID `0x4d00`**（名如 `Sprd Gadget Serial`）。
日常网卡：**VID `0x19D2` PID `0x1354`**（`U30 Pro`）。重启后偶发 `0x19D2:0x0246`，macOS 往往挂不出 RNDIS。

---

## 2. 准备

### 2.1 软件

```bash
brew install libusb
# 编译 spd_dump（不要用 make 的 -s，Apple clang 会拒）
./scripts/macos-u30pro/build-spd_dump.sh
```

再准备：

- 与机身版本一致的 **U30Pro B23 一键 Root** 包（内含 `bin/magisk.img`、`bin/tos.bin`、面具 `Magisk_28103_*.apk`）
- 本仓库 Release 的完整版 APK，例如 `UFI-TOOLS_WEB_V4.0.0_*.apk`
- `adb`（`brew install --cask android-platform-tools`）

### 2.2 硬件动作（脚本代替不了）

一键包的「直插电」是：**先开等待，再关机插 USB**。先插再开脚本，brom 窗口经常已经过了。

1. 设备 **关机、灯灭**
2. **拔掉 USB**
3. 电脑上启动 `backup.sh` 或 `flash.sh`，看到 `Waiting for boot_diag...`
4. **再插回 Mac 机身口**（不要休眠 hub），插上后不要拔
5. 若多次 `find port failed` / 总线上看不到 `1782:4d00`，才需要短接测试点（要开盖，agent 不能远程做）

Kick 进 FDL 时日志可能出现 `FDL2: incompatible partition`，本机仍能读/写 slot b，**不是**立刻中止的理由。随后常有一次 `usb_recv ... TIMEOUT`，再 `DISABLE_TRANSCODE` 即可继续。

---

## 3. 备份（必须先做）

社区 Windows 包的注意事项写了必须备份，但包里往往 **没有** 备份脚本。macOS：

```bash
export SPD_DUMP=/path/to/spd_dump   # build-spd_dump.sh 的产物
export BACKUP_DIR="$HOME/u30-b23-backup-$(date +%Y%m%d-%H%M%S)"
./scripts/macos-u30pro/backup.sh
```

脚本会拒绝覆盖已有的 `init_boot.bin` / `trustos.bin`，因此每次请选择新的或空的 `BACKUP_DIR`。成功应看到约：

- `init_boot.bin` 8 MiB，`file` 为 Android bootimg，**没有** magisk overlay
- `trustos.bin` 6 MiB，DHTB 头；尾部约 1 MiB 全 0 是分区填充

本机备份时 `r init_boot` 实际读的是 **`init_boot_b`**，`r trustos` 读的是 **`trustos_b`**（`Device is using slot b`）。把这两份和以后提取的 `boot_b.img` 放在同一目录，不要当日常镜像刷回去。

核对 magisk 包是否匹配：原厂 `init_boot.bin` 与包内 `magisk.img` 应是 **同一 `ro.build.fingerprint`**，仅 magisk 那份带 overlay。脚本找不到指纹、指纹对不上、镜像头/大小不匹配，都会拒绝写入。

---

## 4. 写入

**必须用绝对路径。** 开源 `spd_dump` 的 `path DIR` 会改搜索目录，相对文件名会变成 `File does not exist.`，然后 `EXIT:0` 看起来像成功——本机第一次写就踩过，分区没动。

```bash
export SPD_DUMP=/path/to/spd_dump
export TOS=/abs/path/to/tos.bin
export MAGISK_IMG=/abs/path/to/magisk.img
./scripts/macos-u30pro/flash.sh
```

关机拔插时机与备份相同。成功日志应类似：

```text
Write Part Done: trustos_b, target: 0x4f4708, written: 0x4f4708
Force Write init_boot_b Done
EXIT:0
```

设备 `reset` 后回到 `19D2:1354`。等 `192.168.0.1` 能 ping，TCP **5555** 应开放。脚本会保留刷写日志，只有同时看到 `Write Part Done: trustos_` 和 `Force Write init_boot_` 才报告成功；`EXIT:0` 单独不算成功。

---

## 5. 安装 UFI-TOOLS

```bash
adb connect 192.168.0.1:5555
adb -s 192.168.0.1:5555 install -r /abs/path/to/UFI-TOOLS_WEB_V4.0.0.apk
adb -s 192.168.0.1:5555 install -r /abs/path/to/Magisk_28103.apk    # 只用包内这一份
adb -s 192.168.0.1:5555 shell monkey -p com.minikano.f50_sms -c android.intent.category.LAUNCHER 1
```

- 后台：<http://192.168.0.1:2333>
- 登录：**UFI 口令**默认 `admin`（应用里写的默认值，弱口令请改）；**官方后台密码**是原厂 WebUI 密码，不是 `admin`
- 点 **高级功能 → 添加高级功能**，按提示重启
- **不要关文件共享**
- TTYD：<http://192.168.0.1:1146>（口令=UFI 口令，输入不回显）
- 面具若提示修复环境，只用 28103

adb shell 默认仍是 `uid=2000`。TTYD 里 `id` 应为 `uid=0`。要让电脑 `adb shell su`，在面具里给 shell / UFI-TOOLS 授权。

---

## 6. 本机踩过、文档化以免再踩

| 现象 | 原因 | 处理 |
|---|---|---|
| `Waiting for boot_diag` → `find port failed` | 设备不在 `1782:4d00`，或先插后开脚本 | 关机，**先开脚本再插** |
| `libusb_claim_interface ... NO_DEVICE` | brom 窗口已过 | 立刻再开 wait，再拔插一次 |
| ARM64 Win11 + 包内 `spd_dump.exe` | `hotplug unsupported`，kick 被关掉 | 不要用 Apple Silicon 上的 Win11 跑原包 |
| `path ./flash` + `tos.bin` → `File does not exist.` 但 EXIT:0 | 上游工具对缺失文件可能继续并返回 0 | 保留日志，**不要盲目重试**；确认两条成功标记后再决定下一步 |
| `FDL2: incompatible partition` | GPT 探测警告 | 本机仍可读写 slot b |
| USB `19D2:0246`、Mac 无网卡 | 组合描述符变了 | 关机再插；不要当下载模式 |
| `USB_PORT_SETTING` → `failure` | B23 没实现 | 不要再写这个 goform |
| 测速走 Mac 默认路由 | Clash / 家宽网关 | 用 `--interface` 指向 U30 网卡，或直接用手机接 U30 Wi‑Fi |

---

## 7. 救砖

有备份时，下载模式下把 `init_boot.bin` / `trustos.bin` 写回对应分区（同样用绝对路径、`w` / `w_force`）。没有备份、又写坏了 `init_boot`，只剩短接 + 再刷匹配的 B23 包。不要碰 `splloader`。
