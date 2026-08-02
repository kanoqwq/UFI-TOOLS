package com.minikano.f50_sms.utils

import android.os.SystemClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
data class CpuUsageSnapshot(val json: String, val overallUsage: Double?)
data class MemoryUsageSnapshot(val json: String, val usagePercent: Double)
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

private data class ThermalSource(val type: String, val tempFile: File)
private data class ThermalReadResult(
    val zones: List<ThermalZone>,
    val hasMissingSource: Boolean,
    val successfulReadCount: Int
)

private const val CPU_MIN_SAMPLE_INTERVAL_MS = 100L
private const val CPU_MAX_BASELINE_AGE_MS = 2_000L
private const val THERMAL_SAMPLE_INTERVAL_MS = 1_000L
private const val THERMAL_DISCOVERY_INTERVAL_MS = 60_000L
private const val THERMAL_RECOVERY_COOLDOWN_MS = 5_000L
private val CPU_CORE_NAME_REGEX = Regex("cpu[0-9]+")
private val WHITESPACE_REGEX = Regex("\\s+")

private val cpuUsageMutex = Mutex()
private var previousCpuStats: Map<String, CpuStat> = emptyMap()
private var cachedCpuUsage: CpuUsageSnapshot? = null
private var lastCpuSampleAtMs = 0L

private val thermalMutex = Mutex()
private var cachedThermalResult: Pair<Int, String>? = null
private var lastThermalSampleAtMs = 0L
private val thermalSourceLock = Any()
private var thermalSources: List<ThermalSource> = emptyList()
private var knownThermalZonePaths: Set<String> = emptySet()
private var lastThermalDiscoveryAtMs = 0L
private var lastThermalRecoveryAtMs = 0L

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

    cpuDir.listFiles { _, name -> CPU_CORE_NAME_REGEX.matches(name) }?.forEach { coreDir ->
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

suspend fun getCpuUsageSnapshot(): CpuUsageSnapshot = withContext(Dispatchers.IO) {
    cpuUsageMutex.withLock {
        val now = SystemClock.elapsedRealtime()
        cachedCpuUsage?.takeIf { now - lastCpuSampleAtMs < CPU_MIN_SAMPLE_INTERVAL_MS }
            ?.let { return@withLock it }

        var currentStats = readProcStat()
        var baselineStats = previousCpuStats

        // 首次调用没有上一个时间点，仅首次保留原有的 100ms 双点采样。
        if (baselineStats.isEmpty() || now - lastCpuSampleAtMs > CPU_MAX_BASELINE_AGE_MS) {
            baselineStats = currentStats
            delay(CPU_MIN_SAMPLE_INTERVAL_MS)
            currentStats = readProcStat()
        }

        var overallUsage: Double? = null
        val json = buildJsonObject {
            baselineStats.forEach { (cpu, stat1) ->
                val stat2 = currentStats[cpu] ?: return@forEach
                val totalDiff = stat2.total - stat1.total
                val idleDiff = stat2.idle - stat1.idle
                val usage = if (totalDiff <= 0L) {
                    0.0
                } else {
                    ((totalDiff - idleDiff) * 100.0 / totalDiff).coerceIn(0.0, 100.0)
                }
                val formattedUsage = "%.1f".format(usage)
                if (cpu == "cpu") overallUsage = formattedUsage.toDoubleOrNull()
                put(cpu, formattedUsage)
            }
        }

        CpuUsageSnapshot(json.toString(), overallUsage).also {
            previousCpuStats = currentStats
            cachedCpuUsage = it
            lastCpuSampleAtMs = SystemClock.elapsedRealtime()
        }
    }
}

suspend fun calculateCpuUsage(): String = getCpuUsageSnapshot().json

private fun readProcStat(): Map<String, CpuStat> {
    val stats = mutableMapOf<String, CpuStat>()
    File("/proc/stat").bufferedReader().useLines { lines ->
        lines.filter { it.startsWith("cpu") }.forEach { line ->
            val parts = line.trim().split(WHITESPACE_REGEX)
            if (parts.size > 4) {
                val cpuName = parts[0]
                // 计算总时间（所有字段之和）
                val total = parts.subList(1, parts.size).sumOf { it.toLongOrNull() ?: 0 }
                // 空闲时间 = idle + iowait (第4列 + 第5列)
                val idle = (parts[4].toLongOrNull() ?: 0L) +
                    (parts.getOrNull(5)?.toLongOrNull() ?: 0L)
                stats[cpuName] = CpuStat(cpuName, total, idle)
            }
        }
    }
    return stats
}

suspend fun getMemoryUsageSnapshot(): MemoryUsageSnapshot = withContext(Dispatchers.IO) {
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

    val formattedUsage = "%.1f".format(usagePercent)
    val json = buildJsonObject {
        put("mem_total_kb", memInfo.total)
        put("mem_available_kb", memInfo.available)
        put("mem_used_kb", used)
        put("mem_usage_percent", formattedUsage)
        put("swap_total_kb", memInfo.swapTotal)
        put("swap_free_kb", memInfo.swapFree)
        put("swap_used_kb", swapUsed)
        put("swap_usage_percent", "%.1f".format(swapUsagePercent))
    }.toString()

    return@withContext MemoryUsageSnapshot(
        json = json,
        usagePercent = formattedUsage.toDoubleOrNull() ?: usagePercent
    )
}

suspend fun getMemoryUsage(): String = getMemoryUsageSnapshot().json

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
    return line.split(WHITESPACE_REGEX)
        .getOrNull(1)
        ?.toLongOrNull() ?: 0L
}

