package com.minikano.f50_sms.modules.plugins

import android.content.Context
import androidx.core.content.edit
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.modules.BASE_TAG
import com.minikano.f50_sms.modules.auth.authenticatedRoute
import com.minikano.f50_sms.utils.KanoRequest
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import org.json.JSONObject

fun Route.pluginsModule(context: Context) {
    val TAG = "[$BASE_TAG]_pluginsModule"
    val PLUGIN_STORE_NAME = "kano_plugin_store"
    val PLUGIN_KEY = "kano_plugins"

    authenticatedRoute(context){
        //保存插件
        post("/api/set_custom_head") {
            try {
                val body = call.receiveText()
                val bodyBytes = body.toByteArray(Charsets.UTF_8)
                val maxSizeInBytes = 5 * 1024 * 1024

                if (bodyBytes.size > maxSizeInBytes) {
                    throw Exception("插件总容量超出限制: ${bodyBytes.size / 1024}KB/${maxSizeInBytes / 1024}KB")
                }

                val json = JSONObject(body)
                val text = json.optString("text", "").trim()

                val sharedPref =
                    context.getSharedPreferences(PLUGIN_STORE_NAME, Context.MODE_PRIVATE)
                sharedPref.edit(commit = true){
                    putString(PLUGIN_KEY, text)
                }

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"result":"success"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.OK
                )

            } catch (e: Exception) {
                KanoLog.d(TAG, "配置出错： ${e.message}")
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"error":"配置出错: ${e.message}"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.InternalServerError
                )
            }
        }

        //从插件市场获取插件
        get("/api/plugins_store"){
            try {
                val download_url = "${AppMeta.GLOBAL_SERVER_URL}/d/UFI-TOOLS-UPDATE/plugins/ufi-tools-plugins"
                val url = "${AppMeta.GLOBAL_SERVER_URL}/api/fs/list"
                val path = "/UFI-TOOLS-UPDATE/plugins/ufi-tools-plugins"

                // 请求 alist 的 API
                val requestBody = """
            {
                "path": "$path",
                "password": "",
                "page": 1,
                "per_page": 0,
                "refresh": false
            }
        """.trimIndent()

                val alistResponse = KanoRequest.postJson(url, requestBody)

                val alistBody = alistResponse.body?.string()

                // 拼装 JSON 响应
                val resultJson = """{
                    |"download_url":"$download_url",
                    |"res":$alistBody
                    |}""".trimMargin()

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                if (resultJson != null) {
                    call.respondText(resultJson, ContentType.Application.Json, HttpStatusCode.OK)
                }else{
                    throw Exception("响应为空")
                }
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

    //读取插件
    get("/api/get_custom_head") {
        try {
            val sharedPref =
                context.getSharedPreferences(PLUGIN_STORE_NAME, Context.MODE_PRIVATE)
            val text = sharedPref.getString(PLUGIN_KEY, "") ?: ""
            val json = JSONObject(mapOf("text" to text)).toString()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                json,
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "读取自定义头部出错： ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"读取自定义头部出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }
}