package com.minikano.f50_sms

import android.app.ActivityManager
import android.app.AppOpsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.MutableLiveData
import androidx.compose.runtime.livedata.observeAsState
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.utils.DeviceModelChecker
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.ShellKano
import com.minikano.f50_sms.utils.UniqueDeviceIDManager
import com.minikano.f50_sms.utils.WakeLock
import com.minikano.f50_sms.utils.getBooleanCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.system.exitProcess
import androidx.core.content.edit
import com.minikano.f50_sms.configs.AppMeta.updateIsDefaultOrWeakToken

class MainActivity : ComponentActivity() {
    companion object {
        const val REQUEST_CODE_NOTIFICATION = 114514
        const val REQUEST_CODE_SMS = 1919810
    }
    private val port = 2333
    private val PREFS_NAME = "kano_ZTE_store"
    private val PREF_GATEWAY_IP = "gateway_ip"
    private val PREF_LOGIN_TOKEN = "login_token"
    private val PREF_TOKEN_ENABLED = "login_token_enabled"
    private val PREF_AUTO_IP_ENABLED = "auto_ip_enabled"
    private val PREF_ISDEBUG = "kano_is_debug"
    private val PREF_WAKELOCK = "wakeLock"
    private val serverStatusLiveData = MutableLiveData<Boolean>()
    private val SERVER_INTENT = "com.minikano.f50_sms.SERVER_STATUS_CHANGED"
    private val UI_INTENT = "com.minikano.f50_sms.UI_STATUS_CHANGED"
    fun hasUsageAccessPermission(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            context.packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppMeta.init(this)
        UniqueDeviceIDManager.init(this)
        val context = this

        //第一次启动初始化spf
        KanoUtils.initSharedPerfs(context)

        // 这里用协程异步调用
        lifecycleScope.launch {
            UniqueDeviceIDManager.init(applicationContext)

            setContent {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    elevation = CardDefaults.cardElevation(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {

                        CircularProgressIndicator()

                        Spacer(modifier = Modifier.height(12.dp))

                        Text("加载数据中(Loading)...", fontSize = 16.sp)
                    }
                }
            }

            val isUnSupportDevice = withContext(Dispatchers.IO) { DeviceModelChecker.checkBlackList(applicationContext) }

            if (isUnSupportDevice) {
                Toast.makeText(applicationContext, "该设备不受支持,正在退出...", Toast.LENGTH_LONG).show()
                setContent {
                    Card(
                        shape = RoundedCornerShape(16.dp), // 圆角
                        elevation = CardDefaults.cardElevation(8.dp), // 阴影
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp) // 外边距
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text("Device id:${UniqueDeviceIDManager.getUUID()}", fontSize = 14.sp)
                            repeat(4) {
                                Text("不受支持的设备！！", fontSize = 20.sp)
                                Text("Unsupported device！！", fontSize = 20.sp)
                            }
                            Text("3秒后自动退出！！", fontSize = 20.sp)
                            Text("Auto exit in 3 seconds！！", fontSize = 20.sp)
                        }
                    }
                }
                delay(4600)
                exitProcess(-114514)
            } else {
                // 保持屏幕常亮
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

                requestNotificationPermissionIfNeeded()

                // 忽略电池优化权限
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                if (!powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    intent.data = Uri.parse("package:${context.packageName}")
                    context.startActivity(intent)
                }

                //用户使用量权限
                if (!hasUsageAccessPermission(context)) {
                    val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                }

                val versionName = context.packageManager.getPackageInfo(context.packageName, 0).versionName

                //每次启动时需要检测IP变动，适应用户ip网段更改
                KanoUtils.adaptIPChange(context)

                //防止服务重复启动
                if (!isServiceRunning(WebService::class.java)) {
                    startForegroundService(Intent(context, WebService::class.java))
                }
                if (!isServiceRunning(ADBService::class.java)) {
                    startForegroundService(Intent(context, ADBService::class.java))
                }

                // 注册广播
                registerReceiver(
                    serverStatusReceiver, IntentFilter(SERVER_INTENT),
                    Context.RECEIVER_EXPORTED
                )

                val sf = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                AppMeta.setIsEnableLog(context,sf.getBooleanCompat(PREF_ISDEBUG,false))

                setContent {
                    val context = this@MainActivity

                    val sharedPrefs = remember {
                        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    }

                    val isServerRunning by serverStatusLiveData.observeAsState(false)
                    var gatewayIp by remember {
                        mutableStateOf(
                            sharedPrefs.getString(
                                PREF_GATEWAY_IP,
                                "0.0.0.0:8080"
                            ) ?: "0.0.0.0:8080"
                        )
                    }

                    var loginToken by remember {
                        mutableStateOf(
                            sharedPrefs.getString(
                                PREF_LOGIN_TOKEN,
                                "admin"
                            ) ?: "admin"
                        )
                    }

                    var loginTokenInput by remember {
                        mutableStateOf(
                            ""
                        )
                    }

                    var isTokenEnabled by remember {
                        mutableStateOf(
                            sharedPrefs.getString(
                                PREF_TOKEN_ENABLED,
                                true.toString()
                            ) ?: true.toString()
                        )
                    }
                    var isAutoIpEnabled by remember {
                        mutableStateOf(
                            sharedPrefs.getString(
                                PREF_AUTO_IP_ENABLED,
                                true.toString()
                            ) ?: true.toString()
                        )
                    }

                    var isDebugLog by remember {
                        mutableStateOf(
                            sharedPrefs.getBooleanCompat(
                                PREF_ISDEBUG,
                                false
                            )
                        )
                    }

                    var wakeLock by remember {
                        mutableStateOf(
                            sharedPrefs.getString(
                                PREF_WAKELOCK,
                                "lock"
                            ) ?: "lock"
                        )
                    }

                    if (isServerRunning) {
                        ServerUI(
                            serverAddress = "http://${gatewayIp.substringBefore(":")}:$port",
                            gatewayIp,
                            versionName = versionName ?: "unknown",
                            onStopServer = {
                                sendBroadcast(Intent(UI_INTENT).putExtra("status", false))
                                serverStatusLiveData.postValue(false)

                                gatewayIp = sharedPrefs.getString(
                                            PREF_GATEWAY_IP,
                                            "0.0.0.0:8080"
                                        ) ?: "0.0.0.0:8080"

                                loginToken = sharedPrefs.getString(
                                            PREF_LOGIN_TOKEN,
                                            "admin"
                                        ) ?: "admin"

                                isTokenEnabled = sharedPrefs.getString(
                                            PREF_TOKEN_ENABLED,
                                            true.toString()
                                        ) ?: true.toString()

                                isAutoIpEnabled = sharedPrefs.getString(
                                            PREF_AUTO_IP_ENABLED,
                                            true.toString()
                                        ) ?: true.toString()

                                isDebugLog = sharedPrefs.getBooleanCompat(
                                        PREF_ISDEBUG,
                                        false)

                                wakeLock  = sharedPrefs.getString(
                                    PREF_WAKELOCK,
                                    "lock"
                                ) ?: "lock"

                                KanoLog.d("UFI_TOOLS_LOG", "user touched stop btn")
                            }
                        )
                    } else {
                        InputUI(
                            gatewayIp = gatewayIp,
                            onGatewayIpChange = { gatewayIp = it },
                            loginToken = loginTokenInput,
                            versionName = versionName ?: "unknown",
                            onLoginTokenChange = {
                                loginTokenInput = it.ifBlank {
                                    ""
                                }
                            },
                            isTokenEnabled = isTokenEnabled == true.toString(),
                            isAutoCheckIp = isAutoIpEnabled == true.toString(),
                            isDebug = isDebugLog == true,
                            isWkLock = wakeLock == "lock",
                            onTokenEnableChange = { isTokenEnabled = it.toString() },
                            onAutoCheckIpChange = {
                                isAutoIpEnabled = it.toString()
                                if (it.toString() == true.toString()) {
                                    KanoUtils.adaptIPChange(context, true) { newIp ->
                                        gatewayIp = newIp // 更新 Compose 状态变量，UI 立即更新
                                    }
                                }
                            },
                            onDebugChange = {
                                AppMeta.setIsEnableLog(sharedPrefs,it)
                                isDebugLog = it
                            },
                            onIsWkLockChange = {
                                wakeLock = if(it){
                                    "lock"
                                } else{
                                    "unlock"
                                }
                            },
                            onConfirm = {
                                // 保存并重启服务器

                                if(!loginTokenInput.isBlank()){
                                    sharedPrefs.edit(commit = true) {
                                        putString(PREF_LOGIN_TOKEN,KanoUtils.sha256Hex(loginTokenInput.ifBlank { "admin" }) )
                                        updateIsDefaultOrWeakToken(context,KanoUtils.isWeakToken(loginTokenInput.ifBlank { "admin" }))
                                    }
                                }

                                sharedPrefs.edit(commit = true) {
                                    putString(PREF_GATEWAY_IP, gatewayIp)
                                    putString(PREF_TOKEN_ENABLED, isTokenEnabled)
                                    putString(PREF_AUTO_IP_ENABLED, isAutoIpEnabled)
                                    putString(PREF_WAKELOCK, wakeLock)
                                }
                                //更新唤醒锁
                                if(wakeLock != "lock"){
                                    WakeLock.releaseWakeLock()
                                } else {
                                    WakeLock.execWakeLock(getSystemService(Context.POWER_SERVICE) as PowerManager)
                                }
                                sendBroadcast(Intent(UI_INTENT).putExtra("status", true))
                                serverStatusLiveData.postValue(true)
                                KanoLog.d("UFI_TOOLS_LOG", "user touched start btn")
                                runADB()
                            }
                        )
                    }
                }

                runADB()
            }
        }

    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
                REQUEST_CODE_NOTIFICATION
            )
        } else {
            requestSmsPermissionIfNeeded()
        }
    }

    private fun requestSmsPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_SMS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(android.Manifest.permission.READ_SMS),
                REQUEST_CODE_SMS
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == REQUEST_CODE_NOTIFICATION) {
            requestSmsPermissionIfNeeded()
        }
        if (requestCode == REQUEST_CODE_SMS) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                KanoLog.d("权限", "短信权限已授予")
            } else {
                KanoLog.d("权限", "短信权限被拒绝")
            }
        }
    }

    private fun runADB() {
        //网络adb
        //adb setprop service.adb.tcp.port 5555
        Thread {
            try {
                ShellKano.runShellCommand("/system/bin/setprop persist.service.adb.tcp.port 5555")
                ShellKano.runShellCommand("/system/bin/setprop service.adb.tcp.port 5555")
                KanoLog.d("UFI_TOOLS_LOG", "网络adb调试执行成功")
            } catch (e: Exception) {
                try {
                    ShellKano.runShellCommand("/system/bin/setprop service.adb.tcp.port 5555")
                    ShellKano.runShellCommand("/system/bin/setprop persist.service.adb.tcp.port 5555")
                    KanoLog.d("UFI_TOOLS_LOG", "网络adb调试执行成功")
                } catch (e: Exception) {
                    KanoLog.d("UFI_TOOLS_LOG", "网络adb调试出错： ${e.message}")
                }
            }
        }.start()
    }

    private val serverStatusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action
            if (action == SERVER_INTENT) {
                val isRunning = intent.getBooleanExtra("status", false) ?: false
                KanoLog.d("UFI_TOOLS_LOG", "isServerRunning is $isRunning")
                serverStatusLiveData.postValue(isRunning)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(serverStatusReceiver)
    }

    fun isServiceRunning(serviceClass: Class<*>): Boolean {
        val manager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (service in manager.getRunningServices(Int.MAX_VALUE)) {
            if (serviceClass.name == service.service.className) {
                return true
            }
        }
        return false
    }
}

