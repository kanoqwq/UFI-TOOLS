package com.minikano.f50_sms.utils

import android.content.Context
import android.util.Log
import com.minikano.f50_sms.ADBService.Companion.adbIsReady
import com.minikano.f50_sms.utils.KanoUtils.Companion.sendShellCmd
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.w3c.dom.Document
import org.w3c.dom.NodeList
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit
import javax.xml.parsers.DocumentBuilderFactory

class ShellKano {
    companion object {
        const val PREFS_NAME = "kano_ZTE_store"

        fun runShellCommand(command: String?, escaped: Boolean = false,timeoutSec: Long = 60L): String? {

            if (command.isNullOrBlank()) return null

            val output = StringBuilder()
            val error = StringBuilder()

            return try {

                val process = if (escaped) {
                    Runtime.getRuntime().exec(arrayOf("sh", "-c", command))
                } else {
                    Runtime.getRuntime().exec(command)
                }

                val reader = process.inputStream.bufferedReader()
                val errorReader = process.errorStream.bufferedReader()

                val outThread = Thread {
                    try {
                        reader.useLines { lines ->
                            lines.forEach { line ->
                                output.appendLine(line)
                            }
                        }
                    } catch (_: Exception) {}
                }

                val errThread = Thread {
                    try {
                        errorReader.useLines { lines ->
                            lines.forEach { line ->
                                error.appendLine(line)
                            }
                        }
                    } catch (_: Exception) {}
                }

                outThread.start()
                errThread.start()

                // 默认 60s 超时
                val finished = process.waitFor(timeoutSec, TimeUnit.SECONDS)

                if (!finished) {
                    process.destroyForcibly()
                    return null
                }

                outThread.join()
                errThread.join()

                if (error.isNotEmpty()) {
                    null
                } else {
                    output.toString().trim()
                }

            } catch (e: Exception) {
                e.printStackTrace()
                null
            }
        }

        fun runShellCommand(command: String?, context: Context): String? {
            val output = StringBuilder()
            try {
                // 设置 HOME 环境变量
                val env = arrayOf("HOME=${context.filesDir.absolutePath}")

                // 启动进程（传入环境变量）
                val process = Runtime.getRuntime().exec(command, env)

                val reader = BufferedReader(
                    InputStreamReader(process.inputStream)
                )
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    output.append(line).append("\n")
                }

                reader.close()
                process.waitFor()
            } catch (e: IOException) {
                e.printStackTrace()
                return null
            } catch (e: InterruptedException) {
                e.printStackTrace()
                return null
            }

            return output.toString().trim { it <= ' ' }
        }

        /**
         * adb寻找ui控件然后点击
         * @return 1 0 -1
         * 1表示已经在AT发送界面了
         * 0表示执行点击成功
         * -1表示执行失败 没有找到任何文本
         */
        fun parseUiDumpAndClick(targetText: String, adbPath: String, context: Context): Number {
            val cacheFile = getUiDoc(adbPath, context)

            val doc = cacheFile
            KanoLog.d("UFI_TOOLS_LOG", "doc 读取 结果：${doc.getElementsByTagName("node")}")

            //tap逻辑
            val nodes = doc.getElementsByTagName("node")
            for (i in 0 until nodes.length) {
                val node = nodes.item(i)
                val attrs = node.attributes
                val text = attrs.getNamedItem("text")?.nodeValue ?: ""
                KanoLog.d("UFI_TOOLS_LOG", "Node text: '$text'")
                if (text.contains(targetText)) {
                    val bounds = attrs.getNamedItem("bounds")?.nodeValue ?: continue
                    val regex = Regex("""\[(\d+),(\d+)\]\[(\d+),(\d+)\]""")
                    val match = regex.find(bounds) ?: continue
                    val (x1, y1, x2, y2) = match.destructured
                    val tapX = (x1.toInt() + x2.toInt()) / 2
                    val tapY = (y1.toInt() + y2.toInt()) / 2
                    val result = runShellCommand(
                        "$adbPath -s localhost shell input tap $tapX $tapY",
                        context
                    )
                        ?: throw Exception("执行 input tap 失败")
                    KanoLog.d("UFI_TOOLS_LOG", "input tap 点击 坐标：$tapX,$tapY 结果：${result} ")
                    return 0
                } else if (text.contains("AT Command:")) {
                    //说明已经在AT页面了
                    return 1
                }
            }
            return -1
        }

