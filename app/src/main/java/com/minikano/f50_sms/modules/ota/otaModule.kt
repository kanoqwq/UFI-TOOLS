package com.minikano.f50_sms.modules.ota

import android.content.Context
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.modules.BASE_TAG
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoRequest
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.RootShell
import com.minikano.f50_sms.utils.ShellKano
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.header
import io.ktor.server.response.respondOutputStream
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.utils.io.ByteChannel
import io.ktor.utils.io.close
import io.ktor.utils.io.jvm.javaio.copyTo
import io.ktor.utils.io.jvm.javaio.toOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.io.OutputStreamWriter
import kotlin.concurrent.thread

object ApkState {
    var downloadResultPath: String? = null
    var downloadInProgress = false
    var download_percent = 0
    var downloadError: String? = null
    var currentDownloadingUrl: String = ""
}

fun Route.otaModule(context: Context) {
    val TAG = "[$BASE_TAG]_OTAModule"

    //检查更新
    get("/api/check_update") {
        try {
            val path = "/UFI-TOOLS-UPDATE"
            val downloadUrl = "${AppMeta.GLOBAL_SERVER_URL}/d$path/"
            val changelogUrl = "${AppMeta.GLOBAL_SERVER_URL}/d$path/changelog.txt"

            // 拉取 changelog 文本
            val changelog = KanoRequest.getTextFromUrl(changelogUrl)

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

            val alistResponse = KanoRequest.postJson(
                "${AppMeta.GLOBAL_SERVER_URL}/api/fs/list",
                requestBody
            )

            val alistBody = alistResponse.body?.string()

            val safeChangelog = changelog
                ?.replace(Regex("\r?\n"), "<br>")
                ?.let { JSONObject.quote(it) }

            // 拼装 JSON 响应
            val resultJson = """
            {
                "base_uri": "$downloadUrl",
                "alist_res": $alistBody,
                "changelog": $safeChangelog
            }
        """.trimIndent()

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

    //从URL下载APK
    post("/api/download_apk") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val apkUrl = json.optString("apk_url", "").trim()
            if (apkUrl.isEmpty()) {
                throw IllegalArgumentException("请提供 apk_url")
            }

            KanoLog.d(TAG, "接收到 apk_url=$apkUrl")

            synchronized(this) {
                if (ApkState.downloadInProgress && apkUrl == ApkState.currentDownloadingUrl) {
                    KanoLog.d(TAG, "已在下载该 APK，忽略重复请求")
                } else {
                    ApkState.downloadInProgress = true
                    ApkState.download_percent = 0
                    ApkState.downloadResultPath = null
                    ApkState.downloadError = null
                    ApkState.currentDownloadingUrl = apkUrl

                    val outputFile = File(context.getExternalFilesDir(null), "downloaded_app.apk")
                    if (outputFile.exists()) outputFile.delete()

                    thread {
                        try {
                            val path = KanoRequest.downloadFile(apkUrl, outputFile) { percent ->
                                ApkState.download_percent = percent
                            }
                            if (path != null) {
                                ApkState.downloadResultPath = path
                                KanoLog.d(TAG, "下载完成：$path")
                            } else {
                                ApkState.downloadError = "下载失败"
                                KanoLog.d(TAG, "下载失败：返回路径为空")
                            }
                        } catch (e: Exception) {
                            ApkState.downloadError = e.message ?: "未知错误"
                            KanoLog.d(TAG, "【子线程】下载异常：${e.message}")
                        } finally {
                            ApkState.downloadInProgress = false
                        }
                    }
                }
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"download_started"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "【主线程】执行 /download_apk 出错：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"${e.message ?: "未知错误"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //下载进度
    get("/api/download_apk_status") {
        val status = when {
            ApkState.downloadInProgress -> "downloading"
            ApkState.downloadError != null -> "error"
            ApkState.downloadResultPath != null -> "done"
            else -> "idle"
        }

        val json = """
        {
            "status":"$status",
            "percent":${ApkState.download_percent},
            "error":"${ApkState.downloadError ?: ""}"
        }
    """.trimIndent()

        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondText(json, ContentType.Application.Json)
    }

    //安装APK
    post("/api/install_apk") {
        val outputChannel = ByteChannel(autoFlush = true)

        launch(Dispatchers.IO) {
            val writer = OutputStreamWriter(outputChannel.toOutputStream(), Charsets.UTF_8)
            try {
                ApkState.downloadResultPath = ApkState.downloadResultPath
                if (ApkState.downloadResultPath == null) {
                    writer.write("""{"error":"未检测到已下载的 APK"}""")
                    return@launch
                }

                //使用高级功能安装
                val socketPath = File(context.filesDir, "kano_root_shell.sock")
                //试试能不能
                val testResult =
                    RootShell.sendCommandToSocket(
                        "whoami",
                        socketPath.absolutePath
                    ) ?: "whoami执行失败"
                KanoLog.d(TAG, "socat测试结果： $testResult")
                if (socketPath.exists() && testResult.contains("root")) {

                    val shellScript = """
                #!/system/bin/sh
                nohup sh -c '
                pm install -r -g "${ApkState.downloadResultPath}" >> /sdcard/ufi_tools_update.log 2>&1
                dumpsys activity start-activity -n com.minikano.f50_sms/.MainActivity --ez silent true >> /sdcard/ufi_tools_update.log 2>&1
                sync
                sync
                echo "${'$'}(date)install and sync complete!" >> /sdcard/ufi_tools_update.log
                ' >/dev/null 2>&1 &
                """.trimIndent()

                    //保存sh
                    val scriptFile =
                        ShellKano.createShellScript(
                            context,
                            "ufi_tools_update_by_socat.sh",
                            shellScript
                        )
                    val shPath = scriptFile.absolutePath

                    val result =
                        RootShell.sendCommandToSocket(
                            "nohup sh $shPath &",
                            socketPath.absolutePath
                        )

                    KanoLog.d(TAG, "socat安装apk结果： $result")
                    delay(2000)
                    writer.write("""{"result":"success"}""")

                } else {
                    KanoLog.d(TAG, "没有找到socat，执行B计划")

                    val outFileAdb = KanoUtils.copyFileToFilesDir(context, "shell/adb")
                        ?: throw Exception("复制 adb 到 filesDir 失败")
                    outFileAdb.setExecutable(true)

                    // 复制APK到 sdcard 根目录
                    val copyCmd =
                        "${outFileAdb.absolutePath} -s localhost shell sh -c 'cp ${ApkState.downloadResultPath} /sdcard/ufi_tools_latest.apk'"
                    KanoLog.d(TAG, "执行：$copyCmd")
                    ShellKano.runShellCommand(copyCmd, context)

                    // 创建并复制 shell 脚本
                    val scriptText = """
                    #!/system/bin/sh
                    pm install -r -g /sdcard/ufi_tools_latest.apk >> /sdcard/ufi_tools_update.log 2>&1
                    dumpsys activity start-activity -n com.minikano.f50_sms/.MainActivity >> /sdcard/ufi_tools_update.log 2>&1
                    sync
                    sync
                    echo "$(date)install and sync complete!" >> /sdcard/ufi_tools_update.log
                """.trimIndent()

                    val scriptFile =
                        ShellKano.createShellScript(context, "ufi_tools_update.sh", scriptText)
                    val shPath = scriptFile.absolutePath

                    val copyShCmd =
                        "${outFileAdb.absolutePath} -s localhost shell sh -c 'cp $shPath /sdcard/ufi_tools_update.sh'"
                    KanoLog.d(TAG, "执行：$copyShCmd")
                    ShellKano.runShellCommand(copyShCmd, context)

                    suspend fun clickStage() {
                        repeat(10) {
                            ShellKano.runShellCommand(
                                "${outFileAdb.absolutePath} -s localhost shell input keyevent KEYCODE_BACK",
                                context
                            )
                        }
                        delay(100)
                        repeat(5) {
                            ShellKano.runShellCommand(
                                "${outFileAdb.absolutePath} -s localhost shell settings put system screen_off_timeout 300000",
                                context
                            )
                            ShellKano.runShellCommand(
                                "${outFileAdb.absolutePath} -s localhost shell input keyevent KEYCODE_WAKEUP",
                                context
                            )
                            delay(10)
                            ShellKano.runShellCommand(
                                "${outFileAdb.absolutePath} -s localhost shell input tap 0 0",
                                context
                            )
                            delay(10)

                            val result = ShellKano.runShellCommand(
                                "${outFileAdb.absolutePath} -s localhost shell am start -n com.sprd.engineermode/.EngineerModeActivity",
                                context
                            )
                            if (result != null) {
                                val clicked = ShellKano.parseUiDumpAndClick(
                                    "DEBUG&LOG",
                                    outFileAdb.absolutePath,
                                    context
                                )
                                if (clicked == 0) {
                                    ShellKano.parseUiDumpAndClick(
                                        "Adb shell",
                                        outFileAdb.absolutePath,
                                        context
                                    )
                                }
                                return
                            }
                            delay(400)
                        }
                        throw Exception("click_stage 多次尝试失败")
                    }

                    suspend fun tryClickStage(maxRetry: Int = 2) {
                        var retry = 0
                        while (retry <= maxRetry) {
                            try {
                                clickStage()
                                return
                            } catch (e: Exception) {
                                KanoLog.w(
                                    TAG,
                                    "click_stage1 执行失败，尝试第 ${retry + 1} 次，错误：${e.message}"
                                )
                                repeat(10) {
                                    ShellKano.runShellCommand(
                                        "${outFileAdb.absolutePath} -s localhost shell input keyevent KEYCODE_BACK",
                                        context
                                    )
                                }
                                Thread.sleep(1000)
                                retry++
                            }
                        }
                        throw Exception("click_stage 多次重试失败")
                    }

                    tryClickStage()

                    try {
                        val escapedCommand =
                            "sh /sdcard/ufi_tools_update.sh".replace("\"", "\\\"")
                        ShellKano.fillInputAndSend(
                            escapedCommand,
                            outFileAdb.absolutePath,
                            context,
                            "",
                            listOf("START", "开始"),
                            needBack = false,
                            useClipBoard = true
                        )
                        writer.write("""{"result":"success"}""")
                    } catch (e: Exception) {
                        writer.write("""{"error":${JSONObject.quote("执行 shell 命令失败: ${e.message}")}}""")
                    }
                }
            } catch (e: Exception) {
                writer.write("""{"error":${JSONObject.quote("异常: ${e.message}")}}""")
            } finally {
                writer.flush()
                outputChannel.close()
            }
        }

        call.response.header(HttpHeaders.AccessControlAllowOrigin, "*")
        call.respondOutputStream(ContentType.Application.Json) {
            outputChannel.copyTo(this)
        }
    }

}