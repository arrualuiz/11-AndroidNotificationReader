package br.com.arruadev.notificaarquivo

import android.app.Notification
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.content.ContextCompat

class NotificationCaptureService : NotificationListenerService() {
    data class ReconcileResult(
        val activeCount: Int,
        val removedCount: Int
    )

    companion object {
        @Volatile
        private var connectedInstance: NotificationCaptureService? = null

        fun reconcileNow(): ReconcileResult? =
            connectedInstance?.reconcileWithActiveNotifications()

        fun requestReconnect(context: Context) {
            requestRebind(ComponentName(context, NotificationCaptureService::class.java))
        }

        fun isConnected(): Boolean = connectedInstance != null

        fun dismissNow(notification: CapturedNotification): Boolean {
            val service = connectedInstance ?: return false
            service.cancelNotification(notification.sourceKey)
            NotificationStore.remove(service.applicationContext, notification.id)
            return true
        }
    }

    private var receiverRegistered = false

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
    }

    override fun onListenerDisconnected() {
        if (connectedInstance === this) connectedInstance = null
        CaptureHealthStore.setConnected(applicationContext, false)
        super.onListenerDisconnected()
    }

    override fun onNotificationPosted(statusBarNotification: StatusBarNotification?) {
        val posted = statusBarNotification ?: return
        CaptureHealthStore.recordNotification(applicationContext)
        saveNotification(posted)
    }

    override fun onDestroy() {
        if (connectedInstance === this) connectedInstance = null
        CaptureHealthStore.setConnected(applicationContext, false)
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
        val active = runCatching { activeNotifications?.toList().orEmpty() }
            .getOrDefault(emptyList())
            .filterNot { it.packageName == applicationContext.packageName }
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
