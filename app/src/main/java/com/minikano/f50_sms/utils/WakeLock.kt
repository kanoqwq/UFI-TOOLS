package com.minikano.f50_sms.utils

import android.os.PowerManager
import android.util.Log

class WakeLock {

    companion object {
        private var wakeLock: PowerManager.WakeLock? = null
        private var wakeLock2: PowerManager.WakeLock? = null
        private var wakeLock3: PowerManager.WakeLock? = null
        private var wakeLockBase: PowerManager.WakeLock? = null

        fun execWakeLock (pm: PowerManager){
            //防止重复持有唤醒锁
            releaseWakeLock()
            wakeLock = pm.newWakeLock(
                PowerManager.SCREEN_DIM_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "UFI-TOOLS::WakeLock"
            )
            wakeLock?.acquire()
            Log.d("UFI_TOOLS_LOG", "已开启唤醒锁，防止屏幕熄灭!")

            wakeLock2 = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "UFI-TOOLS::FULL_WAKE_LOCK"
            )
            wakeLock2?.acquire()
            Log.d("UFI_TOOLS_LOG", "已开启更强的唤醒锁，保持屏幕常亮并唤醒!")

            wakeLock3 = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "UFI-TOOLS::BrightWakeLock"
            )
            wakeLock3?.acquire()
            Log.d("UFI_TOOLS_LOG", "已开启屏幕亮度唤醒锁，保持屏幕常亮并唤醒!")
        }

        fun exeBaseWakeLock (pm: PowerManager){
            //防止重复持有唤醒锁
            releaseBaseWakeLock()
            wakeLockBase = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "UFI_TOOLS:WebServer"
                )
            wakeLockBase?.setReferenceCounted(false)
            wakeLockBase?.acquire()
        }

        fun releaseBaseWakeLock() {
            wakeLockBase?.let {
                if (it.isHeld) it.release()
                Log.d("UFI_TOOLS_LOG", "已释放Base唤醒锁")
            }
        }

        fun releaseWakeLock() {
            wakeLock?.let {
                if (it.isHeld) it.release()
                Log.d("UFI_TOOLS_LOG", "已释放唤醒锁")
            }
            wakeLock2?.let {
                if (it.isHeld) it.release()
                Log.d("UFI_TOOLS_LOG", "已释放FULL_WAKE_LOCK")
            }
            wakeLock3?.let {
                if (it.isHeld) it.release()
                Log.d("UFI_TOOLS_LOG", "已释放BrightWakeLock")
            }
        }
    }
}