package br.com.arruadev.notificaarquivo

import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs

object NotificationStore {
    const val ACTION_CHANGED = "br.com.arruadev.notificaarquivo.NOTIFICATIONS_CHANGED"

    private const val PREFERENCES_NAME = "notification_archive"
    private const val NOTIFICATIONS_KEY = "notifications"
    private const val IGNORED_APPS_KEY = "ignored_apps"
    private const val MAX_ITEMS = 500
    private const val DUPLICATE_WINDOW_MS = 10 * 60 * 1_000L

    @Synchronized
    fun add(context: Context, notification: CapturedNotification): Boolean {
        if (isPackageIgnored(context, notification.packageName)) return false

        val current = readInternal(context)
        val duplicate = current.firstOrNull {
            it.sourceKey == notification.sourceKey &&
                it.title == notification.title &&
                it.text == notification.text &&
                abs(notification.postedAt - it.postedAt) <= DUPLICATE_WINDOW_MS
        }

        val item = if (duplicate == null) {
            notification
        } else {
            notification.copy(id = duplicate.id, category = duplicate.category)
        }

        val updated = buildList {
            add(item)
            addAll(current.filterNot { it.id == item.id })
        }.take(MAX_ITEMS)

        writeNotifications(context, updated)
        notifyChanged(context)
        return true
    }

    @Synchronized
    fun read(context: Context): List<CapturedNotification> {
        val original = readInternal(context)
        val compacted = collapseDuplicates(original)
        if (compacted != original) writeNotifications(context, compacted)
        return compacted
    }

    @Synchronized
    fun clear(context: Context) {
        writeNotifications(context, emptyList())
        notifyChanged(context)
    }

    @Synchronized
    fun ignorePackage(context: Context, packageName: String, appName: String) {
        val apps = ignoredApps(context)
            .filterNot { it.packageName == packageName }
            .plus(IgnoredApp(packageName, appName))
            .sortedBy { it.appName.lowercase() }
        writeIgnoredApps(context, apps)
        writeNotifications(context, readInternal(context).filterNot { it.packageName == packageName })
        notifyChanged(context)
    }

    @Synchronized
    fun allowPackage(context: Context, packageName: String) {
        writeIgnoredApps(context, ignoredApps(context).filterNot { it.packageName == packageName })
        notifyChanged(context)
    }

    fun isPackageIgnored(context: Context, packageName: String): Boolean =
        ignoredApps(context).any { it.packageName == packageName }

    fun ignoredApps(context: Context): List<IgnoredApp> {
        val raw = preferences(context).getString(IGNORED_APPS_KEY, null) ?: return emptyList()
        return runCatching {
            val json = JSONArray(raw)
            List(json.length()) { index ->
                json.getJSONObject(index).let {
                    IgnoredApp(it.getString("packageName"), it.getString("appName"))
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun readInternal(context: Context): List<CapturedNotification> {
        val raw = preferences(context).getString(NOTIFICATIONS_KEY, null)
            ?: return emptyList()

        return runCatching {
            val json = JSONArray(raw)
            List(json.length()) { index -> json.getJSONObject(index).toNotification() }
        }.getOrDefault(emptyList())
    }

    private fun collapseDuplicates(items: List<CapturedNotification>): List<CapturedNotification> {
        val lastTimestampByContent = mutableMapOf<String, Long>()
        return items.sortedByDescending { it.postedAt }.mapNotNull { original ->
            val item = original.withRecoveredSourceKey()
            val contentKey = "${item.sourceKey}\u0000${item.title}\u0000${item.text}"
            val newerTimestamp = lastTimestampByContent[contentKey]
            lastTimestampByContent[contentKey] = item.postedAt

            if (newerTimestamp != null && newerTimestamp - item.postedAt <= DUPLICATE_WINDOW_MS) {
                null
            } else {
                item
            }
        }.take(MAX_ITEMS)
    }

    private fun CapturedNotification.withRecoveredSourceKey(): CapturedNotification {
        if (sourceKey.isNotBlank()) return this
        return copy(sourceKey = id.substringBeforeLast(':', id))
    }

    private fun writeNotifications(context: Context, notifications: List<CapturedNotification>) {
        val json = JSONArray()
        notifications.forEach { json.put(it.toJson()) }
        preferences(context).edit().putString(NOTIFICATIONS_KEY, json.toString()).commit()
    }

    private fun writeIgnoredApps(context: Context, apps: List<IgnoredApp>) {
        val json = JSONArray()
        apps.forEach { app ->
            json.put(JSONObject().apply {
                put("packageName", app.packageName)
                put("appName", app.appName)
            })
        }
        preferences(context).edit().putString(IGNORED_APPS_KEY, json.toString()).commit()
    }

    private fun preferences(context: Context) =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    private fun notifyChanged(context: Context) {
        context.sendBroadcast(Intent(ACTION_CHANGED).setPackage(context.packageName))
    }

    private fun CapturedNotification.toJson() = JSONObject().apply {
        put("id", id)
        put("sourceKey", sourceKey)
        put("packageName", packageName)
        put("appName", appName)
        put("title", title)
        put("text", text)
        put("postedAt", postedAt)
        put("category", category)
    }

    private fun JSONObject.toNotification() = CapturedNotification(
        id = getString("id"),
        sourceKey = optString("sourceKey"),
        packageName = getString("packageName"),
        appName = getString("appName"),
        title = optString("title"),
        text = optString("text"),
        postedAt = getLong("postedAt"),
        category = optString("category", "Sem categoria")
    )
}
