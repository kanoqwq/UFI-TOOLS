package com.minikano.f50_sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.utils.DeviceModelChecker
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.ShellKano
import com.minikano.f50_sms.utils.UniqueDeviceIDManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.system.exitProcess

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("UFI_TOOLS_LOG", "开机广播接收到，准备启动服务")
            //初始化spf
            KanoUtils.initSharedPerfs(context)
            AppMeta.init(context)
            UniqueDeviceIDManager.init(context)

            // 启动协程异步调用 suspend 函数
            CoroutineScope(Dispatchers.Default).launch {
                UniqueDeviceIDManager.init(context)
                val isUnSupportDevice = DeviceModelChecker.checkBlackList(context)
                Log.d("UFI_TOOLS_LOG", "黑名单检测结果：$isUnSupportDevice")

                withContext(Dispatchers.Main) {
                    if (isUnSupportDevice) {
                        // 处理不支持设备逻辑
                        Log.d("UFI_TOOLS_LOG", "检测到不受支持的设备，终结程序")
                        exitProcess(-999)
                    }
                }
            }

            val startIntent = Intent(context, WebService::class.java)
            startIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startForegroundService(startIntent)
            Log.d("UFI_TOOLS_LOG", "启动WebService")

            val startIntent_ADB = Intent(context, ADBService::class.java)
            startIntent_ADB.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startForegroundService(startIntent_ADB)
            Log.d("UFI_TOOLS_LOG", "启动ADBService")

            //激活网络ADB等
            ShellKano.runADB(context)
            Log.d("UFI_TOOLS_LOG", "激活网络ADB")
        }
    }
}