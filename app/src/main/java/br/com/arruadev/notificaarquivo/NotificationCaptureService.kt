package br.com.arruadev.notificaarquivo

import android.app.Notification
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

class NotificationCaptureService : NotificationListenerService() {
    data class ReconcileResult(
        val activeCount: Int,
        val removedCount: Int,
        val error: String? = null
    )

    companion object {
        @Volatile
        private var connectedInstance: NotificationCaptureService? = null

        @Volatile
        private var lastReconnectRequestAt: Long = 0

        fun reconcileNow(): ReconcileResult? =
            connectedInstance?.reconcileWithActiveNotifications()

        fun requestReconnect(
            context: Context,
            reason: String = "solicitacao manual",
            force: Boolean = false
        ): Boolean {
            val appContext = context.applicationContext
            val accessGranted = NotificationManagerCompat.getEnabledListenerPackages(appContext)
                .contains(appContext.packageName)
            if (!accessGranted) {
                val message = "Reconexao cancelada: acesso a notificacoes nao concedido."
                CaptureHealthStore.recordReconnectFailure(appContext, message)
                DiagnosticLogStore.warn(appContext, "CaptureService", message)
                return false
            }

            val now = System.currentTimeMillis()
            if (!force && now - lastReconnectRequestAt < RECONNECT_DEBOUNCE_MS) {
                return true
            }
            lastReconnectRequestAt = now

            CaptureHealthStore.recordReconnectAttempt(appContext)
            DiagnosticLogStore.info(appContext, "CaptureService", "Rebind solicitado: $reason")
            return runCatching {
                requestRebind(ComponentName(appContext, NotificationCaptureService::class.java))
                true
            }.getOrElse { error ->
                val message = "Falha ao solicitar rebind."
                CaptureHealthStore.recordReconnectFailure(appContext, message)
                DiagnosticLogStore.error(appContext, "CaptureService", message, error)
                false
            }
        }

        fun isConnected(): Boolean = connectedInstance != null

        fun dismissNow(notification: CapturedNotification): Boolean {
            val service = connectedInstance ?: return false
            service.cancelNotification(notification.sourceKey)
            NotificationStore.remove(service.applicationContext, notification.id)
            return true
        }

        private const val RECONNECT_DEBOUNCE_MS = 3_000L
        private const val INITIAL_RECONCILIATION_DELAY_MS = 750L
    }

    private var receiverRegistered = false
    private val mainHandler = Handler(Looper.getMainLooper())

    private val commandsReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                NotificationCommands.ACTION_DISMISS -> dismissNotification(intent)
                NotificationCommands.ACTION_RECONCILE -> reconcileWithActiveNotifications()
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        DiagnosticLogStore.info(applicationContext, "CaptureService", "Servico criado.")
        ContextCompat.registerReceiver(
            this,
            commandsReceiver,
            IntentFilter().apply {
                addAction(NotificationCommands.ACTION_DISMISS)
                addAction(NotificationCommands.ACTION_RECONCILE)
            },
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        receiverRegistered = true
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        connectedInstance = this
        CaptureHealthStore.setConnected(applicationContext, true)
        DiagnosticLogStore.info(applicationContext, "CaptureService", "Listener conectado ao Android.")
        mainHandler.postDelayed(
            {
                if (connectedInstance === this) {
                    runCatching { reconcileWithActiveNotifications() }
                        .onFailure { error ->
                            DiagnosticLogStore.error(
                                applicationContext,
                                "CaptureService",
                                "Falha na reconciliacao inicial.",
                                error
                            )
                        }
                }
            },
            INITIAL_RECONCILIATION_DELAY_MS
        )
    }

    override fun onListenerDisconnected() {
        if (connectedInstance === this) connectedInstance = null
        CaptureHealthStore.recordDisconnected(
            applicationContext,
            "O Android desconectou o listener."
        )
        DiagnosticLogStore.warn(
            applicationContext,
            "CaptureService",
            "Listener desconectado pelo Android."
        )
        super.onListenerDisconnected()
        requestReconnect(
            applicationContext,
            "callback onListenerDisconnected",
            force = true
        )
    }

