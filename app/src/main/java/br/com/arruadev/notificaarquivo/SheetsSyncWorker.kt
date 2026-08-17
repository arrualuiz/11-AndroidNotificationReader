package br.com.arruadev.notificaarquivo

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.concurrent.TimeUnit

class SheetsSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val settings = SheetsSyncSettingsStore.read(applicationContext)
        if (!settings.isConfigured()) return@withContext Result.success()

        val pending = NotificationStore.pending(applicationContext)
        if (pending.isEmpty()) return@withContext Result.success()

        SheetsSyncMetadataStore.recordAttempt(applicationContext)
        try {
            val result = SheetsSyncClient.sync(
                settings = settings,
                deviceId = DeviceInfo.id(applicationContext),
                notifications = pending
            )
            NotificationStore.markSynced(applicationContext, pending)
            SheetsSyncMetadataStore.recordSuccess(applicationContext, result)
            Result.success()
        } catch (error: SheetsSyncException) {
            handleFailure(error.message.orEmpty(), error.retryable)
        } catch (error: IllegalArgumentException) {
            handleFailure(error.message.orEmpty(), retryable = false)
        } catch (error: IOException) {
            handleFailure("Sem conexao com o Sheets.", retryable = true)
        } catch (error: Exception) {
            handleFailure(error.message ?: "Falha desconhecida.", retryable = true)
        }
    }

    private fun handleFailure(message: String, retryable: Boolean): Result {
        SheetsSyncMetadataStore.recordFailure(applicationContext, message)
        return if (retryable) Result.retry() else Result.failure()
    }
}

object SyncScheduler {
    private const val IMMEDIATE_WORK_NAME = "sheets-immediate-sync"
    private const val PERIODIC_WORK_NAME = "sheets-periodic-sync"

    private val networkConstraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun scheduleImmediate(context: Context) {
        if (!SheetsSyncSettingsStore.read(context).isConfigured()) return

        val request = OneTimeWorkRequestBuilder<SheetsSyncWorker>()
            .setConstraints(networkConstraints)
            .setInitialDelay(15, TimeUnit.SECONDS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    fun schedulePeriodic(context: Context) {
        if (!SheetsSyncSettingsStore.read(context).isConfigured()) return

        val request = PeriodicWorkRequestBuilder<SheetsSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }
}
