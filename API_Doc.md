## 0. 写在前面

> **本API文档适用于 `UFI-TOOLS v4.1.3`版本**
> **本文档中 UFI-TOOLS 自身的`POST`请求体均为`JSON`格式**（例外：`/api/upload_img` 为 `multipart/form-data`；`/api/speedtest` 无请求体）
> **本文档中所有`GET`请求参数均为`query`参数**
> **中兴官方接口（`/api/goform/...`）为`application/x-www-form-urlencoded`表单格式，详见 [3.13 节](#313-反向代理官方web模块goform-速查)**

**服务地址**

- UFI-TOOLS Web 服务监听 `0.0.0.0:2333`，浏览器访问 `http://<设备IP>:2333/`。
- 所有 UFI-TOOLS 自身 API 以 `/api/` 开头；前端以相对路径 `/api` 发起同源请求。
- 中兴官方 WEB 后台运行在 `http://<设备IP>:8080`，`/api/goform/...` 会被反向代理到该地址。

**通用响应约定**

- 除特殊说明外，响应均为 JSON，且带 `Access-Control-Allow-Origin: *` 响应头。
- 失败统一返回 `{"error":"..."}`（多数为 HTTP 500，个别为 400/403/404）。
- 鉴权失败返回 `401 Unauthorized`（空响应体），见第 1 节。

------

## 1. 鉴权与请求签名规则

签名机制起到如下作用：

- 防止请求被伪造（如跨站、重放等）
- 服务器可验证 `kano-sign` 是否有效、是否与 `kano-t` 匹配
- 简单的"认证 + 防篡改"方式

### 1.1 需要携带的请求头

除 [1.4 白名单](#14-免认证端点白名单) 中的端点外，所有 `/api/` 请求（包括 `/api/goform/...` 与 `/api/proxy/...`）都必须携带以下三个请求头：

| Header 键      | 说明                                                         |
| -------------- | ------------------------------------------------------------ |
| `kano-t`       | 当前时间戳（毫秒，`Date.now()`）                              |
| `kano-sign`    | 用于验证请求合法性的签名字符串（算法见下）                    |
| `authorization` | 登录口令经过 SHA-256 后的小写十六进制字符串。初始默认口令为 `admin` |

> 服务端会将 `authorization` 再次做 SHA-256 后与存储的口令哈希做常量时间比对，等价于要求 `authorization == SHA256(口令)`。

------

### 1.2 签名计算逻辑

签名的核心公式如下：

```
kano-sign = SHA256( SHA256(part1) + SHA256(part2) )
```

具体步骤如下：

#### (1) 构造原始数据：

```js
rawData = "minikano" + HTTP_METHOD + URL_PATH + 时间戳
```

- `HTTP_METHOD`：请求方法，如 `GET` / `POST`（全大写）
- `URL_PATH`：请求路径（**不包含 query 参数**），如 `/api/data`
- `时间戳`：`Date.now()`，即当前毫秒时间戳
- `/api/proxy/...` 例外：签名使用原始请求路径（即包含 `--目标URL` 的完整路径，仅做前导斜杠归一化）

#### (2) 使用 HMAC-MD5 进行第一步加密：

```js
hmac = HMAC_MD5(rawData, secretKey)
```

- 密钥固定为：

  ```js
  "minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd"
  ```

#### (3) 将 HMAC 值（16 字节）二分为两部分：

- `part1`：前 8 字节
- `part2`：后 8 字节

#### (4) 各部分再做 SHA256：

```js
sha1 = SHA256(part1)   // 32 字节
sha2 = SHA256(part2)   // 32 字节
```

#### (5) 连接并最终 SHA256：

```js
finalHash = SHA256(sha1 + sha2)   // 小写 hex 输出
```

------

### 1.3 使用示例

假设请求为：

```js
fetch("/api/user?id=123", { method: "POST" });
```

内部处理流程如下：

- 提取方法：`POST`
- 提取路径：`/api/user`
- 获取当前时间戳：例如 `1718438543772`
- 构造签名原始数据：

  ```
  minikanoPOST/api/user1718438543772
  ```

- 使用上述算法生成签名，并添加请求头：

```http
kano-t: 1718438543772
kano-sign: <计算后的SHA256哈希>
authorization: <SHA256(口令)的小写hex>
```

**JS代码参考：[https://github.com/kanoqwq/UFI-TOOLS/blob/http-server-version/app/frontEnd/public/script/requests.js](https://github.com/kanoqwq/UFI-TOOLS/blob/http-server-version/app/frontEnd/public/script/requests.js)**

------

### 1.4 免认证端点（白名单）

以下端点**无需**携带上述三个请求头：

| 类型     | 端点                     | 说明                       |
| -------- | ------------------------ | -------------------------- |
| 精确匹配 | `GET /api/get_custom_head` | 读取插件内容               |
| 精确匹配 | `GET /api/version_info`    | 应用版本信息               |
| 精确匹配 | `GET /api/need_token`      | 是否启用口令认证           |
| 精确匹配 | `GET /api/get_theme`       | 主题配置                   |
| 精确匹配 | `GET /api/SELinux`         | SELinux 状态               |
| 前缀匹配 | `/api/uploads`、`/api/uploads/...` | 用户上传的文件（图片、脚本等） |
| 非api路径 | `/{任意路径}`             | 静态资源（前端页面、脚本、语言包等） |

### 1.5 其他说明

- 鉴权失败统一返回 `401 Unauthorized`（空响应体）。
- 当 `login_token_enabled` 设为 `false` 时鉴权完全关闭（该开关**没有 HTTP 端点**，只能在本机 App 界面中修改）。
- 若从未修改过口令，默认口令为 `admin`，`/api/is_weak_token` 会将其标记为弱口令。

------

## 2. API 请求示例

**GET 请求示例**（执行 AT 指令）

```http
GET /api/AT?command=AT%2BCSQ&slot=0
kano-t: 1718438543772
kano-sign: <签名>
authorization: <SHA256(口令)的小写hex>
```

返回：

```json
{
  "result": "+CSQ: 25,99 OK"
}
```

**POST 请求示例**（Root Shell 执行命令）

```http
POST /api/root_shell
Content-Type: application/json
kano-t: 1718438543772
kano-sign: <签名>
authorization: <SHA256(口令)的小写hex>

{ "command": "whoami", "timeout": 10000 }
```

返回：

```json
{
  "result": { "done": true, "content": "root" }
}
```

------

## 3. 功能模块

### 3.1 设备基础信息模块（Base Device Info Module）

| 方法 | 路径                    | 描述                                     | 参数                                   | 是否认证 |
| ---- | ----------------------- | ---------------------------------------- | -------------------------------------- | -------- |
| GET  | `/api/baseDeviceInfo`   | 获取设备总览信息（电量、温度、CPU、内存、存储、流量等） | 无          | 是 |
| GET  | `/api/connInfo`         | 获取 `/proc/net` 各协议连接数统计        | 无                                     | 是 |
| GET  | `/api/cellularUsage`    | 查询时间区间内的蜂窝流量用量             | `startTime`、`endTime`、`method`       | 是 |
| POST | `/api/accept_terms`     | 记录用户已阅读使用条款                   | 无                                     | 是 |
| POST | `/api/set_nickname`     | 设置设备别名（超 255 字符自动截断）      | JSON：`{ "nickname": "..." }`          | 是 |
| GET  | `/api/version_info`     | 获取应用版本号、设备型号、别名、协议接受状态 | 无                                 | **否** |
| GET  | `/api/device_id`        | 获取设备唯一 UUID（用于公告/上报接口）   | 无                                     | 是 |
| GET  | `/api/SELinux`          | 获取 SELinux 状态（`Enforcing`/`Permissive` 等） | 无                              | **否** |
| GET  | `/api/need_token`       | 获取是否启用了登录口令认证               | 无                                     | **否** |
| GET  | `/api/usb_status`       | 获取 USB 设备树、接口速率、Type-C 模式   | 无                                     | 是 |
| GET  | `/api/volte_status`     | 查询 VoLTE 开关状态                      | Query：`slot`（0/1，默认 0）           | 是 |
| POST | `/api/volte_status`     | 设置 VoLTE 开关                          | JSON：`{ "enabled": "0"/"1", "slot": "0"/"1" }` | 是 |
| GET  | `/api/vonr_status`      | 查询 VoNR 开关状态                       | Query：`slot`（0/1，默认 0）           | 是 |
| POST | `/api/vonr_status`      | 设置 VoNR 开关                           | JSON：`{ "enabled": "0"/"1", "slot": "0"/"1" }` | 是 |
| POST | `/api/set_cookie`       | 保存中兴官方后台登录 Cookie              | JSON：`{ "cookie": "..." }`            | 是 |
| GET  | `/api/get_cookie`       | 读取中兴官方后台登录 Cookie              | 无                                     | 是 |

#### `GET /api/baseDeviceInfo` 响应字段

```json
{
  "app_ver": "4.1.3",
  "app_ver_code": "20260908",
  "model": "U30Air",
  "battery": "80",
  "daily_data": 123456789,
  "monthly_data": 12345678901,
  "internal_available_storage": 123456789,
  "internal_used_storage": 123456789,
  "internal_total_storage": 123456789,
  "external_total_storage": 0,
  "external_used_storage": 0,
  "external_available_storage": 0,
  "cpu_temp_list": "[{\"type\":\"cpu\",\"temp\":45}]",
  "cpu_temp": 45,
  "client_ip": "192.168.0.100",
  "cpu_usage": 23.5,
  "mem_usage": 61.2,
  "cpuFreqInfo": "...",
  "cpuUsageInfo": "...",
  "memInfo": "...",
  "current_now": -350000,
  "voltage_now": 3900000,
  "is_reached_data_flow_limit": false
}
```

| 字段                          | 类型    | 说明                                       |
| ----------------------------- | ------- | ------------------------------------------ |
| `app_ver` / `app_ver_code`    | string  | 应用版本号 / 版本Code                      |
| `model`                       | string  | 设备型号                                   |
| `battery`                     | string  | 电量百分比                                 |
| `daily_data` / `monthly_data` | number  | 当日 / 当月已用流量（**字节**）            |
| `internal_*_storage`          | number  | 内部存储 可用/已用/总量（字节）            |
| `external_*_storage`          | number  | 外部存储（可移动设备）总量/已用/可用（字节） |
| `cpu_temp_list`               | string  | 各温度传感器 JSON 数组（字符串形式）       |
| `cpu_temp`                    | number  | 最高 CPU 温度（℃）                         |
| `client_ip`                   | string  | 请求客户端 IP                              |
| `cpu_usage` / `mem_usage`     | number  | CPU / 内存使用率（百分比）                 |
| `cpuFreqInfo` / `cpuUsageInfo` / `memInfo` | string | 各核心频率 / 使用率 / 内存原始 JSON 片段 |
| `current_now` / `voltage_now` | number  | 瞬时电流（µA）/ 电压（µV），可为负值       |
| `is_reached_data_flow_limit`  | bool    | 是否已达流量阈值（前端据此提示断网状态）   |

> 部分字段在采集失败时为 `null`。

#### `GET /api/cellularUsage`

| 参数       | 必填 | 说明                                                         |
| ---------- | ---- | ------------------------------------------------------------ |
| `startTime` | 是   | 起始时间（毫秒时间戳）                                        |
| `endTime`   | 是   | 结束时间（毫秒时间戳）                                        |
| `method`    | 否   | `date-range`（默认，逐日统计）/ `mills-range`（区间总量）     |

返回：

```json
// method=date-range：usage 为区间内逐日数组（usage 为字符串形式的字节数）
{
  "result": "success",
  "usage": [
    { "date": "2026-09-01", "usage": "123456" },
    { "date": "2026-09-02", "usage": "234567" }
  ]
}

// method=mills-range：usage 为区间总量（字符串形式的数值）
{ "result": "success", "usage": "123456789" }
```

#### VoLTE / VoNR 说明

- **GET**：`slot` 从 **query** 读取，返回 `{"enabled": true/false}`。
- **POST**：`enabled`、`slot` 均从 **JSON body** 读取（`"0"` 关闭，非 `"0"` 一律视为开启；`slot` 非 `"0"` 一律视为卡槽 1），返回 `{"result":"success"}`。
- 注意：前端在 POST 时会把 `slot` 放在 query 中，但服务端 POST 只读取 body 中的 `slot`（缺省为卡槽 0）。第三方对接请通过 **body** 传递 `slot`。

------

### 3.2 配置模块（Config Module）

| 方法 | 路径                      | 描述                     | 参数                                                         | 是否认证 |
| ---- | ------------------------- | ------------------------ | ------------------------------------------------------------ | -------- |
| GET  | `/api/is_weak_token`      | 当前口令是否为弱口令     | 无                                                           | 是 |
| POST | `/api/set_token`          | 修改登录口令             | JSON：`{ "token": "新口令" }`                                 | 是 |
| GET  | `/api/get_res_server`     | 获取资源服务器地址       | 无                                                           | 是 |
| POST | `/api/set_res_server`     | 设置资源服务器地址       | JSON：`{ "res_server": "https://..." }`                       | 是 |
| GET  | `/api/get_log_status`     | 获取调试日志开关状态     | 无                                                           | 是 |
| POST | `/api/set_log_status`     | 设置调试日志开关         | JSON：`{ "debug_log_enabled": true/false }`                   | 是 |
| POST | `/api/set_wakelock_status`| 设置 CPU 唤醒锁开关      | JSON：`{ "wakelock_enabled": true/false }`                    | 是 |
| POST | `/api/set_data_limit`     | 设置 UFI-TOOLS 自身的流量阈值与提醒开关 | JSON：见下表                                   | 是 |
| GET  | `/api/get_data_limit`     | 读取流量阈值配置         | 无                                                           | 是 |

#### `POST /api/set_token` 口令规则

- 不能为空；长度 ≥ 8 位且 ≤ 128 位；
- 必须同时包含字母和数字（正则 `^(?=.*[a-zA-Z])(?=.*\d).{8,128}$`）；
- 成功返回 `{"result":"success"}`，不合规返回 `{"error":"..."}`（HTTP 500）。

#### `POST /api/set_data_limit` 请求字段

```json
{
  "data_flow_limit_enabled": "1",
  "data_limit_status_forward_enabled": "1",
  "data_flow_max_limit": 10737418240,
  "data_flow_check_daily_or_monthly": "monthly",
  "data_check_reference": "android"
}
```

| 字段                                 | 说明                                                         |
| ------------------------------------ | ------------------------------------------------------------ |
| `data_flow_limit_enabled`            | 是否启用流量限制，接受 `"1"/"0"` 或布尔值                     |
| `data_limit_status_forward_enabled`  | 达到阈值后是否推送提醒                                       |
| `data_flow_max_limit`                | 流量上限（**字节**）；≤ 0 会被归一化为 `-1`（表示不限制）     |
| `data_flow_check_daily_or_monthly`   | 统计周期：`daily` / `monthly`（其它值归为 `monthly`）         |
| `data_check_reference`               | 流量统计口径：`android` 或 `ufi`（两者等价，均存为 `android`）；其它值为 `default` |

`GET /api/get_data_limit` 返回：

```json
{
  "data_flow_limit_enabled": "1",
  "data_flow_max_limit": 10737418240,
  "data_flow_check_daily_or_monthly": "monthly",
  "data_check_reference": "android",
  "data_limit_status_forward_enabled": "1"
}
```

------

### 3.3 ADB 模块（ADB Module）

> v4.1.3 起，"USB调试"更名为**有线adb**（`usb_port_switch`），"ADB自启"更名为**无线adb**（本模块）。

| 方法 | 路径                            | 描述                           | 参数                                    | 是否认证 |
| ---- | ------------------------------- | ------------------------------ | --------------------------------------- | -------- |
| POST | `/api/update_admin_pwd`         | 更新官方后台密码（明文存储）   | JSON：`{ "password": "..." }`           | 是       |
| GET  | `/api/get_official_web_password`| 读取官方后台密码（**明文返回**） | 无                                    | 是       |
| GET  | `/api/adb_wifi_setting`         | 获取无线 ADB 自启状态          | 无                                      | 是       |
| POST | `/api/adb_wifi_setting`         | 开启/关闭无线 ADB 自启         | JSON：`{ "enabled": true/false, "password": "..." }` | 是 |
| GET  | `/api/adb_alive`                | 无线 ADB 当前是否就绪          | 无                                      | 是       |

- `POST /api/adb_wifi_setting`：`enabled=true` 时会将 `password` 同时保存为官方后台密码（`ADMIN_PWD`）；`enabled=false` 时会清除已保存的密码。返回 `{"result":"success","enabled":"true"}`（注意 `enabled` 为字符串）。
- `GET /api/adb_alive` 返回 `{"result":"true"}` 或 `{"result":"false"}`（字符串）。
- 有线 adb（USB 调试）不通过本模块控制，由官方接口 `goformId=USB_PORT_SETTING` 管理（见 3.13）。

------

### 3.4 AT 指令模块（AT Module）

| 方法 | 路径                            | 描述                       | 参数                                    | 是否认证 |
| ---- | ------------------------------- | -------------------------- | --------------------------------------- | -------- |
| GET  | `/api/AT`                       | 执行 AT 指令并返回结果     | Query：`command`（必填）、`slot`（默认 0） | 是   |
| GET  | `/api/getSupportNrBandList`     | 查询基带支持的 NR（5G）频段列表 | Query：`slot`（默认 0）            | 是       |

#### `GET /api/AT`

- `command` 必须以 `AT` 开头（不区分大小写），否则报错；
- 通过设备内置的 `sendat` 工具执行，响应中的换行会被去除；
- 返回 `{"result":"+CSQ: 25,99 OK"}`；失败返回 `{"error":"AT指令执行错误：..."}`（HTTP 500）。

```
GET /api/AT?command=AT%2BCGEQOSRDP%3D1&slot=0
```

#### `GET /api/getSupportNrBandList`

- 通过 `AT+SP5GCMDS="get nr support_band"` 查询基带支持的 NR 频段；
- 结果带**进程内缓存**（每次服务启动后首次查询实际执行 AT，之后直接返回缓存）；
- 返回 `{"slot":0,"band_list":[1,3,5,8,...]}`；查询失败返回 `{"error":"..."}`（HTTP 500）。

------

### 3.5 高级功能模块（Advanced Tools Module）

| 方法 | 路径                    | 描述                                   | 参数                                    | 是否认证 |
| ---- | ----------------------- | -------------------------------------- | --------------------------------------- | -------- |
| GET  | `/api/smbPath`          | 开启/关闭"高级功能"（高级模式基础设施）| Query：`enable`（必填，`1` 开启）       | 是       |
| GET  | `/api/disable_fota`     | 禁用系统 OTA 更新                      | 无                                      | 是       |
| GET  | `/api/hasTTYD`          | 探测 ttyd Web 终端是否存活             | Query：`port`（必填，ttyd 端口）        | 是       |
| POST | `/api/user_shell`       | 以 app（shell）权限执行命令            | JSON：`{ "command": "..." }`            | 是       |
| GET  | `/api/one_click_shell`  | 一键进入工程模式并执行 `/sdcard/one_click_shell.sh` | 无                         | 是       |
| POST | `/api/root_shell`       | 以 **root** 权限执行命令（需高级功能） | JSON：`{ "command": "...", "timeout": 100000 }` | 是 |

#### `GET /api/smbPath?enable=1`

- `enable=1`：开启高级功能——写入 samba 配置并启动保活脚本（ttyd 终端、socat root shell、SMB 等基础设施），返回 `{"result":"执行成功，等待1-2分钟即可生效！..."}`；
- `enable` 为其它值：关闭高级功能（删除 smb.conf、停止保活）；
- 执行失败返回 `{"error":"..."}`（HTTP 500）。开启依赖 root shell socket 或无线 ADB 可用。

#### `POST /api/root_shell`

- `command`：要执行的命令（必填）；
- `timeout`：超时毫秒数，默认 `100000`，超过 `100000` 会被截断为 `100000`；
- 依赖高级功能开启后创建的 socat unix socket（`files/kano_root_shell.sock`），socket 不存在时返回错误"没有找到 socat 创建的 sock (高级功能是否开启？)"；
- 返回 `{"result":{"done":true,"content":"..."}}`；失败返回 `{"error":"..."}`（HTTP 500）。

#### `POST /api/user_shell`

- `command`：要执行的命令（必填非空）；
- 返回 `{"result":{"done":true,"content":"..."}}`，权限为 app（shell）用户，无需开启高级功能。

#### `GET /api/hasTTYD?port=1146`

- 探测网关 IP 上指定端口的 HTTP 服务是否可达（ttyd 终端默认端口 `1146`，由高级功能脚本拉起）；
- 返回 `{"code":"200","ip":"<网关IP>:<端口>"}`，`code` 为 HTTP 状态码字符串，前端据 `code == "200"` 内嵌 iframe 终端。

------

### 3.6 OTA 模块（OTA Module）

| 方法 | 路径                       | 描述                      | 参数                     | 是否认证 | 备注                                |
| ---- | -------------------------- | ------------------------- | ------------------------ | -------- | ----------------------------------- |
| GET  | `/api/check_update`        | 拉取版本列表与更新日志    | 无                       | 是       | 调用资源服务器（alist）接口          |
| POST | `/api/download_apk`        | 开始下载 APK 文件         | JSON：`{ "apk_url": "..." }` | 是   | 后台线程异步下载，支持状态查询       |
| GET  | `/api/download_apk_status` | 查询下载进度与状态        | 无                       | 是       | 前端每 500ms 轮询                    |
| POST | `/api/install_apk`         | 安装已下载的 APK 文件     | 无                       | 是       | 优先 socat（root），否则走 ADB 自动化 |

#### `GET /api/check_update` 响应

```json
{
  "base_uri": "https://pan.kanokano.cn/d/UFI-TOOLS-UPDATE/",
  "alist_res": { "code": 200, "message": "success", "data": { "content": [ { "name": "ufi-tools-4.1.3.apk", "modified": "...", "size": 12345678 } ] } },
  "changelog": "v4.1.3<br>- ...<br>- ..."
}
```

- `base_uri`：APK 下载根地址（`资源服务器/d/UFI-TOOLS-UPDATE/`）；
- `alist_res`：alist `/api/fs/list` 原始响应，版本文件列表在 `data.content` 中；
- `changelog`：changelog.txt 内容，换行已替换为 `<br>`。

#### `GET /api/download_apk_status` 响应

```json
{ "status": "downloading", "percent": 42, "error": "" }
```

- `status`：`idle`（空闲）/ `downloading`（下载中）/ `done`（完成）/ `error`（失败）；
- `percent`：0-100；`error`：失败原因，无错误时为空字符串。
- 下载到设备 `Android/data/com.minikano.f50_sms/files/downloaded_app.apk`，同一 URL 下载中去重。

#### `POST /api/install_apk`

- 无请求参数；流式返回 `{"result":"success"}` 或 `{"error":"..."}`；
- 若 root shell socket 可用（`whoami` 返回 root），通过 socat 执行 `pm install -r -g` 静默安装；
- 否则回退到 ADB 自动化：自动打开工程模式 → DEBUG&LOG → Adb shell → 注入安装脚本（需要无线 ADB 开启）。

------

### 3.7 插件模块（Plugins Module）

插件本质是一段注入到前端页面的自定义 HTML/JS 文本。

| 方法 | 路径                     | 描述                   | 参数                                     | 是否认证 |
| ---- | ------------------------ | ---------------------- | ---------------------------------------- | -------- |
| POST | `/api/set_custom_head`   | 保存插件文本           | JSON：`{ "text": "..." }`                | 是       |
| GET  | `/api/plugins_store`     | 获取官方插件市场列表   | 无                                       | 是       |
| GET  | `/api/get_custom_head`   | 读取插件文本           | 无                                       | **否**   |

#### `POST /api/set_custom_head` 大小限制

- **后端硬限制 5MB**：以整个 JSON 请求体的 UTF-8 字节数计算，超出返回 `{"error":"配置出错: 插件总容量超出限制: xKB/5120KB"}`；
- 前端自身限制为 10MB；
- 返回 `{"result":"success"}`。

#### `GET /api/plugins_store` 响应

```json
{
  "download_url": "https://pan.kanokano.cn/d/UFI-TOOLS-UPDATE/plugins/ufi-tools-plugins",
  "res": { "code": 200, "message": "success", "data": { "content": [ { "name": "hello.js", "modified": "...", "hash_info": { "md5": "..." } } ] } }
}
```

- `download_url + "/" + name` 即插件下载地址；插件源格式规范见 [第 5 节](#5-ufi-tools-插件源-json-规范)。
- 前端也支持自定义插件仓库地址，自定义仓库内容通过 `/api/proxy/--<仓库URL>` 拉取（见 3.12）。

------

### 3.8 短信转发模块（SMS Forward Module）

| 方法 | 路径                                | 描述                       | 参数                                                         | 是否认证 |
| ---- | ----------------------------------- | -------------------------- | ------------------------------------------------------------ | -------- |
| GET  | `/api/sms_forward_method`           | 获取当前转发渠道           | 无                                                           | 是       |
| POST | `/api/sms_forward_mail`             | 配置 SMTP 邮件转发         | JSON：`{ "smtp_host", "smtp_port", "smtp_to", "smtp_username", "smtp_password", "smtp_from", "smtp_from_name", "forward_dev_info" }` | 是 |
| GET  | `/api/sms_forward_mail`             | 读取 SMTP 配置（**明文含密码**） | 无                                                     | 是       |
| POST | `/api/sms_forward_curl`             | 配置 curl 命令转发         | JSON：`{ "curl_text": "..." }`                                | 是       |
| GET  | `/api/sms_forward_curl`             | 读取 curl 转发配置         | 无                                                           | 是       |
| POST | `/api/sms_forward_dingtalk`         | 配置钉钉 webhook 转发      | JSON：`{ "webhook_url", "secret", "forward_dev_info" }`       | 是       |
| GET  | `/api/sms_forward_dingtalk`         | 读取钉钉转发配置           | 无                                                           | 是       |
| POST | `/api/sms_forward_enabled`          | 设置短信转发总开关         | Query：`enable`（必填，`0`/`1`）                              | 是       |
| GET  | `/api/sms_forward_enabled`          | 读取短信转发开关状态       | 无                                                           | 是       |
| POST | `/api/power_status_forward_enabled` | 设置电量信息转发开关       | Query：`enable`（必填，`0`/`1`）                              | 是       |
| GET  | `/api/power_status_forward_enabled` | 读取电量转发开关状态       | 无                                                           | 是       |
| POST | `/api/sms_forward_blacklist`        | 设置短信转发黑名单         | JSON：`{ "phone": "...", "keywords": "..." }`                 | 是       |
| GET  | `/api/sms_forward_blacklist`        | 读取黑名单                 | 无                                                           | 是       |
| POST | `/api/do_forward_msg`               | 用当前渠道主动推送一条消息 | JSON：`{ "address", "body", "is_sms", "timestamp" }`          | 是       |

#### 参数说明

- `POST /api/sms_forward_mail`：`smtp_host`、`smtp_to`、`smtp_username`、`smtp_password` 必填；`smtp_port` 缺省为 `"465"`；`forward_dev_info` 为 `"0"`/`"1"`（转发内容是否附带设备状态信息）。保存成功后会**立即发送一封测试邮件**（发件人标识 `1145141919810`，内容 `UFI-TOOLS TEST消息`）。
- `smtp_from` / `smtp_from_name`（可选，本次新增）：分别表示**发件邮箱**与**发件人显示名**。部分邮件服务商的「SMTP 认证用户名」与「发件邮箱」不是同一个值 —— 例如 Resend 的用户名固定是 `resend`（密码才是 API Key）、Mailjet 用 API Key 当用户名、SMTP2GO 的用户名只是中继凭据，此时**必须显式填写 `smtp_from`**，否则服务商会以「发件地址/域名未验证」拒收。`smtp_from` 留空时回退为 `smtp_username`（兼容自建邮箱、QQ 邮箱等用户名即发件人的场景）；若填写则必须包含 `@`，否则接口返回 500 `{"error":"SMTP配置出错"}`。
- `smtp_to` 支持**逗号分隔的多个收件人**：例如 `"a@x.com, b@y.com, c@z.com"`，底层由 `InternetAddress.parse()` 拆成多条独立的 `RCPT TO`，因此收件人之间**互相可见**（如需隐藏，请各收件人分别配置或改用其他渠道）。全角逗号 `，`、全角分号 `；`、顿号 `、` 会被自动归一化为半角逗号；每个地址需有且只有一个 `@` 且不含空白字符，否则返回 500 `{"error":"SMTP配置出错"}`。读取接口返回的 `smtp_to` 始终是半角逗号 + 空格分隔的规范格式。
- SMTP 端口决定加密方式：`465` / `2465` / `8465` / `443` / `588` 走**隐式 SSL/TLS**（连接即握手），其余端口（`25` / `587` / `2525` / `2587` 等）走 **STARTTLS**（先明文再升级）。连接强制使用 TLSv1.2 及以上。
- `POST /api/sms_forward_curl`：`curl_text` 为完整 curl 命令模板，**必须包含** `{{sms-body}}`、`{{sms-time}}`、`{{sms-from}}` 三个占位符，保存后会发送一次测试转发。
- `POST /api/sms_forward_dingtalk`：`webhook_url` 必填；`secret` 为可选的加签密钥；保存后会发送测试消息。
- `POST /api/sms_forward_blacklist`：`phone`（只允许数字与换行符，正则 `^[0-9\n]*$`，多个号码用换行分隔）与 `keywords`（多个关键词用换行分隔）两个键都必须存在；命中黑名单号码或关键词的短信不会被转发。
- `POST /api/do_forward_msg`：`address`（来源号码）、`body`（内容）、`is_sms`（布尔，默认 `true`）、`timestamp`（毫秒，缺省取当前时间）。按当前已配置的渠道（`sms_forward_method`）推送。
- 开关类 GET 返回 `{"enabled":"0"}` / `{"enabled":"1"}`（字符串）。
- `GET /api/sms_forward_method` 返回 `{"sms_forward_method":"SMTP"}`，取值 `SMTP` / `CURL` / `DINGTALK` / `""`（未配置）。

------

### 3.9 定时任务模块（Scheduled Task Module）

| 方法 | 路径               | 描述               | 参数                                                 | 是否认证 |
| ---- | ------------------ | ------------------ | ---------------------------------------------------- | -------- |
| POST | `/api/add_task`    | 添加定时任务       | JSON：`{ "id", "time", "repeatDaily", "action" }`    | 是       |
| POST | `/api/remove_task` | 删除指定任务       | JSON：`{ "id": "..." }`                              | 是       |
| POST | `/api/clear_task`  | 清空全部任务       | 无                                                   | 是       |
| GET  | `/api/list_tasks`  | 获取全部任务列表   | 无                                                   | 是       |
| GET  | `/api/get_task`    | 获取单个任务详情   | Query：`id`（必填）                                   | 是       |

#### `POST /api/add_task` 请求字段

```json
{
  "id": "daily_reboot",
  "time": "03:00:00",
  "repeatDaily": true,
  "action": { "goformId": "REBOOT_DEVICE" }
}
```

| 字段          | 必填 | 说明                                                         |
| ------------- | ---- | ------------------------------------------------------------ |
| `id`          | 是   | 任务唯一标识（重复添加会覆盖同 id 任务）                      |
| `time`        | 是   | `HH:mm:ss` 或 `HH:mm`（前者截断为 `HH:mm`），按本地时间触发   |
| `repeatDaily` | 否   | 是否每天重复，默认 `true`；`false` 时仅触发一次              |
| `action`      | 是   | JSON 对象（键值均为字符串），决定触发时执行的动作，见下       |

**`action` 的两种语义：**

1. 当 `action` 包含键 `kano_do_sms_forward_action` 且值为 `"1"` 时：触发一次短信/电量信息转发（按当前已配置的渠道 SMTP/CURL/DINGTALK，且总开关需为开）；
2. 其它情况：`action` 整体作为**官方 goform 表单参数**，由后端自动登录官方后台（使用已保存的 `ADMIN_PWD`）执行，例如 `{"goformId":"REBOOT_DEVICE"}` 或 `{"goformId":"SET_SIM_SLOT","sim_slot":"1"}`。

**任务详情（TaskInfo）结构**（`list_tasks` / `get_task` 返回）：

```json
{
  "key": 1718438543772,
  "id": "daily_reboot",
  "time": "03:00",
  "repeatDaily": true,
  "actionMap": { "goformId": "REBOOT_DEVICE" },
  "lastRunTimestamp": 1718523600000,
  "hasTriggered": false
}
```

- 调度器每分钟匹配 `HH:mm` 触发，每天只触发一次（`repeatDaily` 任务次日自动重置）；任务持久化存储，服务重启后自动恢复。
- `GET /api/get_task?id=xxx`：缺少 `id` 返回 400 `{"error":"缺少任务ID"}`；任务不存在返回 404 `{"error":"任务不存在"}`。
- `POST /api/remove_task` 成功返回 `{"result":"removed"}`。

------

### 3.10 主题模块（Theme Module）

| 方法 | 路径                              | 描述                         | 参数                                    | 是否认证 |
| ---- | --------------------------------- | ---------------------------- | --------------------------------------- | -------- |
| GET  | `/api/uploads/{文件名}`           | 访问已上传的文件             | 路径参数                                 | **否**   |
| POST | `/api/upload_img`                 | 上传文件（流式写盘）         | `multipart/form-data`，文件 part         | 是       |
| POST | `/api/delete_img`                 | 删除单个上传文件             | JSON：`{ "file_name": "..." }`           | 是       |
| POST | `/api/delete_all_uploads_data`    | 清空上传目录                 | 无                                       | 是       |
| POST | `/api/set_theme`                  | 保存主题配置                 | JSON：11 个字段（见下）                  | 是       |
| GET  | `/api/get_theme`                  | 获取当前主题配置             | 无                                       | **否**   |

#### 文件上传

- `POST /api/upload_img`：`multipart/form-data`，文件字段名任意（前端用 `file`）；服务端按原文件名扩展名保存为 `<UUID>.<ext>`；**后端无大小限制**（流式落盘），前端场景限制 10MB；
- 响应 `{"url":"/uploads/<uuid>.<ext>"}` —— 这是相对路径，实际访问地址为 **`/api/uploads/<uuid>.<ext>`**（前端会自动拼接 `/api` 前缀）；
- `POST /api/delete_img`：`file_name` 禁止包含 `..` 或以 `/` 开头；文件不存在时同样返回 `{"result":"success"}`；
- `POST /api/delete_all_uploads_data` 返回：

```json
{ "result": "success", "deleted_list": { "a.png": true, "b.js": false } }
```

- `GET /api/uploads/{文件名}` 公开可访问，带路径穿越防护（越出 uploads 目录返回 403，文件不存在返回 404）。

#### `POST /api/set_theme` 请求字段（均为字符串，可省略，省略时用默认值）

| 字段                | 默认值                    | 说明                     |
| ------------------- | ------------------------- | ------------------------ |
| `backgroundEnabled` | `"false"`                 | 是否启用自定义背景       |
| `backgroundUrl`     | `""`                      | 背景图地址（可为 `/api/uploads/...` 或外链） |
| `textColor`         | `"rgba(255, 255, 255, 1)"`| 文字颜色                 |
| `textColorPer`      | `"100"`                   | 文字颜色饱和度百分比     |
| `themeColor`        | `"201"`                   | 主题色相（hue）          |
| `colorPer`          | `"67"`                    | 主题色百分比             |
| `saturationPer`     | `"100"`                   | 饱和度百分比             |
| `brightPer`         | `"21"`                    | 亮度百分比               |
| `opacityPer`        | `"21"`                    | 背景不透明度百分比       |
| `blurSwitch`        | `"true"`                  | 背景模糊开关             |
| `overlaySwitch`     | `"true"`                  | 遮罩层开关               |

`GET /api/get_theme` 返回同结构 JSON（未配置过时返回上述默认值）。前端重置主题时 POST 空对象 `{}`。

------

### 3.11 网络测速模块（Speedtest Module）

| 方法 | 路径             | 描述                     | 参数                                   | 是否认证 |
| ---- | ---------------- | ------------------------ | -------------------------------------- | -------- |
| GET  | `/api/speedtest` | 下载测速数据（流式）     | Query：`ckSize`（块数量）、`cors`（可选） | 是     |

- 响应为 `application/octet-stream` 二进制流，内容由预生成的 **8MB 随机缓冲块** 重复 `ckSize` 次组成；
- `ckSize` ≤ 0 或缺省时默认 `4`（即 32MB），上限 `1024`（即 8GB）；
- 响应头：`Content-Length`（总字节数）、`Content-Disposition: attachment; filename=random.dat`、`Cache-Control: no-store`；
- 存在 `cors` 参数时追加 `Access-Control-Allow-Origin: *` 等响应头（供第三方网页测速使用）；
- **并发上限 3**：已有 3 个测速连接时返回 HTTP 429（文本"测速请求过多，请稍后再试"）；
- 客户端可通过流式读取（`ReadableStream`）统计单位时间接收字节数来计算下载速率，前端同时用它做本地测速，蜂窝测速则走 `/api/proxy`。

------

### 3.12 反向代理模块（Any Proxy Module）

**万能 HTTP 代理接口**，用于将客户端请求转发到任意目标地址并原样返回响应。路径格式：

```shell
GET /api/proxy/--https://example.com/api/xxx
```

- 路径中 `/api/proxy/` 之后的剩余部分即目标 URL，`--` 前缀**可省略**（会被自动剥离）；
- 支持任意 HTTP 方法（`GET`/`POST`/`PUT`/`PATCH`/`DELETE` 等），POST/PUT/PATCH 的请求体会原样转发（保留 `Content-Type`）；
- 该接口受 UFI-TOOLS 鉴权保护，但 `authorization`、`kano-t`、`kano-sign` 等头**不会**被转发给目标服务器；
- **签名注意**：本接口的 `kano-sign` 使用**原始请求路径**（`/api/proxy/--目标URL` 整体，不含 query）计算，见 1.2 节。

**安全限制：**

1. 目标主机为 `ufi.ztedevice.com` 时拒绝（403）；
2. 目标域名解析到 `0.0.0.0`、环回地址（127.0.0.0/8、::1）、链路本地（169.254.x.x）或私网地址（192.168.x.x、10.x.x.x、172.16-31.x.x）时拒绝，避免内网服务被探测；
3. 整体超时 **30 秒**（连接 10s / 读 8s / 写 8s），超时会截断输出返回不完整数据。

**请求头转发规则：**

- 常规安全请求头自动转发（如 `Accept`、`User-Agent`、`Content-Type`）；
- 想注入敏感头（如 `Authorization`、`Cookie`）时使用 **`kano-` 前缀**，转发时自动去前缀：

| 自定义头部名       | 实际转发为      |
| ------------------ | --------------- |
| `kano-Authorization` | `Authorization` |
| `kano-cookie`      | `Cookie`        |

- 以下头会被过滤不转发：`connection`、`keep-alive`、`transfer-encoding`、`upgrade`、`host`、`content-length`、`expect`、`referer`、`origin`、`authorization`、`x-forwarded-for`、`sec-*`、`via` 等代理敏感头。

**响应处理：**

- 普通响应：状态码、Content-Type、响应体原样流式返回；
- **HTML 响应**：自动把 `/` 开头的资源路径（`src`/`href` 属性）改写为 `/api/proxy/--<基路径>/...`，保证页面资源继续走代理；
- 上游 `Set-Cookie` 会以 **`Kano-SetCk`** 和 **`Kano-Set-Cookie`** 两个响应头回传（可重复）；
- CORS：反射请求 `Origin`，并追加 `Access-Control-Allow-Credentials: true`、`Access-Control-Expose-Headers: Kano-SetCk`；
- 目标被禁止返回 403；上游异常或空响应返回 502。

**示例：**

```http
POST /api/proxy/--http://example.com/api/login
Content-Type: application/json
kano-Authorization: Bearer abc123

{ "username": "admin", "password": "123456" }
```

会被代理为：

```http
POST http://example.com/api/login
Content-Type: application/json
Authorization: Bearer abc123

{ "username": "admin", "password": "123456" }
```

**前端典型用法**：插件市场自定义仓库拉取、公告 API（`/api/proxy/--https://api.kanokano.cn/ufi_tools_report/...`）、蜂窝网络测速（多线程下载外部测速文件）。

------

### 3.13 反向代理官方WEB模块（goform 速查）

所有以 `/api/goform/` 开头的请求会被转发到中兴官方 WEB 后台（`http://<官方后台IP>:8080/goform/...`），用于登录、短信收发、APN、频段锁等**官方固件功能**。

| 方法 | 路径                | 描述             | 参数                                     | 是否认证 |
| ---- | ------------------- | ---------------- | ---------------------------------------- | -------- |
| 任意 | `/api/goform/{...}` | 反代官方 WEB API | 请求路径 + 查询参数 + 请求体（POST/PUT） | **是**   |

#### 代理行为细节

- **目标地址**：应用配置的官方后台地址（`gateway_ip`，默认 `192.168.0.1:8080`），随服务启动固定，**不是请求参数**；
- **路径与参数**：`/api` 之后的部分（含 query）原样拼接到目标地址；POST/PUT 请求体原样转发；
- **请求头**：客户端的 `Host`、`Referer`、`Cookie` 头会被忽略；`Referer` 强制设置为官方后台地址；`Kano-Cookie` 请求头会被转成上游的 `Cookie`（浏览器 fetch 不允许直接设置 Cookie 头，因此用此自定义头携带会话）；
- **响应头**：上游的 `Set-Cookie` 会改名为 **`kano-cookie`** 回传给客户端；自动附加 CORS 头；
- `OPTIONS` 请求直接返回 CORS 预检响应，不转发；
- 上游连接超时 15s / 读取超时 20s；转发异常返回 HTTP 500；
- **注意**：`/api/goform/...` 与其它 `/api/` 接口一样受 UFI-TOOLS 鉴权保护（需 `kano-t`/`kano-sign`/`authorization`）。

#### 官方接口协议（登录与防篡改签名）

官方后端有两个统一入口：

**① 读操作** `GET /api/goform/goform_get_cmd_process`

```
GET /api/goform/goform_get_cmd_process?isTest=false&cmd=<字段列表>&multi_data=1&_=<毫秒时间戳>
Kano-Cookie: <会话Cookie，需要登录态的读操作携带>
```

- `cmd`：要查询的字段名，多个用逗号分隔；`multi_data=1` 表示返回多个字段；
- 响应为 JSON，字段名与查询的字段一一对应。

**② 写操作** `POST /api/goform/goform_set_cmd_process`

```
POST /api/goform/goform_set_cmd_process
Content-Type: application/x-www-form-urlencoded

goformId=<操作ID>&<参数...>&isTest=false&AD=<防篡改签名>
Kano-Cookie: <会话Cookie>
```

- 除 `goformId=LOGIN/LOGIN_MULTI_USER` 外，写操作必须携带 `AD` 参数；
- `AD = SHA256( SHA256(wa_inner_version + cr_version) + RD )`；
  - `wa_inner_version`、`cr_version`：`cmd=Language,cr_version,wa_inner_version&multi_data=1` 获取；
  - `RD`：`cmd=RD` 获取（需会话 Cookie）；
- 响应中 `result` 为 `"success"` 表示成功，`"3"` 表示密码错误。

**登录流程**（前端 `login()` 的完整逻辑）：

1. `GET /api/get_cookie` 读取服务端持久化的会话 Cookie；
2. `GET /api/goform/goform_get_cmd_process?isTest=false&cmd=loginfo`（带 `kano-cookie`），`loginfo == "ok"` 表示会话有效，跳到第 6 步；
3. 会话失效则 `POST /api/set_cookie` 清空服务端 Cookie；
4. `GET ...cmd=LD` 获取随机数 `LD`，计算 `password = SHA256( SHA256(明文密码) + LD )`；
5. `POST goformId=LOGIN`（旧方式）或 `goformId=LOGIN_MULTI_USER` + `IP=localhost`（新方式），附 `user=admin`；从**响应头 `kano-cookie`** 取会话（取 `;` 前第一段），`POST /api/set_cookie` 持久化；
6. 后续读写操作通过 `Kano-Cookie` 请求头携带会话；用完后 `goformId=LOGOUT` 退出。

#### goformId 写操作速查表（前端实际使用）

以下均为 `POST /api/goform/goform_set_cmd_process` 的表单参数（`goformId` 之外的键值对即为该操作的参数）：

| goformId | 主要参数 | 功能 |
| --- | --- | --- |
| `LOGIN` | `password=SHA256(SHA256(密码)+LD)`、`user=admin` | 登录官方后台（旧方式） |
| `LOGIN_MULTI_USER` | 同上 + `IP=localhost` | 登录官方后台（新方式） |
| `LOGOUT` | `AD` | 退出登录 |
| `CHANGE_PASSWORD` | `oldPassword=SHA256(旧密码)`、`newPassword=SHA256(新密码)` | 修改官方后台密码 |
| `REBOOT_DEVICE` | 无 | 重启设备 |
| `SHUTDOWN_DEVICE` | 无 | 关机（U30Air 等带电池机型） |
| `SEND_SMS` | `Number=手机号`、`MessageBody=内容(UTF-16 hex编码，见 requests.js 的 gsmEncode)` | 发送短信 |
| `DELETE_SMS` | `msg_id`、`notCallback=true` | 删除短信 |
| `SET_MSG_READ` | `msg_id`、`notCallback=true`（逐条调用） | 标记短信已读 |
| `USB_PORT_SETTING` | `usb_port_switch=0/1` | 有线 adb（USB 调试）开关 |
| `PERFORMANCE_MODE_SETTING` | `performance_mode=0/1` | 性能模式 |
| `SET_BEARER_PREFERENCE` | `BearerPreference=<值>` | 网络模式切换（5G/4G 自动等） |
| `SET_USB_NETWORK_PROTOCAL` | `usb_network_protocal=<值>` | USB 网络协议切换 |
| `switchWiFiModule` | `SwitchOption=0/1` | WiFi 总开关 |
| `switchWiFiChip` | `ChipEnum=chip1/chip2`、`GuestEnable=0` | WiFi 芯片切换（双频机型 2.4G/5G） |
| `SAMBA_SETTING` | `samba_switch=0/1` | SMB 文件共享开关 |
| `SET_CONNECTION_MODE` | `ConnectionMode=auto_dial`、`roam_setting_option` 或 `dial_roam_setting_option=on/off` | 数据漫游开关 |
| `INDICATOR_LIGHT_SETTING` | `indicator_light_switch=0/1` | 指示灯开关 |
| `CONNECT_NETWORK` / `DISCONNECT_NETWORK` | 无 | 蜂窝数据连接 / 断开 |
| `SET_SIM_SLOT` | `sim_slot=0/1/2/11` | SIM 卡槽切换（v50 双卡机型） |
| `WIFI_NFC_SET` | `web_wifi_nfc_switch=0/1` | NFC 开关 |
| `SET_WIFI_SLEEP_INFO` | `sleep_sysIdleTimeToSleep=<分钟>` | WiFi 自动休眠时间 |
| `RESTART_SCHEDULE_SETTING` | `restart_schedule_switch=0/1`、`restart_time=HH:mm` | 定时重启 |
| `LTE_BAND_LOCK` | `lte_band_lock=逗号分隔的4G频段` | 4G 频段锁（空为解锁；提交后常配合 `AT+SFUN=4/5` 重启网络栈生效） |
| `NR_BAND_LOCK` | `nr_band_lock=逗号分隔的5G频段` | 5G 频段锁（支持频段可用 `/api/getSupportNrBandList` 查询） |
| `CELL_LOCK` | `pci`、`earfcn`、`rat` | 锁定基站（值来自 `neighbor_cell_info`） |
| `UNLOCK_ALL_CELL` | 无 | 解除基站锁定 |
| `setAccessPointInfo` | `SSID`、`AuthMode`、`EncrypType`、`Password=base64`、`ApMaxStationNumber`、`ApBroadcastDisabled`、`ApIsolate`、`ChipIndex`、`AccessPointIndex` | WiFi 热点配置 |
| `setDeviceAccessControlList` | `AclMode`、`WhiteMacList`、`BlackMacList`、`WhiteNameList`、`BlackNameList` | 客户端接入黑白名单 |
| `DATA_LIMIT_SETTING` | `data_volume_limit_switch`、`traffic_clear_date`、`data_volume_alert_percent`、`data_volume_limit_size` 等 | 官方流量限制设置（同时写 `flux_` 前缀字段） |
| `FLOW_CALIBRATION_MANUAL` | `calibration_way`、`time=0`、`data=已用字节数` | 流量手动校准 |
| `DHCP_SETTING` | `lanIp`、`lanNetmask`、`lanDhcpType`、`dhcpStart`、`dhcpEnd`、`dhcpLease`、`dhcp_reboot_flag`、`mac_ip_reset` | LAN/DHCP 配置（成功后网关 IP 变更，前端会延时跳转新地址） |
| `APN_PROC_EX` | `apn_mode=auto`；或 `apn_mode=manual` + `apn_action=save`/`delete`/`set_default` + `index` + APN 详情字段（`profile_name`、`apn_wan_apn`、`apn_pdp_type`、`apn_ppp_username` 等） | APN 管理（保存/删除/设默认/自动手动切换） |
| `EDIT_HOSTNAME` | `mac`、`hostname` | 已连接客户端改名 |

#### goform cmd 读操作速查表（前端实际使用）

**会话/版本类**：`LD`（登录随机数）、`RD`（AD 签名随机数）、`loginfo`（登录状态，`ok`=已登录）、`wa_inner_version`、`cr_version`（固件版本，计算 AD 用）、`Language`

**主页状态轮询**（前端每秒刷新一次的 38 个字段）：

```
usb_port_switch,battery_charging,sms_received_flag,sms_unread_num,sms_sim_unread_num,
sim_msisdn,dual_sim_support,sim_slot,data_volume_limit_switch,battery_value,
battery_vol_percent,network_signalbar,network_rssi,cr_version,iccid,imei,imsi,
ipv6_wan_ipaddr,lan_ipaddr,mac_address,msisdn,network_information,Lte_ca_status,
rssi,Z5g_rsrp,lte_rsrp,wifi_access_sta_num,loginfo,data_volume_alert_percent,
data_volume_limit_size,realtime_rx_thrpt,realtime_tx_thrpt,realtime_time,
monthly_tx_bytes,monthly_rx_bytes,monthly_time,network_type,network_provider,ppp_status
```

常用字段：`ppp_status`（拨号状态）、`network_type`/`network_provider`（网络制式/运营商）、`rssi`/`lte_rsrp`/`Z5g_rsrp`/`network_signalbar`（信号）、`realtime_rx_thrpt`/`realtime_tx_thrpt`（实时上下行速率）、`monthly_tx_bytes`/`monthly_rx_bytes`（当月收发流量）、`battery_value`/`battery_vol_percent`（电量）、`sms_unread_num`（未读短信数）、`wifi_access_sta_num`（WiFi 连接数）、`lan_ipaddr`（网关 IP）、`imei`/`iccid`/`imsi`/`msisdn`（卡与设备标识）、`sim_slot`（当前卡槽）、`usb_port_switch`（有线 adb 状态）。

**短信列表**（分页查询，`content` 为 base64 编码，`tag=1` 为未读）：

```
GET /api/goform/goform_get_cmd_process?multi_data=1&isTest=false&cmd=sms_data_total
    &page=0&data_per_page=500&mem_store=1&tags=100&order_by=order by id desc&_=<时间戳>
```

**WiFi 热点配置**：`queryWiFiModuleSwitch,queryAccessPointInfo`（返回 `SSID`、`Password`（base64）、`AuthMode`、`ApMaxStationNumber`、`ApBroadcastDisabled`、`QrImageUrl`（二维码相对路径）等）

**客户端管理**：`station_list,lan_station_list,queryDeviceAccessControlList,hostNameList`（无线/有线客户端、黑白名单、主机名）

**LAN/DHCP**：`lan_ipaddr,lan_netmask,mac_address,dhcpEnabled,dhcpStart,dhcpEnd,dhcpLease_hour,mtu,tcp_mss`

**频段/基站锁**：`lte_band_lock,nr_band_lock`（当前锁频配置）；`neighbor_cell_info,locked_cell_info`（邻区列表与已锁基站）

**流量管理**：`flux_data_volume_limit_switch,data_volume_limit_switch,data_volume_limit_unit,data_volume_limit_size,data_volume_alert_percent,monthly_tx_bytes,monthly_rx_bytes,monthly_time,wan_auto_clear_flow_data_switch,traffic_clear_date`

**快捷开关状态**：`performance_mode`、`net_select`、`usb_network_protocal`、`samba_switch`、`roam_setting_option`、`dial_roam_setting_option`、`indicator_light_switch`、`restart_schedule_switch`、`restart_time`、`sleep_sysIdleTimeToSleep`、`is_support_nfc_functions`、`web_wifi_nfc_switch`、`sim_slot`

**APN 配置**（约 90 个字段）：`apn_interface_version,APN_config0~19,ipv6_APN_config0~19,apn_m_profile_name,profile_name,apn_wan_dial,apn_select,apn_pdp_type,apn_pdp_select,apn_pdp_addr,index,apn_Current_index,apn_auto_config,apn_ipv6_apn_auto_config,apn_mode,apn_wan_apn,apn_ppp_auth_mode,apn_ppp_username,apn_ppp_passwd,dns_mode,prefer_dns_manual,standby_dns_manual,apn_ipv6_wan_apn,...`（完整列表见 `app/frontEnd/public/script/requests.js` 的 `getAPNData`）

------

### 3.14 静态资源

| 方法 | 路径           | 描述                                     | 是否认证 |
| ---- | -------------- | ---------------------------------------- | -------- |
| GET  | `/{任意路径}`  | 读取应用内置 assets 目录中的文件         | **否**   |

- 空路径返回 `index.html`（前端单页应用）；
- 可访问 `script/*`、`style/*`、`lang/*.json`（en/zh/ja/vi 语言包）、`favicon.webp`、`manifest.json`、`robots.txt` 等；
- 路径包含 `..` 返回 403；文件不存在返回 404；
- Content-Type 按扩展名推断。

------

## 4. CLI 请求工具

UFI-TOOLS 内置了两个 CLI 请求工具，部署在设备 `/data/data/com.minikano.f50_sms/files/` 目录下，可直接在 adb/root shell 中使用。

### 4.1 `ufi_req` —— 请求 UFI-TOOLS `/api/` 接口

自动完成签名（`kano-t`/`kano-sign`）与鉴权（`authorization`）。**在不传 `-pass` 时会自动读取本机存储的口令哈希**（`/data/data/com.minikano.f50_sms/shared_prefs/kano_ZTE_store.xml` 中的 `login_token`），因此设备本机使用时无需知道明文口令。

```shell
:/ # /data/data/com.minikano.f50_sms/files/ufi_req
ufi_req - MiniKano签名请求工具

用法：
  ufi_req -host 192.168.1.1 -pass 123456 -X POST -e /api/xxx -d '{"command":"ls"}'
  ufi_req -host 192.168.1.1 -pass 123456 -X GET  -e "/api/AT?command=AT&slot=0"

参数：
  -X string
        HTTP 方法：GET/POST/PUT/DELETE... (default "GET")
  -d string
        请求体(JSON字符串)。GET 一般不需要。例：'{"command":"ls"}'
  -e string
        请求路径或完整URL，如 "/api/xxx" (必填)
  -host string
        目标地址，比如 "192.168.0.1" 或 "192.168.0.1:2333" (选填) (default "192.168.0.1:2333")
  -pass string
        密码明文，用于生成 Authorization=sha256(password) (可以不填，不填自动获取本机的密码)
  -t int
        超时秒数 (default 10)
```

行为说明：

- 签名只对**路径**计算（不含 query）；携带 `-d` 时自动设置 `Content-Type: application/json`；
- HTTP 状态码非 200 时输出 `{"error":"HTTP <状态码> <描述>"}`，否则原样输出响应体。

### 4.2 `zreq` —— 请求中兴官方后台接口

自动完成官方后台登录（LOGIN 获取 Cookie）与写操作所需的 `AD` 签名计算。目标固定为 `http://<ip>:8080`。**`-pwd` 可省略**（有内置默认值）。

```shell
:/ # /data/data/com.minikano.f50_sms/files/zreq
Usage of /data/data/com.minikano.f50_sms/files/zreq:
  -body string
        POST 请求体，格式：goformId=LOGIN&isTest=false
  -ip string
        设备 IP 地址（可选），示例：192.168.0.1 (default "192.168.0.1")
  -json
        是否以 JSON 格式输出响应
  -method string
        请求方法：GET 或 POST（默认 GET） (default "GET")
  -params string
        GET 请求参数，格式：cmd=LD&multi_data=1
  -pwd string
        登录密码（可选，有默认值）
```

行为说明：

- 工具启动后先用 `-pwd` 完成一次 `goformId=LOGIN` 登录（密码错误会报"登录失败"）；
- `GET`：请求 `goform_get_cmd_process?isTest=false&<params>&_=<时间戳>`；
- `POST`：自动计算 `AD`（由 `wa_inner_version`/`cr_version`/`RD` 得出）并附加 `isTest=false` 后请求 `goform_set_cmd_process`；
- `-json` 时格式化输出，否则按 `键: 值` 逐行输出。

------

## 5. UFI-TOOLS 插件源 JSON 规范

插件源地址必须返回 JSON。

## 基础结构

```json
{
  "download_url": "https://example.com/plugins",
  "res": {
    "code": 200,
    "message": "success",
    "data": {
      "content": []
    }
  }
}
```

## 字段要求

### download_url

插件文件下载根地址。

客户端会通过以下规则拼接插件下载地址：

```txt
download_url + "/" + name
```

例如：

```txt
https://example.com/plugins/hello.js
```

------

### res.code

状态码。

成功时应为：

```json
200
```

------

### res.message

状态信息。

成功时建议为：

```json
"success"
```

------

### res.data.content

插件列表数组。

每个插件对象至少需要包含：

```json
{
  "name": "hello.js",
  "modified": "2026-06-06T00:00:00+08:00",
  "hash_info": {
    "md5": "可选"
  }
}
```

## 插件对象字段

| 字段          | 类型    | 必填 | 说明                             |
| ------------- | ------- | ---- | -------------------------------- |
| name          | string  | 是   | 插件文件名，用于显示、搜索、下载 |
| modified      | string  | 建议 | 最后修改时间，用于显示           |
| hash_info.md5 | string  | 否   | MD5，用于显示                    |
| size          | number  | 否   | 文件大小                         |
| is_dir        | boolean | 否   | 是否目录，插件建议为 false       |

## 最小可用示例

```json
{
  "download_url": "https://example.com/plugins",
  "res": {
    "code": 200,
    "message": "success",
    "data": {
      "content": [
        {
          "name": "hello.js",
          "modified": "2026-06-06T00:00:00+08:00",
          "hash_info": {
            "md5": "d41d8cd98f00b204e9800998ecf8427e"
          }
        }
      ]
    }
  }
}
```

## 注意事项

1. `name` 必须是实际可下载的文件名。
2. 插件下载地址必须能通过 `download_url/name` 访问。
3. `content` 为空时，客户端会显示未找到插件。
4. 建议只返回 `.js` 插件文件，不返回目录。
5. `modified` 建议使用 ISO 时间格式。
