# Como conectar o Android ao Google Sheets

## Estrutura da planilha

- `Notificacoes`: dados brutos enviados pelo Android. Nao edite os IDs.
- `Categorias`: regras editaveis por pacote Android.
- `Financeiro`: eventos financeiros relevantes; propagandas de bancos e lojas ficam de fora.
- `Lancamentos`: compras, Pix, pagamentos e saques transformados em dados estruturados.
- `Aplicativos`: resumo reconstruido pelo Apps Script depois de cada envio.
- `Dashboard`: indicadores gerais e grafico de categorias.
- `Dashboard financeiro`: gastos por periodo, grupo, estabelecimento, horario e instituicao.
- `Ajuda`: lembrete do fluxo e dos campos.
- `Backup dados`: copia bruta criada antes de uma recuperacao de colunas.

As tabelas visuais sao padronizadas em verde e recebem estes nomes:

- `Notificacoes`: `TodasNotificacoes`.
- `Categorias`: `CatalogoCategorias`.
- `Aplicativos`: `ResumoAplicativos`.
- `Financeiro`: `NotificacoesFinanceiras`.
- `Lancamentos`: `LancamentosFinanceiros`.

O `Code.gs` nao contem token, ID de planilha, ID de pasta ou nomes de abas. Toda a
configuracao fica em **Configuracoes do projeto > Propriedades do script** no Apps Script.

Cadastre estas propriedades exatamente como abaixo:

| Propriedade | Valor |
| --- | --- |
| `SYNC_TOKEN` | Um token novo, aleatorio e com pelo menos 32 caracteres |
| `SPREADSHEET_ID` | ID ou URL da planilha correta |
| `DEBUG_PARENT_FOLDER_ID` | ID ou URL da pasta de debug no Drive |
| `DEBUG_FOLDER_NAME` | `NotificaArquivo-Debug` |
| `DEBUG_TIME_ZONE` | `America/Sao_Paulo` |
| `SHEET_NOTIFICATIONS` | `Notificacoes` |
| `SHEET_CATEGORIES` | `Categorias` |
| `SHEET_APPLICATIONS` | `Aplicativos` |
| `SHEET_FINANCIAL` | `Financeiro` |
| `SHEET_TRANSACTIONS` | `Lancamentos` |
| `SHEET_DASHBOARD` | `Dashboard` |
| `SHEET_FINANCIAL_DASHBOARD` | `Dashboard financeiro` |
| `SHEET_HELP` | `Ajuda` |
| `SHEET_BACKUP` | `Backup dados` |

O Apps Script nao carrega arquivos `.env`. As Script Properties cumprem esse papel no
servidor e nao entram no Git. Nao coloque o valor de `SYNC_TOKEN` em `Code.gs`, README,
logs, commits ou capturas de tela.

A ordem mantida automaticamente em `Notificacoes` e `Financeiro` e:

`Data notificacao`, `Categoria`, `Titulo`, `Texto`, `Aplicativo`, `ID`,
`Recebido em`, `Sensivel?`, `Pacote`, `Chave fonte`, `Device ID`.

Na aba `Categorias`, use:

- `Pacote`: identificador tecnico, como `com.whatsapp`.
- `Aplicativo`: nome apenas para leitura.
- `Categoria`: Financeiro, Mensagens, Trabalho, Sistema etc.
- `Incluir?`: `TRUE` aceita as proximas notificacoes do pacote. `FALSE` descarta as
  proximas no servidor. Apagar ou ocultar uma notificacao no celular nao muda esta
  regra e nao remove linhas antigas da planilha.
- `Sensivel?`: etiqueta de privacidade para bancos, autenticadores, codigos e conteudo
  pessoal. Nao apaga, nao esconde e nao criptografa a linha. Ela alimenta o indicador
  do Dashboard e permite ocultar conteudo privado em interfaces futuras. Registros
  financeiros sao marcados automaticamente.

## Preparar a planilha

1. Importe `Modelo-Notifica-Arquivo.xlsx` no Google Drive e abra como Google Sheets.
2. No menu da planilha, entre em **Extensoes > Apps Script**.
3. Apague o codigo inicial e cole todo o conteudo de `Code.gs`.
4. Cadastre todas as Script Properties da tabela acima.
5. Salve e execute `diagnosticarConfiguracao`.
6. Se a planilha recebeu linhas em ordens diferentes, execute primeiro
   `recuperarDadosMisturados`. Ela cria `Backup dados`, reconhece os formatos antigo e
   novo linha por linha, remove duplicatas por `ID` e reconstrui os indicadores.
7. Execute `prepararPlanilha` uma vez. Ela confirma a estrutura e atualiza os resumos.
8. Execute `configurarTabelas` para confirmar os nomes e a aparencia verde. O Google
   pode solicitar uma nova autorizacao para acessar a API do Sheets.
9. Para retirar os dados demonstrativos, execute `limparExemplos`.

## Publicar o endpoint

1. No editor do Apps Script, clique em **Implantar > Nova implantacao**.
2. Escolha o tipo **Aplicativo da Web**.
3. Em **Executar como**, escolha sua propria conta.
4. Em **Quem pode acessar**, escolha **Qualquer pessoa**.
5. Confirme a implantacao e copie a URL terminada em `/exec`.

Ao substituir o `Code.gs` por uma versao mais nova, abra **Implantar > Gerenciar
implantacoes**, edite a implantacao, escolha **Nova versao** e confirme. Apenas salvar
o codigo nao atualiza a URL `/exec` que o Android esta usando.

