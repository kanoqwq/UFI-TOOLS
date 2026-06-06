## 0. 写在前面

> **本API文档适用于 `UFI-TOOLS v3.1.5`版本**
> **本文档中所有`POST`请求体(除官方API外)均为`JSON`格式**
> **本文档中所有`GET`请求参数均为`query`参数**

## 1. 请求签名规则

签名机制起到如下作用：

- 防止请求被伪造（如跨站、重放等）
- 服务器可验证 `kano-sign` 是否有效、是否与 `kano-t` 匹配
- 简单的“认证 + 防篡改”方式

### 1. **添加请求头**

每个请求都会自动附加两个自定义请求头：

| Header 键   | 说明                             |
| ----------- | -------------------------------- |
| `kano-t`    | 当前时间戳（毫秒，`Date.now()`） |
| `kano-sign` | 用于验证请求合法性的签名字符串   |
| `Authorization` | 密码进过sha256后的字符串（小写）   |

------

### 2. **签名计算逻辑**

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
- `URL_PATH`：请求路径（不包含 query 参数），如 `/api/data`
- `时间戳`：`Date.now()`，即当前毫秒时间戳

#### (2) 使用 HMAC-MD5 进行第一步加密：

```js
hmac = HMAC_MD5(rawData, secretKey)
```

- 密钥固定为：

  ```js
  "minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd"
  ```

#### (3) 将 HMAC 值二分为两部分：

- `part1`：前半部分的字节
- `part2`：后半部分的字节

#### (4) 各部分再做 SHA256：

```js
sha1 = SHA256(part1)
sha2 = SHA256(part2)
```

#### (5) 连接并最终 SHA256：

```js
finalHash = SHA256(sha1 + sha2)
```

------

### 3. **使用示例**

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
```

**JS代码参考：[https://github.com/kanoqwq/UFI-TOOLS/blob/http-server-version/app/frontEnd/public/script/requests.js](https://github.com/kanoqwq/UFI-TOOLS/blob/http-server-version/app/frontEnd/public/script/requests.js)**



## 2. API示例

> **注：本文提到的POST接口请求体格式均为JSON**、**GET请求均为Query或无参数**

**GET请求示例**

```
GET /api/AT?command=AT+CSQ&slot=0
```

返回：

```json
{
  "result": "XXXXXX OK"
}
```

**POST请求实例**

``` 
POST http://192.168.1.1/goform/login
Authorization: sha256(password)
Content-Type: application/json
{ "username": "admin", "password": "123456" }
```

返回：

```json
{
  "result": "success"
}
```

------



### ADB 模块 （ADB Module）

| 方法 | 路径                    | 描述                    | 参数                  | 是否认证 |
| ---- | ----------------------- | ----------------------- | --------------------- | -------- |
| GET  | `/api/adb_wifi_setting` | 获取网络 ADB 自启状态   | 无                    | 是       |
| POST | `/api/adb_wifi_setting` | 设置网络 ADB 自启状态   | `enabled`，`password` | 是       |
| GET  | `/api/adb_alive`        | 获取网络 ADB 是否已启动 | 无                    | 是       |

------



### 高级功能模块（Advanced Tools Module）

| 方法 | 路径                   | 描述                              | 参数简要                     | 是否认证 |
| ---- | ---------------------- | --------------------------------- | ---------------------------- | -------- |
| GET  | `/api/smbPath`         | 更改 Samba 分享地址为根目录       | `enable=1/0` 开启或关闭      | 是       |
| GET  | `/api/hasTTYD`         | 判断是否存在 ttyd 服务            | `port=端口号`                | 是       |
| GET  | `/api/one_click_shell` | 启动一键进入工程模式 + 执行脚本   | 无参数                       | 是       |
| POST | `/api/root_shell`      | 发送指令到 Root Shell Socket 执行 | JSON: `{ "command": "..." }` | 是       |

------



### 反向代理模块 （Any Proxy Module）

**反向代理接口**，用于将客户端请求转发到指定的目标地址，并返回其响应结果。路径格式为：

```shell
GET /api/proxy/--http://example.com/api/xxx
```

#### 请求方式支持：`GET` `POST` `PUT` `PATCH`

请求体（如 POST 的 JSON）将会原样转发给目标地址。

**注意：**

1. 该接口也需要进行auth验证
2. 为了避免UFI-TOOLS authToken和需要转发头部冲突，代理验证token时可以以`kano-authorization`携带token进行验证(见下表)
3. 为了避免内网服务暴露在外网，反向代理接口默认会阻止以此方式访问内网地址
4. 该接口固定超时时间为30秒，超过时间到了会截断输出并返回不完整的数据。

------

#### 可自定义的请求头（自动转发）：

- 默认会自动转发 **常规安全请求头**（如 `Accept`、`User-Agent`）。
- 想要手动注入敏感头（如 `Authorization`）时，使用 **`kano-` 前缀**：

| 自定义头部名         | 实际转发为      |
| -------------------- | --------------- |
| `kano-Authorization` | `Authorization` |
| `kano-Cookie`        | `Cookie`        |

------

#### 响应处理：

- 普通响应：按原格式返回（含状态码、Content-Type）。
- HTML 响应：会自动将 `/` 开头的资源路径（如 `/static/js/app.js`）改写为代理路径，确保前端页面可正常加载资源。

------

#### 示例：

```http
POST /api/proxy/--http://192.168.1.1/goform/login
Content-Type: application/json
kano-Authorization: Bearer abc123

