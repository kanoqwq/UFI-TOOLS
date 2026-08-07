package com.minikano.f50_sms.modules.speedtest

import android.content.Context
import com.minikano.f50_sms.utils.KanoUtils
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytesWriter
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.utils.io.writeFully
import kotlinx.coroutines.sync.Semaphore

object SpeedTestCache {
    val buffer = ByteArray(8 * 1024 * 1024).apply {
        java.security.SecureRandom().nextBytes(this)
    }
}

val speedTestLimiter = Semaphore(3)

fun Route.speedTestModule(context: Context) {
    //测速
    get("/api/speedtest") {
        if (!speedTestLimiter.tryAcquire()) {
            call.respond(HttpStatusCode.TooManyRequests, "测速请求过多，请稍后再试")
            return@get
        }
        try {
            val parms = call.request.queryParameters
            val totalChunks = KanoUtils.getChunkCount(parms["ckSize"]).coerceIn(1, 1024)
            val enableCors = parms.contains("cors")
            val buffer = SpeedTestCache.buffer

            if (enableCors) {
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.response.headers.append("Access-Control-Allow-Methods", "GET, POST")
            }

            val contentLength = buffer.size.toLong() * totalChunks

            call.response.headers.append(
                HttpHeaders.ContentLength,
                contentLength.toString()
            )

            call.response.headers.append(
                HttpHeaders.ContentDisposition,
                "attachment; filename=random.dat"
            )
            call.response.headers.append(
                HttpHeaders.CacheControl,
                "no-store"
            )
            call.response.headers.append(HttpHeaders.Pragma, "no-cache")

            call.respondBytesWriter(
                contentType = ContentType.Application.OctetStream
            ) {
                var i = 0
                while (i < totalChunks) {
                    writeFully(buffer)
                    i++
                }
            }
        } finally {
            speedTestLimiter.release()
        }
    }
}