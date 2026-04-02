package com.minikano.f50_sms.utils

import android.content.Context
//import android.os.Build
import android.util.Log
//import com.minikano.f50_sms.utils.KanoReport.Companion.reportToServer
//import kotlinx.coroutines.CoroutineScope
//import kotlinx.coroutines.Dispatchers
//import kotlinx.coroutines.launch
//import androidx.core.content.edit

object DeviceModelChecker {
//    private var isUnSupportDevice = false
//    private val devicesBlackList = listOf(
//        "MU5352"
//    )
//    private val PREFS_NAME = "kano_ZTE_store"
//    private val frimwareWhiteList = listOf(
//        "MU5352_DSV1.0.0B07",
//        "MU5352_DSV1.0.0B05",
//        "MU5352_DSV1.0.0B03",
//        "MU300",
//        "F50",
//        "U30Air",
//    )

    suspend fun checkBlackList(context:Context): Boolean {
        Log.d("UFI_TOOLS_LOG_devcheck", "黑名单功能不启用")
        return false
//        Log.d("UFI_TOOLS_LOG_devcheck", "正在遍历黑名单设备...")
//        val model = Build.MODEL.trim()
//        val firmwareVersion = Build.DISPLAY
//
//        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
//        val isDeviceWhiteList = prefs.getString("is_device_white_list", null)
//        if (!isDeviceWhiteList.isNullOrEmpty()) {
//            if(isDeviceWhiteList == "kano") {
//                Log.d("UFI_TOOLS_LOG_devcheck", "线上白名单(已持久化)，永久放行")
//                return false
//            } else {
//                Log.d("UFI_TOOLS_LOG_devcheck", "错误的白名单字符串，跳过")
//                prefs.edit(commit = true) { remove("is_device_white_list") }
//            }
//        }
//
//        val uuid = UniqueDeviceIDManager.getUUID()
//        Log.d("UFI_TOOLS_LOG_devcheck", "当前设备UUID:$uuid")
//
//        try {
//            if (uuid != null) {
//                val res = KanoReport.getRemoteDeviceRegisterItem(uuid)
//                Log.d("UFI_TOOLS_LOG_devcheck", "线上数据返回:$res")
//                if (res != null && res.isWhiteList) {
//                    Log.d("UFI_TOOLS_LOG_devcheck", "线上白名单，永久放行")
//                    prefs.edit(commit = true) { putString("is_device_white_list", "kano") }
//                    return false
//                }
//                //上报信息
//                try{
//                    CoroutineScope(Dispatchers.Main).launch {
//                        reportToServer()
//                    }
//                } catch (_:Exception){}
//            }
//        } catch (e: Exception) {
//            Log.e("UFI_TOOLS_LOG_devcheck", "获取远程设备注册信息异常", e)
//        }
//
//        devicesBlackList.forEach {
//            Log.d("UFI_TOOLS_LOG_devcheck", "$it == $model ?")
//            if (it.trim().contains(model)) {
//                isUnSupportDevice = true
//            }
//        }
//        frimwareWhiteList.forEach {
//            if (firmwareVersion.contains(it.trim())) {
//                Log.d("UFI_TOOLS_LOG_devcheck", "检测到白名单固件，即将放行")
//                isUnSupportDevice = false
//            }
//        }
//        return isUnSupportDevice
    }

    fun checkIsNotUFI(context: Context):Boolean{
        return false
    }
}