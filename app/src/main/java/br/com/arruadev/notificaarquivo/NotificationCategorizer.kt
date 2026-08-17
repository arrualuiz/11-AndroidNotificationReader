package br.com.arruadev.notificaarquivo

object NotificationCategorizer {
    fun categoryFor(
        packageName: String,
        appName: String,
        title: String = "",
        text: String = ""
    ): String {
        val source = "$packageName $appName $title $text".lowercase()
        return when {
            source.containsAny(
                "santander",
                "c6bank",
                "c6 bank",
                "intermedium",
                "banco inter",
                "bancointer",
                "caixa tem",
                "br.gov.caixa",
                "com.nu.production",
                "nubank",
                "neon",
                "riachuelo",
                "midway"
            ) -> "Financeiro"
            source.containsAny("whatsapp", "telegram", "messenger", "com.google.android.apps.messaging") ->
                "Mensagens"
            source.containsAny("ifood", "rappi", "uber eats", "99food") -> "Entregas"
            source.containsAny("duolingo", "coursera", "udemy") -> "Educacao"
            source.containsAny("mercadolibre", "mercado livre", "shopee", "amazon") -> "Compras"
            packageName == "android" ||
                packageName.startsWith("com.android.") ||
                packageName.startsWith("com.miui.") ||
                packageName.startsWith("com.xiaomi.") -> "Sistema"
            else -> "Outros"
        }
    }

    private fun String.containsAny(vararg values: String): Boolean =
        values.any(::contains)
}
