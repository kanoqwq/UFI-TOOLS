package com.minikano.f50_sms.utils

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.BufferedReader
import java.io.FileReader
import java.util.Locale

/*
* 感谢群内 执念 大哥提供的思路
* */

// 数据类
data class CpuStat(val cpu: String, val total: Long, val idle: Long)
data class ThermalZone(val type: String, val temp: Int)
data class MemoryInfo(
    val total: Long,
    val available: Long,
    val used: Long,
    val usagePercent: Double,
    val swapTotal: Long,
    val swapFree: Long,
    val swapUsed: Long,
    val swapUsagePercent: Double
)

data class UsbDevice(
    val path: String,
    val product: String,
    val speed: Int
)

fun buildJsonObject(block: JSONObject.() -> Unit): JSONObject {
    return JSONObject().apply(block)
}

private fun buildThermalJson(zones: List<ThermalZone>): String {
    if (zones.isEmpty()) return "[]"
    val jsonParts = Array(zones.size) { i ->
        val zone = zones[i]
        """{"type":"${zone.type}","temp":${zone.temp}}"""
    }
    return "[${jsonParts.joinToString(",")}]"
}

//获取json格式的cpu频率
suspend fun getCpuFreqJson(): String = withContext(Dispatchers.IO) {
    val json = JSONObject()
    val cpuDir = File("/sys/devices/system/cpu")

    cpuDir.listFiles { _, name -> name.matches(Regex("cpu[0-9]+")) }?.forEach { coreDir ->
        val coreName = coreDir.name
        val cur = File(coreDir, "cpufreq/scaling_cur_freq").takeIf { it.exists() }
            ?.readText()?.trim()?.toIntOrNull()?.div(1000) ?: 0

        val max = File(coreDir, "cpufreq/cpuinfo_max_freq").takeIf { it.exists() }
            ?.readText()?.trim()?.toIntOrNull()?.div(1000) ?: 0

        json.put(coreName, JSONObject().apply {
            put("cur", cur)
            put("max", max)
        })
    }
    return@withContext json.toString()
}

suspend fun calculateCpuUsage(): String = withContext(Dispatchers.IO) {
    // 第一次读取
    val stats1 = readProcStat()
    delay(100) // 等待 100ms
    // 第二次读取
    val stats2 = readProcStat()

    val json = buildJsonObject {
        stats1.forEach { (cpu, stat1) ->
            val stat2 = stats2[cpu] ?: return@forEach

            val totalDiff = stat2.total - stat1.total
            val idleDiff = stat2.idle - stat1.idle

            val usage = if (totalDiff == 0L) {
                0.0
            } else {
                ((totalDiff - idleDiff) * 100.0) / totalDiff
            }

            put(cpu, "%.1f".format(usage))
        }
    }

    return@withContext json.toString()
}

private fun readProcStat(): Map<String, CpuStat> {
    val stats = mutableMapOf<String, CpuStat>()
    File("/proc/stat").bufferedReader().useLines { lines ->
        lines.filter { it.startsWith("cpu") }.forEach { line ->
            val parts = line.trim().split("\\s+".toRegex())
            if (parts.size > 4) {
                val cpuName = parts[0]
                // 计算总时间（所有字段之和）
                val total = parts.subList(1, parts.size).sumOf { it.toLongOrNull() ?: 0 }
                // 空闲时间 = idle + iowait (第4列 + 第5列)
                val idle = parts[4].toLongOrNull() ?: (0 +
                        (parts.getOrNull(5)?.toLongOrNull() ?: 0))
                stats[cpuName] = CpuStat(cpuName, total, idle)
            }
        }
    }
    return stats
}

suspend fun getMemoryUsage(): String = withContext(Dispatchers.IO) {
    val memInfo = readProcMeminfo()

    // 计算内存使用率
    val used = memInfo.total - memInfo.available
    val usagePercent = if (memInfo.total > 0) {
        used.toDouble() * 100 / memInfo.total
    } else 0.0

    // 计算交换空间使用率
    val swapUsed = memInfo.swapTotal - memInfo.swapFree
    val swapUsagePercent = if (memInfo.swapTotal > 0) {
        swapUsed.toDouble() * 100 / memInfo.swapTotal
    } else 0.0

    // 构建JSON
    return@withContext buildJsonObject {
        put("mem_total_kb", memInfo.total)
        put("mem_available_kb", memInfo.available)
        put("mem_used_kb", used)
        put("mem_usage_percent", "%.1f".format(usagePercent))
        put("swap_total_kb", memInfo.swapTotal)
        put("swap_free_kb", memInfo.swapFree)
        put("swap_used_kb", swapUsed)
        put("swap_usage_percent", "%.1f".format(swapUsagePercent))
    }.toString()
}