private fun listThermalZoneDirs(): List<File> {
    val thermalDir = File("/sys/class/thermal")
    return thermalDir.listFiles()
        ?.filter { it.name.startsWith("thermal_zone") }
        ?.sortedBy { it.name }
        ?: emptyList()
}

private fun discoverThermalSources(zoneDirs: List<File>): List<ThermalSource> {
    return zoneDirs.mapNotNull { zoneDir ->
        val typeFile = File(zoneDir, "type")
        val tempFile = File(zoneDir, "temp")
        if (!typeFile.exists() || !tempFile.exists()) return@mapNotNull null

        try {
            val sensorType = typeFile.readText().trim()
            if (sensorType.isEmpty() ||
                sensorType.contains("chg") ||
                sensorType.contains("front") ||
                sensorType.contains("frame") ||
                sensorType.contains("wcn") ||
                sensorType.contains("usb") ||
                sensorType.contains("bcl") ||
                sensorType.contains("interface") ||
                sensorType.contains("skin") ||
                sensorType.contains("back")
            ) {
                null
            } else {
                ThermalSource(sensorType, tempFile)
            }
        } catch (_: Exception) {
            null
        }
    }
}

private fun refreshThermalSources(
    now: Long,
    forceCheck: Boolean = false,
    rebuildEvenIfUnchanged: Boolean = false
): List<ThermalSource> = synchronized(thermalSourceLock) {
    if (!forceCheck &&
        lastThermalDiscoveryAtMs != 0L &&
        now - lastThermalDiscoveryAtMs < THERMAL_DISCOVERY_INTERVAL_MS
    ) {
        return@synchronized thermalSources
    }

    val zoneDirs = listThermalZoneDirs()
    val currentPaths = zoneDirs.mapTo(linkedSetOf()) { it.absolutePath }
    if (rebuildEvenIfUnchanged ||
        currentPaths != knownThermalZonePaths ||
        (thermalSources.isEmpty() && currentPaths.isNotEmpty())
    ) {
        thermalSources = discoverThermalSources(zoneDirs)
        knownThermalZonePaths = currentPaths
    }
    lastThermalDiscoveryAtMs = now
    thermalSources
}

private fun shouldRecoverThermalSources(now: Long): Boolean = synchronized(thermalSourceLock) {
    if (lastThermalRecoveryAtMs != 0L &&
        now - lastThermalRecoveryAtMs < THERMAL_RECOVERY_COOLDOWN_MS
    ) {
        false
    } else {
        lastThermalRecoveryAtMs = now
        true
    }
}

private fun readThermalValues(sources: List<ThermalSource>): ThermalReadResult {
    val zones = ArrayList<ThermalZone>(sources.size)
    var hasMissingSource = false
    var successfulReadCount = 0

    sources.forEach { source ->
        if (!source.tempFile.exists()) {
            hasMissingSource = true
            return@forEach
        }

        try {
            val tempValue = source.tempFile.readText().trim().toIntOrNull() ?: return@forEach
            successfulReadCount++
            if (tempValue in 0..124_000) {
                zones.add(ThermalZone(source.type, tempValue))
            }
        } catch (_: Exception) {
            if (!source.tempFile.exists()) hasMissingSource = true
        }
    }

    return ThermalReadResult(zones, hasMissingSource, successfulReadCount)
}

fun initializeDeviceInfoSources() {
    refreshThermalSources(
        now = SystemClock.elapsedRealtime(),
        forceCheck = true,
        rebuildEvenIfUnchanged = true
    )
}

//CPU温度：temp 最快每秒读取一次，节点目录每分钟低频检查一次。
suspend fun readThermalZones(): Pair<Int, String> = withContext(Dispatchers.IO) {
    thermalMutex.withLock {
        val now = SystemClock.elapsedRealtime()
        cachedThermalResult?.takeIf {
            now - lastThermalSampleAtMs < THERMAL_SAMPLE_INTERVAL_MS
        }?.let { return@withLock it }

        var sources = refreshThermalSources(now)
        var reading = readThermalValues(sources)

        val allSourcesFailed = sources.isNotEmpty() && reading.successfulReadCount == 0
        if ((reading.hasMissingSource || allSourcesFailed) && shouldRecoverThermalSources(now)) {
            sources = refreshThermalSources(
                now = now,
                forceCheck = true,
                rebuildEvenIfUnchanged = true
            )
            reading = readThermalValues(sources)
        }

        val zones = reading.zones
        val result = Pair(zones.maxOfOrNull { it.temp } ?: -1, buildThermalJson(zones))
        cachedThermalResult = result
        lastThermalSampleAtMs = SystemClock.elapsedRealtime()
        result
    }
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
                val parts = line.trim().split(WHITESPACE_REGEX)
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
