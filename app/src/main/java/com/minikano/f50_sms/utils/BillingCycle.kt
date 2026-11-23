package com.minikano.f50_sms.utils

import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

/** A cycle includes its start and excludes the next settlement day's midnight. */
data class BillingCycle(
    val start: LocalDate,
    val endExclusive: LocalDate,
    val zone: ZoneId,
) {
    val startMillis: Long get() = start.atStartOfDay(zone).toInstant().toEpochMilli()
    val endMillis: Long get() = endExclusive.atStartOfDay(zone).toInstant().toEpochMilli()

    companion object {
        fun current(
            settlementDay: Int,
            nowMillis: Long = System.currentTimeMillis(),
            zone: ZoneId = ZoneId.systemDefault(),
        ): BillingCycle {
            require(settlementDay in 1..31) { "Settlement day must be between 1 and 31" }
            val today = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()
            fun settlementDate(month: YearMonth): LocalDate =
                month.atDay(minOf(settlementDay, month.lengthOfMonth()))

            var startMonth = YearMonth.from(today)
            if (today < settlementDate(startMonth)) startMonth = startMonth.minusMonths(1)
            return BillingCycle(
                settlementDate(startMonth),
                settlementDate(startMonth.plusMonths(1)),
                zone,
            )
        }
    }
}
