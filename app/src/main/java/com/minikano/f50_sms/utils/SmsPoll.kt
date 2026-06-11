package com.minikano.f50_sms.utils

import android.content.Context
import android.net.Uri
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.utils.KanoUtils.Companion.buildStatusSmsMsg
import com.minikano.f50_sms.utils.KanoUtils.Companion.sendShellCmd
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class SmsInfo(val address: String, val body: String, val timestamp: Long)

object SmsPoll {
    private var lastSms: SmsInfo? = null

    //store
    private val PREFS_NAME = "kano_ZTE_store"
    private val TAG = "UFI_TOOLS_LOG_SmsPool"

    fun checkNewSmsAndSend(context: Context) {
        val sms = getLatestSms(context) ?: return

        val now = System.currentTimeMillis()
        val minute = 2
        val withinMin = now - sms.timestamp <= minute * 60 * 1000
        val isNew = lastSms == null || sms != lastSms

        if (withinMin && isNew) {
            KanoLog.d(TAG, "收到新短信: ${sms.address} - ${sms.body}")
            lastSms = sms

            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            // 转发预处理
            val keywords = sharedPrefs.getString("kano_sms_forward_blacklist_keywords", "") ?: ""
            val phone = sharedPrefs.getString("kano_sms_forward_blacklist_phone", "") ?: ""

            val phoneList = phone
                .split('\n')
                .map { it.trim() }
                .filter { it.isNotEmpty() }

            if (phoneList.contains(sms.address)) {
                KanoLog.d(TAG, "源手机号 ${sms.address} 在手机号黑名单内，不执行短信转发操作")
                return
            }

            val keywordsList = keywords
                .split('\n')
                .map { it.trim() }
                .filter { it.isNotEmpty() }

            for (item in keywordsList) {
                if (sms.body.contains(item)) {
                    KanoLog.d(TAG, "短信内容命中关键词 [$item]，不执行短信转发")
                    return
                }
            }

            val sms_forward_method = sharedPrefs.getString("kano_sms_forward_method", "") ?: ""
            when (sms_forward_method) {
                "SMTP" -> {
                    forwardByEmail(lastSms, context)
                }
                "CURL" -> {
                    forwardSmsByCurl(lastSms, context)
                }
                "DINGTALK" -> {
                    forwardSmsByDingTalk(lastSms, context)
                }
            }
        } else {
            KanoLog.d(
                TAG,
                "无新短信，短信是否${minute}分钟内：$withinMin,短信是否为新：$isNew"
            )
        }
    }

    //通过curl转发
    fun forwardSmsByCurl(sms_data: SmsInfo?, context: Context) {
        if (sms_data == null) return
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val originalCurl = sharedPrefs.getString("kano_sms_curl", null)
        if (originalCurl.isNullOrEmpty()) {
            KanoLog.e(TAG, "curl 配置错误：kano_sms_curl 为空")
            return
        }

        KanoLog.d(TAG, "开始转发短信...（CURL）")
        try {
            val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                .withZone(ZoneId.systemDefault())
            val smsText = JSONObject.quote(sms_data.body.trim()).removeSurrounding("\"")
            val smsFrom = sms_data.address
            val smsTime = formatter.format(Instant.ofEpochMilli(sms_data.timestamp))

            //替换并发送
            var replacedCurl = originalCurl
                .replace("{{sms-body}}", smsText)
                .replace("{{sms-time}}", smsTime)
                .replace("{{sms-from}}", smsFrom).trimIndent()

            //寻找可替换的其他占位符
            replacedCurl = buildStatusSmsMsg(replacedCurl,context, TAG)

            KanoCURL(context).send(replacedCurl)
        } catch (e: Exception){
            KanoLog.e(TAG,"短信转发(forwardSmsByCurl)出错：",e)
        }
    }