Na versao 0.7.0 do script, execute tambem `configurarAtualizacaoAutomatica` uma vez pelo editor.
Ela substitui os acionadores anteriores por dois novos: uma verificacao completa a cada
5 minutos e uma atualizacao do `Dashboard financeiro` quando as datas de inicio ou fim
sao editadas. Cada lote recebido tambem atualiza os resumos imediatamente. Se um painel
falhar, a notificacao bruta continua confirmada ao Android e o erro recebe um relatorio.

O processamento e retroativo. `prepararPlanilha` e `atualizarResumos` releem toda a aba
`Notificacoes`, retiram propagandas da aba `Financeiro`, reconstroem `Lancamentos` e
refazem os dois dashboards. Nenhuma linha bruta e apagada.

## Analise financeira

`Financeiro` conserva a notificacao original de compras aprovadas, Pix, transferencias,
pagamentos, boletos, faturas e saques. Uma notificacao da Riachuelo so entra nessa aba
quando falar de uma operacao financeira; colecoes, cupons e descontos sao classificados
como `Promocoes`.

`Lancamentos` inclui apenas movimentacoes que tenham valor reconhecido e indiquem uma
entrada ou saida efetiva. Boleto apenas disponivel e aviso de fatura nao sao somados como
gasto, pois ainda nao comprovam pagamento. O parser reconhece os formatos atuais de
Nubank, C6 Bank, Neon e Santander e pode ser ampliado quando surgir um texto novo.

No `Dashboard financeiro`, edite as celulas amarelas `Inicio` e `Fim`. O acionador refaz
o painel com o periodo escolhido. Os valores de Shopee, iFood, Uber e comida na rua sao
separados, assim como cartao virtual, horario, instituicao e estabelecimento.

Ao atualizar de uma versao anterior, execute `prepararPlanilha` novamente. Ela cria a
aba `Financeiro`, preenche o catalogo de `Categorias`, categoriza os registros antigos
e reconstrui os resumos sem apagar a aba `Notificacoes`. Depois publique uma **Nova
versao** da implantacao para que a URL `/exec` use o codigo novo.

## Diagnostico e relatorios de erro

Antes de preparar, voce pode executar `diagnosticarConfiguracao`. Em caso de sucesso,
ela apenas mostra no registro o ID da planilha e quais abas existem. Nenhum arquivo de
debug e criado quando tudo funciona.

Quando uma operacao falha, o script cria automaticamente no Google Drive:

`DEBUG_FOLDER_NAME/AAAA-MM-DD/HH-MM-SS-operacao-identificador.json`

O relatorio contem a versao do servidor, etapa, planilha configurada, mensagem e stack
trace. O token e o texto das notificacoes nao sao incluidos. `prepararPlanilha` tenta
todas as etapas independentes; cada falha recebe seu proprio relatorio diario.

Na primeira execucao desta versao, o Google tambem pedira permissao para criar os
relatorios no Drive. Se o registro mencionar uma preparacao parcial, abra a pasta do
dia indicado na mensagem.

Se o app ainda mostrar **Faca uma selecao em uma coluna para realizar acoes no nivel
da coluna**, a URL `/exec` ainda esta executando uma implantacao anterior. Crie uma
**Nova versao** da implantacao e toque em **Enviar agora** no Android.

O endpoint precisa ficar acessivel sem login porque o aplicativo Android nao realiza
OAuth nesta primeira versao. O script rejeita requisicoes cujo token nao confere.

## Configurar o Android

1. Instale a versao 0.8.0 do Notifica Arquivo.
2. Abra o painel **Google Sheets** e toque em **Configurar**.
3. Cole a URL `/exec` da implantacao.
4. Informe exatamente o valor da Script Property `SYNC_TOKEN`.
5. Salve. O primeiro envio sera agendado automaticamente.

O aplicativo envia os registros pendentes. O Apps Script compara a coluna `ID`,
grava apenas novidades e informa quantos itens ja existiam. Depois da confirmacao,
o Android marca o registro como sincronizado. **Enviar agora** serve para antecipar
uma tentativa, mas nao precisa ser usado no dia a dia.

No Android, **Ocultar** cria um filtro local para uma notificacao fixa. **Excluir**
remove o item local e tenta fecha-lo tambem na barra do sistema. Nenhuma dessas acoes
apaga linhas que ja estejam no Google Sheets.

## Funcionamento automatico

- Uma nova notificacao agenda um envio para cerca de 15 segundos depois.
- Uma verificacao de seguranca roda periodicamente, em intervalos minimos de 15 minutos.
- O trabalho exige conexao de rede. Sem internet, os registros ficam pendentes.
- O agendamento sobrevive ao fechamento do app e a reinicializacao do aparelho.
- O Android escolhe o instante real da execucao para preservar bateria.
- O cabo USB e o computador nao participam do envio. Depois de instalar e configurar,
  o celular pode ser desconectado e envia diretamente pela internet.

No Xiaomi/MIUI, abra as configuracoes do **Notifica Arquivo**, ative **Inicio
automatico** e selecione **Sem restricoes** na economia de bateria. Dentro do app,
o botao **Bateria** abre a tela geral dessas configuracoes. Nao use **Forcar parada**:
o Android bloqueia tarefas de segundo plano ate o aplicativo ser aberto novamente.

## Privacidade

O token nao fica no APK nem no repositorio. No Android ele e informado em campo
mascarado e armazenado criptografado por uma chave do Android Keystore. Ainda assim,
alguem com o aparelho desbloqueado e controle total pode comprometer a sessao. Nao
publique a planilha na web e nao exponha diretamente a aba `Notificacoes` no Netlify.
