package com.minikano.f50_sms.modules.smsForward

import android.content.Context
import androidx.core.content.edit
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.SmsInfo
import com.minikano.f50_sms.utils.SmsPoll
import com.minikano.f50_sms.modules.BASE_TAG
import com.minikano.f50_sms.utils.SmsPoll.forwardByEmail
import com.minikano.f50_sms.utils.SmsPoll.forwardSmsByCurl
import com.minikano.f50_sms.utils.SmsPoll.forwardSmsByDingTalk
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import org.json.JSONObject

fun Route.smsModule(context: Context) {
    val TAG = "[$BASE_TAG]_smsModule"

    //获取短信转发方式
    get("/api/sms_forward_method") {
        val sharedPrefs =
            context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
        val sms_forward_method = sharedPrefs.getString("kano_sms_forward_method", "") ?: ""
        val json = """
        {
            "sms_forward_method": "${sms_forward_method.replace("\"", "\\\"")}"
        }
    """.trimIndent()

        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondText(json, ContentType.Application.Json, HttpStatusCode.OK)
    }

    //短信转发参数存入-邮件
    post("/api/sms_forward_mail") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val smtpHost = json.optString("smtp_host", "").trim()
            val smtpPort = json.optString("smtp_port", "465").trim()
            val smtpTo = json.optString("smtp_to", "").trim()
            val smtpUsername = json.optString("smtp_username", "").trim()
            val smtpPassword = json.optString("smtp_password", "").trim()
            val shouldForwardDeviceInfo = json.optString("forward_dev_info", "0").trim()


            if (smtpTo.isEmpty() || smtpHost.isEmpty() || smtpUsername.isEmpty() || smtpPassword.isEmpty()) {
                throw Exception("缺少必要参数")
            }

            val sharedPrefs =
                context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("kano_sms_forward_method", "SMTP")
                putString("kano_smtp_host", smtpHost)
                putString("kano_smtp_port", smtpPort)
                putString("kano_smtp_to", smtpTo)
                putString("kano_smtp_username", smtpUsername)
                putString("kano_smtp_password", smtpPassword)
                putString("kano_smtp_forward_device_info", shouldForwardDeviceInfo)
            }

            KanoLog.d(TAG, "SMTP配置已保存：$smtpHost:$smtpPort [$smtpUsername]")

            val test_msg = SmsInfo("1145141919810", "UFI-TOOLS TEST消息", System.currentTimeMillis())
            SmsPoll.forwardByEmail(test_msg, context)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )

        } catch (e: Exception) {
            KanoLog.d(TAG, "SMTP配置出错： ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"SMTP配置出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //读取smtp配置
    get("/api/sms_forward_mail") {
        val sharedPrefs =
            context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
        val smtpHost = sharedPrefs.getString("kano_smtp_host", "") ?: ""
        val smtpPort = sharedPrefs.getString("kano_smtp_port", "") ?: ""
        val smtpTo = sharedPrefs.getString("kano_smtp_to", "") ?: ""
        val username = sharedPrefs.getString("kano_smtp_username", "") ?: ""
        val password = sharedPrefs.getString("kano_smtp_password", "") ?: ""
        val shouldForwardDeviceInfo = sharedPrefs.getString("kano_smtp_forward_device_info","0")?: "0"

        val json = """
        {
            "smtp_host": "$smtpHost",
            "smtp_port": "$smtpPort",
            "smtp_to": "$smtpTo",
            "smtp_username": "$username",
            "smtp_password": "$password",
            "forward_dev_info":"$shouldForwardDeviceInfo"
        }
    """.trimIndent()

        call.respondText(json, ContentType.Application.Json, HttpStatusCode.OK)
    }

    //短信转发参数存入-curl
    post("/api/sms_forward_curl") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val originalCurl = json.getString("curl_text")

            KanoLog.d(TAG, "是否找到{{sms}}：${originalCurl.contains("{{sms}}")}")
            KanoLog.d(TAG, "curl配置：$originalCurl")

            if (!originalCurl.contains("{{sms-body}}")) throw Exception("没有找到“{{sms-body}}”占位符")
            if (!originalCurl.contains("{{sms-time}}")) throw Exception("没有找到“{{sms-time}}”占位符")
            if (!originalCurl.contains("{{sms-from}}")) throw Exception("没有找到“{{sms-from}}”占位符")

            // 存储到 SharedPreferences
            val sharedPrefs =
                context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("kano_sms_forward_method", "CURL")
                putString("kano_sms_curl", originalCurl)
            }

            // 发送测试消息
            val test_msg =
                SmsInfo("1145141919810", "UFI-TOOLS TEST消息", System.currentTimeMillis())
            SmsPoll.forwardSmsByCurl(test_msg, context)

            json.put("curl_text", originalCurl)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "curl配置出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"curl配置出错：${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //读取短信转发curl配置
    get("/api/sms_forward_curl") {
        val sharedPrefs =
            context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)

        val curlText = sharedPrefs.getString("kano_sms_curl", "") ?: ""

        val json = JSONObject(mapOf("curl_text" to curlText)).toString()

        call.respondText(
            json,
            ContentType.Application.Json,
            HttpStatusCode.OK
        )
    }

    //短信转发总开关
    post("/api/sms_forward_enabled") {
        try {
            val enable = call.request.queryParameters["enable"]
                ?: throw Exception("query 缺少 enable 参数")
            KanoLog.d(TAG, "短信转发 enable 传入参数：$enable")

            val sharedPrefs =
                context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("kano_sms_forward_enabled", enable)
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "请求出错： ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"请求出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //获取短信转发状态
    get("/api/sms_forward_enabled") {
        try {
            val sharedPrefs =
                context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            val str = sharedPrefs.getString("kano_sms_forward_enabled", "0") ?: "0"

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"enabled":"$str"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "请求出错： ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"请求出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //转发电量信息总开关
    post("/api/power_status_forward_enabled") {
        try {
            val enable = call.request.queryParameters["enable"]
                ?: throw Exception("query 缺少 enable 参数")
            KanoLog.d(TAG, "短信转发 enable 传入参数：$enable")

            val sharedPrefs =
                context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("kano_power_status_forward_enabled", enable)
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "请求出错： ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"请求出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //获取电量信息转发状态
    get("/api/power_status_forward_enabled") {
        try {
            val sharedPrefs =
                context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            val str = sharedPrefs.getString("kano_power_status_forward_enabled", "0") ?: "0"

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"enabled":"$str"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "请求出错： ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"请求出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //短信转发黑名单配置
    post("/api/sms_forward_blacklist") {
        try {
            val raw = call.receiveText()

            val json = JSONObject(raw)

            if (!json.has("phone")) throw Exception("缺少 phone 参数")
            if (!json.has("keywords")) throw Exception("缺少 keywords 参数")

            val phone = json.optString("phone")
            val keywords = json.optString("keywords")

            if (!phone.matches(Regex("^[0-9\\n]*$"))) {
                throw Exception("phone 参数非法")
            }

            val sharedPrefs =
                context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("kano_sms_forward_blacklist_phone", phone)
                putString("kano_sms_forward_blacklist_keywords", keywords)
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "请求出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"请求出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //获取短信转发黑名单
    get("/api/sms_forward_blacklist") {
        try {
            val sharedPrefs =
                context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            val keywords = sharedPrefs.getString("kano_sms_forward_blacklist_keywords", "") ?: ""
            val phone = sharedPrefs.getString("kano_sms_forward_blacklist_phone", "") ?: ""

            val json = JSONObject().apply {
                put("keywords", keywords)
                put("phone", phone)
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                json.toString(),
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "请求出错： ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"请求出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //短信转发参数存入-钉钉webhook
    post("/api/sms_forward_dingtalk") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val webhookUrl = json.optString("webhook_url", "").trim()
            val shouldForwardDeviceInfo = json.optString("forward_dev_info", "0").trim()
            val secret = json.optString("secret", "").trim()

            if (webhookUrl.isEmpty()) {
                throw Exception("缺少必要参数：webhook_url")
            }

            // 存储到 SharedPreferences
            val sharedPrefs =
                context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("kano_sms_forward_method", "DINGTALK")
                putString("kano_dingtalk_webhook", webhookUrl)
                putString("kano_dingtalk_secret", secret)
                putString("kano_dingtalk_forward_device_info",shouldForwardDeviceInfo)
            }

            KanoLog.d(TAG, "钉钉配置已保存：$webhookUrl")

            // 发送测试消息
            val test_msg =
                SmsInfo("1145141919810", "UFI-TOOLS TEST消息", System.currentTimeMillis())
            SmsPoll.forwardSmsByDingTalk(test_msg, context)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "钉钉配置出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"钉钉配置出错：${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //读取短信转发钉钉配置
    get("/api/sms_forward_dingtalk") {
        val sharedPrefs =
            context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)

        val webhookUrl = sharedPrefs.getString("kano_dingtalk_webhook", "") ?: ""
        val secret = sharedPrefs.getString("kano_dingtalk_secret", "") ?: ""
        val shouldForwardDeviceInfo = sharedPrefs.getString("kano_dingtalk_forward_device_info","0")?: "0"

        val json = """
        {
            "webhook_url": "$webhookUrl",
            "secret": "$secret",
            "forward_dev_info":"$shouldForwardDeviceInfo"
        }
    """.trimIndent()

        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondText(json, ContentType.Application.Json, HttpStatusCode.OK)
    }

    //使用短信转发渠道发送自定义消息
    post("/api/do_forward_msg") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val address = json.optString("address", "").trim()
            val smsBody = json.optString("body", "").trim()
            val isSms = json.optBoolean("is_sms", true)
            var timestamp = json.optLong("timestamp", -1)

            if (timestamp < 0 ) {
                timestamp = System.currentTimeMillis()
            }

            val sharedPrefs = context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            val forwardMethod = sharedPrefs.getString("kano_sms_forward_method", "") ?: ""
            val sms = SmsInfo(address,smsBody,timestamp)
            when (forwardMethod) {
                "SMTP" -> {
                    forwardByEmail(sms, context,isSms)
                }
                "CURL" -> {
                    forwardSmsByCurl(sms, context)
                }
                "DINGTALK" -> {
                    forwardSmsByDingTalk(sms, context,isSms)
                }
            }

            KanoLog.d(TAG, "主动触发短信转发API：$sms,渠道：$forwardMethod")

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "主动触发短信转发出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"主动触发短信转发出错：${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

}