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

O endpoint precisa ficar acessivel sem login porque o aplicativo Android nao realiza
OAuth nesta primeira versao. O script rejeita requisicoes cujo token nao confere.

## Configurar o Android

1. Instale a versao 0.2.0 do Notifica Arquivo.
2. Abra o painel **Google Sheets** e toque em **Configurar**.
3. Cole a URL `/exec` da implantacao.
4. Informe exatamente o token usado em `configurarToken`.
5. Salve e toque em **Enviar agora**.

O aplicativo envia todos os registros locais. O Apps Script compara a coluna `ID`,
grava apenas novidades e informa quantos itens ja existiam.

## Privacidade

Esse token e adequado para um prototipo pessoal, mas pode ser recuperado por alguem
que tenha acesso ao aparelho ou ao APK configurado. Nao publique a planilha na web e
nao use o Netlify para expor diretamente a aba `Notificacoes`. Antes de trabalhar com
notificacoes bancarias reais, mantenha filtros locais e adicione autenticacao ao
dashboard.

