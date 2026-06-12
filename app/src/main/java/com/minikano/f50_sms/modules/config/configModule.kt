package com.minikano.f50_sms.modules.config

import android.content.Context
import com.minikano.f50_sms.modules.BASE_TAG
import com.minikano.f50_sms.utils.KanoLog
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
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.utils.KanoUtils

fun Route.configModule(context: Context) {
    val TAG = "[$BASE_TAG]_configModule"
    val PREFS_NAME = "kano_ZTE_store"
    val PREF_LOGIN_TOKEN = "login_token"

    //检查是否默认口令
    get("/api/is_weak_token") {
        try {
            val jsonResult = """{"is_weak_token":${AppMeta.isDefaultOrWeakToken}}""".trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "获取是否弱Token出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取是否弱Token出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //设置口令
    post("/api/set_token") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val token = json.optString("token", "").trim()
            if (token.isEmpty() || token.isBlank()) {
                throw IllegalArgumentException("请提供 token")
            }

            val regex = Regex("^(?=.*[a-zA-Z])(?=.*\\d).{8,128}$")
            if(token.length < 8) {
                throw IllegalArgumentException("token 需要至少8位")
            }
            else if(!regex.matches(token)) {
                throw IllegalArgumentException("口令需要至少同时包含数字和字母")
            }

            KanoLog.d(TAG, "接收到 token=$token")

            val pref = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            pref.edit(commit = true) {
                putString(PREF_LOGIN_TOKEN, KanoUtils.sha256Hex(token))
            }
            AppMeta.updateIsDefaultOrWeakToken(context,KanoUtils.isWeakToken(token = token))

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "设置口令出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"${e.message ?: "未知错误"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //获取全局服务器地址
    get("/api/get_res_server") {
        try {
            // 拼装 JSON 响应
            val resultJson = """{
                "res_server": "${AppMeta.GLOBAL_SERVER_URL}"
            }""".trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(resultJson, ContentType.Application.Json, HttpStatusCode.OK)
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

    //设置资源服务器
    post("/api/set_res_server") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val resServerUrl = json.optString("res_server", "").trim()
            if (resServerUrl.isEmpty() || resServerUrl.isBlank()) {
                throw IllegalArgumentException("请提供 res_server")
            }

            KanoLog.d(TAG, "接收到 res_server=$resServerUrl")

            AppMeta.setGlobalServerUrl(context, resServerUrl)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "设置resServerUrl出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"${e.message ?: "未知错误"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //获取日志开关状态
    get("/api/get_log_status") {
        try {
            // 拼装 JSON 响应
            val resultJson = """{
                "debug_log_enabled": "${AppMeta.isEnableLog}"
            }""".trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(resultJson, ContentType.Application.Json, HttpStatusCode.OK)
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

    //设置日志开关状态
    post("/api/set_log_status") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val debugEnabled = json.optBoolean("debug_log_enabled", false)

            KanoLog.d(TAG, "接收到 debug_log_enabled=$debugEnabled")

            AppMeta.setIsEnableLog(context, debugEnabled)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "设置debug_log_enabled出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"${e.message ?: "未知错误"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //设置唤醒锁开关状态
    post("/api/set_wakelock_status") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val wakeLockEnabled = json.optBoolean("wakelock_enabled", false)

            KanoLog.d(TAG, "接收到 wakelock_enabled=$wakeLockEnabled")

            AppMeta.setIsEnableWakeLock(context, wakeLockEnabled)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "设置wakelock_enabled出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"${e.message ?: "未知错误"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //设置流量阈值与断网开关
    post("/api/set_data_limit") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val dataFlowEnabled = if (
                json.optString("data_flow_limit_enabled", "0") == "1" ||
                json.optBoolean("data_flow_limit_enabled", false)
            ) "1" else "0"
            val dataFlowNoticeEnabled = if (
                json.optString("data_limit_status_forward_enabled", "0") == "1" ||
                json.optBoolean("data_limit_status_forward_enabled", false)
            ) "1" else "0"

            var dataFlowMaxLimit = json.optLong("data_flow_max_limit", -1L)
            var flowType = json.optString("data_flow_check_daily_or_monthly", "monthly")
            var dataReference = json.optString("data_check_reference", "default")

            if (dataFlowMaxLimit <= 0) {
                dataFlowMaxLimit = -1L
            }

            if (flowType != "daily") {
                flowType = "monthly"
            }

            dataReference = when (dataReference) {
                "android", "ufi" -> "android"
                else -> "default"
            }

            KanoLog.d(TAG, "接收到 data_flow_limit_enabled=$dataFlowEnabled")
            KanoLog.d(TAG, "接收到 data_flow_max_limit=$dataFlowMaxLimit")
            KanoLog.d(TAG, "接收到 data_flow_check_daily_or_monthly=$flowType")
            KanoLog.d(TAG, "接收到 data_check_reference=$dataReference")
            KanoLog.d(TAG, "接收到 data_limit_status_forward_enabled=$dataFlowNoticeEnabled")

            AppMeta.setIsDataFlowLimitEnabled(context, dataFlowEnabled == "1")
            AppMeta.setDataFlowCheckDailyOrMonthly(context, flowType)
            AppMeta.setDataFlowCheckRef(context, dataReference)
            AppMeta.setDataFlowMaxValue(context, dataFlowMaxLimit)
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            //持久化
            sharedPrefs.edit(commit = true) {
                putString("kano_data_limit_status_forward_enabled",dataFlowNoticeEnabled)
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "设置 set_data_limit 出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"${e.message ?: "未知错误"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //获取流量阈值开关
    get("/api/get_data_limit") {
        try {
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            // 拼装 JSON 响应
            val resultJson = JSONObject()
                .put("data_flow_limit_enabled",if(AppMeta.isDataFlowLimitEnabled) "1" else "0")
                .put("data_flow_max_limit",AppMeta.dataFlowMaxValue)
                .put("data_flow_check_daily_or_monthly",AppMeta.dataFlowCheckDailyOrMonthly)
                .put("data_check_reference",AppMeta.dataFlowCheckRef)
                .put("data_limit_status_forward_enabled",sharedPrefs.getString("kano_data_limit_status_forward_enabled","0"))

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
}