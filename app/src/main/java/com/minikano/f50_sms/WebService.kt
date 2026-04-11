package com.minikano.f50_sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.UniqueDeviceIDManager
import com.minikano.f50_sms.utils.WakeLock
import kotlin.concurrent.thread

class WebService : Service() {
    private var webServer: KanoWebServer? = null
    private val port = 2333
    private val SERVER_INTENT = "com.minikano.f50_sms.SERVER_STATUS_CHANGED"
    private val UI_INTENT = "com.minikano.f50_sms.UI_STATUS_CHANGED"

    @Volatile
    private var allowAutoStart = true
    private var allowAutoReStart = true

    private val statusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action
            Log.d("UFI_TOOLS_LOG", "WebService 收到 Intent")
            if (action == UI_INTENT) {
                val shouldStart = intent.getBooleanExtra("status", false)
                if (shouldStart) {
                    startWebServer()
                } else {
                    stopWebServer()
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        AppMeta.init(this)
        // Application 或 Activity 启动时调用一次初始化：
        UniqueDeviceIDManager.init(this)
        startForegroundNotification()

        //检测IP变动，适应用户ip网段更改
        KanoUtils.adaptIPChange(applicationContext)

        val prefs = getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
        val needWakeLock = prefs.getString("wakeLock", "lock") ?: "lock"
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if(needWakeLock != "lock") {
            KanoLog.d("UFI_TOOLS_LOG","不需要唤醒锁，正在释放...")
            WakeLock.releaseWakeLock()
        } else {
            KanoLog.d("UFI_TOOLS_LOG","需要唤醒锁，正在执行...")
            WakeLock.execWakeLock(pm)
        }

        // 注册广播接收器
        registerReceiver(statusReceiver, IntentFilter(UI_INTENT), Context.RECEIVER_EXPORTED)
        startForeground(114514, createNotification())

        allowAutoReStart = true
        startWebServer()

        Log.d("UFI_TOOLS_LOG", "WebService Init Success!")
    }

    private fun startWebServer() {
        val prefs = getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
        Thread {
            val currentIp = prefs.getString("gateway_ip", "0.0.0.0:8080") ?: "0.0.0.0:8080"
            allowAutoStart = true
            try {
                Log.d("UFI_TOOLS_LOG", "正在启动web服务，绑定地址：http://0.0.0.0:$port")
                webServer = KanoWebServer(applicationContext, 2333, currentIp)
                webServer?.start()
                sendStickyBroadcast(Intent(SERVER_INTENT).putExtra("status", true))
                Log.d("UFI_TOOLS_LOG", "启动服务成功，地址：http://0.0.0.0:$port")
            } catch (fallbackEx: Exception) {
                Log.e("UFI_TOOLS_LOG", "服务启动失败: ${fallbackEx.message}")
                sendStickyBroadcast(Intent(SERVER_INTENT).putExtra("status", false))
            }
        }.start()
    }

    private fun stopWebServer() {
        allowAutoStart = false  // 禁止自动重试
        allowAutoReStart = false  // 禁止自动重启

        thread { webServer?.stop() }
        sendStickyBroadcast(Intent(SERVER_INTENT).putExtra("status", false))
        Log.d("UFI_TOOLS_LOG", "Web server stopped")
    }

    override fun onDestroy() {
        super.onDestroy()
        stopWebServer()
    }

    private fun createNotification(): Notification {
        val channelId = "web_server_channel"
        val channel = NotificationChannel(
            channelId, "Web Server", NotificationManager.IMPORTANCE_LOW
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)

        val builder =
            NotificationCompat.Builder(this, channelId).setContentTitle("ZTE Tools Web Server")
                .setContentText("服务正在后台运行中")
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setOngoing(true)

        return builder.build()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startForegroundNotification() {
        val channelId = "running_service"
        val channelName = "服务器状态"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val chan =
                NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_HIGH)
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(chan)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_launcher_foreground).setOngoing(true).build()

        startForeground(1, notification)
        Log.d("UFI_TOOLS_LOG", "通知已建立")
    }
}