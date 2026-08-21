package br.com.arruadev.notificaarquivo

import android.content.Context
import android.content.Intent
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class DiagnosticEntry(
    val timestamp: Long,
    val level: String,
    val source: String,
    val message: String
) {
    fun displayLine(): String = buildString {
        append(DISPLAY_TIME_FORMAT.format(Instant.ofEpochMilli(timestamp)))
        append("  ")
        append(level.padEnd(5))
        append("  ")
        append(source)
        append("  ")
        append(message)
    }

    private companion object {
        val DISPLAY_TIME_FORMAT: DateTimeFormatter = DateTimeFormatter
            .ofPattern("dd/MM HH:mm:ss")
            .withZone(ZoneId.systemDefault())
    }
}

object DiagnosticLogStore {
    const val ACTION_CHANGED = "br.com.arruadev.notificaarquivo.DIAGNOSTIC_LOG_CHANGED"

    private const val TAG = "NotificaArquivo"
    private const val DIRECTORY_NAME = "diagnostics"
    private const val RETENTION_DAYS = 7L
    private const val MAX_FILE_BYTES = 1_000_000L
    private const val MAX_FILE_LINES_AFTER_COMPACTION = 2_000
    private const val MAX_MESSAGE_LENGTH = 800
    private val lock = Any()

    fun info(context: Context, source: String, message: String) {
        Log.i(TAG, "$source: $message")
        append(context, "INFO", source, message)
    }

    fun warn(context: Context, source: String, message: String) {
        Log.w(TAG, "$source: $message")
        append(context, "WARN", source, message)
    }

    fun error(context: Context, source: String, message: String, error: Throwable? = null) {
        Log.e(TAG, "$source: $message", error)
        val detail = error?.let { " (${it.javaClass.simpleName}: ${it.message.orEmpty()})" }.orEmpty()
        append(context, "ERROR", source, message + detail)
    }

    fun read(context: Context, limit: Int = 250): List<DiagnosticEntry> = synchronized(lock) {
        diagnosticsDirectory(context)
            .listFiles { file -> file.isFile && file.extension == "log" }
            .orEmpty()
            .sortedBy { it.name }
            .flatMap { file ->
                runCatching { file.readLines(Charsets.UTF_8) }.getOrDefault(emptyList())
            }
            .takeLast(limit)
            .mapNotNull(::parseEntry)
    }

    fun clear(context: Context) {
        runCatching {
            synchronized(lock) {
                diagnosticsDirectory(context).listFiles().orEmpty().forEach { file ->
                    if (file.isFile && file.extension == "log") file.delete()
                }
            }
        }
        runCatching {
            context.sendBroadcast(Intent(ACTION_CHANGED).setPackage(context.packageName))
        }
    }

    private fun append(context: Context, level: String, source: String, message: String) {
        val safeSource = sanitize(source, 80)
        val safeMessage = sanitize(message, MAX_MESSAGE_LENGTH)
        val written = runCatching {
            synchronized(lock) {
                val directory = diagnosticsDirectory(context)
                pruneOldFiles(directory)
                val file = File(directory, "${LocalDate.now()}.log")
                compactIfNeeded(file)
                val line = JSONObject()
                    .put("timestamp", System.currentTimeMillis())
                    .put("level", level)
                    .put("source", safeSource)
                    .put("message", safeMessage)
                    .toString()
                file.appendText(line + System.lineSeparator(), Charsets.UTF_8)
            }
        }.onFailure { error ->
            Log.e(TAG, "Nao foi possivel persistir o diagnostico.", error)
        }.isSuccess
        if (written) {
            runCatching {
                context.sendBroadcast(Intent(ACTION_CHANGED).setPackage(context.packageName))
            }
        }
    }

    private fun diagnosticsDirectory(context: Context): File =
        File(context.filesDir, DIRECTORY_NAME).apply { mkdirs() }

    private fun pruneOldFiles(directory: File) {
        val oldestDate = LocalDate.now().minusDays(RETENTION_DAYS)
        directory.listFiles().orEmpty().forEach { file ->
            val fileDate = runCatching { LocalDate.parse(file.nameWithoutExtension) }.getOrNull()
            if (fileDate != null && fileDate.isBefore(oldestDate)) file.delete()
        }
    }

    private fun compactIfNeeded(file: File) {
        if (!file.exists() || file.length() < MAX_FILE_BYTES) return
        val recentLines = runCatching { file.readLines(Charsets.UTF_8) }
            .getOrDefault(emptyList())
            .takeLast(MAX_FILE_LINES_AFTER_COMPACTION)
        file.writeText(
            recentLines.joinToString(System.lineSeparator(), postfix = System.lineSeparator()),
            Charsets.UTF_8
        )
    }

    private fun parseEntry(line: String): DiagnosticEntry? = runCatching {
        val json = JSONObject(line)
        DiagnosticEntry(
            timestamp = json.getLong("timestamp"),
            level = json.getString("level"),
            source = json.getString("source"),
            message = json.getString("message")
        )
    }.getOrNull()

    private fun sanitize(value: String, maxLength: Int): String = value
        .replace('\n', ' ')
        .replace('\r', ' ')
        .trim()
        .take(maxLength)
}
