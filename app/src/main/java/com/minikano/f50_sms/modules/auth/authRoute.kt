package com.minikano.f50_sms.modules.auth

import android.content.Context
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.call
import io.ktor.server.plugins.origin
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.route

fun Route.authenticatedRoute(context: Context, block: Route.() -> Unit) {
    route("") {
        intercept(ApplicationCallPipeline.Plugins) {
            // 只有"本来就要带凭据"的请求才参与限流计数。
            // 白名单接口不参与，否则攻击者可以拿它们把失败计数清零。
            val needsAuth = KanoAuth.requiresAuth(call, context)
            val host = call.request.origin.remoteHost

            if (needsAuth) {
                val locked = AuthThrottle.lockedSeconds(host)
                if (locked > 0) {
                    call.respondText(
                        """{"error":"口令错误次数过多，请 $locked 秒后再试。<br>Too many failed attempts, try again in ${locked}s.","code":"rate_limited"}""",
                        ContentType.Application.Json,
                        HttpStatusCode.TooManyRequests
                    )
                    finish()
                    return@intercept
                }
            }

            if (!KanoAuth.checkAuth(call, context)) {
                if (needsAuth) AuthThrottle.onFailure(host)
                call.respondText(
                    """{"error":"unauthorized"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.Unauthorized
                )
                finish() // 阻止后续处理
                return@intercept
            }

            if (needsAuth) AuthThrottle.onSuccess(host)

            // 口令正确，但如果还是默认/弱口令，高危接口一律拒绝。
            if (!KanoAuth.checkHighRisk(call, context)) {
                call.respondText(
                    """{"error":"当前仍在使用默认/弱口令，该功能已被禁用。请先在 APP 内设置一个至少 8 位、包含字母和数字的强口令。<br>A default or weak password is still in use, so this feature is disabled. Please set a strong password (8+ chars, letters and digits) in the app first.","code":"weak_token"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.Forbidden
                )
                finish()
                return@intercept
            }
        }
        block()
    }
}
