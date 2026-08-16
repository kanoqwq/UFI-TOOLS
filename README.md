# 🧰 UFI-TOOLS

> 一款面向某兴随身WIFI（F50/U30 Air）的多功能管理与扩展工具  
> 支持远程管理、信号监控、系统控制、插件扩展等丰富功能  
> 同时也提供其他某兴展锐Android手机/平板支持

**[UFI-TOOLS使用说明](https://github.com/kanoqwq/UFI-TOOLS/blob/http-server-version/User_Doc.md)**

F50 / U30Air 通用安装教程：[📺 B站视频](https://www.bilibili.com/video/BV1qUHpzeEDd)  
Magisk 模块版本（畅行60 / 云电脑）安装教程：[📺 B站视频](https://www.bilibili.com/video/BV1nsW4zpE1T)

---

## Star History

<a href="https://star-history.dera.page/#kanoqwq/UFI-TOOLS&type=date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=kanoqwq/UFI-TOOLS&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=kanoqwq/UFI-TOOLS&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=kanoqwq/UFI-TOOLS&type=date&legend=top-left" />
 </picture>
</a>

---

## 🧩 版本区分

UFI-TOOLS 提供 **Pocket Edition（PE版）** 与 **完整版本** 两种使用形态，满足不同场景需求：

| 版本类型 | 部署方式 | 适用设备 | 功能支持 | 典型用途 |
|-----------|-----------|-----------|-----------|-----------|
| 📱 **[Pocket Edition (PE版)](https://github.com/kanoqwq/UFI-TOOLS/tree/main)** | 仅需安装在手机上 | 手机端连接MIFI/UFI设备 | ⭐ 精简功能集<br>🚫 无需安装到随身WiFi<br>⚙️ 可远程控制随身WiFi | 手机控制随身WiFi设备，轻量远程管理 |
| 💻 **[完整版 (Full)](https://github.com/kanoqwq/UFI-TOOLS/tree/http-server-version)** | 安装在目标设备（随身WiFi / 平板 / 路由） | 随身WIFI（U30 Air/F50 等） | 🌟 全功能支持<br>🧠 插件商店完整可用<br>🔐 可开启高级功能 | 深度系统管理与插件扩展，完全控制目标机器 |

> 💡 PE版适合普通用户快速使用；完整版为进阶用户或发烧友设计。

> 💡 如何知道自己的设备是否支持UFI-TOOLS？
>
> - 只要你是某兴随身WiFi，紫光平台，Android系统，就可以尝试使用UFI-TOOLS进行设备管理。
> - 直接下载PE版本连接设备进行尝试。

---

## 📘 项目简介

**UFI-TOOLS** 是为 **zxe（某兴）+ 展锐 / 紫光平台设备** 打造的全能系统管理与扩展框架。  
支持在 **便携路由器、手机、平板** 等多种设备上运行，可通过 **Web UI / APK / Magisk 模块** 等方式部署。

- ✅ 适配设备：zxe F50、U30 Air、畅行60、远航60系列、某兴云电脑平板等  
- 🧩 模块化插件系统  
- 🌐 支持远程网页控制与设备集群管理  
- ⚙️ 可作为后台服务运行，支持开机自启  

---

## ⚙️ 核心功能模块

### 🔧 系统与设备控制
- 一键开启高级功能，获取系统最高权限（Root 级控制）  
- **性能模式切换 / CPU 核心控制 / 电池定量停充**  
- **USB 调试自动启用** 与 **网络 USB 调试自动启动**  
- 支持 **文件共享 / 指示灯控制 / OTA 更新**  
- 支持 **开机自启脚本与后台服务**  

---

### 📶 网络与信号管理
- **免重启锁频段 / 锁小区**（即时生效）  
- 支持 **3G / 4G / 5G 网络模式切换**  
- 实时监测：RSRP、SINR、PCI、Band、QCI、SNR、QoS、IPv6 等信号、频段，速率等指标  
- **内网测速** 与实时速率图表可视化  

---

### 💬 通信与命令功能
- 短信发送、接收与 **自动转发**  
- 内置 **AT 命令终端**（支持自定义命令交互）  
- 支持 **远程 SSH 管理** 与命令行访问（需开启高级功能）  
- 提供轻量 **Web 控制台**，支持局域网 / 穿透远控  

---

### 🧩 插件商店系统
UFI-TOOLS 内置 **插件商店**，可在线下载、安装多种功能插件。  
插件服务器已收录常用组件，涵盖系统扩展、AI、网络、自动化等领域：

| 类别 | 插件名称 | 功能说明 |
|------|-----------|-----------|
| 🛡️ 系统安全 | ADGuardHome | 广告过滤、DNS 管理 |
| 📊 状态监控 | 流量状态卡片 | 实时显示设备流量与速率 |
| 🤖 智能应用 | AI 看板 | 智能监控信息展示 |
| 🔑 远程访问 | SSH 工具 | 提供远程命令行访问入口 |
| ⚙️ 系统控制 | CPU 核心控制 | 动态管理核心启停 |
| 🎨 外观自定义 | 主题布局编辑 | 自定义界面主题与排版 |
| 🔋 电源管理 | 电池定量停充 | 延长电池寿命，智能控制充电阈值 |
| 🏫 网络支持 | EasyConnect | 校园网 VPN 支持 |
| ⏰ 自动化 | Crontab 定时任务 | 定时推送与脚本任务 |
| 🌐 远程互联 | EasyTier 异地组网 | 多设备跨地域组网互通 |

> 🔓 插件系统模块化设计，以上仅展示部分插件，未来将持续扩展更多功能。

---

### 🧠 高级功能
开启“高级功能”后可解锁系统特权功能：
- 获取设备最高系统权限  
- 访问隐藏接口与底层管理模块  
- 解锁全部插件商店插件  
- 启用极速更新通道（更新零等待）  
- 支持远程SSH访问、文件推送、系统级调试  

---

### 📱 平台兼容性
支持以下设备及运行方式：

- 📲 **Magisk 模块安装** (适合手机/平板)
- 💻 **一键安装 / 投屏安装** （推荐，适合随身WiFi）   

**适配机型：**

- 某兴畅行60 / 远航60 / 畅行60Plus  
- 某兴云电脑平板（W200DS系列）  
- F50、U30 Air  
- 以及其他紫光 CPU + 某兴 MyOS 13 系统设备（理论兼容）  

---

### 🌐 远程管理与网页控制
- 内置轻量级 Web Server，可通过浏览器访问控制界面  
- 支持：
  - 设备状态卡片  
  - 实时性能监控  
  - 插件商店  
  - 网络控制与调试  
- 默认访问地址：`http://设备IP:2333`  

---

## 🌟 项目特点与优势
- 🧩 模块化设计：核心 + 插件架构，灵活扩展  
- ⚡ 免重启锁频段 / 锁小区：调试更高效  
- 📈 实时可视化监控：信号、CPU、温度、内存、速率  
- 🔐 高级功能：一键获取系统权限、为极客用户定制提供专属功能
- 🧠 多平台支持：手机 / 平板 / 随身WiFi 全面兼容  
- 🔄 极速更新机制：自动保持最新版本  
- 🖥️ 双端控制：浏览器操作支持移动端与PC端  
- ☁️ 异地组网：通过 EasyTier 轻松实现远程互联  
- 🐱 猫猫插件：智能访问互联网（需额外配置）  

---

## ⚠️ 注意事项
- 部分功能依赖于具体设备型号或系统版本。  
- 插件商店部分插件需启用「高级功能」后才能使用。  
- 使用高级功能前，请备份重要数据。  
- 项目测试环境：  
  `U30Air_SSVB14 / MU300_ZYV1.0.0B09 / 畅行60（Rooted） / 畅行60Plus（Rooted） / 远航60（Rooted） / 云电脑平板（Rooted）`  

---

## 📜 开源协议
本项目遵循 **MIT License**  
可自由使用、修改与分发，但请保留作者署名。

欢迎提交 Issue / Pull Request 一起完善项目 💡  

> 本项目完全开源免费，如果你喜欢这个项目的话，也可以请我喝一杯咖啡~
>
> | ![ali_pay](./images/ali_pay.jpeg) | ![wechat_pay](./images/zsm.png) |
> | ------------------------------- | ------------------------------- |
>

> 欢迎加入群聊一起讨论！
> TG：[t.me/ufi_tools_chat](https://github.com/kanoqwq/UFI-TOOLS/tree/http-server-version)
>
> | ![group2](./images/group_2.jpg) | ![group3](./images/group_3.jpg) |
> | ------------------------------- | ------------------------------- |
>

