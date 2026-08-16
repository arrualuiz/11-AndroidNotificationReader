# Notifica Arquivo

Projeto inicial Android em Kotlin e Jetpack Compose. Esta primeira versao:

- Abre uma tela funcional, equivalente ao primeiro "Hello World" do projeto.
- Leva o usuario a tela de acesso a notificacoes do Android.
- Captura titulo e texto de novas notificacoes.
- Guarda ate 500 itens localmente no aparelho.
- Mostra o historico quando o aplicativo e reaberto.

A versao 0.2.0 tambem consolida notificacoes identicas, atualiza a tela ao vivo,
permite limpar o historico, ignorar aplicativos repetitivos e enviar manualmente os
registros para um Google Sheets por meio de um endpoint do Apps Script.

Ela ainda nao possui banco Room, login, sincronizacao automatica ou edicao de
categorias dentro do Android.

## O que instalar

Este computador ja possui o Android Studio e o Android SDK instalados em
`C:\Program Files\Android\Android Studio`. O Android Studio ja traz um JDK adequado;
nao e necessario instalar Java separadamente para este projeto.

O VS Code pode editar os arquivos Kotlin, mas o Android Studio e a melhor ferramenta
para sincronizar o Gradle, instalar SDKs, depurar e gerar o APK.

## Como abrir

1. Abra o Android Studio.
2. Escolha **Open**.
3. Selecione a pasta `NotificaArquivo`, onde esta este arquivo.
4. Aguarde o Gradle terminar de baixar e sincronizar as dependencias.
5. Se o Android Studio oferecer instalar o Android SDK 36, aceite.

## Como testar no Redmi Note 6 Pro

1. No celular, ative **Opcoes do desenvolvedor** tocando varias vezes em
   **Configuracoes > Sobre o telefone > Versao da MIUI**.
2. Ative **Depuracao USB** nas opcoes do desenvolvedor.
3. Conecte o celular por USB e autorize a chave de depuracao.
4. No Android Studio, selecione o Redmi na barra superior e pressione **Run**.
5. Abra o app e toque em **Permitir acesso**.
6. Na lista do Android, habilite **Notifica Arquivo**.
7. Receba uma notificacao de teste e volte ao aplicativo.

Em aparelhos Xiaomi/MIUI, habilite tambem o inicio automatico do app e remova a
restricao de bateria se a captura parar depois de algum tempo.

## Como conectar ao Google Sheets

Na pasta `google-sheets` existem tres entregaveis:

- `Modelo-Notifica-Arquivo.xlsx`: planilha pronta para importar no Google Drive.
- `Code.gs`: endpoint que recebe os dados enviados pelo Android.
- `COMO-CONECTAR.md`: instrucoes completas de configuracao e implantacao.

Depois de implantar o Apps Script como Aplicativo da Web, copie a URL `/exec` e o
token para o painel **Google Sheets > Configurar** do aplicativo. O botao
**Enviar agora** manda o historico local; IDs existentes nao sao duplicados.

## Onde comecar a ler o codigo

- `MainActivity.kt`: tela e botao de permissao.
- `NotificationCaptureService.kt`: recebe cada notificacao nova.
- `NotificationStore.kt`: salva e recupera os dados locais.
- `SheetsSync.kt`: envia um lote JSON para o Apps Script.
- `CapturedNotification.kt`: define os campos de uma notificacao.
- `docs/ARQUITETURA.md`: desenho da evolucao para Sheets, dashboard e iOS.

## Proxima pequena entrega

Substituir o armazenamento provisorio por Room, adicionar categorias editaveis no
Android e agendar sincronizacao automatica somente em redes confiaveis.
