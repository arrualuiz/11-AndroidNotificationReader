package br.com.arruadev.notificaarquivo

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {
    private var notifications by mutableStateOf<List<CapturedNotification>>(emptyList())
    private var accessGranted by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // >>> DISPARA A NOTIFICAÇÃO DE TESTE ASSIM QUE O APP ABRIR <<<
        dispararNotificacaoTeste(this)

        setContent {
            NotificaArquivoTheme {
                NotificationArchiveScreen(
                    accessGranted = accessGranted,
                    notifications = notifications,
                    onOpenSettings = ::openNotificationAccessSettings
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        accessGranted = NotificationManagerCompat.getEnabledListenerPackages(this)
            .contains(packageName)
        notifications = NotificationStore.read(this)
    }

    private fun openNotificationAccessSettings() {
        startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }
}

// >>> FUNÇÃO QUE GERA A NOTIFICAÇÃO DE TESTE <<<
fun dispararNotificacaoTeste(context: Context) {
    val channelId = "canal_teste_captura"
    val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(
            channelId,
            "Canal de Testes",
            NotificationManager.IMPORTANCE_DEFAULT
        )
        notificationManager.createNotificationChannel(channel)
    }

    val builder = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle("Teste do NotificaArquivo")
        .setContentText("Capturando essa notificação de teste!")
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)

    notificationManager.notify(1, builder.build())
}

@Composable
private fun NotificationArchiveScreen(
    accessGranted: Boolean,
    notifications: List<CapturedNotification>,
    onOpenSettings: () -> Unit
) {
    Surface(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 24.dp)) {
            Text(
                text = "Notifica Arquivo",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Seu arquivo local de notificacoes",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(20.dp))

            AccessPanel(accessGranted = accessGranted, onOpenSettings = onOpenSettings)

            Spacer(modifier = Modifier.height(24.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Historico",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "${notifications.size} itens",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            if (notifications.isEmpty()) {
                EmptyState(modifier = Modifier.weight(1f))
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(notifications, key = { it.id }) { notification ->
                        NotificationItem(notification)
                    }
                }
            }
        }
    }
}

@Composable
private fun AccessPanel(accessGranted: Boolean, onOpenSettings: () -> Unit) {
    val container = if (accessGranted) Color(0xFFDCEFE8) else Color(0xFFFFE8D6)
    val content = if (accessGranted) Color(0xFF16483E) else Color(0xFF6E3515)

    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = container),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = if (accessGranted) "Captura ativada" else "Acesso ainda nao ativado",
                color = content,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = if (accessGranted) {
                    "As proximas notificacoes com texto serao guardadas neste aparelho."
                } else {
                    "O Android exige que voce autorize manualmente o acesso."
                },
                color = content
            )
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = onOpenSettings) {
                Text(if (accessGranted) "Revisar acesso" else "Permitir acesso")
            }
        }
    }
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
private fun NotificationItem(notification: CapturedNotification) {
    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
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
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = notification.category,
                color = MaterialTheme.colorScheme.primary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
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
    val isDark = isSystemInDarkTheme()
    MaterialTheme(colorScheme = if (isDark) DarkColors else LightColors, content = content)
}