package com.minikano.f50_sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.provider.Settings
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
import com.minikano.f50_sms.utils.KanoUtils.Companion.isADBAutoBootUpEnabled
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
import java.io.BufferedInputStream
import java.io.DataInputStream
import java.io.File
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class ADBService : Service() {
    private lateinit var handlerThread: HandlerThread
    private lateinit var handler: Handler
    private val adbExecutor = Executors.newSingleThreadExecutor()
    private val adbMaintenanceExecutor = Executors.newSingleThreadExecutor()
    private val adbWatchdogExecutor = Executors.newSingleThreadScheduledExecutor()
    private val iperfExecutor = Executors.newSingleThreadExecutor()
    private var disableFOTATimes = 3

    private  val TAG = "UFI_TOOLS_LOG_ADBService"
    private lateinit var batteryReceiver: BatteryReceiver
    private val adbTaskStarted = AtomicBoolean(false)
    private val adbMaintenanceStarted = AtomicBoolean(false)
    private val adbWakeSignal = LinkedBlockingQueue<Unit>(1)
    @Volatile private var adbTrackProcess: Process? = null
    @Volatile private var serviceStopping = false
    private var adbObserverRegistered = false

    private val adbStateObserver = object : ContentObserver(null) {
        override fun onChange(selfChange: Boolean) {
            if (!isUsbDebuggingEnabled(applicationContext)) {
                updateAdbReady(false, "ADB 已关闭")
                adbTrackProcess?.destroy()
            }
            adbWakeSignal.offer(Unit)
        }
    }

    companion object {
        @Volatile
        var adbIsReady: Boolean = false
        var isExecutedDisabledFOTA = false
        var isExecutingDisabledFOTA = false
        var isExecutedSambaMount = false
    }

    override fun onCreate() {
        super.onCreate()
        contentResolver.registerContentObserver(
            Settings.Global.getUriFor(Settings.Global.ADB_ENABLED),
            false,
            adbStateObserver
        )
        adbObserverRegistered = true
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
            handler.postDelayed(this, 30_000)
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
        if (!adbTaskStarted.compareAndSet(false, true)) {
            KanoLog.d(TAG, "ADB 状态监听已经运行，跳过重复启动")
            return
        }

        adbExecutor.execute {
            val retryDelaysMs = longArrayOf(2_000, 5_000, 10_000, 30_000, 60_000)
            var retryIndex = 0
            var nextAdbdWakeAllowedAtMs = 0L

            try {
                val adbFile = File(context.filesDir, "adb")
                adbFile.setExecutable(true)

                while (!serviceStopping && !Thread.currentThread().isInterrupted) {
                    if (!isUsbDebuggingEnabled(context) && !isADBAutoBootUpEnabled(context)) {
                        updateAdbReady(false, "ADB和无线adb自启开关都未启用")
                        KanoLog.d(TAG, "ADB和无线adb自启开关都未启用，等待系统设置变化")
                        adbWakeSignal.take()
                        retryIndex = 0
                        continue
                    }

                    if (!isLocalAdbPortOpen()) {
                        updateAdbReady(false, "localhost:5555 端口不可用")

                        val now = SystemClock.elapsedRealtime()
                        if (now >= nextAdbdWakeAllowedAtMs &&
                            KanoUtils.tryWakeAdbdViaAdvancedFunc(context)
                        ) {
                            nextAdbdWakeAllowedAtMs = now + 15_000
                            retryIndex = 0
                            KanoLog.d(TAG, "已请求高级功能拉起 adbd，1 秒后检查端口")
                            adbWakeSignal.poll(1_000, TimeUnit.MILLISECONDS)
                            continue
                        }

                        retryIndex = waitForAdbRetry(retryDelaysMs, retryIndex)
                        continue
                    }

                    val connectResult = executeShellFromAssetsSubfolderWithArgs(
                        context,
                        "shell/adb",
                        "connect",
                        "localhost",
                        timeoutMs = 5_000
                    )

                    val connected = connectResult?.contains("connected to localhost:5555") == true
                    if (!connected) {
                        updateAdbReady(false, "adb connect 失败")
                        KanoLog.w(TAG, "ADB 连接失败: $connectResult")
                        retryIndex = waitForAdbRetry(retryDelaysMs, retryIndex)
                        continue
                    }

                    KanoLog.d(TAG, "ADB 已连接，启动 track-devices 事件监听")
                    val wasReady = try {
                        monitorAdbDevices(adbFile, context)
                    } catch (e: InterruptedException) {
                        throw e
                    } catch (e: Exception) {
                        if (!serviceStopping && isUsbDebuggingEnabled(context)) {
                            KanoLog.w(TAG, "track-devices 监听已断开: ${e.message}")
                        }
                        false
                    }
                    updateAdbReady(false, "track-devices 已结束")

                    if (wasReady) {
                        retryIndex = 0
                    }
                    retryIndex = waitForAdbRetry(retryDelaysMs, retryIndex)
                }
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                KanoLog.d(TAG, "ADB 状态监听已停止")
            } catch (e: Exception) {
                if (!serviceStopping) {
                    KanoLog.e(TAG, "ADB 状态监听异常", e)
                }
            } finally {
                adbTrackProcess?.destroy()
                adbTrackProcess = null
                updateAdbReady(false, "ADB 状态监听已停止")
                adbTaskStarted.set(false)
            }
        }
    }

    private fun isLocalAdbPortOpen(): Boolean {
        return try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress("localhost", 5555), 500)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun waitForAdbRetry(delays: LongArray, retryIndex: Int): Int {
        val delayMs = delays[retryIndex.coerceAtMost(delays.lastIndex)]
        KanoLog.d(TAG, "${delayMs / 1000} 秒后重试 ADB 连接")
        adbWakeSignal.poll(delayMs, TimeUnit.MILLISECONDS)
        return (retryIndex + 1).coerceAtMost(delays.lastIndex)
    }

    private fun monitorAdbDevices(adbFile: File, context: Context): Boolean {
        val process = ProcessBuilder(adbFile.absolutePath, "track-devices")
            .apply {
                environment()["HOME"] = context.filesDir.absolutePath
            }
            .start()
        adbTrackProcess = process
        var wasReady = false

        val watchdog = adbWatchdogExecutor.scheduleWithFixedDelay(
            {
                if (!serviceStopping && adbIsReady && !isLocalAdbPortOpen()) {
                    KanoLog.w(TAG, "ADB watchdog 检测到 localhost:5555 已关闭")
                    updateAdbReady(false, "ADB watchdog 端口探测失败")
                    process.destroy()
                    adbWakeSignal.offer(Unit)
                }
            },
            20_000,
            20_000,
            TimeUnit.MILLISECONDS
        )

        val errorReader = Thread({
            try {
                process.errorStream.bufferedReader().useLines { lines ->
                    lines.filter { it.isNotBlank() }.forEach {
                        KanoLog.w(TAG, "track-devices: $it")
                    }
                }
            } catch (_: Exception) {
                // 服务停止时关闭进程会打断流读取，无需记录错误。
            }
        }, "AdbTrackErrorReader").apply {
            isDaemon = true
            start()
        }

        try {
            DataInputStream(BufferedInputStream(process.inputStream)).use { input ->
                while (!serviceStopping && !Thread.currentThread().isInterrupted) {
                    val lengthBytes = ByteArray(4)
                    input.readFully(lengthBytes)
                    val payloadLength = String(lengthBytes, Charsets.US_ASCII).toIntOrNull(16)
                        ?: throw IllegalStateException("无效的 track-devices 数据长度")
                    require(payloadLength in 0..64 * 1024) {
                        "异常的 track-devices 数据长度: $payloadLength"
                    }

                    val payload = ByteArray(payloadLength)
                    input.readFully(payload)
                    val snapshot = String(payload, Charsets.UTF_8)
                    val ready = snapshot.lineSequence().any { line ->
                        val columns = line.trim().split(Regex("\\s+"), limit = 2)
                        columns.size == 2 &&
                            columns[0] == "localhost:5555" &&
                            columns[1] == "device"
                    }

                    updateAdbReady(ready, "track-devices 状态变化")
                    if (ready) {
                        wasReady = true
                        scheduleAdbReadyMaintenance()
                    } else {
                        break
                    }
                }
            }
        } catch (e: InterruptedException) {
            throw e
        } catch (e: Exception) {
            if (!wasReady) throw e
            if (!serviceStopping) {
                KanoLog.d(TAG, "track-devices 连接已结束: ${e.message}")
            }
        } finally {
            watchdog.cancel(true)
            process.destroy()
            errorReader.join(200)
            if (adbTrackProcess === process) {
                adbTrackProcess = null
            }
        }

        return wasReady
    }

    private fun updateAdbReady(ready: Boolean, reason: String) {
        if (adbIsReady != ready) {
            KanoLog.d(TAG, "ADB 状态变更: $adbIsReady -> $ready ($reason)")
            adbIsReady = ready
        }
    }

    private fun scheduleAdbReadyMaintenance() {
        if (serviceStopping || isExecutedDisabledFOTA ||
            !adbMaintenanceStarted.compareAndSet(false, true)
        ) {
            return
        }

        try {
            adbMaintenanceExecutor.execute {
                try {
                    handleAdbReady()
                } catch (e: Exception) {
                    KanoLog.e(TAG, "ADB 连接后维护任务异常", e)
                } finally {
                    adbMaintenanceStarted.set(false)
                }
            }
        } catch (e: Exception) {
            adbMaintenanceStarted.set(false)
            if (!serviceStopping) {
                KanoLog.e(TAG, "提交 ADB 连接后维护任务失败", e)
            }
        }
    }

    private fun handleAdbReady() {
        if (isExecutedDisabledFOTA) return

        disableFOTATimes--
        if (disableFOTATimes <= 0) {
            KanoLog.d(TAG, "已连续3次尝试使用adb禁用FOTA，强制isExecutingDisabledFOTA = true")
            isExecutingDisabledFOTA = true
        }
        val result = KanoUtils.disableFota(applicationContext)
        if (result) {
            KanoLog.d(TAG, "使用adb禁用FOTA完成")
        }
        isExecutedDisabledFOTA = true
    }

    override fun onDestroy() {
        serviceStopping = true
        updateAdbReady(false, "ADBService 正在销毁")
        adbTrackProcess?.destroy()
        adbWakeSignal.offer(Unit)

        if (::handler.isInitialized) {
            handler.removeCallbacksAndMessages(null)
        }
        if (::handlerThread.isInitialized) {
            handlerThread.quitSafely()
        }

        adbExecutor.shutdownNow()
        adbMaintenanceExecutor.shutdownNow()
        adbWatchdogExecutor.shutdownNow()
        iperfExecutor.shutdownNow()

        if (::batteryReceiver.isInitialized) {
            unregisterReceiver(batteryReceiver)
        }
        if (adbObserverRegistered) {
            contentResolver.unregisterContentObserver(adbStateObserver)
            adbObserverRegistered = false
        }
        TaskSchedulerManager.scheduler?.stop()
        super.onDestroy()
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
