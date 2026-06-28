package com.minikano.f50_sms.utils

import android.app.usage.NetworkStatsManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.os.BatteryManager
import android.os.StatFs
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import com.minikano.f50_sms.ADBService.Companion.isExecutingDisabledFOTA
import com.minikano.f50_sms.modules.deviceInfo.MyStorageInfo
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Calendar
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import androidx.core.content.edit
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.configs.AppMeta.updateIsDefaultOrWeakToken
import com.minikano.f50_sms.utils.SmsPoll.forwardByEmail
import com.minikano.f50_sms.utils.SmsPoll.forwardSmsByCurl
import com.minikano.f50_sms.utils.SmsPoll.forwardSmsByDingTalk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.ln
import kotlin.math.pow

class KanoUtils {
    companion object {
        fun HmacSignature(secret: String, data: String): String {
            val hmacMd5Bytes = hmac("HmacMD5", secret, data)
            val mid = hmacMd5Bytes.size / 2
            val part1 = hmacMd5Bytes.sliceArray(0 until mid)
            val part2 = hmacMd5Bytes.sliceArray(mid until hmacMd5Bytes.size)
            val sha1 = sha256(part1)
            val sha2 = sha256(part2)
            val combined = sha1 + sha2
            val finalHash = sha256(combined)
            return finalHash.joinToString("") { "%02x".format(it) }
        }

        fun hmac(algorithm: String, key: String, data: String): ByteArray {
            val mac = Mac.getInstance(algorithm)
            val secretKeySpec = SecretKeySpec(key.toByteArray(), algorithm)
            mac.init(secretKeySpec)
            return mac.doFinal(data.toByteArray())
        }

        fun sha256(data: ByteArray): ByteArray {
            val digest = MessageDigest.getInstance("SHA-256")
            return digest.digest(data)
        }

        fun sha256Hex(input: String): String {
            val bytes = input.toByteArray(Charsets.UTF_8)
            val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
            return digest.joinToString("") { "%02x".format(it) }
        }

        fun Long.toReadableSize(decimals: Int = 2): String {
            if (this <= 0) return "0 B"

            val units = arrayOf("B", "KB", "MB", "GB", "TB", "PB", "EB")
            val base = 1024.0

            val exp = (ln(this.toDouble()) / ln(base)).toInt()
            val value = this / base.pow(exp)

            return "%.${decimals}f%s".format(value, units[exp])
        }

        //获取电池电量
        fun getBatteryPercentage(context: Context): Int {
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = context.registerReceiver(null, filter) ?: return -1

            val level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1)

            return ((level / scale.toFloat()) * 100).toInt()
        }

        private var lastStorageInfo: MyStorageInfo? = null
        private var lastStorageUpdateTime: Long = 0

        fun getCachedRemovableStorageInfo(context: Context): MyStorageInfo? {
            val now = System.currentTimeMillis()
            if (lastStorageInfo == null || now - lastStorageUpdateTime > 10_000) {
                val dirs = context.getExternalFilesDirs(null)
                for (file in dirs) {
                    val path = file?.absolutePath ?: continue
                    if (!path.contains("/storage/emulated/0")) {
                        val statFs = StatFs(path)
                        val total = statFs.blockSizeLong * statFs.blockCountLong
                        val available = statFs.blockSizeLong * statFs.availableBlocksLong

                        lastStorageInfo = MyStorageInfo(path, total, available)
                        lastStorageUpdateTime = now
                        break
                    }
                }
            }
            return lastStorageInfo
        }

        fun getStartOfDayMillis(): Long {
            val cal = Calendar.getInstance()
            cal.set(Calendar.HOUR_OF_DAY, 0)
            cal.set(Calendar.MINUTE, 0)
            cal.set(Calendar.SECOND, 0)
            cal.set(Calendar.MILLISECOND, 0)
            return cal.timeInMillis
        }

        fun getStartOfMonthMillis(): Long {
            val cal = Calendar.getInstance()
            cal.set(Calendar.DAY_OF_MONTH,1)
            cal.set(Calendar.HOUR_OF_DAY, 0)
            cal.set(Calendar.MINUTE, 0)
            cal.set(Calendar.SECOND, 0)
            cal.set(Calendar.MILLISECOND, 0)
            return cal.timeInMillis
        }

        fun getTodayDataUsage(
            context: Context,
        ): Long {
            val networkStatsManager =
                context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager

            val startTime = getStartOfDayMillis()
            val endTime = System.currentTimeMillis()

            var totalBytes = 0L

            try {
                val summary = networkStatsManager.querySummaryForDevice(
                    ConnectivityManager.TYPE_MOBILE, null, startTime, endTime
                )
                totalBytes = summary.rxBytes + summary.txBytes
            } catch (e: Exception) {
                e.printStackTrace()
            }

            return totalBytes
        }

