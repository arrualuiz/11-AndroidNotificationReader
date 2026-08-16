package br.com.arruadev.notificaarquivo

import android.content.Context
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
    val duplicates: Int
)

object SheetsSyncSettingsStore {
    private const val PREFERENCES_NAME = "sheets_sync"
    private const val ENDPOINT_KEY = "endpoint"
    private const val TOKEN_KEY = "token"

    fun read(context: Context): SheetsSyncSettings {
        val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        return SheetsSyncSettings(
            endpoint = preferences.getString(ENDPOINT_KEY, "").orEmpty(),
            token = preferences.getString(TOKEN_KEY, "").orEmpty()
        )
    }

    fun save(context: Context, settings: SheetsSyncSettings) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(ENDPOINT_KEY, settings.endpoint.trim())
            .putString(TOKEN_KEY, settings.token.trim())
            .apply()
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
                error("Falha HTTP $responseCode: ${responseText.take(200)}")
            }

            val response = JSONObject(responseText)
            if (!response.optBoolean("ok")) {
                error(response.optString("error", "Resposta invalida do Apps Script."))
            }

            SheetsSyncResult(
                inserted = response.optInt("inserted"),
                duplicates = response.optInt("duplicates")
            )
        } finally {
            connection.disconnect()
        }
    }
}

