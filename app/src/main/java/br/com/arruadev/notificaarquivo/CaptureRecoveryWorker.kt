package br.com.arruadev.notificaarquivo

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.delay
import java.util.concurrent.TimeUnit

class CaptureRecoveryWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val accessGranted = NotificationManagerCompat
            .getEnabledListenerPackages(applicationContext)
            .contains(applicationContext.packageName)
        if (!accessGranted) {
            val message = "Acesso a notificacoes nao concedido."
            CaptureHealthStore.recordReconnectFailure(applicationContext, message)
            DiagnosticLogStore.warn(applicationContext, "CaptureRecovery", message)
            return Result.success()
        }
        if (NotificationCaptureService.isConnected()) return Result.success()

        val requested = NotificationCaptureService.requestReconnect(
            applicationContext,
            "verificacao automatica"
        )
        if (!requested) return Result.success()

        delay(RECONNECT_TIMEOUT_MS)
        return if (NotificationCaptureService.isConnected()) {
            DiagnosticLogStore.info(
                applicationContext,
                "CaptureRecovery",
                "Reconexao automatica confirmada."
            )
            Result.success()
        } else {
            val message = "Sem resposta do Android apos a tentativa automatica."
            CaptureHealthStore.recordReconnectFailure(applicationContext, message)
            DiagnosticLogStore.warn(applicationContext, "CaptureRecovery", message)
            Result.success()
        }
    }

    private companion object {
        const val RECONNECT_TIMEOUT_MS = 8_000L
    }
}

object CaptureRecoveryScheduler {
    private const val IMMEDIATE_WORK_NAME = "capture-recovery-immediate"
    private const val PERIODIC_WORK_NAME = "capture-recovery-periodic"

    fun scheduleImmediate(context: Context) {
        val request = OneTimeWorkRequestBuilder<CaptureRecoveryWorker>().build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<CaptureRecoveryWorker>(15, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }
}