        fun getMonthlyDataUsage(
            context: Context,
        ): Long {
            val networkStatsManager =
                context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager

            val startTime = getStartOfMonthMillis()
            val endTime = System.currentTimeMillis()

            var totalBytes = 0L

            try {
                val summary = networkStatsManager.querySummaryForDevice(
                    ConnectivityManager.TYPE_MOBILE, null, startTime, endTime
                )
                totalBytes = summary.rxBytes + summary.txBytes
            } catch (e: Exception) {
                e.printStackTrace()
            }

            return totalBytes
        }

        //按需获取数据使用量
        fun getRangeDataUsage(
            context: Context,
            startMills:Long,
            endMills:Long
        ): Long {
            val networkStatsManager =
                context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager

            val startTime = startMills
            val endTime = endMills

            var totalBytes = 0L

            try {
                val summary = networkStatsManager.querySummaryForDevice(
                    ConnectivityManager.TYPE_MOBILE, null, startTime, endTime
                )
                totalBytes = summary.rxBytes + summary.txBytes
            } catch (e: Exception) {
                e.printStackTrace()
            }

            return totalBytes
        }

        fun getRangeDailyDataUsage(
            context: Context,
            startMills: Long,
            endMills: Long
        ): List<Map<String, String>> {
            val result = mutableListOf<Map<String, String>>()

            if (startMills > endMills) return result

            val networkStatsManager =
                context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager

            val calendar = Calendar.getInstance()
            calendar.timeInMillis = startMills
            calendar.set(Calendar.HOUR_OF_DAY, 0)
            calendar.set(Calendar.MINUTE, 0)
            calendar.set(Calendar.SECOND, 0)
            calendar.set(Calendar.MILLISECOND, 0)

            val endCalendar = Calendar.getInstance()
            endCalendar.timeInMillis = endMills

            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())

            while (calendar.timeInMillis <= endMills) {
                val currentDayStart = calendar.timeInMillis

                val dayStart = maxOf(currentDayStart, startMills)

                val dayEndCalendar = calendar.clone() as Calendar
                dayEndCalendar.set(Calendar.HOUR_OF_DAY, 23)
                dayEndCalendar.set(Calendar.MINUTE, 59)
                dayEndCalendar.set(Calendar.SECOND, 59)
                dayEndCalendar.set(Calendar.MILLISECOND, 999)

                val dayEnd = minOf(dayEndCalendar.timeInMillis, endMills)

                var totalBytes = 0L

                try {
                    val summary = networkStatsManager.querySummaryForDevice(
                        ConnectivityManager.TYPE_MOBILE,
                        null,
                        dayStart,
                        dayEnd
                    )
                    totalBytes = summary.rxBytes + summary.txBytes
                } catch (e: Exception) {
                    e.printStackTrace()
                }

                result.add(
                    mapOf(
                        "date" to sdf.format(Date(currentDayStart)),
                        "usage" to totalBytes.toString()
                    )
                )

                calendar.add(Calendar.DAY_OF_MONTH, 1)
            }

