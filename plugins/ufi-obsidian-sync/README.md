# UFI Sync Node — UFI-TOOLS 的 Obsidian 同步插件

把一类资源受限的 Android/ARM64 设备变成持续在线的 Syncthing 节点，为 Obsidian
笔记库提供一个低功耗、可跨网络工作的中介副本。电脑、NAS 或其它 Syncthing 主机
不需要同时在线，也不需要与设备处于同一局域网。

这是面向 [UFI-TOOLS 完整版](https://github.com/kanoqwq/UFI-TOOLS/tree/http-server-version)
的单文件插件投稿。插件使用 UFI-TOOLS 的 Root Shell、开机脚本和看门狗能力，目标是
覆盖便携路由器、手机、平板等同一类低资源设备，而不是绑定某一个机型。

## 为什么使用 Syncthing 1.30.0

在我们的 Android/bionic 实机诊断中，当前官方 Linux ARM64 2.x 发布包表现为动态
glibc 链接，下载和校验都成功，但无法直接执行；官方 Linux ARM64 v1.30.0 发布包
则可以作为纯 Go 静态运行时启动，并与电脑端 2.x 进行协议互联。因此本插件固定安装
经过发布环节核验的 v1.30.0，电脑端继续使用各平台当前受支持的 Syncthing 版本。

这是一项面向资源受限 Android/ARM64 宿主的兼容策略，不是对 Syncthing 2.x 的替代。
相关版本与构建变化请以 [Syncthing 官方发布说明](https://github.com/syncthing/syncthing/releases)
为准。

## 功能

- 面板内配置 Obsidian 笔记库、电脑和其它 Syncthing 主机，不需要手写 XML。
- 内置安装、初始化、启停、状态、诊断、卸载和外部看门狗，不要求用户单独维护内核。
- 默认使用 `receiveonly`，把设备作为持续在线的存储中介；不会把设备上的手工修改
  发布回可信电脑。
- 支持全局发现、动态中继、TCP/QUIC，跨网络时不依赖固定的局域网地址。
- 使用 SHA256 白名单验证下载包，保留 Syncthing 上游 LICENSE；下载失败、校验失败或
  新进程启动失败时保留旧状态并回滚。
- 明确传递 Android 系统 CA 目录，保留完整 TLS 验证，不关闭证书检查。
- 针对低资源设备默认降低并发和缓存：顺序处理笔记库、单 copier、单 hasher、较小的
  接收与 puller 缓冲，以及可覆盖的 `GOMEMLIMIT`、`GOGC`、`GOMAXPROCS`。
- 面板显示受管进程树的 RSS、线程和同步状态；请求失败、数据缺失或电脑离线时不沿用
  旧的“在线”或“已完成”结论。
- 所有用户输入都经过前端和设备端二次校验；插件不读取、不显示、不上传 Syncthing
  API key、设备证书或宿主后台密码。

## 安装

1. 在 UFI-TOOLS 完整版中开启高级功能，确认设备具有 Root Shell。
2. 打开 [`dist/ufi-obsidian-sync.js`](dist/ufi-obsidian-sync.js)，完整复制首尾的
   `//<script>` 与 `//</script>` 标记。
3. 在 UFI-TOOLS 的“插件 / 自定义头部”中粘贴并保存，然后刷新页面。
4. 打开“UFI Sync Node”面板，添加至少一个笔记库和一台电脑，点击“保存并应用”。
5. 依次执行“环境体检”和“一键安装”。安装结束后，在电脑端添加面板显示的设备 ID，
   并把对应的 Folder ID 共享给它。

首次安装只安装受信任的固定内核，不提供在线升级按钮。下载任务在设备后台运行，面板
通过短请求轮询进度，以适应 UFI-TOOLS Root Shell 的单次请求上限。

## 数据与安全边界

`receiveonly` 副本是明文存储，不是历史备份：可信电脑发出的删除、覆盖和加密仍可能
传播到设备。重要笔记仍应在电脑端或 NAS 上保留独立备份。

插件默认忽略 `.obsidian/workspace.json`、`.obsidian/workspace-mobile.json`、`.git/`、
`.DS_Store`、`Thumbs.db` 和 `desktop.ini`。存储剩余空间低于安全阈值时拒绝启动，任何
情况下都不自动删除用户数据。

配置应用采用候选文件、语法检查、版本检查和原子替换；失败时恢复旧配置和旧服务状态。
当前共享暂存协议只支持一个管理页面提交配置，不建议多个标签页同时编辑并保存。

## 目录

```text
ufi-obsidian-sync-contribution/
├── plugin/obsidian-sync.src.js   插件源码（构建前占位）
├── device/ufisync.sh              设备端控制脚本
├── build.sh                       内联脚本、校验产物并运行测试
├── dist/ufi-obsidian-sync.js      可直接粘贴到 UFI-TOOLS 的单文件产物
├── test/                          Shell、前端、安装事务和安全回归
├── docs/ui-spec.md                界面与行为规格
└── THIRD_PARTY_NOTICES.md         Syncthing 的 MPL-2.0 声明
```

## 构建与测试

```bash
npm ci
npm test
```

测试覆盖 UFI-TOOLS 注入标记、Shell/JavaScript 语法、配置注入防护、设备 ID 校验、
安装锁、迁移、回滚、看门狗、资源状态、扫描和最终单文件产物一致性。

## 投稿说明

本目录作为 UFI-TOOLS 完整版中的插件贡献提交，目标是进入该项目的插件体系，并由维护者
决定是否加入插件商店的外部清单。插件商店收录与 GitHub 代码合并是两个独立步骤。

在 UFI-TOOLS 仓库中提交时，代码随该仓库根目录的 MIT License 接受审核；如果维护者
希望将插件作为独立仓库或独立下载包发布，再补充独立的许可证文件。Syncthing 本身仍按
[MPL-2.0](https://github.com/syncthing/syncthing/blob/v1.30.0/LICENSE) 分发，详见
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
