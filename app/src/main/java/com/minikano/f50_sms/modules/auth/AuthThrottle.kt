package com.minikano.f50_sms.modules.auth

import com.minikano.f50_sms.utils.KanoLog
import java.util.concurrent.ConcurrentHashMap

/**
 * 按来源 IP 限制口令校验失败次数。
 *
 * 口令是一个静态 bearer（sha256(口令) 本身），接口也没有任何频率限制，
 * 同一局域网内可以无限次猜。这里给暴力破解加一个成本。
 *
 * 只保存在内存里：进程重启即清空。这是刻意的——宁可放宽，
 * 也不要因为持久化的计数把机主自己永久锁在外面。
 */
object AuthThrottle {

    private const val TAG = "UFI_TOOLS_LOG_AuthThrottle"

    /** 窗口内允许的失败次数 */
    private const val MAX_FAILURES = 10

    /** 失败计数的滑动窗口 */
    private const val WINDOW_MS = 5 * 60 * 1000L

    /** 触发后的基础锁定时长，每多失败一次翻倍，上限 MAX_LOCK_MS */
    private const val BASE_LOCK_MS = 30 * 1000L
    private const val MAX_LOCK_MS = 10 * 60 * 1000L

    /** 防止有人伪造大量来源把 map 撑爆 */
    private const val MAX_TRACKED_HOSTS = 512

    private data class State(
        var failures: Int = 0,
        var windowStart: Long = 0L,
        var lockedUntil: Long = 0L
    )

    private val states = ConcurrentHashMap<String, State>()

    /** 该来源当前是否处于锁定期。返回剩余秒数，0 表示未锁定。 */
    fun lockedSeconds(host: String, now: Long = System.currentTimeMillis()): Long {
        val state = states[host] ?: return 0
        val remain = state.lockedUntil - now
        return if (remain > 0) (remain + 999) / 1000 else 0
    }

    fun onFailure(host: String, now: Long = System.currentTimeMillis()) {
        if (states.size >= MAX_TRACKED_HOSTS) evictExpired(now)

        val state = states.getOrPut(host) { State(windowStart = now) }
        synchronized(state) {
            // 窗口过期就重新开始计数
            if (now - state.windowStart > WINDOW_MS) {
                state.failures = 0
                state.windowStart = now
            }
            state.failures += 1

            if (state.failures >= MAX_FAILURES) {
                val over = state.failures - MAX_FAILURES
                val lockMs = (BASE_LOCK_MS shl over.coerceAtMost(6)).coerceAtMost(MAX_LOCK_MS)
                state.lockedUntil = now + lockMs
                KanoLog.w(TAG, "口令失败次数过多，锁定 $host ${lockMs / 1000}s (failures=${state.failures})")
            }
        }
    }

    fun onSuccess(host: String) {
        states.remove(host)
    }

    fun reset() = states.clear()

    private fun evictExpired(now: Long) {
        states.entries.removeAll { (_, state) ->
            state.lockedUntil < now && now - state.windowStart > WINDOW_MS
        }
        // 全都还在窗口内时，直接清空好过无限增长
        if (states.size >= MAX_TRACKED_HOSTS) {
            KanoLog.w(TAG, "跟踪的来源过多，清空计数")
            states.clear()
        }
    }
}
