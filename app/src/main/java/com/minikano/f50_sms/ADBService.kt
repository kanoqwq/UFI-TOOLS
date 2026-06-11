package com.minikano.f50_sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.edit
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.modules.PREFS_NAME
import com.minikano.f50_sms.utils.BatteryReceiver
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoReport.Companion.reportToServer
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.KanoUtils.Companion.getVoLteState
import com.minikano.f50_sms.utils.KanoUtils.Companion.isUsbDebuggingEnabled
import com.minikano.f50_sms.utils.KanoUtils.Companion.runAT
import com.minikano.f50_sms.utils.KanoUtils.Companion.setVoLteState
import com.minikano.f50_sms.utils.KanoUtils.Companion.setVoNrState
import com.minikano.f50_sms.utils.ShellKano
import com.minikano.f50_sms.utils.ShellKano.Companion.executeShellFromAssetsSubfolderWithArgs
import com.minikano.f50_sms.utils.ShellKano.Companion.killProcessByName
import com.minikano.f50_sms.utils.SmbThrottledRunner
import com.minikano.f50_sms.utils.SmsInfo
import com.minikano.f50_sms.utils.SmsPoll
import com.minikano.f50_sms.utils.TaskSchedulerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class ADBService : Service() {
    private lateinit var runnable: Runnable
    private lateinit var handlerThread: HandlerThread
    private lateinit var handler: Handler
    private val adbExecutor = Executors.newSingleThreadExecutor()
    private val iperfExecutor = Executors.newSingleThreadExecutor()
    private var disableFOTATimes = 3

    private  val TAG = "UFI_TOOLS_LOG_ADBService"
    private lateinit var batteryReceiver: BatteryReceiver

    companion object {
        @Volatile
        var adbIsReady: Boolean = false
        var isExecutedDisabledFOTA = false
        var isExecutingDisabledFOTA = false
        var isExecutedSambaMount = false
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(1234599, createNotification())

        if (!::handlerThread.isInitialized || !handlerThread.isAlive) {
            handlerThread = HandlerThread("KanoBackgroundHandler").apply {
                start()
            }
            handler = Handler(handlerThread.looper)
        }

        handler.removeCallbacks(runnableSMSAndDataFlowCheck)
        handler.removeCallbacks(runnableSMB)
        handler.removeCallbacks(runnableRPT)
        handler.removeCallbacks(runnableAT)

        // 串行执行任务
        handler.post {
            resetFilesFromAssets(applicationContext)

            // 等文件拷贝完成后再继续
            startAdbKeepAliveTask(applicationContext)
            startIperfTask(applicationContext)

            handler.post(runnableSMSAndDataFlowCheck)
            handler.post(runnableSMB)
            handler.post(runnableRPT)
            handler.post(runnableAT)
            //订阅电池事件接收器
            registerBatteryReceiver()
        }

        //开启定时任务
        TaskSchedulerManager.init(applicationContext)
        return START_STICKY
    }

    private fun pingAT(): String {
        return runAT(applicationContext,"AT",0)
    }

    private val runnableAT = object : Runnable {
        override fun run() {
            try {
                KanoLog.d(TAG, "---------------等待AT服务可用中---------------")

                if (!pingAT().contains("OK")) {
                    KanoLog.d(TAG, "AT还未准备好，1秒后重试...")
                    handler.postDelayed(this, 1_000)
                    return
                }
                KanoLog.d(TAG, "===============正在执行自启动AT指令===============")

                val sharedPrefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

                if(sharedPrefs.getString("volte_status_0","0") == "1") {
                    val res = setVoLteState(applicationContext, "1", 0)
                    KanoLog.d(TAG, "setVoLteState:$res slot=0")
                }
                if(sharedPrefs.getString("volte_status_1","0") == "1") {
                    val res = setVoLteState(applicationContext, "1", 1)
                    KanoLog.d(TAG, "setVoLteState:$res slot=1")
                }

                if(sharedPrefs.getString("vonr_status_0","0") == "1") {
                    val res = setVoNrState(applicationContext, "1", 0)
                    KanoLog.d(TAG, "setVoNrState:$res slot=0")
                }
                if(sharedPrefs.getString("vonr_status_1","0") == "1") {
                    val res = setVoNrState(applicationContext, "1", 1)
                    KanoLog.d(TAG, "setVoNrState:$res slot=1")
                }

                KanoLog.d(TAG, "===============自启动AT指令执行完成===============")
            } catch (e: Exception) {
                KanoLog.e(TAG, "执行自启动AT指令错误：", e)
                handler.postDelayed(this, 1_500)
            }
        }
    }

    private fun registerBatteryReceiver(){
        batteryReceiver = BatteryReceiver(onLowBattery = {
            forwardMessage(
                """
                ${AppMeta.nickName} 剩余电量低（10%），请及时充电~
                    Battery low (10%). Please charge your device.
                """.trimIndent()
                ,"${AppMeta.nickName} 电量低（10%）")
        },
        onVeryLowBattery = {
            forwardMessage(
                """
                ${AppMeta.nickName} 剩余电量过低（5%），请及时充电~
                Battery is very low (5%). Please charge your device.
                """.trimIndent()
                ,"${AppMeta.nickName} 电量过低（5%）")
        },
        onFullBattery = {
            forwardMessage(
                """
                ${AppMeta.nickName} 电量已充满~
                ${AppMeta.nickName} is fully charged.
                """.trimIndent()
                ,"${AppMeta.nickName} 已充满~")

        },
        onCharge = {
            forwardMessage(
                """
                ${AppMeta.nickName} 已插入电源~
                ${AppMeta.nickName} power connected.
                """.trimIndent()
            ,"${AppMeta.nickName} 已插入电源~")
        })

        registerReceiver(
            batteryReceiver,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        )
        Log.d(TAG, "BatteryReceiver 已注册")
    }

    private fun forwardMessage(message:String,title:String){
        val sharedPrefs = getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
        val isEnabledPowerStatusForward =
            (sharedPrefs.getString("kano_power_status_forward_enabled", "0") ?: "0") == "1"
        val isSMSForwardEnabled = sharedPrefs.getString("kano_sms_forward_enabled", "0") == "1"
        if (isEnabledPowerStatusForward && isSMSForwardEnabled) {
            KanoUtils.forwardBatteryStatusMessage(this,SmsInfo(title,
               message , System.currentTimeMillis()))
        }
    }

    private fun resetFilesFromAssets(context: Context) {
        val filesDir = context.filesDir


        // 删除所有文件
        filesDir.listFiles()?.forEach { file ->
            if (file.isFile) {
                try {
                    file.delete()
                } catch (e: Exception) {
                    Log.e(TAG, "删除文件失败:${e.message}")
                }
            }
        }

        // 复制 assets 中的所有文件
        try {
            KanoUtils.copyAssetsRecursively(context, "shell", context.filesDir)
            KanoUtils.normalizeLineEndingsInDirShallow(context.filesDir)
            Log.d(TAG, "已初始化 files 目录")
        } catch (e: Exception) {
            Log.e(TAG, "初始化 files 目录失败:${e.message}")
        }
    }

    private val runnableSMSAndDataFlowCheck = object : Runnable {
        override fun run() {
            val sharedPrefs = getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            if (sharedPrefs.getString("kano_sms_forward_enabled", "0") == "1") {
                try {
                    SmsPoll.checkNewSmsAndSend(applicationContext)
                } catch (e: Exception) {
                    KanoLog.e(TAG, "读取短信时发生错误", e)
                }
            }
            if (sharedPrefs.getString("kano_data_flow_limit_enabled", "0") == "1") {
                try {
                    KanoUtils.checkAndDoDataLimitReachedAction(applicationContext)
                } catch (e: Exception) {
                    KanoLog.e(TAG, "runnableSMSAndDataFlowCheck->checkAndDoDataLimitReachedAction发生错误", e)
                }
            }
            handler.postDelayed(this, 8000)
        }
    }

    private val rptScope =
        CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile
    private var rptRunning = false
    private val runnableRPT = object : Runnable {
        override fun run() {
            if (rptRunning) {
                KanoLog.w(TAG, "上一次 RPT 还未完成，跳过本次")
            } else {
                rptScope.launch {
                    rptRunning = true
                    try {
                        KanoLog.d(TAG, "周期性发送状态中...")
                        reportToServer()
                    } catch (e: Exception) {
                        KanoLog.e(TAG, "发送状态时发生错误：", e)
                    } finally {
                        rptRunning = false
                    }
                }
            }
            handler.postDelayed(this, TimeUnit.HOURS.toMillis(5))
        }
    }

    private val runnableSMB = object : Runnable {
        override fun run() {
            try {
                KanoLog.d(TAG, "激活SMB内置脚本中...")
                SmbThrottledRunner.runOnceInThread(applicationContext)
            } catch (e: Exception) {
                KanoLog.e(TAG, "激活SMB内置脚本错误")
            }
            handler.postDelayed(this, 20_000)
        }
    }

    private fun startIperfTask(context: Context){
        iperfExecutor.execute {
            try{
                KanoLog.d(TAG, "iperf3启动中...")
                killProcessByName("iperf3")
                val result =
                    executeShellFromAssetsSubfolderWithArgs(
                        applicationContext,
                        "shell/iperf3",
                        "-s",
                        "-D",
                    )
                if (result != null) {
                    KanoLog.d(TAG, "iperf3已启动")
                } else {
                    KanoLog.e(TAG, "iperf3启动失败(用户模式)")
                }
            }catch (e:Exception){
                KanoLog.e(TAG, "iperf3命令执行出错",e)
            }
        }
    }

    private fun startAdbKeepAliveTask(context: Context) {
        adbExecutor.execute {
            try {
                val adbPath = "shell/adb"

                while (!Thread.currentThread().isInterrupted) {
                    val isDebugEnabled = isUsbDebuggingEnabled(context)
                    if (!isDebugEnabled){
                        KanoLog.d(TAG, "没有开启ADB，不执行ADB保活")
                        adbIsReady = false
                    }
                    else {
                        KanoLog.d(TAG, "保活ADB服务中...")

                        var result =
                            executeShellFromAssetsSubfolderWithArgs(context, adbPath, "devices") {
                                ShellKano.killProcessByName("adb")
                            }

                        if (result?.contains("localhost:5555\tdevice") == true) {
                            KanoLog.d(TAG, "adb存活，无需启动")
                            adbIsReady = true
                            if (!isExecutedDisabledFOTA) {
                                disableFOTATimes--
                                if (disableFOTATimes <= 0) {
                                    KanoLog.d(
                                        TAG,
                                        "已连续3次尝试使用adb禁用FOTA，强制isExecutingDisabledFOTA = true"
                                    )
                                    isExecutingDisabledFOTA = true
                                }
                                val res = KanoUtils.disableFota(applicationContext)
                                if (res) {
                                    KanoLog.d(TAG, "使用adb禁用FOTA完成")
                                }
                                isExecutedDisabledFOTA = true
                            }
                        } else {
                            KanoLog.w(TAG, "adb无设备或已退出，尝试启动")
                            adbIsReady = false

                            ShellKano.killProcessByName("adb")
                            Thread.sleep(1000)

                            executeShellFromAssetsSubfolderWithArgs(
                                context,
                                adbPath,
                                "connect",
                                "localhost"
                            ) {
                                ShellKano.killProcessByName("adb")
                            }

                            val maxWaitMs = 5_000
                            val interval = 500
                            var waited = 0

                            while (waited < maxWaitMs) {
                                result = executeShellFromAssetsSubfolderWithArgs(
                                    context,
                                    adbPath,
                                    "devices"
                                ) {
                                    ShellKano.killProcessByName("adb")
                                }

                                if (result?.contains("localhost:5555\tdevice") == true) {
                                    KanoLog.d(TAG, "ADB连接成功: $result")
                                    adbIsReady = true
                                    break
                                } else {
                                    KanoLog.d(TAG, "ADB未连接: $result")
                                }

                                Thread.sleep(interval.toLong())
                                waited += interval
                            }
                        }
                    }
                    // 每 11 秒轮询一次
                    Thread.sleep(11_000)
                }
            } catch (e: Exception) {
                KanoLog.e(TAG, "ADB 保活线程异常", e)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handlerThread.quitSafely()
        handler.removeCallbacks(runnable)
        unregisterReceiver(batteryReceiver)
        TaskSchedulerManager.scheduler?.stop()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotification(): Notification {
        val channelId = "kano_adb_service"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "adb_service后台服务",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("adb_service后台运行中")
            .setContentText("正在执行adb_service定时任务")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .build()
    }
}