@Composable
fun InputUI(
    gatewayIp: String,
    onGatewayIpChange: (String) -> Unit,
    loginToken: String,
    onLoginTokenChange: (String) -> Unit,
    onConfirm: () -> Unit,
    versionName: String,
    isTokenEnabled: Boolean,
    isAutoCheckIp: Boolean,
    isDebug:Boolean,
    isWkLock:Boolean,
    onTokenEnableChange: (Boolean) -> Unit,
    onAutoCheckIpChange: (Boolean) -> Unit,
    onDebugChange:(Boolean) -> Unit,
    onIsWkLockChange:(Boolean) -> Unit
) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Card(
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .wrapContentHeight()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // 标题
                Text(
                    text = "服务已停止\nService has stopped",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "路由器管理IP\nRouter management IP",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = gatewayIp,
                    onValueChange = onGatewayIpChange,
                    enabled = !isAutoCheckIp,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("e.g. 192.168.0.1") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "登录口令(默认admin)\nLogin Token (default: admin)",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = loginToken,
                    onValueChange = onLoginTokenChange,
                    enabled = isTokenEnabled,
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("不更改/Not Change") }
                )
                Spacer(modifier = Modifier.height(6.dp))
                // 开关组
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("自动检测IP\nAuto IP",fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = isAutoCheckIp,
                            onCheckedChange = onAutoCheckIpChange
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("登录口令\nLogin Token",fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = isTokenEnabled,
                            onCheckedChange = onTokenEnableChange
                        )
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("调试日志\nDebug logs",fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = isDebug,
                            onCheckedChange = onDebugChange
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("屏幕常亮\nWake Lock",fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = isWkLock,
                            onCheckedChange = onIsWkLockChange
                        )
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Button(
                    onClick = onConfirm,
                    modifier = Modifier
                        .fillMaxWidth(0.5f)
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("启动/Start", textAlign = TextAlign.Center)
                }
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "Created by Minikano with ❤️ ver: $versionName",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
                HyperlinkText(
                    "View source code on Github(Minikano)",
                    "Github(Minikano)",
                    fontSize = 12.sp,
                    "https://github.com/kanoqwq/F50-SMS"
                )
            }
        }
    }
}

