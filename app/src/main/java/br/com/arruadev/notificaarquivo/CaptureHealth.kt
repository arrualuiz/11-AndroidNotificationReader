package br.com.arruadev.notificaarquivo

import android.content.Context
import android.content.Intent

data class CaptureHealth(
    val listenerConnected: Boolean = false,
    val lastConnectedAt: Long = 0,
    val lastNotificationAt: Long = 0
)

object CaptureHealthStore {
    const val ACTION_CHANGED = "br.com.arruadev.notificaarquivo.CAPTURE_HEALTH_CHANGED"

    private const val PREFERENCES_NAME = "capture_health"
    private const val CONNECTED_KEY = "listener_connected"
    private const val LAST_CONNECTED_KEY = "last_connected"
    private const val LAST_NOTIFICATION_KEY = "last_notification"

    fun read(context: Context): CaptureHealth {
        val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        return CaptureHealth(
            listenerConnected = preferences.getBoolean(CONNECTED_KEY, false),
            lastConnectedAt = preferences.getLong(LAST_CONNECTED_KEY, 0),
            lastNotificationAt = preferences.getLong(LAST_NOTIFICATION_KEY, 0)
        )
    }

    fun setConnected(context: Context, connected: Boolean) {
        val editor = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(CONNECTED_KEY, connected)
        if (connected) editor.putLong(LAST_CONNECTED_KEY, System.currentTimeMillis())
        editor.apply()
        notifyChanged(context)
    }

    fun recordNotification(context: Context) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(LAST_NOTIFICATION_KEY, System.currentTimeMillis())
            .apply()
        notifyChanged(context)
    }

    private fun notifyChanged(context: Context) {
        context.sendBroadcast(Intent(ACTION_CHANGED).setPackage(context.packageName))
    }
}

object NotificationCommands {
    const val ACTION_DISMISS = "br.com.arruadev.notificaarquivo.DISMISS_NOTIFICATION"
    const val ACTION_RECONCILE = "br.com.arruadev.notificaarquivo.RECONCILE_NOTIFICATIONS"
    const val EXTRA_ID = "notification_id"
    const val EXTRA_SOURCE_KEY = "source_key"

    fun dismiss(context: Context, notification: CapturedNotification) {
        NotificationStore.remove(context, notification.id)
        if (NotificationCaptureService.dismissNow(notification)) return
        context.sendBroadcast(
            Intent(ACTION_DISMISS)
                .setPackage(context.packageName)
                .putExtra(EXTRA_ID, notification.id)
                .putExtra(EXTRA_SOURCE_KEY, notification.sourceKey)
        )
    }

    fun reconcile(context: Context) {
        context.sendBroadcast(Intent(ACTION_RECONCILE).setPackage(context.packageName))
    }
}