        /**
         * 填写input内容然后发送AT指令
         */
        fun fillInputAndSend(
            inputText: String,
            adbPath: String,
            context: Context,
            resId: String,
            btnName: List<String>,
            needBack: Boolean = true,
            useClipBoard: Boolean = false
        ): String {
            val doc = getUiDoc(adbPath, context)
            val nodes = doc.getElementsByTagName("node")
            val escapedInput = inputText.replace(" ", "%s")
            //复制文本到剪贴板
            KanoUtils.copyToClipboard(context, "sambaCommand", inputText)

            // 寻找输入框
            var inputClicked = false
            for (i in 0 until nodes.length) {
                val node = nodes.item(i)
                val attrs = node.attributes
                val clazz = attrs.getNamedItem("class")?.nodeValue ?: ""
                val bounds = attrs.getNamedItem("bounds")?.nodeValue ?: continue

                if (clazz == "android.widget.EditText") {
                    val regex = Regex("""\[(\d+),(\d+)\]\[(\d+),(\d+)\]""")
                    val match = regex.find(bounds) ?: continue
                    val (x1, y1, x2, y2) = match.destructured
                    val tapX = (x1.toInt() + x2.toInt()) / 2
                    val tapY = (y1.toInt() + y2.toInt()) / 2

                    repeat(3) {
                        runShellCommand(
                            "$adbPath -s localhost shell input tap $tapX $tapY",
                            context
                        )
                        KanoLog.d("UFI_TOOLS_LOG", "点击输入框坐标：$tapX,$tapY")
                    }

                    // 输入文本
                    if (!useClipBoard) {
                        Thread.sleep(200) // 稍等软键盘弹出
                        runShellCommand(
                            "$adbPath -s localhost shell input text \"$escapedInput\"",
                            context
                        )
                        KanoLog.d("UFI_TOOLS_LOG", "输入文本：$inputText")
                        inputClicked = true
                        if (escapedInput.length > 20) {
                            Thread.sleep(500) // 稍等输入完毕
                        }
                        break
                    } else {
                        runShellCommand(
                            "$adbPath -s localhost shell input keyevent KEYCODE_PASTE",
                            context
                        )
                        KanoLog.d("UFI_TOOLS_LOG", "读取剪贴板，输入文本：$inputText")
                        inputClicked = true
                        Thread.sleep(666) // 稍等输入完毕
                        break
                    }
                }
            }

            if (!inputClicked) throw Exception("未找到 EditText 输入框")

            fun getBtnAndClick(nodes_after: NodeList): String? {
                //找到按钮点击
                for (i in 0 until nodes_after.length) {
                    val node = nodes_after.item(i)
                    val attrs = node.attributes
                    val text = attrs.getNamedItem("text")?.nodeValue ?: ""
                    val bounds = attrs.getNamedItem("bounds")?.nodeValue ?: continue

                    if (btnName.any { it.equals(text, ignoreCase = true) }) {
                        val regex = Regex("""\[(\d+),(\d+)\]\[(\d+),(\d+)\]""")
                        val match = regex.find(bounds) ?: continue
                        val (x1, y1, x2, y2) = match.destructured
                        val tapX = (x1.toInt() + x2.toInt()) / 2
                        val tapY = (y1.toInt() + y2.toInt()) / 2
                        runShellCommand(
                            "$adbPath -s localhost shell input tap $tapX $tapY",
                            context
                        )
                        KanoLog.d(
                            "UFI_TOOLS_LOG",
                            "点击 ${btnName.joinToString(", ")} 坐标：$tapX,$tapY"
                        )
                        //继续检测result
                        if (resId != "") {
                            val res = getTextFromUIByResourceId(resId, adbPath, context)
                            if (needBack) {
                                //返回就完事了
                                Thread.sleep(800) // 稍等输入完毕
                                repeat(10) {
                                    runShellCommand(
                                        "$adbPath -s localhost shell input keyevent KEYCODE_BACK",
                                        context
                                    )
                                }
                            }
                            return res[0]
                        } else {
                            if (needBack) {
                                //返回就完事了
                                Thread.sleep(800) // 稍等输入完毕
                                repeat(10) {
                                    runShellCommand(
                                        "$adbPath -s localhost shell input keyevent KEYCODE_BACK",
                                        context
                                    )
                                }
                            }
                            return ""
                        }
                    }
                }
                return null
            }

            var res: String? = null

            for (i in 0 until 10) {
                val nodes_after = getUiDoc(adbPath, context).getElementsByTagName("node")
                var temp = getBtnAndClick(nodes_after)
                if (temp != null) {
                    res = temp
                    break
                }
            }

            if (res != null) {
                return res as String
            }

            throw Exception("未找到 ${btnName.joinToString(", ")} 按钮")
        }

