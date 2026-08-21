package br.com.arruadev.notificaarquivo

import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
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

private sealed interface HistorySyncStatus {
    data object Idle : HistorySyncStatus
    data object Running : HistorySyncStatus
    data class Success(val removed: Int, val active: Int) : HistorySyncStatus
    data class Error(val message: String) : HistorySyncStatus
}

class MainActivity : ComponentActivity() {
    private var notifications by mutableStateOf<List<CapturedNotification>>(emptyList())
    private var ignoredApps by mutableStateOf<List<IgnoredApp>>(emptyList())
    private var hiddenNotifications by mutableStateOf<List<HiddenNotification>>(emptyList())
    private var captureHealth by mutableStateOf(CaptureHealth())
    private var diagnosticEntries by mutableStateOf<List<DiagnosticEntry>>(emptyList())
    private var batteryUnrestricted by mutableStateOf(false)
    private var accessGranted by mutableStateOf(false)
    private var syncSettings by mutableStateOf(SheetsSyncSettings())
    private var syncMetadata by mutableStateOf(SheetsSyncMetadata())
    private var syncStatus by mutableStateOf<SyncStatus>(SyncStatus.Idle)
    private var historySyncStatus by mutableStateOf<HistorySyncStatus>(HistorySyncStatus.Idle)
    private var darkModeEnabled by mutableStateOf(false)
    private var rotationEnabled by mutableStateOf(false)
    private var receiverRegistered = false

    private val changesReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            refreshState()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uiPreferences = getSharedPreferences(UI_PREFERENCES, MODE_PRIVATE)
        darkModeEnabled = uiPreferences.getBoolean(DARK_MODE_KEY, false)
        rotationEnabled = uiPreferences.getBoolean(ROTATION_ENABLED_KEY, false)
        if (rotationEnabled) applyOrientation(true)
        updateSystemBars(darkModeEnabled)
        syncSettings = SheetsSyncSettingsStore.read(this)
        syncMetadata = SheetsSyncMetadataStore.read(this)
        SyncScheduler.schedulePeriodic(this)
        SyncScheduler.scheduleImmediate(this)
        CaptureRecoveryScheduler.schedulePeriodic(this)
        DiagnosticLogStore.info(
            this,
            "MainActivity",
            "App iniciado: ${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE}."
        )