            return result
        }

        // 解析 URL 编码的请求体
        fun parseUrlEncoded(data: String): Map<String, String> {
            val params = mutableMapOf<String, String>()
            val pairs = data.split("&")

            for (pair in pairs) {
                val keyValue = pair.split("=")
                if (keyValue.size == 2) {
                    val key = keyValue[0]
                    val value = keyValue[1]
                    params[key] = java.net.URLDecoder.decode(value, Charsets.UTF_8.name())  // 解码
                }
            }

            return params
        }


        //获取内存信息
        fun parseMeminfo(meminfo: String): Float {
            val memMap = mutableMapOf<String, Long>()

            meminfo.lines().forEach { line ->
                val parts = line.split(Regex("\\s+"))
                if (parts.size >= 2) {
                    val key = parts[0].removeSuffix(":")
                    val value = parts[1].toLongOrNull() ?: return@forEach
                    memMap[key] = value
                }
            }

            val total = memMap["MemTotal"] ?: return 0f
            val free = memMap["MemFree"] ?: 0
            val cached = memMap["Cached"] ?: 0
            val buffers = memMap["Buffers"] ?: 0

            val used = total - free - cached - buffers
            return used.toFloat() / total
        }

        fun parseCpuStat(raw: String): Pair<Long, Long>? {
            val line = raw.lines().firstOrNull { it.startsWith("cpu ") } ?: return null
            val parts = line.trim().split(Regex("\\s+"))
            if (parts.size < 8) return null

            val user = parts[1].toLongOrNull() ?: return null
            val nice = parts[2].toLongOrNull() ?: return null
            val system = parts[3].toLongOrNull() ?: return null
            val idle = parts[4].toLongOrNull() ?: return null
            val iowait = parts[5].toLongOrNull() ?: 0
            val irq = parts[6].toLongOrNull() ?: 0
            val softirq = parts[7].toLongOrNull() ?: 0

            val total = user + nice + system + idle + iowait + irq + softirq
            val idleAll = idle + iowait
            return Pair(total, idleAll)
        }

        fun getChunkCount(param: String?): Int {
            val default = 4
            val max = 1024

            return param?.toIntOrNull()?.let {
                when {
                    it <= 0 -> default
                    it > max -> max
                    else -> it
                }
            } ?: default
        }

        fun copyToClipboard(context: Context, label: String, text: String) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText(label, text)
            clipboard.setPrimaryClip(clip)
        }

        fun runAT(context: Context,command: String, slot:Int = 0): String{
            val outFileAt = KanoUtils.copyFileToFilesDir(context, "shell/sendat")
                ?: throw Exception("复制 sendat 到 filesDir 失败")
            outFileAt.setExecutable(true)

            val atCommand = "${outFileAt.absolutePath} -n $slot -c '${command.trim()}'"
            val result = ShellKano.runShellCommand(atCommand, true)
                ?: throw Exception("AT 指令没有输出")
            var res = result
                .replace("\"", "\\\"") // 转义引号
                .replace("\n", "")
                .replace("\r", "")
                .trimStart()

            if (res.lowercase().endsWith("ok")) {
                res = res.dropLast(2).trimEnd() + " OK"
            }
            if (res.startsWith(",")) {
                res = res.removePrefix(",").trimStart()
            }
            return res
        }

        fun getVoNrState(context:Context, slotId: Int = 0): Boolean {
            val raw = runAT(context, "AT+SP5GCMDS=\"get nr synch_param\",42",slotId)

            val body = raw
                .substringBefore("OK")
                .substringAfter(":", "")
                .replace("\"", "")
                .replace("\r", " ")
                .replace("\n", " ")
                .trim()

            val state = body
                .split(",")
                .map { it.trim() }
                .getOrNull(2)
                ?.toIntOrNull()
                ?: throw IllegalStateException("Unexpected VoNR response: $raw")

            return state == 1
        }

        fun getVoLteState(context: Context, slotId: Int = 0): Boolean {
            val raw = runAT(context, "AT+CAVIMS?",slotId)

            val body = raw
                .substringBefore("OK")
                .substringAfter(":", "")
                .replace("\"", "")
                .replace("\r", " ")
                .replace("\n", " ")
                .trim()

            val state = body
                .split(",")
                .map { it.trim() }
                .getOrNull(0)
                ?.toIntOrNull()
                ?: throw IllegalStateException("Unexpected VoLte response: $raw")

            return state == 1
        }

        fun setVoNrState(context: Context,state:String, slotId: Int = 0): Boolean {
            return runAT(context, "AT+SP5GCMDS=\"set nr param\",45,$state", slotId).contains("OK")
        }

        fun setVoLteState(context: Context,state:String, slotId: Int = 0): Boolean {
            return runAT(context, "AT+CAVIMS=$state", slotId).contains("OK")
        }

        fun copyFileToFilesDir(
            context: Context,
            path: String,
            skipIfExists: Boolean = true
        ): File? {
            val assetManager = context.assets
            val fileName = File(path).name
            val outFile = File(context.filesDir, fileName)

            // 如果是追加模式且目标文件已存在，则直接返回该文件，避免干扰可执行文件的运行
            if (skipIfExists && outFile.exists()) {
                KanoLog.d("UFI_TOOLS_LOG", "文件已存在，跳过复制：${outFile.absolutePath}")
                return outFile
            }

            val input = try {
                assetManager.open(path)
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG", "assets 中不存在文件: $path")
                return null
            }

            return try {
                KanoLog.d(
                    "UFI_TOOLS_LOG",
                    "开始复制 $fileName 到 ${context.filesDir}（skipIfExists？：$skipIfExists）"
                )
                input.use { ins ->
                    FileOutputStream(outFile, skipIfExists).use { out ->
                        ins.copyTo(out)
                    }
                }
                KanoLog.d("UFI_TOOLS_LOG", "复制 $fileName 成功 -> ${outFile.absolutePath}")
                outFile
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG", "复制 $fileName 失败: ${e.message}")
                null
            }
        }

        fun parseShellArgs(command: String): List<String> {
            val matcher = Regex("""(["'])(.*?)(?<!\\)\1|(\S+)""") // 处理单引号/双引号/无引号的参数
            return matcher.findAll(command).map {
                val quoted = it.groups[2]?.value
                val plain = it.groups[3]?.value
                when {
                    quoted != null -> quoted
                    plain != null -> plain.replace("\\", "")
                    else -> ""
                }
            }.toList()
        }

        fun isAppInstalled(context: Context, packageName: String): Boolean {
            return try {
                context.packageManager.getPackageInfo(packageName, 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }

        fun adaptIPChange(
            context: Context,
            userTouched: Boolean = false,
            onIpChanged: ((String) -> Unit)? = null
        ) {
            val prefs = context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            val ip_add = prefs.getString("gateway_ip", null)
            val need_auto_ip = prefs.getString("auto_ip_enabled", true.toString())
            val currentIp = IPManager.getHotspotGatewayIp("8080")

            if ((ip_add != null && need_auto_ip == "true") || userTouched) {
                KanoLog.d("UFI_TOOLS_LOG", "自动检测IP网关:$currentIp")
                if (currentIp == null) {
                    KanoLog.d("UFI_TOOLS_LOG", "自动检测IP网关失败")
                    Toast.makeText(context, "自动检测IP网关失败...", Toast.LENGTH_SHORT).show()
                    return
                }
                if ((currentIp != ip_add) || userTouched) {
                    if (userTouched) {
                        KanoLog.d("UFI_TOOLS_LOG", "用户点击，自动检测IP网关")
                        Toast.makeText(context, "自动检测IP网关~", Toast.LENGTH_SHORT).show()
                    } else {
                        KanoLog.d(
                            "UFI_TOOLS_LOG",
                            "检测到本地IP网关变动，自动修改IP网关为:$currentIp"
                        )
                        Toast.makeText(
                            context,
                            "检测到本地IP网关变动，自动修改IP网关为:$currentIp",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                    prefs.edit(commit = true) { putString("gateway_ip", currentIp) }
                    if (currentIp != null) {
                        onIpChanged?.invoke(currentIp)
                    } // 通知 Compose 更新 UI
                }
            } else if (need_auto_ip == "true") {
                //说明可能是第一次启动
                prefs.edit(commit = true) { putString("gateway_ip", currentIp) }
                KanoLog.d("UFI_TOOLS_LOG", "可能是第一次启动，自动修改IP网关为:$currentIp")
            }
        }

        private fun isADBEnabled(context: Context): Boolean {
            return try {
                runBlocking {
                    val sharedPrefs =
                        context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
                    val ADB_IP =
                        sharedPrefs.getString("gateway_ip", "")?.substringBefore(":")
                            ?: throw Exception("没有ADMIN_IP")

                    val req = KanoGoformRequest("http://$ADB_IP:8080")
                    val result = req.getData(mapOf("cmd" to "usb_port_switch"))
                    val adb_enabled = result?.getString("usb_port_switch")
                    Log.d("UFI_TOOLS_LOG", "查询ADB开启状态: $adb_enabled")
                    adb_enabled == "1"
                }
            } catch (e: Exception) {
                Log.e("UFI_TOOLS_LOG", "查询ADB开启状态执行错误: ${e.message}")
                false
            }
        }

        fun copyAssetToExternalStorage(
            context: Context,
            assetPath: String,
            skipIfExists: Boolean = false
        ): File? {
            val fileName = File(assetPath).name
            val outFile = File(context.getExternalFilesDir(null), fileName)

            // 如果是追加模式且目标文件已存在，则直接返回该文件，避免干扰可执行文件的运行
            if (skipIfExists && outFile.exists()) {
                KanoLog.d("UFI_TOOLS_LOG", "外部文件已存在，跳过复制：${outFile.absolutePath}")
                return outFile
            }

            val input = try {
                context.assets.open(assetPath)
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG", "assets 中不存在文件: $assetPath")
                return null
            }

            return try {
                KanoLog.d(
                    "UFI_TOOLS_LOG",
                    "开始复制 $fileName 到外部存储目录（skipIfExists?：$skipIfExists）"
                )
                input.use { ins ->
                    FileOutputStream(outFile, skipIfExists).use { out ->
                        ins.copyTo(out)
                    }
                }
                KanoLog.d("UFI_TOOLS_LOG", "复制成功 -> ${outFile.absolutePath}")
                outFile
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG", "复制失败: ${e.message}")
                null
            }
        }

        //递归复制asset中所有的目录和文件到files中
        fun copyAssetsRecursively(
            context: Context,
            assetPath: String = "",
            destDir: File = context.filesDir
        ) {
            val assetManager = context.assets
            val fileList = assetManager.list(assetPath) ?: return

            for (fileName in fileList) {
                val fullAssetPath = if (assetPath.isEmpty()) fileName else "$assetPath/$fileName"
                val outFile = File(destDir, fileName)

                if ((assetManager.list(fullAssetPath)?.isNotEmpty() == true)) {
                    // 是目录，递归复制
                    outFile.mkdirs()
                    copyAssetsRecursively(context, fullAssetPath, outFile)
                } else {
                    // 是文件，复制
                    assetManager.open(fullAssetPath).use { input ->
                        FileOutputStream(outFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    outFile.setExecutable(true)
                    outFile.setReadable(true)
                }
            }
        }

        fun normalizeLineEndingsInDirShallow(dir: File) {
            if (!dir.exists() || !dir.isDirectory) return

            dir.listFiles()?.forEach { file ->
                if (file.isFile && file.extension == "sh") {
                    try {
                        val bytes = file.readBytes()

                        // 是否包含 \r
                        if (!bytes.contains('\r'.code.toByte())) return@forEach

                        val normalized = bytes
                            .toString(Charsets.UTF_8)
                            .replace("\r\n", "\n")
                            .replace("\r", "\n")

                        file.writeText(normalized, Charsets.UTF_8)
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }
        }

        fun getStatusCode(urlStr: String): Int {
            val url = URL(urlStr)
            val connection = url.openConnection() as HttpURLConnection
            return try {
                connection.requestMethod = "GET"
                connection.connectTimeout = 1500
                connection.readTimeout = 1500
                connection.instanceFollowRedirects = false
                connection.connect()
                connection.responseCode // 返回状态码
            } catch (e: Exception) {
                e.printStackTrace()
                -1 // 表示请求失败
            } finally {
                connection.disconnect()
            }
        }


        private var cachedTotal = 0L
        private var lastUpdate = 0L
        fun getCachedTodayUsage(context: Context): Long {
            val now = System.currentTimeMillis()
            if (now - lastUpdate > 10_000) { // 每 10 秒更新一次
                cachedTotal = getTodayDataUsage(context)
                lastUpdate = now
            }
            return cachedTotal
        }

        private var cachedMonthlyTotal = 0L
        private var lastMonthlyUpdate = 0L
        fun getCachedMonthlyUsage(context: Context): Long {
            val now = System.currentTimeMillis()
            if (now - lastMonthlyUpdate > 10_000) { // 每 10 秒更新一次
                cachedMonthlyTotal = getMonthlyDataUsage(context)
                lastMonthlyUpdate = now
            }
            return cachedMonthlyTotal
        }

        fun getSELinuxStatus(): String {
            try {
                val process = Runtime.getRuntime().exec("getenforce")
                val reader = process.inputStream.bufferedReader()
                return reader.readLine().trim()
            } catch (e: Exception) {
                e.printStackTrace()
                return "Unknown"
            }
        }

        @Serializable
        data class ShellResult(
            val done: Boolean,   // true: 正常输出; false: 报错或超时
            val content: String  // 输出内容或错误信息
        )

        fun sendShellCmd(cmd: String, timeoutSeconds: Long = 300): ShellResult {
            if (cmd.isEmpty()) return ShellResult(done = false, content = "Error: empty command")

            return try {
                val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", cmd))

                val output = StringBuilder()
                val error = StringBuilder()

                val reader = process.inputStream.bufferedReader()
                val errorReader = process.errorStream.bufferedReader()

                // 启动两个线程读取输出，避免阻塞
                val outThread = Thread {
                    reader.useLines { lines ->
                        lines.forEach { line -> output.appendLine(line) }
                    }
                }
                val errThread = Thread {
                    errorReader.useLines { lines ->
                        lines.forEach { line -> error.appendLine(line) }
                    }
                }

                outThread.start()
                errThread.start()

                // 等待执行，最多 timeoutSeconds 秒
                val finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS)

                if (!finished) {
                    process.destroyForcibly() // 超时杀掉进程
                    return ShellResult(done = false, content = "Error: Command timed out after $timeoutSeconds seconds")
                }

                // 确保输出线程结束
                outThread.join()
                errThread.join()

                return if (error.isNotEmpty()) {
                    ShellResult(done = false, content = error.toString().trim())
                } else {
                    ShellResult(done = true, content = output.toString().trim())
                }
            } catch (e: Exception) {
                e.printStackTrace()
                ShellResult(done = false, content = "Exception: ${e.message}")
            }
        }

        fun disableFota(context: Context):Boolean{
            if(isExecutingDisabledFOTA){
                KanoLog.w("UFI_TOOLS_LOG", "禁用FOTA操作正在执行..无需重复执行")
                return false
            }
            try {
                isExecutingDisabledFOTA = true
                // 复制依赖文件
                val outFileAdb = copyFileToFilesDir(context, "shell/adb")
                    ?: throw Exception("复制 adb 到 filesDir 失败")

                // 设置执行权限
                outFileAdb.setExecutable(true)

                val cmds = listOf(
                    "${outFileAdb.absolutePath} -s localhost shell pm disable-user --user 0 com.zte.zdm",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 com.zte.zdm",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 cn.zte.aftersale",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 com.zte.zdmdaemon",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 com.zte.zdmdaemon.install",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 com.zte.analytics",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 com.zte.neopush"
                )

                cmds.forEach{item->ShellKano.runShellCommand(item, context = context)}
                return true
            } catch (e:Exception){
                return false
            } finally {
                isExecutingDisabledFOTA = false
            }
        }

        fun isWeakToken(token: String): Boolean {
            val t = token.ifBlank { "admin" }

            val rules: List<(String) -> Boolean> = listOf(
                { it == "admin" },           // 默认弱口令
                { it.length < 8 },           // 最小长度
                { !it.any { c -> c.isDigit() } }, // 没有数字
                { !it.any { c -> c.isLetter() } } // 没有字母
            )

            return rules.any { rule -> rule(t) }
        }

        fun isUsbDebuggingEnabled(context: Context): Boolean {
            return try {
                Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1
            } catch (e: Exception) {
                try {
                    Settings.Secure.getInt(context.contentResolver, Settings.Secure.ADB_ENABLED, 0) == 1
                } catch (e: Exception) {
                    //防止权限原因读取不到，默认是Enabled
                    true
                }
            }
        }

        fun normalizePath(rawPath: String): String {
            fun decodeOnce(s: String): String {
                return try {
                    URLDecoder.decode(s, StandardCharsets.UTF_8.name())
                } catch (e: Exception) {
                    s
                }
            }

            var p = decodeOnce(rawPath)
            p = decodeOnce(p)

            p = p.replace('\\', '/')

            p = p.replace(Regex("/+"), "/")

            if (!p.startsWith("/")) p = "/$p"

            return p
        }

        fun normalizeLeadingSlashes(p: String): String {
            var s = p.replace('\\', '/')
            s = s.replace(Regex("^/+"), "/")
            if (!s.startsWith("/")) s = "/$s"
            return s
        }

        fun isSha256Hex(s: String?): Boolean {
            return !s.isNullOrBlank() && Regex("^[a-fA-F0-9]{64}$").matches(s)
        }

        fun transformLoginToken(context: Context,prefs: SharedPreferences){
            //预处理口令，如果口令存储为明文，则进行hash
            val token = prefs.getString("login_token","") ?: ""
            if(!(token.isEmpty() || token.isBlank())){
                //如果存储的口令不是hash，则进行更改
                if(!isSha256Hex(token) ){
                    val hashToken = sha256Hex(token)
                    prefs.edit(commit = true) { putString("login_token", hashToken) }
                }
            }
        }
        private val PREFS_NAME = "kano_ZTE_store"
        private val PREF_GATEWAY_IP = "gateway_ip"
        private val PREF_LOGIN_TOKEN = "login_token"
        private val PREF_TOKEN_ENABLED = "login_token_enabled"
        private val PREF_AUTO_IP_ENABLED = "auto_ip_enabled"
        private val PREF_ISDEBUG = "kano_is_debug"
        private val PREF_WAKELOCK = "wakeLock"

        private val PREF_POWER_STATUS_FORWARD = "kano_power_status_forward_enabled"

        fun initSharedPerfs(context: Context){
            //初始化login_token
            val spf = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            KanoUtils.transformLoginToken(context,spf)
            val existing = spf.all
            spf.edit(commit = true) {
                if (!existing.containsKey(PREF_LOGIN_TOKEN)) {
                    putString(PREF_LOGIN_TOKEN, KanoUtils.sha256Hex("admin"))
                    updateIsDefaultOrWeakToken(context,true)
                }
                if (!existing.containsKey(PREF_ISDEBUG)) {
                    putBoolean(PREF_ISDEBUG, false)
                }
                if (!existing.containsKey(PREF_GATEWAY_IP)) {
                    putString(PREF_GATEWAY_IP, "192.168.0.1:8080")
                }
                if (!existing.containsKey(PREF_TOKEN_ENABLED)) {
                    putString(PREF_TOKEN_ENABLED, true.toString())
                }
                if (!existing.containsKey(PREF_AUTO_IP_ENABLED)) {
                    putString(PREF_AUTO_IP_ENABLED, true.toString())
                }
                if (!existing.containsKey(PREF_WAKELOCK)) {
                    putString(PREF_WAKELOCK, "lock")
                }
                if (!existing.containsKey(PREF_POWER_STATUS_FORWARD)) {
                    putString(PREF_POWER_STATUS_FORWARD, "1")
                }

            }
        }

        private var catchedFlowMonth : Long = 0L
        private var lastMonthlyFlowUpdate = 0L
        fun getCatchedFlowMonth(context: Context): Long {
            val now = System.currentTimeMillis()
            if (now - lastMonthlyFlowUpdate > 10_000) { // 每 10 秒更新一次
               try {
                    runBlocking {
                        val sharedPrefs =
                            context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
                        val ADB_IP =
                            sharedPrefs.getString("gateway_ip", "")?.substringBefore(":")
                        val req = KanoGoformRequest("http://$ADB_IP:8080")
                        val result = req.getData(mapOf(
                            "cmd" to "monthly_rx_bytes,monthly_tx_bytes"
                        ))

                        val monthlyRxBytes = result?.getLong("monthly_rx_bytes")
                        val monthlyTxBytes = result?.getLong("monthly_tx_bytes")

                        if(monthlyRxBytes == null || monthlyTxBytes == null){
                            throw Exception("monthly_rx_bytes=$monthlyRxBytes,monthly_tx_bytes:$monthlyTxBytes")
                        }

                        val summaryBytes = monthlyRxBytes + monthlyTxBytes
                        catchedFlowMonth = summaryBytes
                    }
                } catch (e: Exception) {
                    Log.e("UFI_TOOLS_LOG", "查询官方后台流量使用情况执行错误: ${e.message}")
                }
                lastMonthlyFlowUpdate = now
            }
            return catchedFlowMonth
        }

        fun isNetworkEnable(context: Context): Boolean{
            var res = false
            try {
                runBlocking {
                    val sharedPrefs =
                        context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
                    val ADB_IP =
                        sharedPrefs.getString("gateway_ip", "192.168.0.1:8080")?.substringBefore(":")
                    val req = KanoGoformRequest("http://$ADB_IP:8080")
                    val result = req.getData(mapOf(
                        "cmd" to "ppp_status"
                    ))
                    res =  result?.getString("ppp_status") == "ppp_disconnected"
                }
            } catch (e: Exception) {
                Log.e("UFI_TOOLS_LOG", "查询官方后台流量使用情况执行错误: ${e.message}")
                res = false
            }
            return res
        }

        fun setNetworkEnable(context: Context,flag: Boolean) {
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val sharedPrefs =
                        context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)

                    val adbIp = sharedPrefs
                        .getString("gateway_ip", "192.168.0.1:8080")
                        ?.substringBefore(":")
                        ?: run {
                            KanoLog.e("UFI_TOOLS_LOG", "gateway_ip为空")
                            return@launch
                        }

                    val adminPwd =
                        sharedPrefs.getString("ADMIN_PWD", "Wa@9w+YWRtaW4=")
                            ?: "Wa@9w+YWRtaW4="

                    val req = KanoGoformRequest("http://$adbIp:8080")

                    val cookie = req.login(adminPwd)

                    if (cookie == null) {
                        KanoLog.e("UFI_TOOLS_LOG", "登录后台失败")
                        return@launch
                    }

                    val result = req.postData(
                        cookie,
                        mapOf(
                            "goformId" to if(!flag)"DISCONNECT_NETWORK" else "CONNECT_NETWORK"
                        )
                    )

                    KanoLog.d(
                        "UFI_TOOLS_LOG",
                        if(!flag) "尝试关闭数据连接：$result" else "尝试打开数据连接：$result"
                    )
                } catch (e: Exception) {
                    KanoLog.e(
                        "UFI_TOOLS_LOG",
                        "setNetworkEnable执行错误",
                        e
                    )
                }
            }
        }

        fun buildStatusSmsMsg(text:String,context: Context,TAG:String): String {
            if(text.isBlank()) return text
            var replacedCurl = text
            runBlocking {
                try {
                    val templates = listOf<String>(
                        "{{cpu-usage}}" ,
                        "{{mem-usage}}" ,
                        "{{app-ver}}" ,
                        "{{battery-level}}" ,
                        "{{battery-current}}" ,
                        "{{battery-voltage}}" ,
                        "{{model}}" ,
                        "{{boot-time}}" ,
                        "{{cpu-temp}}" ,
                        "{{daily-flow}}" ,
                        "{{monthly-flow-count}}" ,
                        "{{monthly-flow-sum}}" ,
                        "{{nickname}}" ,
                    )
                    if(replacedCurl.contains(templates[0])){
                        val usage = calculateCpuUsage()
                        val cpuUsageRes = Json.parseToJsonElement(usage)
                            .jsonObject["cpu"]
                            ?.jsonPrimitive
                            ?.double
                        replacedCurl = replacedCurl
                            .replace(templates[0],"${cpuUsageRes}%")
                    }
                    if(replacedCurl.contains(templates[1])){
                        val mem = getMemoryUsage()
                        val memUsageRes = Json.parseToJsonElement(mem)
                            .jsonObject["mem_usage_percent"]
                            ?.jsonPrimitive
                            ?.double
                        replacedCurl = replacedCurl
                            .replace(templates[1],"${memUsageRes}%")
                    }
                    if(replacedCurl.contains(templates[2])){
                        replacedCurl = replacedCurl
                            .replace(templates[2],AppMeta.versionName)
                    }
                    if(replacedCurl.contains(templates[3])){
                        val batteryLevel: Int = KanoUtils.getBatteryPercentage(context)
                        replacedCurl = replacedCurl
                            .replace(templates[3],"$batteryLevel%")
                    }
                    if(replacedCurl.contains(templates[4]) || replacedCurl.contains(templates[5])){
                        val batteryStatus = readBatteryStatus()
                        if(replacedCurl.contains(templates[4])){
                            replacedCurl = replacedCurl
                                .replace(templates[4],"${batteryStatus.current_uA/1000}mA")
                        }
                        if(replacedCurl.contains(templates[5])){
                            val text = String.format("%.2f", batteryStatus.voltage_uV / 1_000_000.0)
                            replacedCurl = replacedCurl
                                .replace(templates[5],"${text}V")
                        }
                    }
                    if(replacedCurl.contains(templates[6])){
                        replacedCurl = replacedCurl
                            .replace(templates[6],"${AppMeta.model}")
                    }
                    if(replacedCurl.contains(templates[7])){
                        try {
                            val result = sendShellCmd("cut -d. -f1 /proc/uptime")
                            if (!result.done) throw Exception(result.content)
                            KanoLog.d(TAG, "cut -d. -f1 /proc/uptime 执行结果： $result")
                            val time = result.content.toLongOrNull()
                                ?.takeIf { it >= 0 }
                                ?.let { "%.2f".format(it / 3600.0) }
                                ?: "Unknown"
                            replacedCurl = replacedCurl
                                .replace(templates[7], "${time}h")
                        } catch (e: Exception){
                            KanoLog.e(TAG, "获取设备启动时长信息出错： ${e.message}")
                        }
                    }
                    if(replacedCurl.contains(templates[8])){
                        val (maxTemp) = readThermalZones()
                        val temp = maxTemp
                            .takeIf { it >= 0 }
                            ?.let { "%.2f".format(it / 1000.0) }
                            ?: "Unknown"
                        replacedCurl = replacedCurl
                            .replace(templates[8], "${temp}°C")
                    }
                    if(replacedCurl.contains(templates[9])){
                        val dailyData = getCachedTodayUsage(context)
                        replacedCurl = replacedCurl
                            .replace(templates[9], dailyData.toReadableSize())
                    }
                    //月流量统计（Android）
                    if(replacedCurl.contains(templates[10])){
                        val dailyData = getCachedMonthlyUsage(context)
                        replacedCurl = replacedCurl
                            .replace(templates[10], dailyData.toReadableSize())
                    }
                    //月流量统计（官方后台）
                    if(replacedCurl.contains(templates[11])){
                        replacedCurl = replacedCurl
                            .replace(templates[11], getCatchedFlowMonth(context).toReadableSize())
                    }
                    //昵称
                    if(replacedCurl.contains(templates[12])){
                        replacedCurl = replacedCurl
                            .replace(templates[12], AppMeta.nickName)
                    }
                } catch (e: Exception) {
                    KanoLog.e(TAG, "获取设备信息出错： ${e.message}")
                }
            }
            return replacedCurl
        }

        //低电量转发通知
        fun forwardBatteryStatusMessage(context: Context,smsContent: SmsInfo) {
            try {
                val sharedPrefs =
                    context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
                val sms_forward_method = sharedPrefs.getString("kano_sms_forward_method", "") ?: ""
                when (sms_forward_method) {
                    "SMTP" -> {
                        forwardByEmail(smsContent, context)
                    }
                    "CURL" -> {
                        forwardSmsByCurl(smsContent, context)
                    }
                    "DINGTALK" -> {
                        forwardSmsByDingTalk(smsContent, context)
                    }
                }
                KanoLog.d("UFI_TOOLS_LOG_LowBatteryForward","转发消息成功，转发类型:$sms_forward_method")
            } catch (e: Exception){
                KanoLog.e("UFI_TOOLS_LOG_LowBatteryForward","转发消息(forwardLowBatteryMessage)出错：",e)
            }
        }

        private fun forwardMessage(message:String,title:String,context: Context){
            val sharedPrefs = context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            val isEnabledStatusForward =
                (sharedPrefs.getString("kano_data_limit_status_forward_enabled", "0") ?: "0") == "1"
            val isSMSForwardEnabled = sharedPrefs.getString("kano_sms_forward_enabled", "0") == "1"
            if (isEnabledStatusForward && isSMSForwardEnabled) {
                forwardBatteryStatusMessage(context,SmsInfo(title,
                    message , System.currentTimeMillis()))
            }
        }

        //检测流量是否超出阈值，超出断网
        fun checkAndDoDataLimitReachedAction(context: Context) {
            KanoLog.d("UFI_TOOLS_LOG_UFIDataManager","开始检查流量超限情况.....")
            //判断日限 or 月限
            val dataCheckType = AppMeta.dataFlowCheckDailyOrMonthly
            //超量检测判断依据
            val dataFlow = if(dataCheckType == "monthly") {
                when(AppMeta.dataFlowCheckRef) {
                    "android" -> getCachedMonthlyUsage(context)
                    else -> getCatchedFlowMonth(context)
                }
            } else {
                getCachedTodayUsage(context)
            }
            //总流量
            val maxValue = AppMeta.dataFlowMaxValue
            KanoLog.d("UFI_TOOLS_LOG_UFIDataManager","dataFlowMaxValue:${AppMeta.dataFlowMaxValue} dataFlowCheckRef:${AppMeta.dataFlowCheckRef} dataCheckType:$dataCheckType")
            if(maxValue <= 0) return
            if(maxValue - dataFlow <= 1024){
                //查询是否已经断网
                if(isNetworkEnable(context)) return
                CoroutineScope(Dispatchers.IO).launch {
                    forwardMessage(
      """
                流量达到设定值：(${maxValue.toReadableSize()})，即将断网！
                Data limit exceeded (${maxValue.toReadableSize()}). Disconnecting network!
                """.trimIndent()
                        ,"【流量限制】${AppMeta.nickName}",context)
                    delay(3000)
                    //断网
                    setNetworkEnable(context, false)
                    AppMeta.isReachedDataFlowLimit = true
                }
                KanoLog.d("UFI_TOOLS_LOG_UFIDataManager","流量达到阈值${maxValue}-${dataFlow} <= 1024, 执行断网")
            } else {
                AppMeta.isReachedDataFlowLimit = false
            }
        }

        fun getVendorName(): String? {
            return try {
                val process = Runtime.getRuntime().exec("getprop ro.vendor.product.ztename")
                val result = process.inputStream.bufferedReader().readText()
                result
                    .trim()
                    .takeIf { it.isNotEmpty() }
            } catch (e: Exception) {
                null
            }
        }
    }
}