@Composable
fun ServerUI(
    serverAddress: String,
    gatewayIP: String,
    onStopServer: () -> Unit,
    versionName: String
) {
    Surface(modifier = Modifier.fillMaxSize()) {
        Card(
            shape = RoundedCornerShape(16.dp), // 圆角
            elevation = CardDefaults.cardElevation(8.dp), // 阴影
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp) // 外边距
                .wrapContentHeight()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "服务运行中\nServer is running",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(10.dp))
                HyperlinkText(
                    "前端地址/Link: $serverAddress",
                    serverAddress,
                    fontSize = 16.sp,
                    url = serverAddress
                )
                Spacer(modifier = Modifier.height(16.dp))
                HyperlinkText(
                    "网关地址/Gateway: $gatewayIP",
                    gatewayIP,
                    fontSize = 16.sp,
                    url = "http://$gatewayIP"
                )
                Spacer(modifier = Modifier.height(20.dp))
                Text("点击停止服务更改网关和口令密码(默认admin)\nClick to stop the service and change the gateway and password (default: admin)",
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(20.dp))
                Button(onClick = onStopServer) {
                    Text("停止服务/Stop Server")
                }
                Spacer(modifier = Modifier.height(32.dp))
                Text("Created by Minikano with ❤️ ver: ${versionName}", fontSize = 12.sp)
                Spacer(modifier = Modifier.height(10.dp))
                HyperlinkText(
                    "View source code on Github(Minikano)",
                    "Github(Minikano)",
                    fontSize = 12.sp,
                    "https://github.com/kanoqwq/F50-SMS"
                )
            }
        }
    }
}

