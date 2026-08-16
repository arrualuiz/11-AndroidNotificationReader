package br.com.arruadev.notificaarquivo

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class NotificationCaptureService : NotificationListenerService() {
    override fun onNotificationPosted(statusBarNotification: StatusBarNotification?) {
        val posted = statusBarNotification ?: return
        if (posted.packageName == applicationContext.packageName) return

        val extras = posted.notification.extras
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

        if (title.isBlank() && text.isBlank()) return

        NotificationStore.add(
            applicationContext,
            CapturedNotification(
                id = "${posted.key}:${posted.postTime}",
                packageName = posted.packageName,
                appName = appNameFor(posted.packageName),
                title = title.take(500),
                text = text.take(4_000),
                postedAt = posted.postTime
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