private fun readProcMeminfo(): MemoryInfo {
    var total = 0L
    var available = 0L
    var swapTotal = 0L
    var swapFree = 0L

    File("/proc/meminfo").bufferedReader().useLines { lines ->
        lines.forEach { line ->
            when {
                line.startsWith("MemTotal:") -> total = parseMemValue(line)
                line.startsWith("MemAvailable:") -> available = parseMemValue(line)
                line.startsWith("SwapTotal:") -> swapTotal = parseMemValue(line)
                line.startsWith("SwapFree:") -> swapFree = parseMemValue(line)
            }
        }
    }

    return MemoryInfo(total, available, 0, 0.0, swapTotal, swapFree, 0, 0.0)
}

private fun parseMemValue(line: String): Long {
    return line.split("\\s+".toRegex())
        .getOrNull(1)
        ?.toLongOrNull() ?: 0L
}

//CPU温度
suspend fun readThermalZones(): Pair<Int, String> = withContext(Dispatchers.IO) {
    val thermalDir = File("/sys/class/thermal")
    val zones = mutableListOf<ThermalZone>()

    thermalDir.listFiles()?.filter { it.name.startsWith("thermal_zone") }?.forEach { zoneDir ->
        val typeFile = File(zoneDir, "type")
        val tempFile = File(zoneDir, "temp")

        if (typeFile.exists() && tempFile.exists()) {
            try {
                val sensorType = typeFile.readText().trim()
                val tempValue = tempFile.readText().trim().toIntOrNull() ?: -1
                //大于124摄氏度的传感器不显示（过滤无意义值）
                if (tempValue <= 124 * 1000 &&
                    tempValue >= 0 &&
                    sensorType.isNotEmpty() &&
                    !sensorType.contains("chg") &&
                    !sensorType.contains("front") &&
                    !sensorType.contains("frame") &&
                    !sensorType.contains("wcn") &&
                    !sensorType.contains("usb") &&
                    !sensorType.contains("bcl") &&
                    !sensorType.contains("interface") &&
                    !sensorType.contains("skin") &&
                    !sensorType.contains("back")
                ) {
                    zones.add(ThermalZone(sensorType, tempValue))
                }
            } catch (_: Exception) { }
        }
    }
    val sortedZones = zones.sortedByDescending { it.temp }
    val maxTemp = sortedZones.firstOrNull()?.temp ?: -1
    val json = buildThermalJson(zones)

    return@withContext Pair(maxTemp, json)
}

//电池电压，电流
data class BatteryInfo(
    var current_uA: Int = -1,  // 单位 μA
    var voltage_uV: Int = -1  // 单位 μV
)
suspend fun readBatteryStatus(): BatteryInfo = withContext(Dispatchers.IO) {
    val baseDir = File("/sys/class/power_supply/battery")
    val info = BatteryInfo()

    val files = mapOf(
        "current_now" to ::parseMicroAmp,
        "voltage_now" to ::parseMicroVolt
    )

    val details = mutableMapOf<String, Any>()

    files.forEach { (filename, parser) ->
        val file = File(baseDir, filename)
        if (file.exists()) {
            try {
                val raw = file.readText().trim()
                val value = parser(raw)
                details[filename] = value
                when (filename) {
                    "current_now" -> info.current_uA = value
                    "voltage_now" -> info.voltage_uV = value
                }
            } catch (_: Exception) { }
        }
    }

    return@withContext info
}

private fun parseMicroAmp(text: String): Int {
    return text.toIntOrNull() ?: -1
}

private fun parseMicroVolt(text: String): Int {
    return text.toIntOrNull() ?: -1
}

