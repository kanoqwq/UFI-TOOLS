package com.minikano.f50_sms.utils
import java.util.*
import javax.mail.*
import javax.mail.internet.InternetAddress
import javax.mail.internet.MimeMessage
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

class KanoSMTP(
    private val smtpHost: String,
    private val smtpPort: String,
    private val username: String,
    private val password: String,
) {
    companion object {
        // 单线程串行发送：限制并发（最多1线程，空闲30秒后回收），排队而非丢弃。
        // 必须跨实例共享——调用方每次转发都会 new 一个 KanoSMTP
        private val sender = ThreadPoolExecutor(0, 1, 30L, TimeUnit.SECONDS, LinkedBlockingQueue())
    }

    fun sendEmail(to: String, subject: String, body: String,isHTML:Boolean=true) {
        sender.execute {
            try {
                val props = Properties()
                props["mail.smtp.auth"] = "true"
                props["mail.smtp.host"] = smtpHost
                props["mail.smtp.port"] = smtpPort
                // JavaMail 默认超时为无限，目标不可达时发送线程会永久挂起并逐渐堆积
                props["mail.smtp.connectiontimeout"] = "10000"
                props["mail.smtp.timeout"] = "15000"
                props["mail.smtp.writetimeout"] = "15000"

                if (smtpPort == "465") {
                    props["mail.smtp.ssl.enable"] = "true"
                    props["mail.smtp.socketFactory.class"] = "javax.net.ssl.SSLSocketFactory"
                } else {
                    props["mail.smtp.starttls.enable"] = "true"
                }

                val session = Session.getInstance(props, object : Authenticator() {
                    override fun getPasswordAuthentication(): PasswordAuthentication {
                        return PasswordAuthentication(username, password)
                    }
                })


                val message = MimeMessage(session).apply {
                    setFrom(InternetAddress(username))
                    setRecipients(Message.RecipientType.TO, InternetAddress.parse(to))
                    setSubject(subject)
                    if(isHTML) {
                        setContent(body,"text/html; charset=utf-8")
                    }
                    else {
                        setText(body)
                    }
                }

                KanoLog.d("UFI_TOOLS_LOG", "开始发送邮件...")
                Transport.send(message)
                KanoLog.d("UFI_TOOLS_LOG", "$username 邮件发送成功")

            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG", "$username 邮件发送失败: ${e.message}", e)
            }
        }
    }
}
