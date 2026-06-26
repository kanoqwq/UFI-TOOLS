package com.minikano.f50_sms.utils

import android.net.LocalSocket
import android.net.LocalSocketAddress
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.IOException
import java.io.InputStreamReader
import java.io.OutputStreamWriter

object RootShell {

    fun sendCommandToSocket(command: String, socketPath: String,timeout:Int = 60*1000): String? {
        val socket = LocalSocket()
        val socketAddress = LocalSocketAddress(socketPath, LocalSocketAddress.Namespace.FILESYSTEM)

        try {
            KanoLog.d("UFI_TOOLS_LOG", "开始发送socket,目录：${socketPath},命令:${command}")

            socket.connect(socketAddress)
            socket.soTimeout = timeout // 60 秒超时

            KanoLog.d("UFI_TOOLS_LOG", "Socket")

            val outputStream = BufferedWriter(OutputStreamWriter(socket.outputStream))
            val inputStream = BufferedReader(InputStreamReader(socket.inputStream))

            val endTag = "__KANO_SOCKET_COMMAND_END_${java.util.UUID.randomUUID()}__"

            // 发送命令
            outputStream.write(command)
            outputStream.write("\n")
            outputStream.write("printf '%s\\n' '$endTag'\n")  // 标记结尾
            outputStream.flush()
            KanoLog.d("UFI_TOOLS_LOG", "Socket write")

            // 读取响应
            val result = StringBuilder()
            while (true) {
                val line = inputStream.readLine() ?: break

                val endIndex = line.indexOf(endTag)

                if (endIndex >= 0) {
                    //fix: issue #106 RootShell socket 执行命令时，若输出不以换行结尾会导致超时
                    val beforeEnd = line.substring(0, endIndex)
                    if (beforeEnd.isNotEmpty()) {
                        result.append(beforeEnd)
                    }
                    break
                }

                KanoLog.d("UFI_TOOLS_LOG", "Socket : ${line.trim()}")
                result.appendLine(line)
            }

            return result.toString().trimEnd()

        } catch (e: IOException) {
            e.printStackTrace()
            KanoLog.d("UFI_TOOLS_LOG", "Socket Error: ${e.message}")
            return null
        } finally {
            try {
                socket.close()
            } catch (_: IOException) {
            }
        }
    }
}