@Composable
fun HyperlinkText(
    fullText: String,
    linkText: String,
    fontSize: TextUnit,
    url: String,
) {
    val context = LocalContext.current
    val annotatedText = buildAnnotatedString {
        // 整段默认字体大小
        withStyle(style = SpanStyle(fontSize = fontSize)) {
            append(fullText)
        }

        val startIndex = fullText.indexOf(linkText)
        val endIndex = startIndex + linkText.length

        if (startIndex >= 0) {
            // 链接部分样式（覆盖字体大小、颜色、下划线）
            addStyle(
                style = SpanStyle(
                    color = Color(0xFF1E88E5),
                    textDecoration = TextDecoration.Underline,
                    fontSize = fontSize
                ),
                start = startIndex,
                end = endIndex,
            )

            addStringAnnotation(
                tag = "URL",
                annotation = url,
                start = startIndex,
                end = endIndex
            )
        }
    }

    ClickableText(
        text = annotatedText,
        style = TextStyle(fontSize = fontSize), // 控制整体字体大小
        onClick = { offset ->
            annotatedText.getStringAnnotations("URL", offset, offset)
                .firstOrNull()?.let {
                    try {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it.item)))
                    } catch (e: Exception) {
                        Toast.makeText(context, "打开链接失败", Toast.LENGTH_SHORT).show()
                    }
                }
        }
    )
}