        setContent {
            NotificaArquivoTheme(darkTheme = darkModeEnabled) {
                NotificationArchiveScreen(
                    darkModeEnabled = darkModeEnabled,
                    rotationEnabled = rotationEnabled,
                    accessGranted = accessGranted,
                    notifications = notifications,
                    ignoredApps = ignoredApps,
                    hiddenNotifications = hiddenNotifications,
                    captureHealth = captureHealth,
                    diagnosticEntries = diagnosticEntries,
                    batteryUnrestricted = batteryUnrestricted,
                    syncSettings = syncSettings,
                    syncMetadata = syncMetadata,
                    syncStatus = syncStatus,
                    historySyncStatus = historySyncStatus,
                    onOpenSettings = ::openNotificationAccessSettings,
                    onOpenBatterySettings = ::openBatterySettings,
                    onOpenAppSettings = ::openAppSettings,
                    onCheckCapture = ::runCaptureDiagnostic,
                    onReconnectCapture = { requestCaptureReconnect("comando manual") },
                    onCopyDiagnostics = ::copyDiagnosticReport,
                    onClearDiagnostics = ::clearDiagnosticLog,
                    onDismissNotification = { item ->
                        NotificationCommands.dismiss(this, item)
                    },
                    onHideNotification = { item -> NotificationStore.hide(this, item) },
                    onHistorySync = ::syncHistory,
                    onIgnoreApp = { packageName, appName ->
                        NotificationStore.ignorePackage(this, packageName, appName)
                    },
                    onAllowApp = { packageName ->
                        NotificationStore.allowPackage(this, packageName)
                    },
                    onShowNotification = { sourceKey ->
                        NotificationStore.show(this, sourceKey)
                        NotificationCommands.reconcile(this)
                    },
                    onSaveSyncSettings = ::saveSyncSettings,
                    onSync = ::syncWithSheets,
                    onDarkModeChange = ::setDarkMode,
                    onRotationChange = ::changeRotationSetting
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        updateSystemBars(darkModeEnabled)
        if (!receiverRegistered) {
            ContextCompat.registerReceiver(
                this,
                changesReceiver,
                IntentFilter().apply {
                    addAction(NotificationStore.ACTION_CHANGED)
                    addAction(SheetsSyncMetadataStore.ACTION_CHANGED)
                    addAction(CaptureHealthStore.ACTION_CHANGED)
                    addAction(DiagnosticLogStore.ACTION_CHANGED)
                },
                ContextCompat.RECEIVER_NOT_EXPORTED
            )
            receiverRegistered = true
        }
    }

    private fun setDarkMode(enabled: Boolean) {
        if (darkModeEnabled == enabled) return
        getSharedPreferences(UI_PREFERENCES, MODE_PRIVATE)
            .edit()
            .putBoolean(DARK_MODE_KEY, enabled)
            .apply()
        updateSystemBars(enabled)
        recreate()
    }

    private fun changeRotationSetting(enabled: Boolean) {
        if (rotationEnabled == enabled) return
        rotationEnabled = enabled
        getSharedPreferences(UI_PREFERENCES, MODE_PRIVATE)
            .edit()
            .putBoolean(ROTATION_ENABLED_KEY, enabled)
            .apply()
        applyOrientation(enabled)
    }

    private fun applyOrientation(enabled: Boolean) {
        requestedOrientation = if (enabled) {
            ActivityInfo.SCREEN_ORIENTATION_SENSOR
        } else {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
    }

    @Suppress("DEPRECATION")
    private fun updateSystemBars(darkMode: Boolean) {
        val background = if (darkMode) 0xFF101412.toInt() else 0xFFF7F8F6.toInt()
        window.statusBarColor = background
        window.navigationBarColor = 0xFF101412.toInt()
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = !darkMode
            isAppearanceLightNavigationBars = false
        }
    }

    override fun onResume() {
        super.onResume()
        refreshState()
        if (accessGranted && !NotificationCaptureService.isConnected()) {
            requestCaptureReconnect("app em primeiro plano")
        }
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
        hiddenNotifications = NotificationStore.hiddenNotifications(this)
        captureHealth = CaptureHealthStore.read(this)
        diagnosticEntries = DiagnosticLogStore.read(this)
        batteryUnrestricted = getSystemService(PowerManager::class.java)
            .isIgnoringBatteryOptimizations(packageName)
        syncMetadata = SheetsSyncMetadataStore.read(this)
    }

    private fun openNotificationAccessSettings() {
        startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    private fun openBatterySettings() {
        startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    private fun openAppSettings() {
        startActivity(
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:$packageName")
            )
        )
    }

    private fun requestCaptureReconnect(reason: String) {
        val granted = NotificationManagerCompat.getEnabledListenerPackages(this)
            .contains(packageName)
        if (!granted) {
            DiagnosticLogStore.warn(
                this,
                "MainActivity",
                "Reconexao bloqueada: acesso a notificacoes nao concedido."
            )
            refreshState()
            return
        }
        if (NotificationCaptureService.isConnected()) {
            DiagnosticLogStore.info(this, "MainActivity", "Servico ja estava conectado.")
            refreshState()
            return
        }

        NotificationCaptureService.requestReconnect(this, reason)
        lifecycleScope.launch {
            delay(8_000)
            if (!NotificationCaptureService.isConnected()) {
                val message = "O Android nao confirmou a reconexao em 8 segundos."
                CaptureHealthStore.recordReconnectFailure(this@MainActivity, message)
                DiagnosticLogStore.warn(this@MainActivity, "MainActivity", message)
            }
            refreshState()
        }
    }

    private fun runCaptureDiagnostic() {
        DiagnosticLogStore.info(this, "Diagnostico", "Verificacao manual iniciada.")
        val granted = NotificationManagerCompat.getEnabledListenerPackages(this)
            .contains(packageName)
        if (!granted) {
            val message = "Falha: acesso a notificacoes nao concedido."
            CaptureHealthStore.recordReconnectFailure(this, message)
            DiagnosticLogStore.warn(this, "Diagnostico", message)
            refreshState()
            return
        }

        val immediateResult = NotificationCaptureService.reconcileNow()
        if (immediateResult != null) {
            if (immediateResult.error == null) {
                DiagnosticLogStore.info(
                    this,
                    "Diagnostico",
                    "Servico respondeu: ${immediateResult.activeCount} ativas, " +
                        "${immediateResult.removedCount} removidas."
                )
            } else {
                CaptureHealthStore.recordError(this, immediateResult.error)
                DiagnosticLogStore.warn(this, "Diagnostico", immediateResult.error)
            }
            refreshState()
            return
        }

        NotificationCaptureService.requestReconnect(this, "verificacao manual")
        lifecycleScope.launch {
            var result: NotificationCaptureService.ReconcileResult? = null
            for (attempt in 0 until 32) {
                delay(250)
                val candidate = NotificationCaptureService.reconcileNow()
                if (candidate != null) {
                    result = candidate
                    break
                }
            }
            val finalResult = result
            if (finalResult == null) {
                val message = "Falha: listener nao respondeu em 8 segundos."
                CaptureHealthStore.recordReconnectFailure(this@MainActivity, message)
                DiagnosticLogStore.warn(this@MainActivity, "Diagnostico", message)
            } else if (finalResult.error != null) {
                CaptureHealthStore.recordError(this@MainActivity, finalResult.error)
                DiagnosticLogStore.warn(this@MainActivity, "Diagnostico", finalResult.error)
            } else {
                DiagnosticLogStore.info(
                    this@MainActivity,
                    "Diagnostico",
                    "Reconectado: ${finalResult.activeCount} ativas, " +
                        "${finalResult.removedCount} removidas."
                )
            }
            refreshState()
        }
    }

    private fun copyDiagnosticReport() {
        refreshState()
        val currentHealth = captureHealth
        val report = buildString {
            appendLine("Notifica Arquivo - Diagnostico")
            appendLine("Versao: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            appendLine("Dispositivo: ${Build.MANUFACTURER} ${Build.MODEL}")
            appendLine("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            appendLine("Acesso: ${if (accessGranted) "concedido" else "bloqueado"}")
            appendLine("Listener: ${if (currentHealth.listenerConnected) "conectado" else "desconectado"}")
            appendLine("Bateria: ${if (batteryUnrestricted) "sem restricao" else "otimizacao ativa"}")
            appendLine("Ultima conexao: ${formatOptionalTimestamp(currentHealth.lastConnectedAt)}")
            appendLine("Ultima desconexao: ${formatOptionalTimestamp(currentHealth.lastDisconnectedAt)}")
            appendLine("Ultima captura: ${formatOptionalTimestamp(currentHealth.lastNotificationAt)}")
            appendLine("Ultima tentativa: ${formatOptionalTimestamp(currentHealth.lastReconnectAttemptAt)}")
            appendLine("Tentativas: ${currentHealth.reconnectAttemptCount}")
            appendLine("Ultimo erro: ${currentHealth.lastError.ifBlank { "nenhum" }}")
            appendLine()
            appendLine("Eventos recentes:")
            diagnosticEntries.takeLast(200).forEach { appendLine(it.displayLine()) }
        }
        getSystemService(ClipboardManager::class.java)
            .setPrimaryClip(ClipData.newPlainText("Diagnostico Notifica Arquivo", report))
        DiagnosticLogStore.info(this, "Diagnostico", "Relatorio copiado.")
    }

    private fun clearDiagnosticLog() {
        DiagnosticLogStore.clear(this)
        DiagnosticLogStore.info(this, "Diagnostico", "Log limpo pelo usuario.")
        refreshState()
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

    private fun syncHistory() {
        if (historySyncStatus is HistorySyncStatus.Running) return

        val currentSettings = syncSettings
        val snapshot = NotificationStore.pending(this)
        historySyncStatus = HistorySyncStatus.Running
        syncStatus = SyncStatus.Running
        SheetsSyncMetadataStore.recordAttempt(this)

        lifecycleScope.launch {
            val sheetsResult = try {
                withContext(Dispatchers.IO) {
                    SheetsSyncClient.sync(
                        settings = currentSettings,
                        deviceId = DeviceInfo.id(this@MainActivity),
                        notifications = snapshot
                    )
                }
            } catch (error: Exception) {
                val message = error.message ?: "Falha desconhecida."
                SheetsSyncMetadataStore.recordFailure(this@MainActivity, message)
                syncStatus = SyncStatus.Error(message)
                historySyncStatus = HistorySyncStatus.Error(message)
                return@launch
            }

            NotificationStore.markSynced(this@MainActivity, snapshot)
            SheetsSyncMetadataStore.recordSuccess(this@MainActivity, sheetsResult)
            syncStatus = SyncStatus.Success(
                sheetsResult.inserted,
                sheetsResult.duplicates,
                sheetsResult.ignored
            )

            val reconcileResult = awaitListenerReconciliation()
            if (reconcileResult == null) {
                historySyncStatus = HistorySyncStatus.Error(
                    "O servico de captura nao conseguiu reconectar."
                )
            } else if (reconcileResult.error != null) {
                historySyncStatus = HistorySyncStatus.Error(reconcileResult.error)
            } else {
                historySyncStatus = HistorySyncStatus.Success(
                    removed = reconcileResult.removedCount,
                    active = reconcileResult.activeCount
                )
            }
            refreshState()
        }
    }

    private suspend fun awaitListenerReconciliation(): NotificationCaptureService.ReconcileResult? {
        NotificationCaptureService.reconcileNow()?.let { return it }
        CaptureHealthStore.recordDisconnected(this, "Aguardando reconciliacao manual.")
        NotificationCaptureService.requestReconnect(this, "sincronizacao do historico")

        repeat(32) {
            delay(250)
            NotificationCaptureService.reconcileNow()?.let { return it }
        }
        return null
    }
}

@Composable
private fun NotificationArchiveScreen(
    darkModeEnabled: Boolean,
    rotationEnabled: Boolean,
    accessGranted: Boolean,
    notifications: List<CapturedNotification>,
    ignoredApps: List<IgnoredApp>,
    hiddenNotifications: List<HiddenNotification>,
    captureHealth: CaptureHealth,
    diagnosticEntries: List<DiagnosticEntry>,
    batteryUnrestricted: Boolean,
    syncSettings: SheetsSyncSettings,
    syncMetadata: SheetsSyncMetadata,
    syncStatus: SyncStatus,
    historySyncStatus: HistorySyncStatus,
    onOpenSettings: () -> Unit,
    onOpenBatterySettings: () -> Unit,
    onOpenAppSettings: () -> Unit,
    onCheckCapture: () -> Unit,
    onReconnectCapture: () -> Unit,
    onCopyDiagnostics: () -> Unit,
    onClearDiagnostics: () -> Unit,
    onDismissNotification: (CapturedNotification) -> Unit,
    onHideNotification: (CapturedNotification) -> Unit,
    onHistorySync: () -> Unit,
    onIgnoreApp: (String, String) -> Unit,
    onAllowApp: (String) -> Unit,
    onShowNotification: (String) -> Unit,
    onSaveSyncSettings: (SheetsSyncSettings) -> Unit,
    onSync: () -> Unit,
    onDarkModeChange: (Boolean) -> Unit,
    onRotationChange: (Boolean) -> Unit
) {
    var showCaptureSettings by remember { mutableStateOf(false) }
    var showFiltersDialog by remember { mutableStateOf(false) }
    var showSyncDialog by remember { mutableStateOf(false) }
    var pendingIgnore by remember { mutableStateOf<CapturedNotification?>(null) }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var unseenIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var knownIds by remember { mutableStateOf(notifications.map { it.id }.toSet()) }
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()
    val categories = notifications.map { it.category }.distinct().sorted()
    val visibleNotifications = selectedCategory?.let { category ->
        notifications.filter { it.category == category }
    } ?: notifications

    LaunchedEffect(notifications) {
        val currentIds = notifications.map { it.id }.toSet()
        val newIds = currentIds - knownIds
        if (newIds.isNotEmpty()) {
            val atTop = listState.firstVisibleItemIndex == 0 &&
                listState.firstVisibleItemScrollOffset < 12
            val visibleNewIds = notifications
                .filter { it.id in newIds && (selectedCategory == null || it.category == selectedCategory) }
                .mapTo(mutableSetOf()) { it.id }

            if (atTop && visibleNewIds.isNotEmpty()) {
                listState.scrollToItem(0)
            }
            unseenIds = if (atTop) {
                (unseenIds + (newIds - visibleNewIds)).intersect(currentIds)
            } else {
                (unseenIds + newIds).intersect(currentIds)
            }
        } else {
            unseenIds = unseenIds.intersect(currentIds)
        }
        knownIds = currentIds
    }

    LaunchedEffect(listState) {
        snapshotFlow {
            listState.layoutInfo.visibleItemsInfo.mapNotNull { it.key as? String }.toSet()
        }.collectLatest { visibleIds ->
            unseenIds = unseenIds - visibleIds
        }
    }

    if (showCaptureSettings) {
        CaptureSettingsScreen(
            accessGranted = accessGranted,
            captureHealth = captureHealth,
            diagnosticEntries = diagnosticEntries,
            batteryUnrestricted = batteryUnrestricted,
            onBack = { showCaptureSettings = false },
            onOpenSettings = onOpenSettings,
            onOpenBatterySettings = onOpenBatterySettings,
            onOpenAppSettings = onOpenAppSettings,
            onCheckCapture = onCheckCapture,
            onReconnectCapture = onReconnectCapture,
            onCopyDiagnostics = onCopyDiagnostics,
            onClearDiagnostics = onClearDiagnostics
        )
        return
    }

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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                HeaderToggle(
                    label = "Modo escuro",
                    checked = darkModeEnabled,
                    onCheckedChange = onDarkModeChange
                )
                Spacer(modifier = Modifier.size(16.dp))
                HeaderToggle(
                    label = "Permitir giro",
                    checked = rotationEnabled,
                    onCheckedChange = onRotationChange
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            AccessPanel(
                accessGranted = accessGranted,
                captureHealth = captureHealth,
                onConfigure = { showCaptureSettings = true }
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
                        text = historySyncStatusText(historySyncStatus, visibleNotifications.size),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp
                    )
                }
                if (unseenIds.isNotEmpty()) {
                    UnseenBadge(
                        count = unseenIds.size,
                        onClick = {
                            selectedCategory = null
                            coroutineScope.launch { listState.animateScrollToItem(0) }
                        }
                    )
                    Spacer(modifier = Modifier.size(4.dp))
                }
                TextButton(onClick = { showFiltersDialog = true }) {
                    val activeFilters = ignoredApps.size + hiddenNotifications.size +
                        if (selectedCategory == null) 0 else 1
                    Text("Filtros ($activeFilters)")
                }
                Spacer(modifier = Modifier.size(6.dp))
                TextButton(
                    onClick = onHistorySync,
                    enabled = accessGranted &&
                        captureHealth.listenerConnected &&
                        historySyncStatus !is HistorySyncStatus.Running
                ) {
                    Text(
                        if (historySyncStatus is HistorySyncStatus.Running) {
                            "Aguarde..."
                        } else {
                            "Sincronizar"
                        }
                    )
                }
            }

            if (visibleNotifications.isEmpty()) {
                EmptyState(modifier = Modifier.weight(1f))
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(visibleNotifications, key = { it.id }) { notification ->
                        NotificationItem(
                            notification = notification,
                            onDismiss = { onDismissNotification(notification) },
                            onHide = { onHideNotification(notification) },
                            onIgnore = { pendingIgnore = notification }
                        )
                    }
                }
            }
        }
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
            categories = categories,
            selectedCategory = selectedCategory,
            ignoredApps = ignoredApps,
            hiddenNotifications = hiddenNotifications,
            onDismiss = { showFiltersDialog = false },
            onSelectCategory = {
                selectedCategory = it
                showFiltersDialog = false
            },
            onAllow = onAllowApp,
            onShow = onShowNotification
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
private fun HeaderToggle(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp
        )
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun UnseenBadge(count: Int, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(28.dp)
            .background(MaterialTheme.colorScheme.primary, CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = count.toString(),
            color = MaterialTheme.colorScheme.onPrimary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

private fun historySyncStatusText(status: HistorySyncStatus, itemCount: Int): String =
    when (status) {
        HistorySyncStatus.Idle -> "$itemCount itens"
        HistorySyncStatus.Running -> "Sincronizando celular e Sheets..."
        is HistorySyncStatus.Success ->
            "${status.removed} removidos; ${status.active} ativos no celular"
        is HistorySyncStatus.Error -> "Falha: ${status.message}"
    }

@Composable
private fun AccessPanel(
    accessGranted: Boolean,
    captureHealth: CaptureHealth,
    onConfigure: () -> Unit
) {
    val active = accessGranted && captureHealth.listenerConnected
    val container = if (active) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.tertiaryContainer
    }
    val content = if (active) {
        MaterialTheme.colorScheme.onPrimaryContainer
    } else {
        MaterialTheme.colorScheme.onTertiaryContainer
    }

    Surface(
        shape = RoundedCornerShape(8.dp),
        color = container,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .background(content, CircleShape)
            )
            Spacer(modifier = Modifier.size(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (active) "Captura ativa" else "Captura requer atencao",
                    color = content,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = if (!accessGranted) {
                        "Acesso nao concedido"
                    } else if (!captureHealth.listenerConnected &&
                        captureHealth.lastReconnectAttemptAt > 0
                    ) {
                        "Desconectado; tentativa ${formatTimestamp(captureHealth.lastReconnectAttemptAt)}"
                    } else if (!captureHealth.listenerConnected) {
                        "Servico desconectado"
                    } else {
                        "Servico conectado"
                    },
                    color = content,
                    fontSize = 12.sp
                )
            }
            TextButton(onClick = onConfigure) {
                Text("Configurar", color = content)
            }
        }
    }
}

@Composable
private fun CaptureSettingsScreen(
    accessGranted: Boolean,
    captureHealth: CaptureHealth,
    diagnosticEntries: List<DiagnosticEntry>,
    batteryUnrestricted: Boolean,
    onBack: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenBatterySettings: () -> Unit,
    onOpenAppSettings: () -> Unit,
    onCheckCapture: () -> Unit,
    onReconnectCapture: () -> Unit,
    onCopyDiagnostics: () -> Unit,
    onClearDiagnostics: () -> Unit
) {
    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 20.dp)
        ) {
            TextButton(onClick = onBack) { Text("Voltar") }
            Text(
                text = "Diagnostico de captura",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Estado real do listener e eventos recentes deste aparelho.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp
            )
            Spacer(modifier = Modifier.height(20.dp))
            DiagnosticRow(
                label = "Acesso a notificacoes",
                value = if (accessGranted) "Concedido" else "Bloqueado",
                healthy = accessGranted,
                action = "Abrir",
                onAction = onOpenSettings
            )
            DiagnosticRow(
                label = "Servico em segundo plano",
                value = if (captureHealth.listenerConnected) "Conectado" else "Desconectado",
                healthy = captureHealth.listenerConnected
            )
            DiagnosticRow(
                label = "Ultima conexao",
                value = formatOptionalTimestamp(captureHealth.lastConnectedAt),
                healthy = captureHealth.lastConnectedAt > 0
            )
            DiagnosticRow(
                label = "Ultima desconexao",
                value = formatOptionalTimestamp(captureHealth.lastDisconnectedAt),
                healthy = captureHealth.lastDisconnectedAt == 0L || captureHealth.listenerConnected
            )
            DiagnosticRow(
                label = "Ultima captura",
                value = formatOptionalTimestamp(captureHealth.lastNotificationAt),
                healthy = captureHealth.lastNotificationAt > 0
            )
            DiagnosticRow(
                label = "Ultima tentativa de reconexao",
                value = if (captureHealth.lastReconnectAttemptAt > 0) {
                    "${formatTimestamp(captureHealth.lastReconnectAttemptAt)} " +
                        "(${captureHealth.reconnectAttemptCount} tentativas)"
                } else {
                    "Nenhuma"
                },
                healthy = captureHealth.listenerConnected
            )
            DiagnosticRow(
                label = "Otimizacao de bateria",
                value = if (batteryUnrestricted) "Sem restricao" else "Ativa",
                healthy = batteryUnrestricted,
                action = "Abrir",
                onAction = onOpenBatterySettings
            )

            if (captureHealth.lastError.isNotBlank()) {
                Surface(
                    color = Color(0xFFFFE8D6),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = "Ultimo problema",
                            color = Color(0xFF6E3515),
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = captureHealth.lastError,
                            color = Color(0xFF6E3515),
                            fontSize = 13.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
            Text("Comandos seguros", fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Button(onClick = onCheckCapture, modifier = Modifier.fillMaxWidth()) {
                Text("Verificar servico agora")
            }
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(onClick = onReconnectCapture, modifier = Modifier.fillMaxWidth()) {
                Text("Solicitar reconexao")
            }
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(onClick = onCopyDiagnostics, modifier = Modifier.fillMaxWidth()) {
                Text("Copiar relatorio")
            }
            TextButton(onClick = onClearDiagnostics, modifier = Modifier.fillMaxWidth()) {
                Text("Limpar eventos")
            }
            TextButton(onClick = onOpenAppSettings, modifier = Modifier.fillMaxWidth()) {
                Text("Abrir detalhes do app")
            }

            Spacer(modifier = Modifier.height(20.dp))
            Text("Terminal de eventos", fontWeight = FontWeight.Bold)
            Text(
                text = "Os registros ficam no aparelho por 7 dias e nao incluem texto de notificacoes.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp
            )
            Spacer(modifier = Modifier.height(8.dp))
            Surface(
                color = Color(0xFF161A18),
                shape = RoundedCornerShape(6.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 180.dp, max = 320.dp)
            ) {
                SelectionContainer {
                    Column(
                        modifier = Modifier
                            .verticalScroll(rememberScrollState())
                            .padding(12.dp)
                    ) {
                        Text(
                            text = diagnosticEntries.asReversed().take(100)
                                .joinToString("\n") { it.displayLine() }
                                .ifBlank { "Nenhum evento registrado." },
                            color = Color(0xFFB8E8C7),
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            lineHeight = 16.sp
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}

@Composable
private fun DiagnosticRow(
    label: String,
    value: String,
    healthy: Boolean,
    action: String? = null,
    onAction: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(9.dp)
                .background(
                    if (healthy) Color(0xFF146C60) else Color(0xFFB45A24),
                    CircleShape
                )
        )
        Spacer(modifier = Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(label, fontWeight = FontWeight.SemiBold)
            Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        }
        if (action != null && onAction != null) {
            TextButton(onClick = onAction) { Text(action) }
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
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer
        ),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Google Sheets", fontWeight = FontWeight.Bold)
                    Text(
                        text = syncStatusText(status, configured, pendingCount, metadata),
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
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
        metadata.lastError.isNotBlank() ->
            "Automatico ativo; $pendingCount pendentes. Falha: ${metadata.lastError}"
        pendingCount > 0 -> "Automatico ativo; $pendingCount aguardando envio."
        metadata.lastSuccessAt > 0 -> {
            val server = metadata.serverVersion.ifBlank { "anterior" }
            "Automatico ativo; sincronizado em ${formatTimestamp(metadata.lastSuccessAt)} (servidor $server)."
        }
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
private fun NotificationItem(
    notification: CapturedNotification,
    onDismiss: () -> Unit,
    onHide: () -> Unit,
    onIgnore: () -> Unit
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.StartToEnd -> {
                    onDismiss()
                    true
                }
                SwipeToDismissBoxValue.EndToStart -> {
                    onIgnore()
                    false
                }
                SwipeToDismissBoxValue.Settled -> false
            }
        },
        positionalThreshold = { distance -> distance * 0.35f }
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            val deleting = dismissState.dismissDirection == SwipeToDismissBoxValue.StartToEnd
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        if (deleting) Color(0xFF9F3F37) else Color(0xFF6A4F7D),
                        RoundedCornerShape(8.dp)
                    )
                    .padding(horizontal = 20.dp),
                contentAlignment = if (deleting) Alignment.CenterStart else Alignment.CenterEnd
            ) {
                Text(
                    text = if (deleting) "Excluir" else "Ignorar app",
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            }
        },
        content = {
            Card(
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            modifier = Modifier.weight(1f),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = notification.appName,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                            Text(
                                text = notification.category,
                                color = MaterialTheme.colorScheme.primary,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                modifier = Modifier.padding(start = 8.dp)
                            )
                        }
                        Text(
                            text = formatTimestamp(notification.postedAt),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(start = 8.dp)
                        )
                    }
                    if (notification.title.isNotBlank()) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(notification.title, fontWeight = FontWeight.SemiBold)
                    }
                    if (notification.text.isNotBlank()) {
                        Text(
                            notification.text,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (notification.syncedAt == null) {
                            Text(
                                text = "Pendente",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 11.sp,
                                modifier = Modifier.weight(1f)
                            )
                        } else {
                            Row(
                                modifier = Modifier.weight(1f),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(16.dp)
                                        .background(MaterialTheme.colorScheme.primary, CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = "\u2713",
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Spacer(modifier = Modifier.size(6.dp))
                                Text(
                                    text = "Na planilha",
                                    color = MaterialTheme.colorScheme.primary,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                        TextButton(onClick = onHide) {
                            Text("Ocultar")
                        }
                    }
                }
            }
        }
    )
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
    categories: List<String>,
    selectedCategory: String?,
    ignoredApps: List<IgnoredApp>,
    hiddenNotifications: List<HiddenNotification>,
    onDismiss: () -> Unit,
    onSelectCategory: (String?) -> Unit,
    onAllow: (String) -> Unit,
    onShow: (String) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Filtros locais") },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 360.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text("Categoria do historico", fontWeight = FontWeight.Bold)
                CategoryFilterRow(
                    label = "Todas",
                    selected = selectedCategory == null,
                    onClick = { onSelectCategory(null) }
                )
                categories.forEach { category ->
                    CategoryFilterRow(
                        label = category,
                        selected = selectedCategory == category,
                        onClick = { onSelectCategory(category) }
                    )
                }
                if (ignoredApps.isNotEmpty() || hiddenNotifications.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    if (ignoredApps.isNotEmpty()) {
                        Text("Apps ignorados", fontWeight = FontWeight.Bold)
                    }
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
                    if (hiddenNotifications.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Notificacoes ocultas", fontWeight = FontWeight.Bold)
                    }
                    hiddenNotifications.forEach { item ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.appName, fontWeight = FontWeight.SemiBold)
                                Text(item.title.ifBlank { "Notificacao sem titulo" }, fontSize = 11.sp)
                            }
                            TextButton(onClick = { onShow(item.sourceKey) }) {
                                Text("Mostrar")
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
private fun CategoryFilterRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = if (selected) "\u2713" else "",
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.size(24.dp)
        )
        Text(
            text = label,
            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal
        )
    }
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
                Text("Cole a URL da implantacao e o token salvo nas Script Properties.")
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

private fun formatOptionalTimestamp(timestamp: Long): String =
    if (timestamp > 0) formatTimestamp(timestamp) else "Nenhuma"

private val LightColors = lightColorScheme(
    primary = Color(0xFF146C60),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCEFE8),
    onPrimaryContainer = Color(0xFF16483E),
    secondary = Color(0xFF7A5534),
    secondaryContainer = Color(0xFFECE8F3),
    onSecondaryContainer = Color(0xFF403652),
    tertiary = Color(0xFF8B3A3A),
    tertiaryContainer = Color(0xFFFFE8D6),
    onTertiaryContainer = Color(0xFF6E3515),
    background = Color(0xFFF7F8F6),
    onBackground = Color(0xFF1D211F),
    surface = Color(0xFFF7F8F6),
    onSurface = Color(0xFF1D211F),
    surfaceVariant = Color(0xFFE8ECE9),
    onSurfaceVariant = Color(0xFF4A514D)
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF7FD5C4),
    onPrimary = Color(0xFF00382F),
    primaryContainer = Color(0xFF16483E),
    onPrimaryContainer = Color(0xFFB4F1E3),
    secondary = Color(0xFFE9BE94),
    secondaryContainer = Color(0xFF4A405A),
    onSecondaryContainer = Color(0xFFECE5F5),
    tertiary = Color(0xFFFFB3AE),
    tertiaryContainer = Color(0xFF633B37),
    onTertiaryContainer = Color(0xFFFFDAD7),
    background = Color(0xFF101412),
    onBackground = Color(0xFFE0E4E1),
    surface = Color(0xFF101412),
    onSurface = Color(0xFFE0E4E1),
    surfaceVariant = Color(0xFF252B28),
    onSurfaceVariant = Color(0xFFC1C9C4)
)

@Composable
private fun NotificaArquivoTheme(
    darkTheme: Boolean,
    content: @Composable () -> Unit
) {
    MaterialTheme(colorScheme = if (darkTheme) DarkColors else LightColors, content = content)
}

private const val UI_PREFERENCES = "ui_preferences"
private const val DARK_MODE_KEY = "dark_mode"
private const val ROTATION_ENABLED_KEY = "rotation_enabled"
