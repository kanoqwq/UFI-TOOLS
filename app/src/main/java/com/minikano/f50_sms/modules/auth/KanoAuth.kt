package com.minikano.f50_sms.modules.auth

import android.content.Context
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.KanoUtils.Companion.normalizeLeadingSlashes
import com.minikano.f50_sms.utils.KanoUtils.Companion.normalizePath
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path
import io.ktor.server.request.queryString

object KanoAuth {
    val PREFS_NAME = "kano_ZTE_store"
    val PREF_LOGIN_TOKEN = "login_token"
    val PREF_TOKEN_ENABLED = "login_token_enabled"
    val REQUEST_SECRET_KEY = "minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd"

    val apiWhiteListExact: Set<String> = setOf(
            "/api/get_custom_head",
            "/api/version_info",
            "/api/need_token",
            "/api/get_theme",
            "/api/SELinux"
        )

    val apiWhiteListPrefix: List<String> = listOf(
        "/api/uploads"
    )

    /**
     * 弱口令下必须拒绝的高危接口。
     * 这些接口可以直接或间接拿到 root 权限（执行命令、装 APK、开高级功能），
     * 默认口令 admin 时开放它们等于把设备完全交给同一局域网内的任何人。
     */
    val highRiskApis: Set<String> = setOf(
        "/api/root_shell",
        "/api/user_shell",
        "/api/one_click_shell",
        "/api/install_apk",
        "/api/download_apk",
        // 注意：/api/AT 不在此列。主页 QoS 每 10s 轮询它，拦掉会直接废掉仪表盘。
        // 它的命令注入问题在 atModule 里用 argv 传参根治，不靠这道闸。
        "/api/smbPath",
        "/api/get_official_web_password"
    )

    /**
     * 已知弱口令的 sha256。存储的是哈希，无法还原明文，
     * 所以只能拿常见弱口令的哈希来比对。
     */
    private val weakTokenHashes: Set<String> by lazy {
        setOf(
            "admin", "root", "password", "passw0rd", "admin123", "admin888",
            "1234", "12345", "123456", "1234567", "12345678", "123456789",
            "1234567890", "000000", "111111", "888888", "zte", "ufi", "ufitools"
        ).map { KanoUtils.sha256Hex(it).lowercase() }.toSet()
    }

    /**
     * 口令是否为默认/弱口令。
     * AppMeta 里的持久化标志可能因为历史版本而不准，所以同时比对哈希，
     * 两者任一命中都算弱口令。
     */
    fun isWeakTokenInUse(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val tokenStored = (prefs.getString(PREF_LOGIN_TOKEN, "") ?: "").trim().lowercase()

        if (tokenStored.isBlank()) return true
        if (weakTokenHashes.contains(tokenStored)) return true

        return AppMeta.isDefaultOrWeakToken
    }

    /**
     * 口令校验通过之后的第二道闸：弱口令时挡住高危接口。
     * 返回 true 表示放行。
     */
    fun checkHighRisk(call: ApplicationCall, context: Context): Boolean {
        val uri = normalizePath(call.request.path())
        if (!highRiskApis.contains(uri)) return true

        val tokenEnabled = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREF_TOKEN_ENABLED, "true")?.toBoolean() ?: true

        // 口令功能被关掉时，这些接口本来就没有任何保护，同样拦住。
        if (!tokenEnabled || isWeakTokenInUse(context)) {
            KanoLog.w(TAG_AUTH, "弱口令/未启用口令，拒绝高危接口: $uri")
            return false
        }
        return true
    }

    private const val TAG_AUTH = "UFI_TOOLS_LOG_KanoAuth"

    /**
     * 这个请求是否真的需要校验口令。
     *
     * 单独抽出来是为了让失败计数只统计"本来就该带凭据"的请求：
     * 否则攻击者可以拿白名单接口（比如 /api/version_info）
     * 把自己的失败计数清零，限流就形同虚设。
     */
    fun requiresAuth(call: ApplicationCall, context: Context): Boolean {
        val tokenEnabled = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREF_TOKEN_ENABLED, "true")?.toBoolean() ?: true
        if (!tokenEnabled) return false

        val uri = normalizePath(call.request.path())
        val isApi = uri == "/api" || uri.startsWith("/api/")
        if (!isApi) return false

        if (apiWhiteListExact.contains(uri)) return false
        if (apiWhiteListPrefix.any { uri == it || uri.startsWith("$it/") }) return false

        return true
    }

    fun checkAuth(call: ApplicationCall, context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val tokenStored = prefs.getString(PREF_LOGIN_TOKEN, "") ?: ""

        val rawPath = call.request.path()
        val method = call.request.httpMethod.value

        val uri = normalizePath(rawPath)
        val uriForAuth = uri
        val rawPathForSign = normalizeLeadingSlashes(rawPath)
        KanoLog.d("UFI_TOOLS_LOG_KanoAuth") {
            "uri:$uri\t rawPath:$rawPath \t method:$method \t query:${call.request.queryString()}"
        }

        if (!requiresAuth(call, context)) return true

        val headers = call.request.headers
        val timestampStr = headers["kano-t"]
        val clientSignature = headers["kano-sign"]
        val authHeader = headers["authorization"]

        if (timestampStr.isNullOrBlank() || clientSignature.isNullOrBlank() || authHeader.isNullOrBlank() || tokenStored.isBlank()) {
            return false
        }

        if (!KanoUtils.constantTimeSha256Equals(authHeader.trim(), tokenStored)) {
            return false
        }

        val clientTimestamp = timestampStr.toLongOrNull() ?: return false
        //如果是反向代理，则不要进行path过滤
        val signTarget =
            if (uriForAuth == "/api/proxy" || uriForAuth.startsWith("/api/proxy/")) {
                rawPathForSign
            } else {
                uriForAuth       // 其它接口继续用 normalizePath 的结果
            }

        val raw = "minikano$method$signTarget$clientTimestamp"
        val expectedSignature = KanoUtils.HmacSignature(REQUEST_SECRET_KEY, raw)

        return expectedSignature.equals(clientSignature, ignoreCase = true)
    }
}
