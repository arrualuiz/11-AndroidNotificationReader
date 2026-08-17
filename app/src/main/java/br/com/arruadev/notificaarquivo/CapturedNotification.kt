package br.com.arruadev.notificaarquivo

data class CapturedNotification(
    val id: String,
    val sourceKey: String,
    val packageName: String,
    val appName: String,
    val title: String,
    val text: String,
    val postedAt: Long,
    val category: String = "Sem categoria",
    val syncedAt: Long? = null
)

data class IgnoredApp(
    val packageName: String,
    val appName: String
)

data class HiddenNotification(
    val sourceKey: String,
    val packageName: String,
    val appName: String,
    val title: String
)