{ "username": "admin", "password": "123456" }
```

会被代理为：

```http
POST http://192.168.1.1/goform/login
Authorization: Bearer abc123
Content-Type: application/json

{ "username": "admin", "password": "123456" }
```

------



### AT指令模块（AT Module）

| 方法 | 路径      | 描述                   | 参数简要                                         | 是否认证 |
| ---- | --------- | ---------------------- | ------------------------------------------------ | -------- |
| GET  | `/api/AT` | 执行 AT 指令并返回结果 | `command=AT指令`（必填），`slot=卡槽号（默认0）` | 是       |

------



### 设备基础信息模块（Base Device Info Module）

| 方法 | 路径                  | 描述                                            | 参数简要 | 是否认证 |
| ---- | --------------------- | ----------------------------------------------- | -------- | -------- |
| GET  | `/api/baseDeviceInfo` | 获取基础设备信息（电量、IP、CPU、内存、存储等） | 无       | 是       |
| GET  | `/api/version_info`   | 获取应用版本号与设备型号                        | 无       | 否       |
| GET  | `/api/need_token`     | 获取是否启用登录验证（token）                   | 无       | 否       |

------

你的 `otaModule` 是一个完整的 OTA（Over-The-Air）更新模块，使用 Ktor 搭建后端 Web 服务，运行在 Android 环境中（比如嵌入式设备或手机），功能齐全、逻辑严密，涵盖以下主要接口功能：

------



### OTA模块（OTA Module）

| 方法 | 路径                       | 描述                      | 参数      | 认证 | 备注                                |
| ---- | -------------------------- | ------------------------- | --------- | ---- | ----------------------------------- |
| GET  | `/api/check_update`        | 拉取 changelog 和文件列表 | 无        | 是   | 调用 Alist 接口获取 OTA 包信息      |
| POST | `/api/download_apk`        | 开始下载 APK 文件         | {apk_url} | 是   | 后台线程下载，支持状态查询          |
| GET  | `/api/download_apk_status` | 查询下载进度与状态        | 无        | 是   | 下载状态、百分比、错误信息          |
| POST | `/api/install_apk`         | 安装已下载的 APK 文件     | 无        | 是   | 使用 socat（root）或 ADB（非 root） |

------



### 插件模块 （Plugins Module）

| 方法 | 路径                   | 描述               | 参数                                    | 是否认证 |
| ---- | ---------------------- | ------------------ | --------------------------------------- | -------- |
| POST | `/api/set_custom_head` | 设置自定义头部文本 | JSON：`{ "text": "..." }`（限制1145KB） | 是       |
| GET  | `/api/get_custom_head` | 获取自定义头部文本 | 无                                      | 否       |

---



### 短信转发模块 （SMS Forward Module）

| 方法 | 路径                       | 描述                   | 参数                                                         | 是否认证 |
| ---- | -------------------------- | ---------------------- | ------------------------------------------------------------ | -------- |
| GET  | `/api/sms_forward_method`  | 获取当前短信转发方式   | 无                                                           | 是       |
| POST | `/api/sms_forward_mail`    | 配置邮件方式的短信转发 | {`smtp_host`, `smtp_port`, `smtp_to`, `smtp_username`, `smtp_password`} | 是       |
| GET  | `/api/sms_forward_mail`    | 获取邮件转发配置       | 无                                                           | 是       |
| POST | `/api/sms_forward_curl`    | 配置 curl 方式的转发   | {`curl_text`}（需包含 `{{sms-body}}`、`{{sms-time}}`、`{{sms-from}}`） | 是       |
| GET  | `/api/sms_forward_curl`    | 获取 curl 转发配置     | 无                                                           | 是       |
| POST | `/api/sms_forward_dingtalk` | 配置钉钉webhook方式的转发 | {`webhook_url`, `secret`}（`secret`为可选的加签密钥） | 是       |
| GET  | `/api/sms_forward_dingtalk` | 获取钉钉webhook转发配置 | 无                                                           | 是       |
| POST | `/api/sms_forward_enabled` | 设置短信转发总开关     | Query 参数：`enable`（字符串）                               | 是       |
| GET  | `/api/sms_forward_enabled` | 获取短信转发开关状态   | 无                                                           | 是       |

---



### 网路测速模块 （Speedtest Module）

| 方法 | 路径             | 描述                 | 参数                                   | 是否认证 |
| ---- | ---------------- | -------------------- | -------------------------------------- | -------- |
| GET  | `/api/speedtest` | 下载测速数据（限流） | Query：`ckSize`（块数量），`cors` 可选 | 是       |

---



### 主题模块 （Theme Module）

| 方法 | 路径              | 描述                       | 参数（简述）                                               | 是否认证 |
| ---- | ----------------- | -------------------------- | ---------------------------------------------------------- | -------- |
| POST | `/api/upload_img` | 上传图片，返回图片访问 URL | Multipart 表单，图片文件                                   | 是       |
| POST | `/api/delete_img` | 删除图片                   | JSON，`file_name`：要删除的文件名                          | 是       |
| POST | `/api/set_theme`  | 保存主题配置               | JSON，主题配置字段（如`backgroundEnabled`、`textColor`等） | 是       |
| GET  | `/api/get_theme`  | 获取当前主题配置           | 无                                                         | 否       |

------

#### 其他说明：

- 上传的图片保存到 `filesDir/uploads/` 目录，URL 为 `/api/uploads/文件名` 可静态访问。

------



### 反向代理官方WEB模块 （ReverseProxy Module）

| 方法 | 路径                | 描述             | 参数                                    | 是否认证       |
| ---- | ------------------- | ---------------- | --------------------------------------- | -------------- |
| 全部 | `/api/goform/{...}` | 反代 官方WEB API | 请求路径 + 查询参数 + 请求体 (POST/PUT) | 不需要单独认证 |

------

#### 详细说明

- **路径规则**：所有以 `/api/goform/` 开头的请求都会被代理转发。
- **目标服务器地址**：通过参数 `targetServerIP` 指定（形如 `192.168.0.1`），请求转发到 `http://targetServerIP`。
- **请求头转发**：除 `Host` 和 `Referer` 以外，所有请求头都会转发给目标服务器，且会强制设置 `Referer` 为目标服务器地址。
- **请求方法支持**：支持 GET、POST、PUT、OPTIONS 方法转发。
- **请求体转发**：POST 和 PUT 请求体会被读取并写入代理请求。
- **响应头处理**：
  - **会将目标服务器返回的 `Set-Cookie` 头改名为 `kano-cookie` 并转发回客户端。**
  - 自动添加 CORS 相关响应头，允许跨域。
- **异常处理**：捕获所有异常，返回 500 错误及异常信息。


# UFI-TOOLS 插件源 JSON 规范

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