        fun createShellScript(context: Context, fileName: String, scriptContent: String): File {
            val scriptFile = File(context.getExternalFilesDir(null), fileName)

            try {
                // 如果文件已存在，删除旧文件
                if (scriptFile.exists()) {
                    scriptFile.delete()
                }
            } catch (e: Exception) {
                KanoLog.d("UFI_TOOLS_LOG", "删除脚本出错：${e.message}")
            }

            // 写入内容（writeText 本身就是覆盖写入）
            scriptFile.writeText(scriptContent)

            // 设置执行权限（某些设备需要删除后重新设置权限才生效）
            scriptFile.setExecutable(true)

            return scriptFile
        }

        private fun getTextFromUIByResourceId(
            resId: String,
            adbPath: String,
            context: Context
        ): List<String> {
            val doc = getUiDoc(adbPath, context)
            val nodes = doc.getElementsByTagName("node")

            val resultTexts = mutableListOf<String>()

            for (i in 0 until nodes.length) {
                val node = nodes.item(i)
                val attrs = node.attributes

                val resourceId = attrs.getNamedItem("resource-id")?.nodeValue ?: continue
                if (resourceId == resId) {
                    val text = attrs.getNamedItem("text")?.nodeValue ?: ""
                    resultTexts.add(text)
                }
            }

            KanoLog.d(
                "UFI_TOOLS_LOG",
                "根据：$resId 共找到${resultTexts.size}条 result_text 文本：$resultTexts"
            )
            return resultTexts
        }

        //获取UI
        private fun getUiDoc(adbPath: String, context: Context, maxRetry: Int = 3): Document {
            if (adbPath.isEmpty()) throw Exception("需要 adbPath")

            repeat(maxRetry) { attempt ->
                try {

                    // 清除旧的 XML
                    runShellCommand("$adbPath -s localhost shell rm /sdcard/kano_ui.xml", context)
                    Thread.sleep(200)

                    // dump 当前 UI
                    runShellCommand(
                        "$adbPath -s localhost shell uiautomator dump /sdcard/kano_ui.xml",
                        context
                    )
                        ?: throw Exception("uiautomator dump 失败")

                    Thread.sleep(300)

                    // cat 读取 XML 内容
                    val xmlContent = runShellCommand(
                        "$adbPath -s localhost shell cat /sdcard/kano_ui.xml",
                        context
                    )
                        ?: throw Exception("cat kano_ui.xml 失败")

                    if (!xmlContent.trim().endsWith("</hierarchy>")) {
                        KanoLog.w("UFI_TOOLS_LOG", "UI XML 不完整，第 ${attempt + 1} 次尝试")
                        Thread.sleep(200)
                        return@repeat
                    }

                    // 转换为 Document
                    val factory = DocumentBuilderFactory.newInstance()
                    val builder = factory.newDocumentBuilder()
                    val inputStream = xmlContent.byteInputStream()
                    return builder.parse(inputStream)
                } catch (e: Exception) {
                    KanoLog.e("UFI_TOOLS_LOG", "解析 UI XML 失败，第 ${attempt + 1} 次：${e.message}")
                    Thread.sleep(200)
                }
            }

            throw Exception("多次尝试后仍无法获取完整的 UI dump")
        }


