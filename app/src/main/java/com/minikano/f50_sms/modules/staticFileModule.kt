package com.minikano.f50_sms.modules

import android.content.Context
import com.minikano.f50_sms.utils.KanoLog
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.defaultForFilePath
import io.ktor.server.application.call
import io.ktor.server.request.path
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import java.io.FileNotFoundException

/** 不允许通过静态资源接口下载的 assets 目录（可执行文件、证书库等） */
private val PRIVATE_ASSET_PREFIXES = listOf("shell/", "certs/")

//静态资源
fun Route.staticFileModule(context: Context) {
    val TAG = "[$BASE_TAG]_staticFileModule"

    get("{...}") {
        val rawPath = (
            call.parameters["..."]
                ?: call.request.path().removePrefix("/")
            ).trim('/')
        val path = if (rawPath.isBlank()) "index.html" else rawPath

        if (path.contains("..")) {
            KanoLog.w(TAG, "静态资源请求被拒绝(路径非法): $rawPath")
            call.respond(HttpStatusCode.Forbidden, "403 Forbidden")
            return@get
        }

        // 这个 handler 在鉴权之外，任何人都能取。
        // assets 里除了前端资源，还打包了 adb/socat/ttyd 等可执行文件和证书库，
        // 这些不该对未认证的请求开放。
        if (PRIVATE_ASSET_PREFIXES.any { path == it.trimEnd('/') || path.startsWith(it) }) {
            KanoLog.w(TAG, "静态资源请求被拒绝(非公开目录): $rawPath")
            call.respond(HttpStatusCode.Forbidden, "403 Forbidden")
            return@get
        }

        try {
            val bytes = context.assets.open(path).use { it.readBytes() }
            val contentType = ContentType.defaultForFilePath(path)
            call.respondBytes(bytes, contentType)
        } catch (e: SecurityException) {
            KanoLog.e(TAG, "静态资源无权限访问：$path", e)
            call.respond(HttpStatusCode.Forbidden, "403 Forbidden")
        } catch (e: FileNotFoundException) {
            KanoLog.e(TAG, "静态资源不存在：$path", e)
            call.respond(HttpStatusCode.NotFound, "404 Not Found")
        } catch (e: Exception) {
            KanoLog.e(TAG, "静态资源读取失败：$path", e)
            call.respond(HttpStatusCode.InternalServerError, "500 Internal Server Error")
        }
    }
}
