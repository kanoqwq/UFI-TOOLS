package com.minikano.f50_sms.modules

import android.content.Context
import com.minikano.f50_sms.modules.adb.adbModule
import com.minikano.f50_sms.modules.advanced.advancedToolsModule
import com.minikano.f50_sms.modules.at.anyProxyModule
import com.minikano.f50_sms.modules.at.atModule
import com.minikano.f50_sms.modules.auth.authenticatedRoute
import com.minikano.f50_sms.modules.config.configModule
import com.minikano.f50_sms.modules.deviceInfo.baseDeviceInfoModule
import com.minikano.f50_sms.modules.ota.otaModule
import com.minikano.f50_sms.modules.plugins.pluginsModule
import com.minikano.f50_sms.modules.scheduledTask.scheduledTaskModule
import com.minikano.f50_sms.modules.smsForward.smsModule
import com.minikano.f50_sms.modules.speedtest.speedTestModule
import com.minikano.f50_sms.modules.theme.themeModule
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.defaultheaders.DefaultHeaders
import io.ktor.server.routing.routing


const val BASE_TAG = "UFI_TOOLS_LOG"
const val PREFS_NAME = "kano_ZTE_store"

fun Application.mainModule(context: Context, proxyServerIp: String) {
    install(DefaultHeaders)
    val targetServerIP = proxyServerIp  // 目标服务器地址
    val TAG = "[$BASE_TAG]_reverseProxyModule"

    routing {
        // 静态资源
        staticFileModule(context)

        authenticatedRoute(context) {

            configModule(context)

            anyProxyModule(context)

            reverseProxyModule(targetServerIP)

            baseDeviceInfoModule(context)

            adbModule(context)

            atModule(context)

            advancedToolsModule(context, targetServerIP)

            speedTestModule(context)

            otaModule(context)

            smsModule(context)

            scheduledTaskModule(context)
        }

        themeModule(context)
        pluginsModule(context)

    }

}