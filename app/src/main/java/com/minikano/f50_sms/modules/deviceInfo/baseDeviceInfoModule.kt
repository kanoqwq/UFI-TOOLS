package com.minikano.f50_sms.modules.deviceInfo

import android.content.Context
import android.os.StatFs
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.modules.BASE_TAG
import com.minikano.f50_sms.modules.PREFS_NAME
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.UniqueDeviceIDManager
import com.minikano.f50_sms.utils.calculateCpuUsage
import com.minikano.f50_sms.utils.getCpuFreqJson
import com.minikano.f50_sms.utils.getMemoryUsage
import com.minikano.f50_sms.utils.readBatteryStatus
import com.minikano.f50_sms.utils.readThermalZones
import com.minikano.f50_sms.utils.readUsbDevices
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.origin
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import androidx.core.content.edit
import com.minikano.f50_sms.utils.readNetConnCount
import io.ktor.server.request.receiveText
import org.json.JSONArray
import org.json.JSONObject

data class MyStorageInfo(
    val path: String, val totalBytes: Long, val availableBytes: Long
)

fun Route.baseDeviceInfoModule(context: Context) {
    val TAG = "[$BASE_TAG]_baseDeviceInfoModule"

    get("/api/baseDeviceInfo") {
        //客户端IP
        var ipRes: String? = null
        try {
            val headers = call.request.headers

            val ip = headers["http-client-ip"]
                ?: headers["x-forwarded-for"]
                ?: headers["remote-addr"]
                ?: call.request.origin.remoteAddress

            KanoLog.d(TAG, "获取客户端IP成功: $ip")
            ipRes = ip
        } catch (e: Exception) {
            KanoLog.e(TAG, "获取客户端IP出错: ${e.message}")
            ipRes = null
        }

        //cpu温度
        var cpuTempRes: String? = null
        var cpuTempMax:String? = null
        try {
            val (maxTemp,temp) = readThermalZones()
            cpuTempMax = maxTemp.toString()
            KanoLog.d(TAG, "获取CPU温度成功: $temp")
            cpuTempRes = temp
            cpuTempRes = cpuTempRes.replace("\n", "")

        } catch (e: Exception) {
            KanoLog.d(TAG, "获取CPU温度出错： ${e.message}")
            cpuTempRes = null
        }

        //cpu 内存信息
        var cpuFreqInfo: String? = null
        var cpuUsageInfo: String? = null
        var memInfo: String? = null
        var cpuUsageRes: Double? = null
        var memUsageRes: Double? = null

        try {
            val usage = calculateCpuUsage()
            val freq = getCpuFreqJson()
            val mem = getMemoryUsage()

            KanoLog.d(TAG, "CPU频率数据：${freq}")
            KanoLog.d(TAG, "CPU使用数据：${usage}")
            KanoLog.d(TAG, "Mem使用数据：${mem}")
            cpuUsageRes = Json.parseToJsonElement(usage)
                .jsonObject["cpu"]
                ?.jsonPrimitive
                ?.double
            memUsageRes = Json.parseToJsonElement(mem)
                .jsonObject["mem_usage_percent"]
                ?.jsonPrimitive
                ?.double
            cpuFreqInfo = freq
            cpuUsageInfo = usage
            memInfo = mem
        } catch (e: Exception) {
            cpuFreqInfo = null
            cpuUsageInfo = null
            memInfo = null
            KanoLog.d(TAG, "获取cpu内存信息出错： ${e.message}")
        }

        //存储与日流量获取
        var dailyDataRes: Long? = null
        var monthlyDataRes: Long? = null
        var availableSizeRes: Long? = null
        var usedSizeRes: Long? = null
        var totalSizeRes: Long? = null
        var externalTotalRes: Long? = null
        var externalUsedRes: Long? = null
        var externalAvailableRes: Long? = null
        try {
            // 内部存储
            val internalStorage = context.filesDir
            val statFs = StatFs(internalStorage.absolutePath)
            val totalSize = statFs.blockSizeLong * statFs.blockCountLong
            val availableSize = statFs.blockSizeLong * statFs.availableBlocksLong
            val usedSize = totalSize - availableSize

            // 获取日用、月用流量
            dailyDataRes = KanoUtils.getCachedTodayUsage(context)
            monthlyDataRes = KanoUtils.getCachedMonthlyUsage(context)

            // 外部存储（可移动设备）
            val exStorageInfo = KanoUtils.getCachedRemovableStorageInfo(context)
            val externalTotal = exStorageInfo?.totalBytes ?: 0
            val externalAvailable = exStorageInfo?.availableBytes ?: 0
            val externalUsed = externalTotal - externalAvailable

            KanoLog.d(TAG, "日用流量：$dailyDataRes")
            KanoLog.d(TAG, "月用流量：$monthlyDataRes")
            KanoLog.d(TAG, "内部存储：$usedSize/$totalSize")
            KanoLog.d(TAG, "外部存储：$externalAvailable/$externalTotal")

            availableSizeRes = availableSize
            usedSizeRes = usedSize
            totalSizeRes = totalSize
            externalTotalRes = externalTotal
            externalUsedRes = externalUsed
            externalAvailableRes = externalAvailable

        } catch (e: Exception) {
            KanoLog.d(TAG, "存储与日流量信息出错： ${e.message}")
            dailyDataRes = null
            availableSizeRes = null
            usedSizeRes = null
            totalSizeRes = null
            externalTotalRes = null
            externalUsedRes = null
            externalAvailableRes = null
        }


        //型号与电量获取
        var versionNameRes: String? = null
        var versionCodeRes: Int? = null
        var modelRes: String? = null
        var batteryLevelRes: Int? = null
        var currentNow :Int? = null
        var votageNow :Int? = null
        try {
            val batteryLevel: Int = KanoUtils.getBatteryPercentage(context)
            val batteryStatus = readBatteryStatus()
            currentNow = batteryStatus.current_uA
            votageNow = batteryStatus.voltage_uV

            KanoLog.d(TAG, "型号与电量：${AppMeta.model} $batteryLevel")

            versionNameRes = AppMeta.versionName
            versionCodeRes = AppMeta.versionCode
            modelRes = AppMeta.model
            batteryLevelRes = batteryLevel

        } catch (e: Exception) {
            KanoLog.d(TAG, "获取型号与电量信息出错：${e.message}")
            versionNameRes = null
            versionCodeRes = null
            modelRes = null
            batteryLevelRes = null
        }

        val jsonResult = """
            {
                "app_ver": "$versionNameRes",
                "app_ver_code": "$versionCodeRes",
                "model": "$modelRes",
                "battery": "$batteryLevelRes",
                "daily_data": $dailyDataRes,
                "monthly_data": $monthlyDataRes,
                "internal_available_storage": $availableSizeRes,
                "internal_used_storage": $usedSizeRes,
                "internal_total_storage": $totalSizeRes,
                "external_total_storage": $externalTotalRes,
                "external_used_storage": $externalUsedRes,
                "external_available_storage": $externalAvailableRes,
                "cpu_temp_list":$cpuTempRes,
                "cpu_temp":$cpuTempMax,
                "client_ip":"$ipRes",
                "cpu_usage":$cpuUsageRes,
                "mem_usage":$memUsageRes,
                "cpuFreqInfo":$cpuFreqInfo,
                "cpuUsageInfo":$cpuUsageInfo,
                "memInfo":$memInfo,
                "current_now":$currentNow,
                "voltage_now":$votageNow,
                "is_reached_data_flow_limit":${AppMeta.isReachedDataFlowLimit}
            }
        """.trimIndent()
        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondText(jsonResult, ContentType.Application.Json)
    }

    get("/api/connInfo"){
        try {
            val res = readNetConnCount()
            val jsonResult = """{"result":"success","data":{"tcp":"${res.tcp}","tcp_active":"${res.tcpActive}","tcp_other":"${res.tcpOther}","tcp6":"${res.tcp6}","udp":"${res.udp}","udp6":"${res.udp6}","unix":"${res.unix}"}}"""
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "获取连接信息出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取连接信息出错(SELINUX状态：${KanoUtils.getSELinuxStatus()})"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //流量信息获取（时间范围）
    get("/api/cellularUsage") {
        try {
            val method = call.request.queryParameters["method"] ?: "date-range"
            val startTime = call.request.queryParameters["startTime"]?.toLongOrNull()
            val endTime = call.request.queryParameters["endTime"]?.toLongOrNull()

            if (startTime == null) {
                throw Exception("缺少参数 startTime")
            }
            if (endTime == null) {
                throw Exception("缺少参数 endTime")
            }

            KanoLog.d(TAG, "cellularUsage 传入参数：startTime：$startTime endTime：$endTime method：$method")

            val jsonResult = if (method != "mills-range") {
                val res = KanoUtils.getRangeDailyDataUsage(context, startTime, endTime)

                JSONObject().apply {
                    put("result", "success")
                    put("usage", JSONArray(res))
                }.toString()
            } else {
                val res = KanoUtils.getRangeDataUsage(context, startTime, endTime)

                JSONObject().apply {
                    put("result", "success")
                    put("usage", res.toString())
                }.toString()
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)

        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "获取流量使用情况出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                JSONObject().apply {
                    put("error", "获取流量使用情况出错:${e.message}")
                }.toString(),
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    post("/api/accept_terms"){
        try {
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            AppMeta.isReadUseTerms = true
            sharedPrefs.edit(commit = true) { putString("isReadUseTerms", "true") }
            val jsonResult = """{"result":"success"}""".trimIndent()
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "获取用户协议信息出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取用户协议信息出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //设置昵称
    post("/api/set_nickname"){
        try {
            val body = call.receiveText()
            val json = JSONObject(body)
            var nickname = json.optString("nickname", "").trim()
            if (nickname.length > 255) {
                nickname = nickname.take(255)
            }
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            AppMeta.setNickName(sharedPrefs,nickname)
            val jsonResult = """{"result":"success"}""".trimIndent()
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "设置昵称出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"设置昵称出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //版本信息获取
    get("/api/version_info") {
        try {
            val jsonResult = """
            {
                "app_ver": "${AppMeta.versionName}",
                "app_ver_code": "${AppMeta.versionCode}",
                "model":"${AppMeta.model}",
                "nickname":"${AppMeta.nickName}",
                "accept_terms":${AppMeta.isReadUseTerms}
            }
        """.trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "获取版本信息出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取版本信息出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    get("/api/device_id") {
        try {
            val jsonResult = """{"device_id": "${UniqueDeviceIDManager.getUUID()}"}""".trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "获取设备id出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取设备id出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //SELinux状态
    get("/api/SELinux"){
        try {
            val res = KanoUtils.getSELinuxStatus()
            val jsonResult = """
            {
                "selinux": "$res"
            }
        """.trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "获取selinux状态出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取selinux状态出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //是否需要token
    get("/api/need_token") {
        try {
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val needToken = sharedPrefs.getString("login_token_enabled", true.toString())

            val jsonResult = """
            {
                "need_token": $needToken
            }
        """.trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "获取TOKEN信息出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取TOKEN信息出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //usb设备树以及接口状态
    get("/api/usb_status") {
        try {
            val (maxSpeed,details) = readUsbDevices()
            val jsonResult = """
            {
                "maxSpeed":$maxSpeed,
                "details":$details
            }
        """.trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "获取UsbDevices信息出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取UsbDevices信息出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //获取volte状态
    get("/api/volte_status") {
        try {
            val slot = call.request.queryParameters["slot"]?.toIntOrNull() ?: 0
            val res = KanoUtils.getVoLteState(context,slot)
            val jsonResult = """
            {
                "enabled":$res
            }
        """.trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "获取volte_status信息出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取volte_status信息出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //获取vonr状态
    get("/api/vonr_status") {
        try {
            val slot = call.request.queryParameters["slot"]?.toIntOrNull() ?: 0
            val res = KanoUtils.getVoNrState(context,slot)
            val jsonResult = """
            {
                "enabled":$res
            }
        """.trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "获取vonr_status信息出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取vonr_status信息出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //设置volte状态
    post("/api/volte_status"){
        try {
            val body = call.receiveText()
            val json = JSONObject(body)
            var enabled = json.optString("enabled", "1").trim()
            var slot = json.optString("slot", "0")

            if(enabled != "0") enabled = "1"
            if(slot != "0") slot = "1"

            val ok = KanoUtils.setVoLteState(context,enabled,slot.toInt())

            if(!ok) throw Exception("设置失败")

            //存盘
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            //持久化
            sharedPrefs.edit(commit = true) {
                putString("volte_status_$slot", enabled)
            }

            val jsonResult = """{"result":"success"}""".trimIndent()
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "设置volte状态出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"设置volte状态出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //设置vonr状态
    post("/api/vonr_status"){
        try {
            val body = call.receiveText()
            val json = JSONObject(body)
            var enabled = json.optString("enabled", "1").trim()
            var slot = json.optString("slot", "0")

            if(enabled != "0") enabled = "1"
            if(slot != "0") slot = "1"

            val ok = KanoUtils.setVoNrState(context,enabled,slot.toInt())

            if(!ok) throw Exception("设置失败")

            //存盘
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            //持久化
            sharedPrefs.edit(commit = true) {
                putString("vonr_status_$slot", enabled)
            }

            val jsonResult = """{"result":"success"}""".trimIndent()
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            KanoLog.d("UFI_TOOLS_LOG", "设置vonr状态出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"设置vonr状态出错"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }
}