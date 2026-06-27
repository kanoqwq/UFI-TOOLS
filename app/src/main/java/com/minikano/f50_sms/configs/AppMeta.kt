package com.minikano.f50_sms.configs

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import com.minikano.f50_sms.modules.PREFS_NAME
import com.minikano.f50_sms.utils.DeviceModelChecker
import android.os.PowerManager
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.getBooleanCompat
import java.io.File
import androidx.core.content.edit
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.KanoUtils.Companion.isSha256Hex
import com.minikano.f50_sms.utils.WakeLock

object AppMeta {
    var versionName: String = "unknown"
        private set

    var versionCode: Int = 0
        private set
    var model: String = Build.MODEL
        private set

    var nickName: String = Build.MODEL
        private set

    var isDeviceRooted:Boolean = false
        private set

    var isReadUseTerms:Boolean = false

    var isEnableLog:Boolean = false
        private set

    var isEnableWakeLock:Boolean = false
        private set

    var GLOBAL_SERVER_URL = "https://pan.kanokano.cn"
        private set

    var isDefaultOrWeakToken = false
        private set

    var isDataFlowLimitEnabled = false
        private set

    var dataFlowCheckRef = "default"
        private set
    var dataFlowMaxValue = -1L

    var webServerCookie = ""
        private set

    var isReachedDataFlowLimit = false

    var dataFlowCheckDailyOrMonthly = "monthly"
    private const val PREFS_NAME = "kano_ZTE_store"
    private const val GLOBAL_SERVER_URL_KEY = "GLOBAL_SERVER_URL"
    private val PREF_ISDEBUG = "kano_is_debug"
    private val PREF_WAKELOCK = "wakeLock"
    private val PREF_NICKNAME = "nickname"
    private val PREF_IS_WEAK_TOKEN = "is_weak_token"
    private val PREF_IS_DATA_FLOW_LIMIT_ENABLED = "kano_data_flow_limit_enabled"
    private val PREF_DATA_FLOW_MAX_LIMIT = "kano_data_flow_max_limit"
    private val PREF_DATA_FLOW_CHECK_DAILY_OR_MONTHLY = "kano_data_flow_check_daily_or_monthly"
    private val PREF_DATA_CHECK_REFERENCE = "kano_data_check_reference"

    fun setWebServerCookie(ck: String): Boolean {
        if(ck.isBlank()) return false
        webServerCookie = ck.trim()
        return  true
    }

    fun setDataFlowCheckDailyOrMonthly(context: Context,value: String = "monthly"){
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        //持久化
        sharedPrefs.edit(commit = true) {
            putString(PREF_DATA_FLOW_CHECK_DAILY_OR_MONTHLY,value)
        }
        dataFlowCheckDailyOrMonthly = value
    }

    fun setDataFlowCheckRef(context: Context,value: String = "default"){
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        //持久化
        sharedPrefs.edit(commit = true) {
            putString(PREF_DATA_CHECK_REFERENCE,value)
        }
        dataFlowCheckRef = value
    }

    fun setIsDataFlowLimitEnabled(context: Context,value: Boolean){
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        //持久化
        sharedPrefs.edit(commit = true) {
            putString(PREF_IS_DATA_FLOW_LIMIT_ENABLED,if(value) "1" else "0")
        }
        if(!value){
            isReachedDataFlowLimit = false
        }
        isDataFlowLimitEnabled = value
    }

    fun setDataFlowMaxValue(context: Context,value: Long) {
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        //持久化
        sharedPrefs.edit(commit = true) {
            putLong(PREF_DATA_FLOW_MAX_LIMIT,value)
        }
        dataFlowMaxValue = value
    }

    fun updateIsDefaultOrWeakToken(context: Context,value: Boolean) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        //持久化
        prefs.edit(commit = true) {
            putBoolean(PREF_IS_WEAK_TOKEN,value)
        }
        isDefaultOrWeakToken = value
    }

    fun setGlobalServerUrl(context: Context,url: String) {
        if(url.isEmpty() || url.isBlank()) throw Exception("url is empty")
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit(commit = true) { putString(GLOBAL_SERVER_URL_KEY, url) }
        GLOBAL_SERVER_URL = url
    }

    fun setIsEnableLog(context: Context,flag: Boolean) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit(commit = true) { putBoolean(PREF_ISDEBUG, flag)}
        isEnableLog = flag
    }

    fun setIsEnableLog(prefs: SharedPreferences, flag: Boolean) {
        prefs.edit(commit = true) { putBoolean(PREF_ISDEBUG, flag) }
        isEnableLog = flag
    }

    fun setIsEnableWakeLock(context: Context,flag: Boolean) {
        val isLock = if(flag) "lock" else "unlock"
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit(commit = true) { putString(PREF_WAKELOCK, isLock)}
        isEnableWakeLock = flag
        //更新唤醒锁
        if (isEnableWakeLock) {
            WakeLock.execWakeLock(context.getSystemService(Context.POWER_SERVICE) as PowerManager)
        } else {
            WakeLock.releaseWakeLock()
        }
    }

    fun setNickName (prefs: SharedPreferences, nickname: String) {
        if(nickname.isEmpty()){
            nickName = Build.MODEL

        } else {
            nickName = nickname
        }
        prefs.edit(commit = true) { putString(PREF_NICKNAME, nickName) }
    }

    fun init(context: Context) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            val isWeak = prefs.getBoolean(PREF_IS_WEAK_TOKEN, false)
            updateIsDefaultOrWeakToken(context,isWeak)

            //预处理口令
            KanoUtils.transformLoginToken(context, prefs)

            val globalServerAddress = prefs.getString(GLOBAL_SERVER_URL_KEY, null)
            if (globalServerAddress != null) {
                GLOBAL_SERVER_URL = globalServerAddress
            }

            val pkgInfo = context.applicationContext.packageManager.getPackageInfo(context.packageName, 0)
            versionName = pkgInfo.versionName.toString()

            @Suppress("DEPRECATION")
            versionCode = pkgInfo.versionCode
            model = if (Build.MODEL.contains("MU5352")) "U30 Lite" else Build.MODEL

            val socketPath = File(context.filesDir, "kano_root_shell.sock")
            isDeviceRooted = socketPath.exists()

            isReadUseTerms = prefs.getString("isReadUseTerms", "false").toBoolean()

            isEnableLog = prefs.getBooleanCompat(PREF_ISDEBUG, false)

            nickName = prefs.getString("nickname",Build.MODEL) ?: Build.MODEL

            dataFlowCheckRef = prefs.getString(PREF_DATA_CHECK_REFERENCE,"default") ?: "default"
            isDataFlowLimitEnabled = (prefs.getString(PREF_IS_DATA_FLOW_LIMIT_ENABLED,"0") ?: "0") != "0"
            dataFlowCheckDailyOrMonthly = prefs.getString(PREF_DATA_FLOW_CHECK_DAILY_OR_MONTHLY,"monthly") ?: "monthly"
            dataFlowMaxValue = prefs.getLong(PREF_DATA_FLOW_MAX_LIMIT,-1)
        } catch (e: Exception) {
            KanoLog.e("UFI_TOOLS_LOG","AppMeta init failed！！",e)
        }
    }
}