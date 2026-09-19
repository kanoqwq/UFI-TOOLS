package com.minikano.f50_sms.modules.at

import android.content.Context
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.ShellKano
import com.minikano.f50_sms.modules.BASE_TAG
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import org.json.JSONArray
import org.json.JSONObject

private object NrBandListCache {
    private val lock = Any()
    private var bands: List<Int>? = null

    fun getOrQuery(query: () -> List<Int>): List<Int> = synchronized(lock) {
        bands ?: query().also { bands = it }
    }
}

fun Route.atModule(context: Context) {
    val TAG = "[$BASE_TAG]_atModule"

    //AT指令
    get("/api/AT") {
        try {
            val command = call.request.queryParameters["command"]
                ?: throw Exception("缺少 query 参数 command")
            val slot = call.request.queryParameters["slot"]?.toIntOrNull() ?: 0

            KanoLog.d(TAG, "AT_command 传入参数：$command")

            if (!command.trim().startsWith("AT", ignoreCase = true)) {
                throw Exception("解析失败，AT指令需要以 “AT” 开头")
            }

            val outFileAt = KanoUtils.copyFileToFilesDir(context, "shell/sendat")
                ?: throw Exception("复制 sendat 到 filesDir 失败")
            outFileAt.setExecutable(true)

            // 以 argv 传参，不经过 sh -c：命令里的引号/分号无法逃逸成 shell 命令
            val atArgv = listOf(outFileAt.absolutePath, "-n", slot.toString(), "-c", command.trim())
            val result = ShellKano.runShellArgv(atArgv)
                ?: throw Exception("AT 指令没有输出")

            // 不再手工转义引号：交给 JSONObject 序列化，
            // 模组回包里出现反斜杠/控制字符也不会把 JSON 打坏
            var res = result
                .replace("\n", "")
                .replace("\r", "")
                .trimStart()

            if (res.lowercase().endsWith("ok")) {
                res = res.dropLast(2).trimEnd() + " OK"
            }
            if (res.startsWith(",")) {
                res = res.removePrefix(",").trimStart()
            }

            KanoLog.d(TAG, "AT_cmd：$atArgv")
            KanoLog.d(TAG, "AT_result：$res")

            call.respondText(
                JSONObject().put("result", res).toString(),
                ContentType.Application.Json
            )

        } catch (e: Exception) {
            KanoLog.d(TAG, "AT指令执行错误：${e.message}")

            call.respondText(
                JSONObject().put("error", "AT指令执行错误：${e.message}").toString(),
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    // 查询基带支持的 NR 频段，供锁频页面动态渲染。
    get("/api/getSupportNrBandList") {
        try {
            val slot = call.request.queryParameters["slot"]?.toIntOrNull() ?: 0
            val bands = NrBandListCache.getOrQuery {
                val raw = KanoUtils.runAT(context, "AT+SP5GCMDS=\"get nr support_band\"", slot)
                if (raw.contains("ERROR", ignoreCase = true) || !raw.contains("+SP5GCMDS:", ignoreCase = true)) {
                    throw IllegalStateException("查询 NR 支持频段失败：$raw")
                }
                raw
                    .substringBefore("OK")
                    .substringAfter(":", "")
                    .split(",")
                    .drop(1) // 第一个字段是命令名：get nr support_band
                    .mapNotNull { it.trim().trim('"', '\\').toIntOrNull() }
                    .distinct()
            }
            val bandsJson = JSONArray().apply {
                bands.forEach(::put)
            }

            KanoLog.d(TAG, "getSupportNrBandList slot=$slot bands=$bands")
            call.respondText(
                JSONObject()
                    .put("slot", slot)
                    .put("band_list", bandsJson)
                    .toString(),
                ContentType.Application.Json
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "getSupportNrBandList 错误：${e.message}")
            call.respondText(
                JSONObject().put("error", "getSupportNrBandList 错误：${e.message}").toString(),
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

}
