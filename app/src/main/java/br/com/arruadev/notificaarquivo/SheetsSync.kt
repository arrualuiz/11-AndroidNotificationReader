package br.com.arruadev.notificaarquivo

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

data class SheetsSyncSettings(
    val endpoint: String = "",
    val token: String = ""
)

data class SheetsSyncResult(
    val inserted: Int,
    val duplicates: Int,
    val ignored: Int,
    val serverVersion: String
)

data class SheetsSyncMetadata(
    val lastAttemptAt: Long = 0,
    val lastSuccessAt: Long = 0,
    val lastInserted: Int = 0,
    val lastDuplicates: Int = 0,
    val lastIgnored: Int = 0,
    val serverVersion: String = "",
    val lastError: String = ""
)

class SheetsSyncException(message: String, val retryable: Boolean) : Exception(message)

object SheetsSyncSettingsStore {
    private const val PREFERENCES_NAME = "sheets_sync"
    private const val ENDPOINT_KEY = "endpoint"
    private const val ENCRYPTED_TOKEN_KEY = "token_encrypted"
    private const val LEGACY_TOKEN_KEY = "token"

    fun read(context: Context): SheetsSyncSettings {
        val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        val encryptedToken = preferences.getString(ENCRYPTED_TOKEN_KEY, "").orEmpty()
        val legacyToken = preferences.getString(LEGACY_TOKEN_KEY, "").orEmpty()
        val token = when {
            encryptedToken.isNotEmpty() -> runCatching { SecureTokenStore.decrypt(encryptedToken) }
                .getOrDefault("")
            legacyToken.isNotEmpty() -> legacyToken.also {
                preferences.edit()
                    .putString(ENCRYPTED_TOKEN_KEY, SecureTokenStore.encrypt(it))
                    .remove(LEGACY_TOKEN_KEY)
                    .apply()
            }
            else -> ""
        }
        return SheetsSyncSettings(
            endpoint = preferences.getString(ENDPOINT_KEY, "").orEmpty(),
            token = token
        )
    }

    fun save(context: Context, settings: SheetsSyncSettings) {
        val encryptedToken = SecureTokenStore.encrypt(settings.token.trim())
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(ENDPOINT_KEY, settings.endpoint.trim())
            .putString(ENCRYPTED_TOKEN_KEY, encryptedToken)
            .remove(LEGACY_TOKEN_KEY)
            .apply()
    }
}

fun SheetsSyncSettings.isConfigured(): Boolean =
    endpoint.startsWith("https://") && token.isNotBlank()

object DeviceInfo {
    fun id(context: Context): String {
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        )
        return "${Build.MANUFACTURER}-${Build.MODEL}-$androidId"
    }
}

object SheetsSyncMetadataStore {
    const val ACTION_CHANGED = "br.com.arruadev.notificaarquivo.SHEETS_SYNC_CHANGED"

    private const val PREFERENCES_NAME = "sheets_sync_metadata"
    private const val LAST_ATTEMPT_KEY = "last_attempt"
    private const val LAST_SUCCESS_KEY = "last_success"
    private const val LAST_INSERTED_KEY = "last_inserted"
    private const val LAST_DUPLICATES_KEY = "last_duplicates"
    private const val LAST_IGNORED_KEY = "last_ignored"
    private const val SERVER_VERSION_KEY = "server_version"
    private const val LAST_ERROR_KEY = "last_error"

    fun read(context: Context): SheetsSyncMetadata {
        val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        return SheetsSyncMetadata(
            lastAttemptAt = preferences.getLong(LAST_ATTEMPT_KEY, 0),
            lastSuccessAt = preferences.getLong(LAST_SUCCESS_KEY, 0),
            lastInserted = preferences.getInt(LAST_INSERTED_KEY, 0),
            lastDuplicates = preferences.getInt(LAST_DUPLICATES_KEY, 0),
            lastIgnored = preferences.getInt(LAST_IGNORED_KEY, 0),
            serverVersion = preferences.getString(SERVER_VERSION_KEY, "").orEmpty(),
            lastError = preferences.getString(LAST_ERROR_KEY, "").orEmpty()
        )
    }

    fun recordAttempt(context: Context) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(LAST_ATTEMPT_KEY, System.currentTimeMillis())
            .apply()
        notifyChanged(context)
    }

    fun recordSuccess(context: Context, result: SheetsSyncResult) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(LAST_SUCCESS_KEY, System.currentTimeMillis())
            .putInt(LAST_INSERTED_KEY, result.inserted)
            .putInt(LAST_DUPLICATES_KEY, result.duplicates)
            .putInt(LAST_IGNORED_KEY, result.ignored)
            .putString(SERVER_VERSION_KEY, result.serverVersion)
            .putString(LAST_ERROR_KEY, "")
            .apply()
        notifyChanged(context)
    }

    fun recordFailure(context: Context, message: String) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(LAST_ERROR_KEY, message.take(240))
            .apply()
        notifyChanged(context)
    }

    private fun notifyChanged(context: Context) {
        context.sendBroadcast(Intent(ACTION_CHANGED).setPackage(context.packageName))
    }
}

object SheetsSyncClient {
    fun sync(
        settings: SheetsSyncSettings,
        deviceId: String,
        notifications: List<CapturedNotification>
    ): SheetsSyncResult {
        require(settings.endpoint.startsWith("https://")) { "O endpoint precisa usar HTTPS." }
        require(settings.token.isNotBlank()) { "Informe o token configurado no Apps Script." }

        val payload = JSONObject().apply {
            put("token", settings.token)
            put("deviceId", deviceId)
            put("sentAt", Instant.now().toString())
            put("notifications", JSONArray().apply {
                notifications.forEach { item ->
                    put(JSONObject().apply {
                        put("id", item.id)
                        put("sourceKey", item.sourceKey)
                        put("packageName", item.packageName)
                        put("appName", item.appName)
                        put("title", item.title)
                        put("text", item.text)
                        put("postedAt", Instant.ofEpochMilli(item.postedAt).toString())
                        put("category", item.category)
                    })
                }
            })
        }

        val connection = (URL(settings.endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
        }

        return try {
            connection.outputStream.bufferedWriter(Charsets.UTF_8).use { writer ->
                writer.write(payload.toString())
            }

            val responseCode = connection.responseCode
            val responseText = (if (responseCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            })?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()

            if (responseCode !in 200..299) {
                throw SheetsSyncException(
                    message = "Falha HTTP $responseCode: ${responseText.take(200)}",
                    retryable = responseCode == 408 || responseCode == 429 || responseCode >= 500
                )
            }

            val response = JSONObject(responseText)
            if (!response.optBoolean("ok")) {
                val message = response.optString("error", "Resposta invalida do Apps Script.")
                throw SheetsSyncException(
                    message,
                    retryable = !message.contains("Token invalido", ignoreCase = true)
                )
            }

            SheetsSyncResult(
                inserted = response.optInt("inserted"),
                duplicates = response.optInt("duplicates"),
                ignored = response.optInt("ignored"),
                serverVersion = response.optString("apiVersion", "anterior")
            )
        } finally {
            connection.disconnect()
        }
    }
}
