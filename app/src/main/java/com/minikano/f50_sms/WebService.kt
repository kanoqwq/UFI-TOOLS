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

        // Base PARTIAL_WAKE_LOCK 只由承载 Ktor 的核心服务持有。
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        // WakeLock.exeBaseWakeLock(pm)

        //检测IP变动，适应用户ip网段更改
        KanoUtils.adaptIPChange(applicationContext)

        val prefs = getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
        val needWakeLock = prefs.getString("wakeLock", "lock") ?: "lock"
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

    private val serverLock = Any()

    private fun startWebServer() {
        val prefs = getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
        Thread {
            synchronized(serverLock) {
                if (webServer != null) {
                    sendStickyBroadcast(Intent(SERVER_INTENT).putExtra("status", true))
                    return@synchronized
                }

                val currentIp = prefs.getString("gateway_ip", "0.0.0.0:8080") ?: "0.0.0.0:8080"
                allowAutoStart = true
                try {
                    Log.d("UFI_TOOLS_LOG", "正在启动web服务，绑定地址：http://0.0.0.0:$port")
                    val server = KanoWebServer(applicationContext, 2333, currentIp)
                    server.start()
                    webServer = server
                    sendStickyBroadcast(Intent(SERVER_INTENT).putExtra("status", true))
                    Log.d("UFI_TOOLS_LOG", "启动服务成功，地址：http://0.0.0.0:$port")
                } catch (fallbackEx: Exception) {
                    webServer = null
                    Log.e("UFI_TOOLS_LOG", "服务启动失败: ${fallbackEx.message}")
                    sendStickyBroadcast(Intent(SERVER_INTENT).putExtra("status", false))
                }
            }
        }.start()
    }

    private fun stopWebServer() {
        Thread {
            synchronized(serverLock) {
                allowAutoStart = false
                allowAutoReStart = false

                val server = webServer ?: run {
                    sendStickyBroadcast(Intent(SERVER_INTENT).putExtra("status", false))
                    return@synchronized
                }

                try {
                    server.stop()
                    webServer = null
                    sendStickyBroadcast(Intent(SERVER_INTENT).putExtra("status", false))
                    Log.d("UFI_TOOLS_LOG", "Web server stopped")
                } catch (e: Exception) {
                    Log.e("UFI_TOOLS_LOG", "停止服务失败: ${e.message}", e)
                }
            }
        }.start()
    }

    override fun onDestroy() {
        unregisterReceiver(statusReceiver)
        stopWebServer()
        WakeLock.releaseBaseWakeLock()
        super.onDestroy()
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
