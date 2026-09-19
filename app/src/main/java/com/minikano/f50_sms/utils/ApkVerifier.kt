package com.minikano.f50_sms.utils

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import java.io.File
import java.security.MessageDigest

/**
 * 安装前校验 APK。
 *
 * 之前 /api/download_apk 接受任意 URL，/api/install_apk 直接用 root 执行
 * `pm install -r -g`（-g 会自动授予清单里的全部权限）。中间没有任何校验，
 * 意味着只要能调到这两个接口，就能往设备里装任意带全权限的应用。
 *
 * 这里做两件事：
 *  1. 包名必须和当前应用一致 —— 升级通道只能用来升级自己；
 *  2. 签名证书必须和当前已安装版本一致 —— 只有同一个作者签的包才放行。
 *
 * 不依赖服务器下发哈希，所以更新服务器被攻破也无法投毒。
 */
object ApkVerifier {

    private const val TAG = "UFI_TOOLS_LOG_ApkVerifier"

    data class Result(val ok: Boolean, val reason: String)

    fun verify(context: Context, apkPath: String): Result {
        val file = File(apkPath)
        if (!file.exists() || !file.isFile || file.length() <= 0L) {
            return Result(false, "APK 文件不存在或为空")
        }

        val pm = context.packageManager

        val archive = try {
            pm.getPackageArchiveInfo(apkPath, signatureFlag())
        } catch (e: Exception) {
            KanoLog.e(TAG, "解析 APK 失败", e)
            null
        } ?: return Result(false, "无法解析该 APK（文件损坏或不是有效的 APK）")

        if (archive.packageName != context.packageName) {
            return Result(
                false,
                "包名不匹配：期望 ${context.packageName}，实际 ${archive.packageName}。" +
                    "升级通道只能用于升级 UFI-TOOLS 本身。"
            )
        }

        val installed = try {
            pm.getPackageInfo(context.packageName, signatureFlag())
        } catch (e: Exception) {
            KanoLog.e(TAG, "读取已安装包签名失败", e)
            null
        } ?: return Result(false, "无法读取当前已安装版本的签名")

        val downloadedDigests = signatureDigests(archive)
        val installedDigests = signatureDigests(installed)

        if (downloadedDigests.isEmpty() || installedDigests.isEmpty()) {
            return Result(false, "无法读取签名信息")
        }

        // 只要有一个证书对得上就算同一签名者（兼容签名轮转后的多证书情况）
        if (downloadedDigests.intersect(installedDigests).isEmpty()) {
            KanoLog.w(TAG, "签名不匹配 downloaded=$downloadedDigests installed=$installedDigests")
            return Result(false, "APK 签名与当前安装版本不一致，已拒绝安装")
        }

        return Result(true, "校验通过")
    }

    private fun signatureFlag(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }

    private fun signatureDigests(info: PackageInfo): Set<String> {
        val signatures: Array<Signature>? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val signing = info.signingInfo
                when {
                    signing == null -> null
                    signing.hasMultipleSigners() -> signing.apkContentsSigners
                    else -> signing.signingCertificateHistory
                }
            } else {
                @Suppress("DEPRECATION")
                info.signatures
            }

        return signatures.orEmpty().mapNotNull { sig ->
            runCatching {
                MessageDigest.getInstance("SHA-256")
                    .digest(sig.toByteArray())
                    .joinToString("") { "%02x".format(it) }
            }.getOrNull()
        }.toSet()
    }
}
