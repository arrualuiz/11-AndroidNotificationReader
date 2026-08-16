package br.com.arruadev.notificaarquivo

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object NotificationStore {
    private const val PREFERENCES_NAME = "notification_archive"
    private const val NOTIFICATIONS_KEY = "notifications"
    private const val MAX_ITEMS = 500

    @Synchronized
    fun add(context: Context, notification: CapturedNotification) {
        val updated = buildList {
            add(notification)
            addAll(read(context).filterNot { it.id == notification.id })
        }.take(MAX_ITEMS)

        val json = JSONArray()
        updated.forEach { json.put(it.toJson()) }

        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(NOTIFICATIONS_KEY, json.toString())
            .apply()
    }

    @Synchronized
    fun read(context: Context): List<CapturedNotification> {
        val raw = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .getString(NOTIFICATIONS_KEY, null)
            ?: return emptyList()

        return runCatching {
            val json = JSONArray(raw)
            List(json.length()) { index -> json.getJSONObject(index).toNotification() }
        }.getOrDefault(emptyList())
    }

    private fun CapturedNotification.toJson() = JSONObject().apply {
        put("id", id)
        put("packageName", packageName)
        put("appName", appName)
        put("title", title)
        put("text", text)
        put("postedAt", postedAt)
        put("category", category)
    }

    private fun JSONObject.toNotification() = CapturedNotification(
        id = getString("id"),
        packageName = getString("packageName"),
        appName = getString("appName"),
        title = optString("title"),
        text = optString("text"),
        postedAt = getLong("postedAt"),
        category = optString("category", "Sem categoria")
    )
}