suspend fun readUsbDevices(): Pair<Int, String> = withContext(Dispatchers.IO) {
    val usbDir = File("/sys/bus/usb/devices")
    val devices = mutableListOf<UsbDevice>()
    var maxSpeed = 0
    var gadgetSpeed = "unknown"

    usbDir.listFiles()?.forEach { deviceDir ->
        val productFile = File(deviceDir, "product")
        val speedFile = File(deviceDir, "speed")

        if (productFile.exists() && speedFile.exists()) {
            try {
                val product = productFile.readText().trim()
                val speed = speedFile.readText().trim().toIntOrNull() ?: 0
                //排除掉不是 真正 USB-C 的设备
                if (
                    !(deviceDir.name.startsWith("usb")) &&
                    !(product.contains("Host Controller", ignoreCase = true)) &&
                    !(product.contains("HDRC", ignoreCase = true))
                    ) {
                    if(speed > maxSpeed) maxSpeed = speed
                    devices.add(UsbDevice(deviceDir.name, product, speed))
                }
            } catch (_: Exception) {}
        }
    }

    // 顺便获取 Type-C host/gadget 模式
    // cat /sys/class/android_usb/android0/state
    var typeCMode = "unknown"
    val portStateFile = File("/sys/class/android_usb/android0/state")
    if (portStateFile.exists()) {
        val state = portStateFile.readText().trim().uppercase(Locale.getDefault())
        typeCMode = if (state == "DISCONNECTED") "host" else "gadget"
    }

    //如果是gadget模式，从另一个地方获取速度
    if(typeCMode == "gadget"){
        val udcDir = File("/sys/class/udc")
        if (udcDir.exists()){
            var speed = "Unknown"
            udcDir.listFiles()?.forEach { udc ->
                val speedFile = File(udc, "current_speed")
                if (speedFile.exists()) {
                    val raw = speedFile.readText().trim()
                    if(raw != "UNKNOWN") {
                        speed = when (raw) {
                            "low-speed" -> "USB 1.0 (1.5Mbps)"
                            "full-speed" -> "USB 1.1 (12Mbps)"
                            "high-speed" -> "USB 2.0 (480Mbps)"
                            "super-speed" -> "USB 3.0 (5Gbps)"
                            "super-speed-plus" -> "USB 3.1 (10Gbps)"
                            else -> raw
                        }
                    }
                }
            }
            gadgetSpeed = speed
        }
    }

    // 构建 JSON
    val jsonArray = JSONArray()
    devices.forEach { dev ->
        val obj = JSONObject()
        obj.put("path", dev.path)
        obj.put("product", dev.product)
        obj.put("speed", dev.speed)
        jsonArray.put(obj)
    }
    val jsonRoot = JSONObject()
    jsonRoot.put("typec_mode", typeCMode)
    jsonRoot.put("gadget_speed", gadgetSpeed)
    jsonRoot.put("devices", jsonArray)

    return@withContext Pair(maxSpeed, jsonRoot.toString())
}

//连接数
data class NetConnCount(
    var tcp: Int = -1,
    var tcpActive: Int = -1,   // ESTABLISHED
    var tcpOther: Int = -1,    // 其他状态
    var tcp6: Int = -1,
    var udp: Int = -1,
    var udp6: Int = -1,
    var unix: Int = -1,
) {
    val total: Int
        get() = listOf(tcp, tcp6, udp, udp6, unix).filter { it >= 0 }.sum()
}

suspend fun readNetConnCount(): NetConnCount = withContext(Dispatchers.IO) {
    NetConnCount().apply {
        val tcpPair = countTcpStates("/proc/net/tcp")
        tcp = tcpPair.first
        tcpActive = tcpPair.second
        tcpOther = if (tcp >= 0 && tcpActive >= 0) tcp - tcpActive else -1

        tcp6 = countProcNetLines("/proc/net/tcp6", skipHeader = true)
        udp  = countProcNetLines("/proc/net/udp",  skipHeader = true)
        udp6 = countProcNetLines("/proc/net/udp6", skipHeader = true)
        unix = countProcNetLines("/proc/net/unix", skipHeader = true)
    }
}

private fun countTcpStates(path: String): Pair<Int, Int> {
    val f = File(path)
    if (!f.exists()) return -1 to -1

    var total = 0
    var active = 0

    return try {
        BufferedReader(FileReader(f), 8 * 1024).use { br ->
            br.readLine() // header
            while (true) {
                val line = br.readLine() ?: break
                if (line.isEmpty()) continue

                total++

                // 第4列是状态 hex
                // 直接取固定位置比 split 更省CPU
                // 但为稳妥仍用轻量 split
                val parts = line.trim().split(Regex("\\s+"))
                if (parts.size >= 4 && parts[3] == "01") {
                    active++ // ESTABLISHED
                }
            }
            total to active
        }
    } catch (_: Throwable) {
        -1 to -1
    }
}

private fun countProcNetLines(path: String, skipHeader: Boolean): Int {
    val f = File(path)
    if (!f.exists()) return -1

    return try {
        BufferedReader(FileReader(f), /*bufferSize=*/ 8 * 1024).use { br ->
            if (skipHeader) br.readLine() // 读掉表头
            var count = 0
            while (true) {
                val line = br.readLine() ?: break
                // 过滤空行
                if (line.isNotEmpty()) count++
            }
            count
        }
    } catch (_: Throwable) {
        // 无权限 / 读取失败
        -1
    }
}