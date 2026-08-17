# Notifica Arquivo

Projeto inicial Android em Kotlin e Jetpack Compose. Esta primeira versao:

- Abre uma tela funcional, equivalente ao primeiro "Hello World" do projeto.
- Leva o usuario a tela de acesso a notificacoes do Android.
- Captura titulo e texto de novas notificacoes.
- Guarda ate 2.000 itens localmente no aparelho.
- Mostra o historico quando o aplicativo e reaberto.

A versao 0.5.2 tambem consolida notificacoes identicas, atualiza a tela ao vivo,
permite ocultar itens enviados, ignorar aplicativos repetitivos e sincroniza os registros
automaticamente com um Google Sheets por meio de um endpoint do Apps Script.

Cada registro fica pendente no aparelho ate o Sheets confirmar o recebimento. O app
tenta enviar cerca de 15 segundos depois de uma notificacao e mantem uma verificacao
periodica, com internet, a cada 15 minutos. O botao **Enviar agora** continua como
alternativa manual.

Na lista, arrastar para a direita executa **Excluir** e tenta fechar tambem a
notificacao do sistema. Arrastar para a esquerda abre **Ignorar app**. O botao
**Ocultar** cria uma regra local persistente para aquela notificacao, util para avisos
fixos. Os dados que ja chegaram ao Sheets permanecem na planilha.

O botao **Sincronizar** do historico primeiro confirma o lote no Sheets e depois
reconcilia a lista com as notificacoes ativas do Redmi. Ele permanece carregando ate
terminar, informa quantos itens foram removidos e atualiza o horario da sincronizacao.

Ela ainda nao possui banco Room, login ou edicao de categorias dentro do Android.

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

Para o funcionamento mais automatico possivel no Redmi:

1. Ative o acesso de notificacoes do **Notifica Arquivo**.
2. Em **Configuracoes > Apps > Gerenciar apps > Notifica Arquivo**, ative
   **Inicio automatico**.
3. Em bateria/economia de bateria do aplicativo, escolha **Sem restricoes**.
4. Nao use **Forcar parada** e nao revogue o acesso a notificacoes.

Depois dessa configuracao inicial, nao e necessario manter a tela do aplicativo
aberta. A captura e o envio usam servicos de segundo plano do Android. O envio nao e
de horario exato: o Android pode adia-lo para economizar bateria. Sem internet, os
itens permanecem pendentes e voltam a ser tentados quando a rede estiver disponivel.

## Como conectar ao Google Sheets

Na pasta `google-sheets` existem tres entregaveis:

- `Modelo-Notifica-Arquivo.xlsx`: planilha pronta para importar no Google Drive.
- `Code.gs`: endpoint que recebe os dados enviados pelo Android.
- `COMO-CONECTAR.md`: instrucoes completas de configuracao e implantacao.

Depois de implantar o Apps Script como Aplicativo da Web, copie a URL `/exec` e o
token para o painel **Google Sheets > Configurar** do aplicativo. Ao salvar, o envio
automatico e ativado; IDs existentes nao sao duplicados.

## Onde comecar a ler o codigo

- `MainActivity.kt`: tela e botao de permissao.
- `NotificationCaptureService.kt`: recebe cada notificacao nova.
- `NotificationStore.kt`: salva e recupera os dados locais.
- `SheetsSync.kt`: envia um lote JSON para o Apps Script.
- `SheetsSyncWorker.kt`: agenda envios automaticos e novas tentativas.
- `CapturedNotification.kt`: define os campos de uma notificacao.
- `docs/ARQUITETURA.md`: desenho da evolucao para Sheets, dashboard e iOS.

## Proxima pequena entrega

Substituir o armazenamento provisorio por Room e adicionar categorias editaveis no
Android. Room sera importante quando o arquivo local crescer alem deste prototipo.