        fun killProcessByName(processKeyword: String) {
            try {
                val psProcess = ProcessBuilder("ps").start()
                val output = psProcess.inputStream.bufferedReader().readText()

                val lines = output.lines()
                for (line in lines) {
                    if (line.contains(processKeyword)) {
                        val tokens = line.trim().split(Regex("\\s+"))
                        if (tokens.size > 1) {
                            val pid = tokens[1]
                            KanoLog.w("UFI_TOOLS_LOG", "匹配到进程: $line，准备 kill -9 $pid")
                            try {
                                ProcessBuilder("kill", "-9", pid).start().waitFor()
                                KanoLog.w("UFI_TOOLS_LOG", "已 kill -9 $pid")
                            } catch (e: Exception) {
                                KanoLog.e("UFI_TOOLS_LOG", "kill -9 $pid 失败: ${e.message}")
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG", "killProcessByName 执行失败: ${e.message}")
            }
        }

        fun executeShellFromAssetsSubfolderWithArgs(
            context: Context,
            assetSubPath: String,
            vararg args: String,
            timeoutMs: Long = 20000,  // 默认最多等20秒
            onTimeout: (() -> Unit)? = null  // 超时回调
        ): String? {
            var process: Process? = null
            var readerThread: Thread? = null
            return try {
                val fileName = File(assetSubPath).name
                val outFile = File(context.filesDir, fileName)

                if (!outFile.exists()) {
                    context.assets.open(assetSubPath).use { input ->
                        FileOutputStream(outFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    KanoLog.d("UFI_TOOLS_LOG", "${outFile} 文件复制完成")
                } else {
                    KanoLog.d("UFI_TOOLS_LOG", "${outFile} 文件已存在，无需复制")
                }

                outFile.setExecutable(true)

                val command = ArrayList<String>().apply {
                    add(outFile.absolutePath)
                    addAll(args)
                }

                KanoLog.d("UFI_TOOLS_LOG", "执行命令: ${command.joinToString(" ")}")

                val startedProcess = ProcessBuilder(command)
                    .redirectErrorStream(true)
                    .apply {
                        environment()["HOME"] = context.filesDir.absolutePath
                    }
                    .start()
                process = startedProcess

                // 启动线程读输出
                val outputBuilder = StringBuffer()
                readerThread = Thread {
                    try {
                        startedProcess.inputStream.bufferedReader().use { reader ->
                            reader.forEachLine {
                                outputBuilder.append(it).append('\n')
                            }
                        }
                    } catch (e: Exception) {
                        if (startedProcess.isAlive) {
                            KanoLog.w("UFI_TOOLS_LOG", "读取进程输出异常：${e.message}")
                        }
                    }
                }.apply {
                    isDaemon = true
                    start()
                }

                // 最多等待 timeoutMs 毫秒
                val finished = startedProcess.waitFor(timeoutMs, TimeUnit.MILLISECONDS)

                if (!finished) {
                    KanoLog.w("UFI_TOOLS_LOG", "执行超时，强制销毁进程")
                    startedProcess.destroy()

                    if (!startedProcess.waitFor(300, TimeUnit.MILLISECONDS)) {
                        startedProcess.destroyForcibly()
                        startedProcess.waitFor(500, TimeUnit.MILLISECONDS)
                    }

                    // 调用回调
                    try {
                        onTimeout?.invoke()
                    } catch (e: Exception) {
                        KanoLog.w("UFI_TOOLS_LOG", "执行超时回调异常：${e.message}")
                    }

                    if (startedProcess.isAlive) {
                        startedProcess.inputStream.close()
                    }
                    readerThread.join(500)
                    return null
                }

                // 进程退出后输出流会到达 EOF，等待读取线程完整收集输出。
                readerThread.join()
                outputBuilder.toString().trim()

            } catch (e: InterruptedException) {
                process?.let {
                    it.destroy()
                    if (it.isAlive) it.destroyForcibly()
                }
                Thread.currentThread().interrupt()
                KanoLog.d("UFI_TOOLS_LOG", "命令执行被中断")
                null
            } catch (e: Exception) {
                process?.let {
                    it.destroy()
                    if (it.isAlive) it.destroyForcibly()
                }
                KanoLog.e("UFI_TOOLS_LOG", "执行异常: ${e.message}")
                null
            } finally {
                process?.let {
                    runCatching { it.outputStream.close() }
                    runCatching { it.inputStream.close() }
                    runCatching { it.errorStream.close() }
                }
            }
        }

        //检测adb存活
        fun ensureAdbAlive(context: Context): Boolean {
            try {
                val adbPath = "shell/adb"

                // 第一次检测
                var result = executeShellFromAssetsSubfolderWithArgs(context, adbPath, "devices")
                KanoLog.d("UFI_TOOLS_LOG", "adb device 执行状态：$result")

                if (result?.contains("localhost:5555\tdevice") == true) {
                    KanoLog.d("UFI_TOOLS_LOG", "adb存活，无需启动")
                    return true
                }

                KanoLog.w("UFI_TOOLS_LOG", "adb无设备或已退出，尝试启动")

                // 重启 ADB server
                executeShellFromAssetsSubfolderWithArgs(context, adbPath, "kill-server")
                Thread.sleep(1000)
                executeShellFromAssetsSubfolderWithArgs(context, adbPath, "connect", "localhost")

                // 等待最多 10 秒，设备变为 "device"
                val maxWaitMs = 10_000
                val interval = 500
                var waited = 0

                while (waited < maxWaitMs) {
                    result = executeShellFromAssetsSubfolderWithArgs(context, adbPath, "devices")
                    KanoLog.d("UFI_TOOLS_LOG", "等待 ADB 启动中：$result")
                    if (result?.contains("localhost:5555\tdevice") == true) {
                        KanoLog.d("UFI_TOOLS_LOG", "ADB连接成功")
                        return true
                    }
                    Thread.sleep(interval.toLong())
                    waited += interval
                }

                KanoLog.e("UFI_TOOLS_LOG", "等待ADB device超时")
                return false
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG", "检测/启动ADB失败: ${e.message}")
                return false
            }
        }

        fun executeShellFromAssetsSubfolder(
            context: Context,
            assetSubPath: String,
            outFileName: String = "tmp_script.sh"
        ): String? {
            try {
                val assetManager = context.assets

                val inputStream = assetManager.open(assetSubPath)
                val outFile = File(context.filesDir, outFileName)

                if (!outFile.exists()) {
                    inputStream.use { input ->
                        FileOutputStream(outFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                }

                outFile.setExecutable(true)

                val process = Runtime.getRuntime().exec(outFile.absolutePath)

                val reader = process.inputStream.bufferedReader()
                val output = reader.readText()

                process.waitFor()

                return output
            } catch (e: Exception) {
                KanoLog.d("UFI_TOOLS_LOG", "执行出错：${e.message}")
                e.printStackTrace()
            }

            return null
        }


        fun runADB(context: Context) {
            //网络adb
            //adb setprop service.adb.tcp.port 5555
            Thread {
                try {
                    runShellCommand("/system/bin/setprop persist.service.adb.tcp.port 5555")
                    runShellCommand("/system/bin/setprop service.adb.tcp.port 5555")
                    Log.d("UFI_TOOLS_LOG", "网络adb调试prop执行成功")
                } catch (e: Exception) {
                    try {
                        runShellCommand("/system/bin/setprop service.adb.tcp.port 5555")
                        runShellCommand("/system/bin/setprop persist.service.adb.tcp.port 5555")
                        Log.d("UFI_TOOLS_LOG", "网络adb调试prop执行成功")
                    } catch (e: Exception) {
                        Log.d("UFI_TOOLS_LOG", "网络adb调试prop执行出错： ${e.message}")
                    }
                }
                Thread.sleep(500)
                try {
                    Log.d("UFI_TOOLS_LOG", "开始进入adb_ip激活流程")

                    val sharedPrefs =
                        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

                    val ADB_IP_ENABLED = sharedPrefs.getString("ADB_IP_ENABLED", "") ?: null

                    Log.d("UFI_TOOLS_LOG", "ADB_IP_ENABLED:${ADB_IP_ENABLED}")

                    if (ADB_IP_ENABLED == "true") {
                        val ADB_IP =
                            sharedPrefs.getString("gateway_ip", "")?.substringBefore(":")
                                ?: throw Exception("没有ADMIN_IP")
                        val ADMIN_PWD =
                            sharedPrefs.getString("ADMIN_PWD","Wa@9w+YWRtaW4=") ?: "Wa@9w+YWRtaW4="

                        Log.d(
                            "UFI_TOOLS_LOG", "读取网络ADB所需配置：ADB_IP:${
                                ADB_IP
                            } ADMIN_PWD:${
                                ADMIN_PWD.take(2)
                            }"
                        )

                        suspend fun waitUntilReachable(ip: String, timeoutSeconds: Int = 30): Boolean {
                            val intervalMillis = 300L
                            val maxAttempts = timeoutSeconds * 1000 / intervalMillis
                            val req = KanoGoformRequest("http://$ip:8080")

                            repeat(maxAttempts.toInt()) {
                                try {
                                    val result = req.getData(
                                        mapOf(
                                            "multi_data" to "1",
                                            "cmd" to "loginfo"
                                        )
                                    )
                                    KanoLog.d("UFI_TOOLS_LOG", "尝试连接：$result")
                                    if (result != null) {
                                        KanoLog.d("UFI_TOOLS_LOG", "http://$ip:8080 可访问")
                                        return true
                                    }
                                } catch (e: Exception) {
                                    KanoLog.d("UFI_TOOLS_LOG", "连接异常: ${e.message}")
                                }
                                delay(intervalMillis)
                            }

                            KanoLog.e("UFI_TOOLS_LOG", "http://$ip:8080 在 $timeoutSeconds 秒内不可访问")
                            return false
                        }

                        try {
                            runBlocking {
                                //先等待最多30s，等待官方web后台完全启动
                                val reachable = waitUntilReachable(ADB_IP)
                                if (!reachable) {
                                    KanoLog.e("UFI_TOOLS_LOG", "官方WEB服务不可达，终止执行ADB自启操作")
                                    return@runBlocking
                                }
                                //如果开启了高级功能，就不需要去开关ADB开关了
                                //高级功能优先
                                val advancedFuncReachable = KanoUtils.waitAdvancedFuncAndWakeAdbd(context)
                                if(advancedFuncReachable) {
                                    KanoLog.d("UFI_TOOLS_LOG", "使用高级功能打开adbd完成")
                                    return@runBlocking
                                }

                                val req = KanoGoformRequest("http://$ADB_IP:8080")
                                val cookie = req.login(ADMIN_PWD)
                                if (cookie != null) {
                                    val result1 = req.postData(
                                        cookie, mapOf(
                                            "goformId" to "USB_PORT_SETTING",
                                            "usb_port_switch" to "0"
                                        )
                                    )
                                    KanoLog.d("UFI_TOOLS_LOG", "关闭ADBD结果: $result1")
                                    delay(500)
                                    val result2 = req.postData(
                                        cookie, mapOf(
                                            "goformId" to "USB_PORT_SETTING",
                                            "usb_port_switch" to "1"
                                        )
                                    )
                                    KanoLog.d("UFI_TOOLS_LOG", "开启ADBD结果: $result2")

                                    val result3 = req.postData(
                                        cookie, mapOf(
                                            "goformId" to "SetUpgAutoSetting",
                                            "UpgMode" to "0",
                                            "UpgIntervalDay" to "114514",
                                            "UpgRoamPermission" to "0"
                                        )
                                    )

                                    KanoLog.d("UFI_TOOLS_LOG", "禁用FOTA结果: $result3")

                                    val samba_result = sendShellCmd("cat /data/samba/etc/smb.conf | grep internal_storage")

                                    if(samba_result.done && samba_result.content.contains("internal_storage")){
                                        val result = req.postData(
                                            cookie, mapOf(
                                                "goformId" to "SAMBA_SETTING",
                                                "samba_switch" to "1",
                                            )
                                        )
                                        KanoLog.d("UFI_TOOLS_LOG", "开启samba结果: $result")
                                    }

                                    req.logout(cookie)
                                    if (result1?.getString("result") == "success" && result2?.getString("result") == "success") {
                                        KanoLog.d("UFI_TOOLS_LOG", "ADB_WIFI自启动执行成功")
                                    }
                                }
                            }

                        } catch (e: Exception) {
                            KanoLog.e("UFI_TOOLS_LOG", "ADB_WIFI执行错误: ${e.message}")
                        }
                    } else {
                        Log.d("UFI_TOOLS_LOG", "不需要自启动ADB_WIFI")
                    }
                } catch (e: Exception) {
                    Log.d("UFI_TOOLS_LOG", "ADB_WIFI自启动执行错误：${e.message}")
                    e.printStackTrace()
                }

                Thread.sleep(5000)
                executeShellFromAssetsSubfolderWithArgs(
                    context, "shell/adb", "start-server"
                )
                ensureAdbAlive(context)
            }.start()
        }

        fun openSMB (context: Context){
            //samba开关关闭了，立马拉起
            try {
                val open_command = "settings put global samba_enable 1"
                val socketPath = File(context.filesDir, "kano_root_shell.sock")

                if (adbIsReady) {
                    val outFile_adb = KanoUtils.copyFileToFilesDir(context, "shell/adb")
                    if(outFile_adb != null){
                        outFile_adb.setExecutable(true)
                        KanoLog.d("UFI_TOOLS_LOG", "samba被关闭了，尝试打开(使用adb方式)...")
                        val res = runShellCommand(
                            "${outFile_adb.absolutePath} -s localhost shell $open_command",
                            context
                        )
                        KanoLog.d("UFI_TOOLS_LOG", "使用adb方式打开samba结果：$res")
                    }
                }

                if (socketPath.exists()) {
                    KanoLog.d("UFI_TOOLS_LOG", "samba被关闭了，尝试打开(使用root方式)...")
                    val res =  RootShell.sendCommandToSocket(open_command.trimIndent(),
                        socketPath.absolutePath,
                        2000
                    )
                    KanoLog.d("UFI_TOOLS_LOG", "使用root方式打开samba结果：$res")
                }
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG", "smb打开执行失败", e)
            }
        }
    }
}
