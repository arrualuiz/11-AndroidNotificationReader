# Notifica Arquivo

Aplicativo Android em Kotlin e Jetpack Compose para arquivar notificacoes localmente
e sincroniza-las com um Google Sheets.

## Novidades do Apps Script 0.7.1 (depois da v0.8.0)

O aplicativo Android continua na 0.8.0; as mudancas abaixo estao todas em
`google-sheets/Code.gs` (que passou de `API_VERSION = '0.7.0'` para `'0.7.1'`) e na
documentacao.

**Catalogo de cartoes de credito**

- Nova aba `Cartoes de credito` (tabela `CatalogoCartoes`), montada a partir do
  historico: instituicao, quatro ultimos digitos, primeira e ultima notificacao,
  quantidade de compras aprovadas e total observado.
- Colunas editaveis e preservadas a cada reconstrucao: `Tipo` (`Nao informado`,
  `Virtual` ou `Fisico`), `Apelido`, `Titular` e `Uso principal` (`Geral`, `Assinaturas`,
  `Comida na rua`, `Compras` ou `Outro`). Cartoes com tipo `Nao informado` ficam
  marcados em `Revisar?`.
- `Lancamentos` passa a usar o catalogo: o tipo escolhido corrige `Cartao virtual?` e o
  uso principal classifica compras cujo estabelecimento ainda nao e reconhecido.
- Nova Script Property opcional `SHEET_CREDIT_CARDS` para o nome da aba.

**Lancamentos e categorias mais corretos**

- Compras recusadas ou nao aprovadas continuam como aviso financeiro, mas nunca viram
  lancamento.
- Confirmacoes de pagamento ou de pedido pago da Shopee, Mercado Livre, Amazon e Shein
  ficam em `Compras`, sem duplicar a cobranca que o banco ja notifica.
- Nova categoria `Seguranca`: mensagens cujo texto parece um token, chave ou senha sao
  classificadas assim e marcadas como sensiveis. Itens `Financeiro` e `Seguranca` sao
  sempre sensiveis. Qualquer token exposto deve ser trocado mesmo assim.
- Novas regras automaticas: Serasa em `Promocoes`, Pierre em `Financas pessoais`,
  Instagram em `Social`, Shein em `Compras` e o aviso de mapas off-line do Google Maps
  em `Sistema`. Linhas antes classificadas como `Outros` sao recalculadas.
- `Assinaturas` reconhece tambem Google One, Google Drive, iCloud, CapCut, ChatGPT/OpenAI
  e Dropbox.
- Valores aceitos em mais formatos: `R$ 1.234,56`, `R$ 1,234.56` e `R$ 50`.
- O final do cartao e lido mesmo com mascara (`final **** 1234`, `final •• 1234`).

**Relatorios de erro**

- Se a pasta de debug configurada estiver indisponivel, o relatorio e salvo em
  `Meu Drive/NotificaArquivo-Debug` e registra isso no proprio relatorio, em vez de a
  gravacao do erro falhar tambem.

### Como conferir se o Apps Script publicado esta nesta versao

1. Abra no navegador a URL `/exec` do aplicativo da web (a mesma configurada no Android).
2. A resposta mostra `apiVersion`. Se for `0.7.1`, o script publicado esta sincronizado
   com este repositorio.
3. Se ainda for `0.7.0`: cole o `google-sheets/Code.gs` no editor do Apps Script, salve,
   abra **Implantar > Gerenciar implantacoes**, edite a implantacao e escolha **Nova
   versao** (a URL continua a mesma). Depois execute `prepararPlanilha` uma vez para criar
   a aba `Cartoes de credito`.

## Versao 0.8.0

- Recupera automaticamente o listener de notificacoes quando a MIUI o desconecta.
- Adiciona uma tela de diagnostico com estado da captura, eventos recentes, reconexao,
  copia de relatorio e atalhos para as configuracoes do Android.
- Mantem logs locais de erro por sete dias, sem gravar texto de notificacoes,
  credenciais ou URL do endpoint.
- Protege o token de sincronizacao com o Android Keystore e melhora as tentativas em
  segundo plano com WorkManager.
- Atualiza o historico ao vivo, conta itens ainda nao vistos, mostra o check de envio
  ao Sheets e permite ocultar, excluir ou ignorar um aplicativo.
- Organiza o Apps Script e as abas Notificacoes, Financeiro, Lancamentos, Categorias,
  Aplicativos, Dashboard, Dashboard financeiro, Ajuda e Backup dados, com recuperacao
  de esquema e remocao de duplicatas.
- Armazena configuracoes sensiveis nas Script Properties e cria relatorios diarios no
  Drive somente quando uma execucao falha.
- Adiciona um icone adaptativo proprio ao aplicativo.
- Atualiza os dashboards a cada recebimento e reprocessa todo o historico a cada cinco
  minutos, separando propagandas de movimentacoes financeiras.
