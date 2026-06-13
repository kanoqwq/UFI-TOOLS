package com.minikano.f50_sms.utils

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

object PassHash {

    private val rng = SecureRandom()

    /** 生成随机盐 */
    fun generateSalt(bytes: Int = 16): ByteArray {
        require(bytes >= 16) { "salt bytes should be >= 16" }
        val salt = ByteArray(bytes)
        rng.nextBytes(salt)
        return salt
    }

    /**
     * 自定义盐 + 多轮 SHA-256
     * 输出格式：sha256$rounds$<saltB64>$<hashB64>
     */
    fun hash(password: CharArray, salt: ByteArray, rounds: Int = 120_000): String {
        require(rounds >= 10_000) { "rounds too low" }

        val md = MessageDigest.getInstance("SHA-256")

        // 初始：salt || password
        var data = salt + password.concatToString().toByteArray(Charsets.UTF_8)
        var digest = md.digest(data)

        repeat(rounds - 1) {
            // 迭代：digest || salt
            md.reset()
            digest = md.digest(digest + salt)
        }

        java.util.Arrays.fill(data, 0)
        java.util.Arrays.fill(password, '\u0000')

        val saltB64 = Base64.getEncoder().encodeToString(salt)
        val hashB64 = Base64.getEncoder().encodeToString(digest)
        return "sha256\$$rounds\$$saltB64\$$hashB64"
    }

    /** 校验密码（常量时间比较） */
    fun verify(password: CharArray, stored: String): Boolean {
        val parts = stored.split('$')
        if (parts.size != 4) return false
        val algo = parts[0]
        if (algo != "sha256") return false

        val rounds = parts[1].toIntOrNull() ?: return false
        val salt = runCatching { Base64.getDecoder().decode(parts[2]) }.getOrNull() ?: return false
        val expected = runCatching { Base64.getDecoder().decode(parts[3]) }.getOrNull() ?: return false

        val actualStr = hash(password, salt, rounds)
        val actualB64 = actualStr.split('$')[3]
        val actual = Base64.getDecoder().decode(actualB64)

        return constantTimeEquals(actual, expected)
    }

    private fun constantTimeEquals(a: ByteArray, b: ByteArray): Boolean {
        if (a.size != b.size) return false
        var diff = 0
        for (i in a.indices) diff = diff or (a[i].toInt() xor b[i].toInt())
        return diff == 0
    }
}