# Notifica Arquivo

Projeto inicial Android em Kotlin e Jetpack Compose. Esta primeira versao:

- Abre uma tela funcional, equivalente ao primeiro "Hello World" do projeto.
- Leva o usuario a tela de acesso a notificacoes do Android.
- Captura titulo e texto de novas notificacoes.
- Guarda ate 500 itens localmente no aparelho.
- Mostra o historico quando o aplicativo e reaberto.

Ela ainda nao envia dados para a internet e ainda nao possui banco Room, login,
Google Sheets ou edicao de categorias.

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

## Onde comecar a ler o codigo

- `MainActivity.kt`: tela e botao de permissao.
- `NotificationCaptureService.kt`: recebe cada notificacao nova.
- `NotificationStore.kt`: salva e recupera os dados locais.
- `CapturedNotification.kt`: define os campos de uma notificacao.
- `docs/ARQUITETURA.md`: desenho da evolucao para Sheets, dashboard e iOS.

## Proxima pequena entrega

Substituir o armazenamento provisório por Room, adicionar categorias editaveis e
um filtro de aplicativos que nunca devem ter o conteudo salvo.
