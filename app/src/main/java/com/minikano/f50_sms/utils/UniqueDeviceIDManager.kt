package com.minikano.f50_sms.utils

import android.annotation.SuppressLint
import android.util.Log
import java.io.File
import java.util.UUID
import androidx.core.content.edit
import android.provider.Settings
import android.content.Context
import com.minikano.f50_sms.utils.KanoUtils.Companion.sendShellCmd
import java.security.MessageDigest

object UniqueDeviceIDManager {

    private var cachedUUID: String? = null
    private lateinit var uuidFile: File
    private var initialized = false
    private val PREFS_NAME = "kano_ZTE_store"

    /**
     * 必须先调用此方法初始化，传入 Context，
     * 初始化后才能调用 getUUID()
     */
    fun init(context: Context) {
        if (initialized) return
        uuidFile = File(File(context.filesDir, "userid"), "id")
        cachedUUID = loadOrCreateUUID(context)
        initialized = true
    }

    /**
     * 获取UUID，必须先调用 init() 完成初始化，否则会抛异常
     */
    fun getUUID(): String? {
        check(initialized) { "UniqueDeviceIDManager must be initialized first by calling init(context)" }
        return cachedUUID
    }

    @SuppressLint("HardwareIds")
    fun getAndroidId(context: Context): String? {
        return Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        )
    }

    fun getSprdUID(): String? {
        try {
            val cmd = "cat /sys/class/misc/sprd_uid/uid"
            val result = sendShellCmd(cmd)
            if (!result.done) throw Exception(result.content)
            val uid = result.content
            if(uid.isEmpty()) {
                return null
            }
            return uid
        } catch (e: Exception) {
            Log.e("UFI_TOOLS_LOG", "获取sprd_uid失败：", e)
            return null
        }
    }

    fun uuidTo16(uuid: String): String {
        val bytes = MessageDigest.getInstance("SHA-256")
            .digest(uuid.toByteArray())

        return bytes.take(8).joinToString("") {
            "%02x".format(it)
        }
    }

    private fun loadOrCreateUUID(context: Context): String? {
        return try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val storedUUID = prefs.getString("device_uuid", null)
            if (!storedUUID.isNullOrEmpty()) {
                return storedUUID
            }

            var newUUID = getSprdUID()

            if(newUUID == null){
                newUUID = getAndroidId(context)
            }

            if(newUUID == null){
                newUUID = uuidTo16(UUID.randomUUID().toString())
            }

            prefs.edit(commit = true) { putString("device_uuid", newUUID) }
            newUUID
        } catch (e: Exception) {
            Log.e("UFI_TOOLS_LOG", "设备唯一标识符读取失败", e)
            null
        }
    }
}