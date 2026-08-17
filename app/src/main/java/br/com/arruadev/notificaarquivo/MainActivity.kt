package br.com.arruadev.notificaarquivo

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private sealed interface SyncStatus {
    data object Idle : SyncStatus
    data object Running : SyncStatus
    data class Success(val inserted: Int, val duplicates: Int, val ignored: Int) : SyncStatus
    data class Error(val message: String) : SyncStatus
}

class MainActivity : ComponentActivity() {
    private var notifications by mutableStateOf<List<CapturedNotification>>(emptyList())
    private var ignoredApps by mutableStateOf<List<IgnoredApp>>(emptyList())
    private var accessGranted by mutableStateOf(false)
    private var syncSettings by mutableStateOf(SheetsSyncSettings())
    private var syncMetadata by mutableStateOf(SheetsSyncMetadata())
    private var syncStatus by mutableStateOf<SyncStatus>(SyncStatus.Idle)
    private var receiverRegistered = false

    private val changesReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            refreshState()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        syncSettings = SheetsSyncSettingsStore.read(this)
        syncMetadata = SheetsSyncMetadataStore.read(this)
        SyncScheduler.schedulePeriodic(this)
        SyncScheduler.scheduleImmediate(this)

        setContent {
            NotificaArquivoTheme {
                NotificationArchiveScreen(
                    accessGranted = accessGranted,
                    notifications = notifications,
                    ignoredApps = ignoredApps,
                    syncSettings = syncSettings,
                    syncMetadata = syncMetadata,
                    syncStatus = syncStatus,
                    onOpenSettings = ::openNotificationAccessSettings,
                    onOpenBatterySettings = ::openBatterySettings,
                    onClear = { NotificationStore.clear(this) },
                    onIgnoreApp = { packageName, appName ->
                        NotificationStore.ignorePackage(this, packageName, appName)
                    },
                    onAllowApp = { packageName ->
                        NotificationStore.allowPackage(this, packageName)
                    },
                    onSaveSyncSettings = ::saveSyncSettings,
                    onSync = ::syncWithSheets
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (!receiverRegistered) {
            ContextCompat.registerReceiver(
                this,
                changesReceiver,
                IntentFilter().apply {
                    addAction(NotificationStore.ACTION_CHANGED)
                    addAction(SheetsSyncMetadataStore.ACTION_CHANGED)
                },
                ContextCompat.RECEIVER_NOT_EXPORTED
            )
            receiverRegistered = true
        }
    }

    override fun onResume() {
        super.onResume()
        refreshState()
    }

    override fun onStop() {
        if (receiverRegistered) {
            unregisterReceiver(changesReceiver)
            receiverRegistered = false
        }
        super.onStop()
    }

    private fun refreshState() {
        accessGranted = NotificationManagerCompat.getEnabledListenerPackages(this)
            .contains(packageName)
        notifications = NotificationStore.read(this)
        ignoredApps = NotificationStore.ignoredApps(this)
        syncMetadata = SheetsSyncMetadataStore.read(this)
    }

    private fun openNotificationAccessSettings() {
        startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    private fun openBatterySettings() {
        startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    private fun saveSyncSettings(settings: SheetsSyncSettings) {
        val sanitized = SheetsSyncSettings(settings.endpoint.trim(), settings.token.trim())
        SheetsSyncSettingsStore.save(this, sanitized)
        syncSettings = sanitized
        syncStatus = SyncStatus.Idle
        SyncScheduler.schedulePeriodic(this)
        SyncScheduler.scheduleImmediate(this)
    }

    private fun syncWithSheets() {
        val snapshot = NotificationStore.pending(this)
        if (snapshot.isEmpty()) {
            syncStatus = SyncStatus.Success(0, 0, 0)
            return
        }

        val currentSettings = syncSettings
        syncStatus = SyncStatus.Running
        SheetsSyncMetadataStore.recordAttempt(this)

        lifecycleScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    SheetsSyncClient.sync(
                        settings = currentSettings,
                        deviceId = DeviceInfo.id(this@MainActivity),
                        notifications = snapshot
                    )
                }
            }.onSuccess { result ->
                NotificationStore.markSynced(this@MainActivity, snapshot)
                SheetsSyncMetadataStore.recordSuccess(this@MainActivity, result)
                syncStatus = SyncStatus.Success(result.inserted, result.duplicates, result.ignored)
                refreshState()
            }.onFailure { error ->
                val message = error.message ?: "Falha desconhecida."
                SheetsSyncMetadataStore.recordFailure(this@MainActivity, message)
                syncStatus = SyncStatus.Error(message)
            }
        }
    }
}

@Composable
private fun NotificationArchiveScreen(
    accessGranted: Boolean,
    notifications: List<CapturedNotification>,
    ignoredApps: List<IgnoredApp>,
    syncSettings: SheetsSyncSettings,
    syncMetadata: SheetsSyncMetadata,
    syncStatus: SyncStatus,
    onOpenSettings: () -> Unit,
    onOpenBatterySettings: () -> Unit,
    onClear: () -> Unit,
    onIgnoreApp: (String, String) -> Unit,
    onAllowApp: (String) -> Unit,
    onSaveSyncSettings: (SheetsSyncSettings) -> Unit,
    onSync: () -> Unit
) {
    var showClearDialog by remember { mutableStateOf(false) }
    var showFiltersDialog by remember { mutableStateOf(false) }
    var showSyncDialog by remember { mutableStateOf(false) }
    var pendingIgnore by remember { mutableStateOf<CapturedNotification?>(null) }

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 20.dp)) {
            Text(
                text = "Notifica Arquivo",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Seu arquivo local de notificacoes",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(16.dp))
            AccessPanel(
                accessGranted = accessGranted,
                onOpenSettings = onOpenSettings,
                onOpenBatterySettings = onOpenBatterySettings
            )
            Spacer(modifier = Modifier.height(10.dp))
            SheetsPanel(
                settings = syncSettings,
                metadata = syncMetadata,
                status = syncStatus,
                pendingCount = notifications.count { it.syncedAt == null },
                onConfigure = { showSyncDialog = true },
                onSync = onSync
            )
            Spacer(modifier = Modifier.height(18.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Historico",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "${notifications.size} itens",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp
                    )
                }
                TextButton(onClick = { showFiltersDialog = true }) {
                    Text("Filtros (${ignoredApps.size})")
                }
                TextButton(
                    onClick = { showClearDialog = true },
                    enabled = notifications.isNotEmpty()
                ) {
                    Text("Limpar")
                }
            }

            if (notifications.isEmpty()) {
                EmptyState(modifier = Modifier.weight(1f))
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(notifications, key = { it.id }) { notification ->
                        NotificationItem(
                            notification = notification,
                            onIgnore = { pendingIgnore = notification }
                        )
                    }
                }
            }
        }
    }

    if (showClearDialog) {
        ConfirmationDialog(
            title = "Limpar historico?",
            message = "Os registros locais serao apagados. Dados ja enviados ao Sheets permanecem la.",
            confirmLabel = "Limpar",
            onDismiss = { showClearDialog = false },
            onConfirm = {
                showClearDialog = false
                onClear()
            }
        )
    }

    pendingIgnore?.let { notification ->
        ConfirmationDialog(
            title = "Ignorar ${notification.appName}?",
            message = "As notificacoes deste aplicativo serao removidas e as proximas nao serao salvas.",
            confirmLabel = "Ignorar app",
            onDismiss = { pendingIgnore = null },
            onConfirm = {
                pendingIgnore = null
                onIgnoreApp(notification.packageName, notification.appName)
            }
        )
    }

    if (showFiltersDialog) {
        FiltersDialog(
            ignoredApps = ignoredApps,
            onDismiss = { showFiltersDialog = false },
            onAllow = onAllowApp
        )
    }

    if (showSyncDialog) {
        SyncSettingsDialog(
            initialSettings = syncSettings,
            onDismiss = { showSyncDialog = false },
            onSave = {
                showSyncDialog = false
                onSaveSyncSettings(it)
            }
        )
    }
}

