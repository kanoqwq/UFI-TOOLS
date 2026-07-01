package com.minikano.f50_sms.utils

import android.os.Build
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.configs.AppMeta.isDeviceRooted
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit
class KanoReport {
    companion object {
        private const val BASE_URL = "https://api.kanokano.cn/ufi_tools_report"
        private const val REPORT_PATH = "/report"
        private const val TOKEN = "minikano1234"

        private val reportHttpClient: OkHttpClient = OkHttpClient.Builder()
            .callTimeout(6, TimeUnit.SECONDS)
            .connectTimeout(3, TimeUnit.SECONDS)
            .readTimeout(3, TimeUnit.SECONDS)
            .writeTimeout(3, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .build()

        suspend fun reportToServer() {
            try {
                val uuid = UniqueDeviceIDManager.getUUID()?.trim()
                if (uuid.isNullOrEmpty()) {
                    KanoLog.d("UFI_TOOLS_LOG_report_service","UUID 为空，跳过上报")
                    return
                }

                val model = Build.MODEL.trim()
                val firmwareVersion = Build.DISPLAY
                val appVer = "${AppMeta.versionName} (${AppMeta.versionCode})"

                val json = JSONObject().apply {
                    put("uuid", uuid)
                    put("device_name", model)
                    put("app_ver", appVer)
                    put("firmware_ver", firmwareVersion)
                    put("is_root", isDeviceRooted)
                }.toString()

                val url = BASE_URL + REPORT_PATH
                val mediaType = "application/json; charset=utf-8".toMediaType()
                val body = json.toRequestBody(mediaType)

                val request = Request.Builder()
                    .url(url)
                    .header("token",TOKEN)
                    .post(body)
                    .build()

                // 切换到 IO 线程做网络请求
                withContext(Dispatchers.IO) {
                    withTimeout(20_000) {
                        reportHttpClient.newCall(request).execute().use { resp ->
                            if (resp.isSuccessful) {
                                KanoLog.d("UFI_TOOLS_LOG_report_service","上报成功: ${resp.code}")
                            } else {
                                KanoLog.e("UFI_TOOLS_LOG_report_service","上报失败: ${resp.code} - ${resp.message}")
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG_report_service","上报失败:",e)
            }
        }
    }
}