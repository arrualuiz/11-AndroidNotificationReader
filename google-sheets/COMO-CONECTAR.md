# Como conectar o Android ao Google Sheets

## Estrutura da planilha

- `Notificacoes`: dados brutos enviados pelo Android. Nao edite os IDs.
- `Categorias`: regras editaveis por pacote Android.
- `Aplicativos`: resumo reconstruido pelo Apps Script depois de cada envio.
- `Dashboard`: indicadores e graficos.
- `Ajuda`: lembrete do fluxo e dos campos.

Na aba `Categorias`, use:

- `Pacote`: identificador tecnico, como `com.whatsapp`.
- `Aplicativo`: nome apenas para leitura.
- `Categoria`: Financeiro, Mensagens, Trabalho, Sistema etc.
- `Incluir?`: `TRUE` para gravar; `FALSE` para descartar no servidor.
- `Sensivel?`: marque `TRUE` para bancos, autenticadores ou conteudo privado.

## Preparar a planilha

1. Importe `Modelo-Notifica-Arquivo.xlsx` no Google Drive e abra como Google Sheets.
2. No menu da planilha, entre em **Extensoes > Apps Script**.
3. Apague o codigo inicial e cole todo o conteudo de `Code.gs`.
4. Edite o token dentro da funcao `configurarToken`. Use pelo menos 32 caracteres
   aleatorios e nao compartilhe esse valor.
5. Salve e execute `configurarToken`. O Google pedira autorizacao.
6. Execute `prepararPlanilha` uma vez.
7. Para retirar os dados demonstrativos, execute `limparExemplos`.

## Publicar o endpoint

1. No editor do Apps Script, clique em **Implantar > Nova implantacao**.
2. Escolha o tipo **Aplicativo da Web**.
3. Em **Executar como**, escolha sua propria conta.
4. Em **Quem pode acessar**, escolha **Qualquer pessoa**.
5. Confirme a implantacao e copie a URL terminada em `/exec`.

Ao substituir o `Code.gs` por uma versao mais nova, abra **Implantar > Gerenciar
implantacoes**, edite a implantacao, escolha **Nova versao** e confirme. Apenas salvar
o codigo nao atualiza a URL `/exec` que o Android esta usando.

Na versao 0.4.0, execute tambem `configurarAtualizacaoAutomatica` uma vez pelo editor.
Ela cria um acionador que atualiza a aba `Aplicativos` a cada 15 minutos. Essa tarefa
fica separada do recebimento bruto: mesmo que o resumo tenha algum problema, a aba
`Notificacoes` confirma o lote ao Android.

Se o app ainda mostrar **Faca uma selecao em uma coluna para realizar acoes no nivel
da coluna**, a URL `/exec` ainda esta executando uma implantacao anterior. Crie uma
**Nova versao** da implantacao e toque em **Enviar agora** no Android.

O endpoint precisa ficar acessivel sem login porque o aplicativo Android nao realiza
OAuth nesta primeira versao. O script rejeita requisicoes cujo token nao confere.

## Configurar o Android

1. Instale a versao 0.5.0 do Notifica Arquivo.
2. Abra o painel **Google Sheets** e toque em **Configurar**.
3. Cole a URL `/exec` da implantacao.
4. Informe exatamente o token usado em `configurarToken`.
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

No Xiaomi/MIUI, abra as configuracoes do **Notifica Arquivo**, ative **Inicio
automatico** e selecione **Sem restricoes** na economia de bateria. Dentro do app,
o botao **Bateria** abre a tela geral dessas configuracoes. Nao use **Forcar parada**:
o Android bloqueia tarefas de segundo plano ate o aplicativo ser aberto novamente.

## Privacidade

Esse token e adequado para um prototipo pessoal, mas pode ser recuperado por alguem
que tenha acesso ao aparelho ou ao APK configurado. Nao publique a planilha na web e
nao use o Netlify para expor diretamente a aba `Notificacoes`. Antes de trabalhar com
notificacoes bancarias reais, mantenha filtros locais e adicione autenticacao ao
dashboard.
