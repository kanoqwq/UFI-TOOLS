package com.minikano.f50_sms.utils

import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * 全局共享的 OkHttpClient。
 * 每次 new OkHttpClient() 都会创建独立的线程池和连接池且从不释放，
 * 高频调用（如 goform 轮询）会造成持续的内存分配与 GC 压力。
 * 统一使用本实例；个别调用需要不同超时时，用 client.newBuilder()（共享连接池，开销极小）。
 */
object KanoHttp {
    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .callTimeout(45, TimeUnit.SECONDS)
            .connectionPool(ConnectionPool(8, 2, TimeUnit.MINUTES))
            .build()
    }

    // 大文件下载专用：不限总时长（callTimeout），靠 readTimeout 检测停滞
    val downloadClient: OkHttpClient by lazy {
        client.newBuilder()
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .callTimeout(0, TimeUnit.MILLISECONDS)
            .build()
    }
}