@Composable
private fun AccessPanel(
    accessGranted: Boolean,
    onOpenSettings: () -> Unit,
    onOpenBatterySettings: () -> Unit
) {
    val container = if (accessGranted) Color(0xFFDCEFE8) else Color(0xFFFFE8D6)
    val content = if (accessGranted) Color(0xFF16483E) else Color(0xFF6E3515)

    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = container),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (accessGranted) "Captura ativada" else "Acesso ainda nao ativado",
                    color = content,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = if (accessGranted) {
                        "Captura em segundo plano e atualizacao ao vivo."
                    } else {
                        "Autorize manualmente nas configuracoes."
                    },
                    color = content,
                    fontSize = 13.sp
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                TextButton(onClick = onOpenSettings) {
                    Text(if (accessGranted) "Revisar" else "Permitir")
                }
                if (accessGranted) {
                    TextButton(onClick = onOpenBatterySettings) {
                        Text("Bateria")
                    }
                }
            }
        }
    }
}

@Composable
private fun SheetsPanel(
    settings: SheetsSyncSettings,
    metadata: SheetsSyncMetadata,
    status: SyncStatus,
    pendingCount: Int,
    onConfigure: () -> Unit,
    onSync: () -> Unit
) {
    val configured = settings.isConfigured()
    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFECE8F3)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Google Sheets", fontWeight = FontWeight.Bold, color = Color(0xFF403652))
                    Text(
                        text = syncStatusText(status, configured, pendingCount, metadata),
                        color = Color(0xFF574D68),
                        fontSize = 13.sp
                    )
                }
                OutlinedButton(onClick = onConfigure) {
                    Text("Configurar")
                }
            }
            if (configured) {
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = onSync,
                    enabled = pendingCount > 0 && status !is SyncStatus.Running,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (status is SyncStatus.Running) "Enviando..." else "Enviar agora")
                }
            }
        }
    }
}