- Gera as abas `Lancamentos` e `Dashboard financeiro`, com filtro de periodo, valores
  por estabelecimento e horario, cartao virtual e totais de Shopee, iFood, Uber e
  comida na rua.

Funcionalidades principais:

- Abre uma tela funcional, equivalente ao primeiro "Hello World" do projeto.
- Leva o usuario a tela de acesso a notificacoes do Android.
- Captura titulo e texto de novas notificacoes.
- Guarda ate 2.000 itens localmente no aparelho.
- Mostra o historico quando o aplicativo e reaberto.

A versao 0.8.0 tambem consolida notificacoes identicas, atualiza a tela ao vivo,
permite ocultar itens enviados, ignorar aplicativos repetitivos e sincroniza os registros
automaticamente com um Google Sheets por meio de um endpoint do Apps Script.
O token de sincronizacao e criptografado no aparelho com uma chave do Android Keystore.

A tela **Diagnostico de captura** registra conexoes, desconexoes, tentativas de
recuperacao e falhas de sincronizacao. Os logs ficam no armazenamento interno por sete
dias, separados por data, sem titulo ou texto das notificacoes, URL ou token. Nessa tela
tambem e possivel verificar o listener, solicitar reconexao, copiar um relatorio e abrir
as configuracoes necessarias. Quando o Android desconecta o listener, o app solicita um
novo vinculo imediatamente e mantem uma verificacao automatica a cada 15 minutos.

O historico mostra um check nos itens confirmados pelo Sheets, conta notificacoes ainda
nao vistas quando a lista esta rolada e permite filtrar por categorias locais.

O sincronismo manual tambem compara o historico com o celular e mantem apenas a
versao mais recente de cada notificacao que ainda estiver ativa.

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
3. Selecione `C:\DEV\01-Android\NotificaArquivo`.
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

### Espelhar o Redmi no Android Studio

Com a depuracao USB autorizada, abra **View > Tool Windows > Running Devices**. Se o
Redmi nao aparecer automaticamente, abra **File > Settings > Tools > Device
Mirroring**, habilite o espelhamento de aparelhos fisicos e reconecte o cabo USB.
Clique na tela do Redmi dentro de **Running Devices** para usar mouse e teclado.

### Usar o Chrome como navegador padrao

No Redmi, abra **Configuracoes > Apps > Gerenciar apps > tres pontos > Apps padrao >
Navegador** e selecione **Chrome**. O Mi Browser pode ser desativado em sua tela de
informacoes; se a MIUI esconder essa opcao, o comando ADB reversivel e:

```powershell
adb shell pm disable-user --user 0 com.mi.globalbrowser
```

Para reativa-lo depois:

```powershell
adb shell pm enable --user 0 com.mi.globalbrowser
```

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

O token, o ID da planilha, a pasta de debug e os nomes das abas ficam nas Script
Properties do Apps Script. Nenhum desses valores precisa ser gravado no codigo.
Erros do Apps Script sao salvos apenas quando acontecem, em uma subpasta diaria de
`NotificaArquivo-Debug` no Google Drive, sem copiar token ou conteudo de notificacoes.

Desde a 0.7.0, o Apps Script cria um grafico de categorias no dashboard geral e transforma
mensagens de compras, Pix e pagamentos em lancamentos analisaveis. A aba `Financeiro`
mantem os eventos relevantes; a aba `Lancamentos` contem somente movimentacoes com
valor reconhecido. Ofertas da Riachuelo ou de bancos permanecem no historico, mas nao
sao contabilizadas como gasto.

## Onde comecar a ler o codigo

- `MainActivity.kt`: tela e botao de permissao.
- `NotificationCaptureService.kt`: recebe cada notificacao nova.
- `NotificationStore.kt`: salva e recupera os dados locais.
- `SheetsSync.kt`: envia um lote JSON para o Apps Script.
- `SheetsSyncWorker.kt`: agenda envios automaticos e novas tentativas.
- `CaptureRecoveryWorker.kt`: verifica e tenta recuperar o listener desconectado.
- `DiagnosticLogStore.kt`: mantem o terminal de eventos local e limitado.
- `CapturedNotification.kt`: define os campos de uma notificacao.
- `docs/ARQUITETURA.md`: desenho da evolucao para Sheets, dashboard e iOS.

## Como trocar o icone

O desenho principal esta em
`app/src/main/res/drawable-nodpi/ic_launcher_foreground.png`, a cor de fundo em
`app/src/main/res/values/colors.xml` e as definicoes adaptativas em
`app/src/main/res/mipmap-anydpi-v26`. Para usar outra imagem, substitua o PNG por uma
arte quadrada com fundo transparente e mantenha o elemento principal dentro da area
central. O `AndroidManifest.xml` ja aponta para `@mipmap/ic_launcher`.

## Proxima pequena entrega

Substituir o armazenamento provisorio por Room e adicionar categorias editaveis no
Android. Room sera importante quando o arquivo local crescer alem deste prototipo.