    //通过SMTP邮件转发
    fun forwardByEmail(sms_data: SmsInfo?, context: Context,notSMS: Boolean = false) {
        if (sms_data == null) return
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val smtpHost = sharedPrefs.getString("kano_smtp_host", null)
        if (smtpHost.isNullOrEmpty()) {
            KanoLog.e(TAG, "SMTP 配置错误：kano_smtp_host 为空")
            return
        }

        val smtpTo = sharedPrefs.getString("kano_smtp_to", null)
        if (smtpTo.isNullOrEmpty()) {
            KanoLog.e(TAG, "SMTP 配置错误：kano_smtp_to 为空")
            return
        }

        val smtpPort = sharedPrefs.getString("kano_smtp_port", null)
        if (smtpPort.isNullOrEmpty()) {
            KanoLog.e(TAG, "SMTP 配置错误：kano_smtp_port 为空")
            return
        }

        val username = sharedPrefs.getString("kano_smtp_username", null)
        if (username.isNullOrEmpty()) {
            KanoLog.e(TAG, "SMTP 配置错误：kano_smtp_username 为空")
            return
        }

        val password = sharedPrefs.getString("kano_smtp_password", null)
        if (password.isNullOrEmpty()) {
            KanoLog.e(TAG, "SMTP 配置错误：kano_smtp_password 为空")
            return
        }

        val smtpClient = KanoSMTP(smtpHost, smtpPort, username, password)

        KanoLog.d(TAG, "开始转发短信...(SMTP)")

        val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.systemDefault())
        val previewText = sms_data.body.trimStart().let {
            if (it.length > 37) it.take(37) + "…" else it
        }
        val shouldForwardDeviceInfo = sharedPrefs.getString("kano_smtp_forward_device_info","0")?: "0"
        var statusText = ""
        if(shouldForwardDeviceInfo == "1") {
            statusText = buildStatusSmsMsg(
            """
            <p><b>🌐 当日用量: </b>{{daily-flow}}</p>
            <p><b>🌛 月用量(高级后台统计): </b>{{monthly-flow-count}}  </p>
            <p><b>🌛 月用量(官方后台统计): </b>{{monthly-flow-sum}}</p>
            <p><b>🔥 CPU温度: </b>{{cpu-temp}}</p>
            <p><b>🖥️ CPU占用: </b>{{cpu-usage}}</p>
            <p><b>🧠 内存占用: </b>{{mem-usage}}</p>
            <p><b>🔋 电池信息: </b>{{battery-level}} {{battery-current}} {{battery-voltage}}</p>
            <p><b>⏱️ 开机时长: </b>{{boot-time}}</p>
            <p><b>📱 设备名称: </b>{{model}}({{nickname}})</p>
            <p><b>📦 APP版本: </b>{{app-ver}}</p>
            """.trimIndent(), context, TAG
            )
        }
        var body =
        """
        <div>
            <p>${sms_data!!.body.trimStart()}</p>
            <p>📩 <b>来自：</b>${sms_data.address}</p>
            <p>⏰ <b>时间：</b>${formatter.format(Instant.ofEpochMilli(sms_data.timestamp))}</p>
            <hr/>
            $statusText
            <div style="text-align: center;">
                <i>Powered by <a href="https://github.com/kanoqwq/UFI-TOOLS" target="_blank">UFI-TOOLS</a></i>
            </div>
        </div>
        """.trimIndent()
        if(notSMS){
            body =
            """
            <div>
                $statusText
                <div style="text-align: center;">
                    <i>Powered by <a href="https://github.com/kanoqwq/UFI-TOOLS" target="_blank">UFI-TOOLS</a></i>
                </div>
            </div>
            """.trimIndent()
        }
        smtpClient.sendEmail(
            to = smtpTo,
            subject = previewText,
            body = body
        )
    }

    //通过钉钉webhook转发
    fun forwardSmsByDingTalk(sms_data: SmsInfo?, context: Context,notSMS: Boolean = false) {
        if (sms_data == null) return
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val webhookUrl = sharedPrefs.getString("kano_dingtalk_webhook", null)
        if (webhookUrl.isNullOrEmpty()) {
            KanoLog.e(TAG, "钉钉配置错误：kano_dingtalk_webhook 为空")
            return
        }

        val secret = sharedPrefs.getString("kano_dingtalk_secret", null)

        KanoLog.d(TAG, "开始转发短信...（钉钉）")
        val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.systemDefault())
        val smsText = JSONObject.quote(sms_data.body.trim()).removeSurrounding("\"")
        val smsFrom = sms_data.address
        val smsTime = formatter.format(Instant.ofEpochMilli(sms_data.timestamp))

        val shouldForwardDeviceInfo = sharedPrefs.getString("kano_dingtalk_forward_device_info","0")?: "0"
        var statusText = ""
        if(shouldForwardDeviceInfo == "1"){
            statusText = buildStatusSmsMsg(
            """
            🌐 当日用量: {{daily-flow}}    
            🌛 月用量(高级后台统计): {{monthly-flow-count}}    
            🌛 月用量(官方后台统计): {{monthly-flow-sum}}    
            🔥 CPU温度: {{cpu-temp}}
            🖥️ CPU使用: {{cpu-usage}}
            🧠 内存使用: {{mem-usage}}
            🔋 电池信息: {{battery-level}} {{battery-current}} {{battery-voltage}}
            ⏱️ 开机时长: {{boot-time}}
            📱 设备名称: {{model}}({{nickname}})
            📦 APP版本: {{app-ver}}
            """.trimIndent(),context, TAG)
        }
        var smsTypeString =
        """
        📱 新短信通知
            
        📄 内容：$smsText
        📞 来自：$smsFrom
        ⏰ 时间：$smsTime
        """.trimIndent()
        if(notSMS){
            smsTypeString = "📱 设备信息\n"
        }
        // 构建钉钉消息内容
        val messageContent = listOf(
            smsTypeString,
            statusText,
            "\nPowered by UFI-TOOLS"
        ).filter { it.isNotBlank() }
            .joinToString("\n")
        val dingTalkClient = KanoDingTalk(webhookUrl, secret)
        dingTalkClient.sendMessage(messageContent)
    }

    private val SMS_INBOX_URI: Uri = Uri.parse("content://sms/inbox")
        .buildUpon()
        .appendQueryParameter("limit", "1")
        .build()

    private var lastSmsId: Long = -1L

    fun getLatestSms(context: Context): SmsInfo? {
        return try {
            val resolver = context.contentResolver

            val latestId = resolver.query(
                SMS_INBOX_URI,
                arrayOf("_id"),
                null,
                null,
                "date DESC"
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    cursor.getLong(cursor.getColumnIndexOrThrow("_id"))
                } else null
            } ?: return null

            if (latestId == lastSmsId) return null

            resolver.query(
                Uri.parse("content://sms/inbox"),
                arrayOf("address", "body", "date"),
                "_id=?",
                arrayOf(latestId.toString()),
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    lastSmsId = latestId

                    SmsInfo(
                        address = cursor.getString(cursor.getColumnIndexOrThrow("address")),
                        body = cursor.getString(cursor.getColumnIndexOrThrow("body")),
                        timestamp = cursor.getLong(cursor.getColumnIndexOrThrow("date"))
                    )
                } else null
            }
        } catch (e: Exception) {
            KanoLog.e(TAG, "读取最新短信失败", e)
            null
        }
    }
}