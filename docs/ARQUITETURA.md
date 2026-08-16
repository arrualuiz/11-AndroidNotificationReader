# Rascunho da arquitetura

## Objetivo

Guardar notificacoes no Android, classifica-las e consultar os dados pelo iPhone.

## Caminho recomendado

```text
Aplicativos no Android
        |
NotificationListenerService
        |
Banco local no Android (Room, na proxima etapa)
        |
Sincronizacao HTTPS
        |
API propria ou Google Apps Script
        |
Google Sheets no prototipo / PostgreSQL na versao madura
        |
Dashboard web (Netlify) e, se fizer sentido, app iOS
```

O coletor Android e o visualizador sao responsabilidades diferentes. Eles podem ser
dois aplicativos, mas devem compartilhar o mesmo formato de dados e a mesma API.

## Por que comecar com um dashboard web

- Funciona no iPhone, Android e computador com uma unica base de codigo.
- Pode ser adicionado a tela inicial do iPhone como PWA.
- Netlify e suficiente para hospedar a interface.
- Permite validar categorias e graficos antes de investir em um app iOS nativo.

## Quando criar o app iOS

Um app iOS para **consultar seu banco** e relativamente direto: SwiftUI para as telas,
`URLSession` para chamar uma API HTTPS e armazenamento local para cache. O trabalho
fica maior quando entram login seguro, sincronizacao offline, notificacoes push,
publicacao na App Store e manutencao de duas interfaces.

Para desenvolver nativamente, voce precisa de macOS e Xcode. Publicar na App Store
exige participar do Apple Developer Program. Nao e preciso publicar para validar
primeiro a ideia com um dashboard web.

## Limite importante do iPhone

O iOS nao oferece a um aplicativo comum uma API equivalente ao
`NotificationListenerService` do Android para ler as notificacoes de todos os outros
apps. Uma extensao de notificacao da Apple atua sobre notificacoes remotas destinadas
ao proprio aplicativo que contem a extensao. Portanto, migrar o coletor inteiro para
um iPhone no futuro nao preserva a mesma captura geral.

Alternativas futuras no iPhone:

- Integrar diretamente as fontes dos dados, como APIs de bancos, e-mail ou servicos.
- Usar automacoes/atalhos apenas nos fluxos que o iOS permitir.
- Receber dados enviados por um servidor ou por apps que voce controla.
- Manter um aparelho Android barato como coletor dedicado, caso a captura geral seja
  indispensavel.

## Modelo inicial de uma notificacao

```json
{
  "id": "identificador-unico",
  "deviceId": "redmi-note-6-pro",
  "packageName": "com.exemplo.app",
  "appName": "Aplicativo",
  "title": "Titulo",
  "text": "Conteudo",
  "postedAt": "2026-08-16T13:45:00-03:00",
  "category": "Sem categoria",
  "sensitive": false
}
```

## Etapas sugeridas

1. Rodar esta versao local e confirmar a captura no Redmi.
2. Trocar `SharedPreferences` por Room e criar busca/categorias.
3. Criar filtros de privacidade para bancos, autenticadores e mensagens sensiveis.
4. Enviar lotes para um endpoint do Google Apps Script e registrar no Sheets.
5. Criar o dashboard responsivo e protege-lo com autenticacao.
6. Avaliar se o dashboard ja resolve o uso no iPhone antes de criar um app nativo.

