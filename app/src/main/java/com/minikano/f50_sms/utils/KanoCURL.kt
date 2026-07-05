package com.minikano.f50_sms.utils

import android.content.Context
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

class KanoCURL(private val context: Context) {
    companion object {
        // 单线程串行发送：限制并发（最多1线程，空闲30秒后回收），排队而非丢弃。
        // 必须跨实例共享——调用方每次转发都会 new 一个 KanoCURL
        private val sender = ThreadPoolExecutor(0, 1, 30L, TimeUnit.SECONDS, LinkedBlockingQueue())
    }

    fun send(command:String) {
        sender.execute {
            try {
                KanoLog.w("UFI_TOOLS_LOG_Curl", "正在执行curl命令:$command")
                val args = KanoUtils.parseShellArgs(command.replaceFirst("curl", ""))
                val result = ShellKano.executeShellFromAssetsSubfolderWithArgs(
                    context,
                    "shell/curl",
                    *args.toTypedArray(),
                    timeoutMs = 10000
                ) ?: throw Exception("runShellCommand为null")
                KanoLog.w("UFI_TOOLS_LOG_Curl", "执行curl命令结果：$result")
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG_Curl", "curl请求失败: ${e.message}", e)
            }
        }
    }
}
