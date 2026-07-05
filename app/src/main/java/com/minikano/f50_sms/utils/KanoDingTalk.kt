package com.minikano.f50_sms.utils

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.security.MessageDigest
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import java.util.Base64
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class KanoDingTalk(
    private val webhookUrl: String,
    private val secret: String? = null
) {
    companion object {
        // 单线程串行发送：限制并发（最多1线程，空闲30秒后回收），排队而非丢弃。
        // 必须跨实例共享——调用方每次转发都会 new 一个 KanoDingTalk
        private val sender = ThreadPoolExecutor(0, 1, 30L, TimeUnit.SECONDS, LinkedBlockingQueue())
    }

    fun sendMessage(content: String) {
        sender.execute {
            try {
                // 共享客户端自带超时，发送线程最多阻塞 callTimeout（30 秒），不会永久挂起
                val client = KanoHttp.client
                val mediaType = "application/json; charset=utf-8".toMediaType()
                
                // 构建消息内容
                val messageJson = """
                {
                    "msgtype": "text",
                    "text": {
                        "content": "$content"
                    }
                }
                """.trimIndent()

                // 计算签名（如果提供了secret）
                val finalUrl = if (!secret.isNullOrEmpty()) {
                    val timestamp = System.currentTimeMillis()
                    val stringToSign = "$timestamp\n$secret"
                    val hmacSha256 = Mac.getInstance("HmacSHA256")
                    val secretKeySpec = SecretKeySpec(secret.toByteArray(StandardCharsets.UTF_8), "HmacSHA256")
                    hmacSha256.init(secretKeySpec)
                    val sign = Base64.getEncoder().encodeToString(hmacSha256.doFinal(stringToSign.toByteArray(StandardCharsets.UTF_8)))
                    val encodedSign = URLEncoder.encode(sign, "UTF-8")
                    "$webhookUrl&timestamp=$timestamp&sign=$encodedSign"
                } else {
                    webhookUrl
                }

                val body = messageJson.toRequestBody(mediaType)
                val request = Request.Builder()
                    .url(finalUrl)
                    .post(body)
                    .build()

                KanoLog.d("UFI_TOOLS_LOG_DingTalk", "开始发送钉钉消息...")
                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        KanoLog.d("UFI_TOOLS_LOG_DingTalk", "钉钉消息发送成功")
                    } else {
                        KanoLog.e("UFI_TOOLS_LOG_DingTalk", "钉钉消息发送失败: ${response.code}")
                    }
                }
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG_DingTalk", "钉钉消息发送异常: ${e.message}", e)
            }
        }
    }
} 
