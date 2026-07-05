package com.minikano.f50_sms.modules

import com.minikano.f50_sms.utils.KanoLog
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.httpMethod
import io.ktor.server.request.receiveText
import io.ktor.server.request.uri
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.route
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

const val TAG = "[$BASE_TAG]_reverseProxyModule"

private data class ProxyResult(
    val responseCode: Int,
    val responseBytes: ByteArray,
    val responseContentType: String,
    val setCookies: List<String>
)

// 反向代理官方后端
fun Route.reverseProxyModule(targetServerIP: String) {
    // 转发到原厂web后端
    route("/api/goform/{...}") {
        KanoLog.d(TAG, "开始反向代理资源...")
        handle {
            val targetServer = "http://${targetServerIP}"
            val originalPath = call.request.uri.removePrefix("/api")
            val queryString = call.request.queryParameters.entries()
                .joinToString("&") { (k, v) -> v.joinToString("&") { "$k=$it" } }

            val fullUrl = if (queryString.isBlank()) {
                "$targetServer$originalPath"
            } else {
                "$targetServer$originalPath?$queryString"
            }

            val method = call.request.httpMethod.value

            // 处理 OPTIONS 请求
            if (method == "OPTIONS") {
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.response.headers.append("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                call.response.headers.append("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
                call.respond(HttpStatusCode.OK)
                return@handle
            }

            try {
                // 先在 Ktor 协程里读取请求信息，避免在 IO 线程里直接操作 call
                val kanoCookie = call.request.headers["Kano-Cookie"]

                val requestHeaders = mutableListOf<Pair<String, List<String>>>()
                call.request.headers.forEach { key, values ->
                    requestHeaders.add(key to values)
                }

                val requestBodyBytes = if (method == "POST" || method == "PUT") {
                    call.receiveText().toByteArray()
                } else {
                    null
                }

                val proxyResult = withContext(Dispatchers.IO) {
                    val url = URL(fullUrl)
                    val conn = (url.openConnection() as HttpURLConnection).apply {
                        connectTimeout = 15_000
                        readTimeout = 20_000

                        requestMethod = method
                        doInput = true

                        setRequestProperty("Referer", targetServer)

                        if (!kanoCookie.isNullOrBlank()) {
                            setRequestProperty("Cookie", kanoCookie)
                        }

                        requestHeaders.forEach { (key, values) ->
                            // 忽略客户端 Referer / Host / Cookie
                            if (!key.equals("host", ignoreCase = true) &&
                                !key.equals("referer", ignoreCase = true) &&
                                !key.equals("cookie", ignoreCase = true)
                            ) {
                                setRequestProperty(key, values.joinToString(","))
                            }
                        }

                        if (requestBodyBytes != null) {
                            doOutput = true

                            // 保持原行为：显式设置 Content-Length
                            setRequestProperty("Content-Length", requestBodyBytes.size.toString())

                            outputStream.use {
                                it.write(requestBodyBytes)
                            }
                        }
                    }

                    try {
                        val responseCode = conn.responseCode
                        val responseStream = if (responseCode in 200..299) {
                            conn.inputStream
                        } else {
                            conn.errorStream
                        }

                        val responseBytes = responseStream?.use { it.readBytes() } ?: ByteArray(0)
                        val responseContentType = conn.contentType ?: "text/plain"

                        val setCookies = mutableListOf<String>()
                        conn.headerFields.forEach { (key, values) ->
                            if (key != null && key.equals("Set-Cookie", ignoreCase = true)) {
                                values?.forEach { cookie ->
                                    setCookies.add(cookie)
                                }
                            }
                        }

                        ProxyResult(
                            responseCode = responseCode,
                            responseBytes = responseBytes,
                            responseContentType = responseContentType,
                            setCookies = setCookies
                        )
                    } finally {
                        conn.disconnect()
                    }
                }

                proxyResult.setCookies.forEach { cookie ->
                    call.response.headers.append("kano-cookie", cookie)
                }

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.response.headers.append("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                call.response.headers.append("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")

                call.respondBytes(
                    proxyResult.responseBytes,
                    ContentType.parse(proxyResult.responseContentType),
                    HttpStatusCode.fromValue(proxyResult.responseCode)
                )
            } catch (e: Exception) {
                KanoLog.e(TAG, "转发出错", e)
                call.respond(HttpStatusCode.InternalServerError, "Proxy error: ${e.message}")
            }
        }
    }
}