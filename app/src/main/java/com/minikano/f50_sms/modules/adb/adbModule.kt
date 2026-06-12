package com.minikano.f50_sms.modules.adb

import android.content.Context
import com.minikano.f50_sms.ADBService
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.modules.BASE_TAG
import com.minikano.f50_sms.modules.PREFS_NAME
import com.minikano.f50_sms.utils.ShellKano
import com.minikano.f50_sms.utils.ShellKano.Companion
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import org.json.JSONObject
import androidx.core.content.edit

//静态资源
fun Route.adbModule(context: Context) {
    val TAG = "[$BASE_TAG]_adbModule"

    //更新ADMIN_PWD
    post("/api/update_admin_pwd"){
        try {
            // 获取 JSON Body
            val body = call.receiveText()
            val json = JSONObject(body)

            val password = json.optString("password", "")

            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            // 保存配置
            sharedPrefs.edit(commit = true) {
                putString("ADMIN_PWD", password)
            }

            // 响应
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "解析ADB_WIFI POST 请求出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"参数解析失败"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //获取当前高级后台存储的官方后台密码
    get("/api/get_official_web_password") {
        try {
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            // 拼装 JSON 响应
            val resultJson = JSONObject()
                .put("pwd",sharedPrefs.getString("ADMIN_PWD",""))

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(resultJson.toString(), ContentType.Application.Json, HttpStatusCode.OK)
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

    //获取网络ADB自启状态
    get("/api/adb_wifi_setting") {
        try {
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val adbIpEnabled = sharedPrefs.getString("ADB_IP_ENABLED", "false")

            call.respondText(
                """{"enabled":$adbIpEnabled}""",
                ContentType.Application.Json
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "获取网络adb信息出错： ${e.message}")

            call.respondText(
                """{"error":"获取网络adb信息失败"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //修改网络ADB自启状态
    post("/api/adb_wifi_setting") {
        try {
            // 获取 JSON Body
            val body = call.receiveText()
            val json = JSONObject(body)

            val enabled = json.optBoolean("enabled", false)
            val password = json.optString("password", "")

            KanoLog.d(
                TAG,
                "接收到ADB_WIFI配置：enabled=$enabled, password=$password"
            )

            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            // 保存配置
            if (enabled) {
                sharedPrefs.edit(commit = true) {
                    putString("ADMIN_PWD", password)
                    putString("ADB_IP_ENABLED", "true")
                }
            } else {
                sharedPrefs.edit(commit = true) {
                    remove("ADMIN_PWD")
                    putString("ADB_IP_ENABLED", "false")
                }
            }

            KanoLog.d(TAG, "ADMIN_PWD:${sharedPrefs.getString("ADMIN_PWD", "")}")

            // 响应
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success","enabled":"$enabled"}""",
                ContentType.Application.Json
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "解析ADB_WIFI POST 请求出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"参数解析失败"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //网络ADB启动状态
    get("/api/adb_alive") {
        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondText(
            """{"result":"${ADBService.adbIsReady}"}""".trimIndent(),
            ContentType.Application.Json,
            HttpStatusCode.OK
        )
    }

}