private fun syncStatusText(
    status: SyncStatus,
    configured: Boolean,
    pendingCount: Int,
    metadata: SheetsSyncMetadata
): String = when (status) {
    SyncStatus.Idle -> when {
        !configured -> "Endpoint ainda nao configurado."
        metadata.lastError.isNotBlank() -> "Automatico ativo; ultima tentativa falhou: ${metadata.lastError}"
        pendingCount > 0 -> "Automatico ativo; $pendingCount aguardando envio."
        metadata.lastSuccessAt > 0 -> "Automatico ativo; sincronizado em ${formatTimestamp(metadata.lastSuccessAt)}."
        else -> "Automatico ativo; aguardando notificacoes."
    }
    SyncStatus.Running -> "Enviando notificacoes..."
    is SyncStatus.Success -> if (status.inserted + status.duplicates + status.ignored == 0) {
        "Tudo sincronizado; nenhuma pendencia."
    } else {
        "${status.inserted} novas; ${status.duplicates} repetidas; ${status.ignored} filtradas."
    }
    is SyncStatus.Error -> status.message
}

@Composable
private fun EmptyState(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Nenhuma notificacao arquivada", fontWeight = FontWeight.SemiBold)
        Text(
            text = "Depois de ativar o acesso, envie uma mensagem de teste.",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun NotificationItem(notification: CapturedNotification, onIgnore: () -> Unit) {
    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = notification.appName,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = formatTimestamp(notification.postedAt),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
            }
            if (notification.title.isNotBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(notification.title, fontWeight = FontWeight.SemiBold)
            }
            if (notification.text.isNotBlank()) {
                Text(notification.text, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = notification.category,
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
                TextButton(onClick = onIgnore) {
                    Text("Ignorar app")
                }
            }
        }
    }
}

@Composable
private fun ConfirmationDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirmLabel) } }
    )
}

@Composable
private fun FiltersDialog(
    ignoredApps: List<IgnoredApp>,
    onDismiss: () -> Unit,
    onAllow: (String) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Apps ignorados") },
        text = {
            if (ignoredApps.isEmpty()) {
                Text("Nenhum aplicativo esta sendo ignorado.")
            } else {
                Column(
                    modifier = Modifier
                        .heightIn(max = 320.dp)
                        .verticalScroll(rememberScrollState())
                ) {
                    ignoredApps.forEach { app ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(app.appName, fontWeight = FontWeight.SemiBold)
                                Text(app.packageName, fontSize = 11.sp)
                            }
                            TextButton(onClick = { onAllow(app.packageName) }) {
                                Text("Reativar")
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Fechar") } }
    )
}

@Composable
private fun SyncSettingsDialog(
    initialSettings: SheetsSyncSettings,
    onDismiss: () -> Unit,
    onSave: (SheetsSyncSettings) -> Unit
) {
    var endpoint by remember(initialSettings.endpoint) { mutableStateOf(initialSettings.endpoint) }
    var token by remember(initialSettings.token) { mutableStateOf(initialSettings.token) }
    val valid = endpoint.trim().startsWith("https://") && token.isNotBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Conectar ao Sheets") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Cole a URL da implantacao do Apps Script e o token definido no script.")
                OutlinedTextField(
                    value = endpoint,
                    onValueChange = { endpoint = it },
                    label = { Text("URL do Apps Script") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = token,
                    onValueChange = { token = it },
                    label = { Text("Token") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
        confirmButton = {
            TextButton(
                onClick = { onSave(SheetsSyncSettings(endpoint.trim(), token.trim())) },
                enabled = valid
            ) {
                Text("Salvar")
            }
        }
    )
}

private fun formatTimestamp(timestamp: Long): String = DateTimeFormatter
    .ofPattern("dd/MM HH:mm")
    .withZone(ZoneId.systemDefault())
    .format(Instant.ofEpochMilli(timestamp))

private val LightColors = lightColorScheme(
    primary = Color(0xFF146C60),
    secondary = Color(0xFF7A5534),
    tertiary = Color(0xFF8B3A3A),
    background = Color(0xFFF7F8F6),
    surface = Color(0xFFF7F8F6),
    surfaceVariant = Color(0xFFE8ECE9)
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF7FD5C4),
    secondary = Color(0xFFE9BE94),
    tertiary = Color(0xFFFFB3AE),
    background = Color(0xFF101412),
    surface = Color(0xFF101412),
    surfaceVariant = Color(0xFF252B28)
)

@Composable
private fun NotificaArquivoTheme(content: @Composable () -> Unit) {
    val isDark = androidx.compose.foundation.isSystemInDarkTheme()
    MaterialTheme(colorScheme = if (isDark) DarkColors else LightColors, content = content)
}
