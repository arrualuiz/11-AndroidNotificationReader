const SHEETS = {
  notifications: 'Notificacoes',
  categories: 'Categorias',
  applications: 'Aplicativos',
  dashboard: 'Dashboard',
};

const API_VERSION = '0.4.0';

const NOTIFICATION_HEADERS = [
  'ID',
  'Device ID',
  'Chave fonte',
  'Pacote',
  'Aplicativo',
  'Titulo',
  'Texto',
  'Data notificacao',
  'Categoria',
  'Sensivel?',
  'Recebido em',
];

const CATEGORY_HEADERS = ['Pacote', 'Aplicativo', 'Categoria', 'Incluir?', 'Sensivel?'];
const APPLICATION_HEADERS = [
  'Pacote',
  'Aplicativo',
  'Categoria',
  'Quantidade',
  'Primeira notificacao',
  'Ultima notificacao',
  'Sensivel?',
];

/**
 * Edite o token abaixo e execute esta funcao uma vez pelo editor do Apps Script.
 */
function configurarToken() {
  const token = 'TROQUE-POR-UM-TOKEN-GRANDE-E-ALEATORIO';
  PropertiesService.getScriptProperties().setProperty('SYNC_TOKEN', token);
}

/**
 * Execute uma vez depois de importar a planilha-modelo.
 */
function prepararPlanilha() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(spreadsheet, SHEETS.notifications, NOTIFICATION_HEADERS);
  ensureSheet_(spreadsheet, SHEETS.categories, CATEGORY_HEADERS);
  ensureSheet_(spreadsheet, SHEETS.applications, APPLICATION_HEADERS);
  if (!spreadsheet.getSheetByName(SHEETS.dashboard)) spreadsheet.insertSheet(SHEETS.dashboard);
  rebuildApplications_();
}

/**
 * Execute uma vez para atualizar as abas de resumo fora do recebimento do Android.
 */
function configurarAtualizacaoAutomatica() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'atualizarResumos')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('atualizarResumos')
    .timeBased()
    .everyMinutes(15)
    .create();
}

function atualizarResumos() {
  rebuildApplications_();
  SpreadsheetApp.flush();
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'Planilha ocupada. Tente novamente.' });

  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    const expectedToken = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
    if (!expectedToken || payload.token !== expectedToken) {
      return json_({ ok: false, error: 'Token invalido.' });
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEETS.notifications);
    if (!sheet) {
      return json_({
        ok: false,
        apiVersion: API_VERSION,
        error: 'Aba Notificacoes nao encontrada. Execute prepararPlanilha uma vez.',
      });
    }
    const rules = readCategoryRules_(spreadsheet);
    const existingIds = readExistingIds_(sheet);
    const notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
    const rows = [];
    let duplicates = 0;
    let ignored = 0;

    notifications.forEach((item) => {
      const id = clean_(item.id, 300);
      if (!id || existingIds.has(id)) {
        duplicates += 1;
        return;
      }

      const packageName = clean_(item.packageName, 300);
      const rule = rules.get(packageName);
      if (rule && !rule.include) {
        ignored += 1;
        return;
      }

      rows.push([
        id,
        clean_(payload.deviceId, 300),
        clean_(item.sourceKey, 500),
        packageName,
        clean_(item.appName, 300),
        clean_(item.title, 500),
        clean_(item.text, 4000),
        safeDate_(item.postedAt),
        rule?.category || clean_(item.category, 100) || 'Sem categoria',
        rule?.sensitive || false,
        new Date(),
      ]);
      existingIds.add(id);
    });

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, NOTIFICATION_HEADERS.length).setValues(rows);
      try {
        sheet.getRange(sheet.getLastRow() - rows.length + 1, 8, rows.length, 1)
          .setNumberFormat('yyyy-mm-dd hh:mm:ss');
        sheet.getRange(sheet.getLastRow() - rows.length + 1, 11, rows.length, 1)
          .setNumberFormat('yyyy-mm-dd hh:mm:ss');
      } catch (formatError) {
        // A formatacao e cosmetica e nunca deve impedir a confirmacao do lote.
      }
    }

    SpreadsheetApp.flush();
    return json_({
      ok: true,
      apiVersion: API_VERSION,
      inserted: rows.length,
      duplicates,
      ignored,
    });
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error) });
  } finally {
    lock.releaseLock();
  }
}

/** Remove somente as linhas de demonstracao que comecam com EXEMPLO-. */
function limparExemplos() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.notifications);
  if (!sheet || sheet.getLastRow() < 2) return;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const kept = values.filter((row) => !String(row[0]).startsWith('EXEMPLO-'));
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, sheet.getLastColumn()).clearContent();
  if (kept.length > 0) sheet.getRange(2, 1, kept.length, kept[0].length).setValues(kept);
  rebuildApplications_();
}

function readCategoryRules_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEETS.categories);
  const rules = new Map();
  if (!sheet || sheet.getLastRow() < 2) return rules;

  sheet.getRange(2, 1, sheet.getLastRow() - 1, CATEGORY_HEADERS.length).getValues().forEach((row) => {
    const packageName = String(row[0] || '').trim();
    if (!packageName) return;
    rules.set(packageName, {
      category: String(row[2] || 'Sem categoria').trim(),
      include: row[3] !== false,
      sensitive: row[4] === true,
    });
  });
  return rules;
}

function readExistingIds_(sheet) {
  if (sheet.getLastRow() < 2) return new Set();
  return new Set(
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat().filter(Boolean)
  );
}

function rebuildApplications_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const source = spreadsheet.getSheetByName(SHEETS.notifications);
  const target = ensureSheet_(spreadsheet, SHEETS.applications, APPLICATION_HEADERS);
  const groups = new Map();

  if (source && source.getLastRow() >= 2) {
    source.getRange(2, 1, source.getLastRow() - 1, NOTIFICATION_HEADERS.length).getValues().forEach((row) => {
      const packageName = String(row[3] || '').trim();
      if (!packageName) return;
      const date = row[7] instanceof Date ? row[7] : new Date(row[7]);
      const current = groups.get(packageName) || {
        packageName,
        appName: String(row[4] || packageName),
        category: String(row[8] || 'Sem categoria'),
        count: 0,
        first: date,
        last: date,
        sensitive: row[9] === true,
      };
      current.count += 1;
      if (date < current.first) current.first = date;
      if (date > current.last) current.last = date;
      current.category = String(row[8] || current.category);
      current.sensitive = current.sensitive || row[9] === true;
      groups.set(packageName, current);
    });
  }

  const rows = Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .map((item) => [
      item.packageName,
      item.appName,
      item.category,
      item.count,
      item.first,
      item.last,
      item.sensitive,
    ]);

  if (target.getMaxRows() > 1) {
    target.getRange(2, 1, target.getMaxRows() - 1, APPLICATION_HEADERS.length).clearContent();
  }
  if (rows.length > 0) {
    target.getRange(2, 1, rows.length, APPLICATION_HEADERS.length).setValues(rows);
    target.getRange(2, 5, rows.length, 2).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  }
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (currentHeaders.join('|') !== headers.join('|')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function safeDate_(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function clean_(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