    override fun onNotificationPosted(statusBarNotification: StatusBarNotification?) {
        val posted = statusBarNotification ?: return
        CaptureHealthStore.recordNotification(applicationContext)
        val saved = saveNotification(posted)
        if (saved) {
            DiagnosticLogStore.info(
                applicationContext,
                "CaptureService",
                "Notificacao capturada: pacote=${posted.packageName}."
            )
        }
    }

    override fun onDestroy() {
        if (connectedInstance === this) connectedInstance = null
        CaptureHealthStore.recordDisconnected(applicationContext, "O processo do servico foi encerrado.")
        DiagnosticLogStore.warn(applicationContext, "CaptureService", "Servico destruido.")
        mainHandler.removeCallbacksAndMessages(null)
        if (receiverRegistered) unregisterReceiver(commandsReceiver)
        receiverRegistered = false
        super.onDestroy()
    }

    private fun dismissNotification(intent: Intent) {
        val sourceKey = intent.getStringExtra(NotificationCommands.EXTRA_SOURCE_KEY).orEmpty()
        val id = intent.getStringExtra(NotificationCommands.EXTRA_ID).orEmpty()
        if (sourceKey.isNotBlank()) cancelNotification(sourceKey)
        if (id.isNotBlank()) NotificationStore.remove(applicationContext, id)
    }

    private fun reconcileWithActiveNotifications(): ReconcileResult {
        val active = try {
            activeNotifications?.toList().orEmpty()
                .filterNot { it.packageName == applicationContext.packageName }
        } catch (error: Exception) {
            val message = "Nao foi possivel ler as notificacoes ativas."
            CaptureHealthStore.recordError(applicationContext, message)
            DiagnosticLogStore.error(applicationContext, "CaptureService", message, error)
            return ReconcileResult(activeCount = 0, removedCount = 0, error = message)
        }
        val activeKeys = active.mapTo(mutableSetOf()) { it.key }
        var foundNewItems = false

        active.forEach { posted ->
            if (saveNotification(posted, scheduleSync = false)) foundNewItems = true
        }
        val removedCount = NotificationStore.removeSyncedNotActive(
            applicationContext,
            activeKeys
        )
        if (foundNewItems) SyncScheduler.scheduleImmediate(applicationContext)
        DiagnosticLogStore.info(
            applicationContext,
            "CaptureService",
            "Reconciliacao concluida: ${activeKeys.size} ativas, $removedCount removidas."
        )
        return ReconcileResult(
            activeCount = activeKeys.size,
            removedCount = removedCount
        )
    }

    private fun saveNotification(
        posted: StatusBarNotification,
        scheduleSync: Boolean = true
    ): Boolean {
        if (posted.packageName == applicationContext.packageName) return false
        val captured = posted.toCapturedNotification() ?: return false
        val saved = NotificationStore.add(applicationContext, captured)
        if (saved && scheduleSync) SyncScheduler.scheduleImmediate(applicationContext)
        return saved
    }

    private fun StatusBarNotification.toCapturedNotification(): CapturedNotification? {
        val extras = notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)
            ?.toString()
            ?.trim()
            .orEmpty()

        val text = sequenceOf(
            Notification.EXTRA_BIG_TEXT,
            Notification.EXTRA_TEXT,
            Notification.EXTRA_SUB_TEXT
        ).mapNotNull { key -> extras.getCharSequence(key)?.toString()?.trim() }
            .firstOrNull { it.isNotBlank() }
            .orEmpty()

        if (title.isBlank() && text.isBlank()) return null
        return CapturedNotification(
            id = "$key:$postTime",
            sourceKey = key,
            packageName = packageName,
            appName = appNameFor(packageName),
            title = title.take(500),
            text = text.take(4_000),
            postedAt = postTime,
            category = NotificationCategorizer.categoryFor(
                packageName = packageName,
                appName = appNameFor(packageName),
                title = title,
                text = text
            )
        )
    }

    private fun appNameFor(packageName: String): String = try {
        val applicationInfo = packageManager.getApplicationInfo(packageName, 0)
        packageManager.getApplicationLabel(applicationInfo).toString()
    } catch (_: PackageManager.NameNotFoundException) {
        packageName
    }

}
