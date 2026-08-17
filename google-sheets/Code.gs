const SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1Q-Ccl5UngOts5X0yCPJ04USDVjk6rCciCyynOlPrVN0/edit';
const DEBUG_ROOT_FOLDER = 'NotificaArquivo-Debug';
const DEBUG_TIME_ZONE = 'America/Sao_Paulo';

const SHEETS = {
  notifications: 'Notificacoes',
  categories: 'Categorias',
  applications: 'Aplicativos',
  financial: 'Financeiro',
  dashboard: 'Dashboard',
  help: 'Ajuda',
};

const API_VERSION = '0.5.5';

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
const FINANCIAL_HEADERS = NOTIFICATION_HEADERS;
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
  const spreadsheet = runWithDebug_('prepararPlanilha/abrir-planilha', () => configuredSpreadsheet_());
  runStepsWithDebug_('prepararPlanilha', [
    ['preparar-Notificacoes', () => ensureSheet_(spreadsheet, SHEETS.notifications, NOTIFICATION_HEADERS)],
    ['preparar-Categorias', () => ensureSheet_(spreadsheet, SHEETS.categories, CATEGORY_HEADERS)],
    ['preparar-Aplicativos', () => ensureSheet_(spreadsheet, SHEETS.applications, APPLICATION_HEADERS)],
    ['preparar-Financeiro', () => ensureSheet_(spreadsheet, SHEETS.financial, FINANCIAL_HEADERS)],
    ['preparar-Dashboard', () => ensurePlainSheet_(spreadsheet, SHEETS.dashboard)],
    ['preparar-Ajuda', () => ensurePlainSheet_(spreadsheet, SHEETS.help)],
    ['catalogar-categorias', () => syncCategoryCatalog_(spreadsheet)],
    ['categorizar-historico', () => updateNotificationCategories_(spreadsheet)],
    ['reconstruir-Financeiro', () => rebuildFinancial_(spreadsheet)],
    ['reconstruir-Aplicativos', () => rebuildApplications_(spreadsheet)],
  ]);
  return `Planilha preparada: ${spreadsheet.getName()} (${spreadsheet.getId()})`;
}

/**
 * Execute uma vez para atualizar as abas de resumo fora do recebimento do Android.
 */
function configurarAtualizacaoAutomatica() {
  return runWithDebug_('configurarAtualizacaoAutomatica', () => {
    ScriptApp.getProjectTriggers()
      .filter((trigger) => trigger.getHandlerFunction() === 'atualizarResumos')
      .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

    ScriptApp.newTrigger('atualizarResumos')
      .timeBased()
      .everyMinutes(15)
      .create();
  });
}

function atualizarResumos() {
  const spreadsheet = runWithDebug_('atualizarResumos/abrir-planilha', () => configuredSpreadsheet_());
  runStepsWithDebug_('atualizarResumos', [
    ['catalogar-categorias', () => syncCategoryCatalog_(spreadsheet)],
    ['categorizar-historico', () => updateNotificationCategories_(spreadsheet)],
    ['reconstruir-Financeiro', () => rebuildFinancial_(spreadsheet)],
    ['reconstruir-Aplicativos', () => rebuildApplications_(spreadsheet)],
  ]);
}

function diagnosticarConfiguracao() {
  return runWithDebug_('diagnosticarConfiguracao', () => {
    const spreadsheet = configuredSpreadsheet_();
    const result = {
      ok: true,
      apiVersion: API_VERSION,
      spreadsheetId: spreadsheet.getId(),
      spreadsheetName: spreadsheet.getName(),
      tabs: Object.values(SHEETS).map((name) => ({
        name,
        exists: Boolean(spreadsheet.getSheetByName(name)),
      })),
    };
    console.log(JSON.stringify(result, null, 2));
    return JSON.stringify(result);
  });
}

function doGet() {
  return json_({
    ok: true,
    apiVersion: API_VERSION,
    message: 'Endpoint ativo. O aplicativo envia notificacoes por POST.',
  });
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'Planilha ocupada. Tente novamente.' });
  let payload = {};

  try {
    payload = JSON.parse(event.postData.contents || '{}');
    const expectedToken = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
    if (!expectedToken || payload.token !== expectedToken) {
      return json_({ ok: false, error: 'Token invalido.' });
    }

    const spreadsheet = configuredSpreadsheet_();
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
    const financialSheet = ensureSheet_(spreadsheet, SHEETS.financial, FINANCIAL_HEADERS);
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

      const appName = clean_(item.appName, 300);
      const title = clean_(item.title, 500);
      const text = clean_(item.text, 4000);
      const automaticCategory = automaticCategory_(packageName, appName, title, text);
      const category = rule?.category || clean_(item.category, 100);
      const resolvedCategory = !category || category === 'Sem categoria'
        ? automaticCategory
        : category;
      rows.push([
        id,
        clean_(payload.deviceId, 300),
        clean_(item.sourceKey, 500),
        packageName,
        appName,
        title,
        text,
        safeDate_(item.postedAt),
        resolvedCategory,
        rule ? rule.sensitive : resolvedCategory === 'Financeiro',
        new Date(),
      ]);
      existingIds.add(id);
    });

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, NOTIFICATION_HEADERS.length).setValues(rows);
      const financialRows = rows.filter((row) => isFinancialRow_(row));
      if (financialRows.length > 0) {
        try {
          financialSheet
            .getRange(financialSheet.getLastRow() + 1, 1, financialRows.length, FINANCIAL_HEADERS.length)
            .setValues(financialRows);
        } catch (financialError) {
          writeErrorReport_('doPost/atualizar-Financeiro', financialError, {
            deviceId: clean_(payload.deviceId, 300),
            rowCount: financialRows.length,
          });
        }
      }

      try {
        syncCategoryCatalog_(spreadsheet);
      } catch (catalogError) {
        writeErrorReport_('doPost/catalogar-categorias', catalogError, {
          deviceId: clean_(payload.deviceId, 300),
          rowCount: rows.length,
        });
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
    const debug = writeErrorReport_('doPost', error, {
      deviceId: clean_(payload.deviceId, 300),
      notificationCount: Array.isArray(payload.notifications) ? payload.notifications.length : 0,
    });
    return json_({
      ok: false,
      apiVersion: API_VERSION,
      error: String(error.message || error),
      debugReport: debug.path,
    });
  } finally {
    lock.releaseLock();
  }
}

/** Remove somente as linhas de demonstracao que comecam com EXEMPLO-. */
function limparExemplos() {
  return runWithDebug_('limparExemplos', () => {
    const sheet = configuredSpreadsheet_().getSheetByName(SHEETS.notifications);
    if (!sheet || sheet.getLastRow() < 2) return;
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const kept = values.filter((row) => !String(row[0]).startsWith('EXEMPLO-'));
    replaceDataRows_(sheet, sheet.getLastColumn(), kept);
    atualizarResumos();
  });
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

function syncCategoryCatalog_(spreadsheet) {
  const source = spreadsheet.getSheetByName(SHEETS.notifications);
  const target = ensureSheet_(spreadsheet, SHEETS.categories, CATEGORY_HEADERS);
  if (!source || source.getLastRow() < 2) return;

  const existingPackages = target.getLastRow() < 2
    ? new Set()
    : new Set(
        target
          .getRange(2, 1, target.getLastRow() - 1, 1)
          .getDisplayValues()
          .flat()
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      );
  const newApps = new Map();

  source
    .getRange(2, 1, source.getLastRow() - 1, NOTIFICATION_HEADERS.length)
    .getValues()
    .forEach((row) => {
      const packageName = String(row[3] || '').trim();
      if (!packageName || existingPackages.has(packageName) || newApps.has(packageName)) return;
      const appName = String(row[4] || packageName).trim();
      const category = automaticCategory_(packageName, appName, row[5], row[6]);
      newApps.set(packageName, [
        packageName,
        appName,
        category,
        true,
        category === 'Financeiro',
      ]);
    });

  const rows = Array.from(newApps.values()).sort((a, b) => a[1].localeCompare(b[1]));
  if (rows.length > 0) {
    target.getRange(target.getLastRow() + 1, 1, rows.length, CATEGORY_HEADERS.length).setValues(rows);
  }
}

function updateNotificationCategories_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEETS.notifications);
  if (!sheet || sheet.getLastRow() < 2) return;

  const rules = readCategoryRules_(spreadsheet);
  const rowCount = sheet.getLastRow() - 1;
  const rows = sheet.getRange(2, 1, rowCount, NOTIFICATION_HEADERS.length).getValues();
  const categories = [];
  const sensitiveValues = [];

  rows.forEach((row) => {
    const packageName = String(row[3] || '').trim();
    const appName = String(row[4] || packageName).trim();
    const rule = rules.get(packageName);
    const automatic = automaticCategory_(packageName, appName, row[5], row[6]);
    const current = String(row[8] || '').trim();
    const category = rule?.category && rule.category !== 'Sem categoria'
      ? rule.category
      : current && current !== 'Sem categoria'
        ? current
        : automatic;
    categories.push([category]);
    sensitiveValues.push([rule ? rule.sensitive : row[9] === true || category === 'Financeiro']);
  });

  sheet.getRange(2, 9, rowCount, 1).setValues(categories);
  sheet.getRange(2, 10, rowCount, 1).setValues(sensitiveValues);
}

function rebuildFinancial_(spreadsheet) {
  const source = spreadsheet.getSheetByName(SHEETS.notifications);
  const target = ensureSheet_(spreadsheet, SHEETS.financial, FINANCIAL_HEADERS);
  const rows = source && source.getLastRow() >= 2
    ? source
        .getRange(2, 1, source.getLastRow() - 1, NOTIFICATION_HEADERS.length)
        .getValues()
        .filter((row) => isFinancialRow_(row))
    : [];

  replaceDataRows_(target, FINANCIAL_HEADERS.length, rows);
}

function isFinancialRow_(row) {
  return String(row[8] || '') === 'Financeiro' ||
    automaticCategory_(row[3], row[4], row[5], row[6]) === 'Financeiro';
}

function automaticCategory_(packageName, appName, title, text) {
  const source = normalize_([packageName, appName, title, text].join(' '));
  if (containsAny_(source, [
    'santander',
    'c6bank',
    'c6 bank',
    'intermedium',
    'banco inter',
    'bancointer',
    'br.com.inter',
    'caixa tem',
    'br.gov.caixa',
    'com.caixa',
    'nubank',
    'com.nu.production',
    'neon',
    'riachuelo',
    'midway',
  ])) return 'Financeiro';
  if (containsAny_(source, ['whatsapp', 'telegram', 'messenger', 'com.google.android.apps.messaging'])) {
    return 'Mensagens';
  }
  if (containsAny_(source, ['ifood', 'rappi', 'uber eats', '99food'])) return 'Entregas';
  if (containsAny_(source, ['duolingo', 'coursera', 'udemy'])) return 'Educacao';
  if (containsAny_(source, ['mercadolibre', 'mercado livre', 'shopee', 'amazon'])) return 'Compras';
  if (containsAny_(source, ['codigo de verificacao', 'codigo de seguranca', 'autenticacao'])) {
    return 'Seguranca';
  }
  if (
    source.startsWith('android ') ||
    source.startsWith('com.android.') ||
    source.startsWith('com.miui.') ||
    source.startsWith('com.xiaomi.')
  ) return 'Sistema';
  return 'Outros';
}

function normalize_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function containsAny_(source, values) {
  return values.some((value) => source.includes(value));
}

function readExistingIds_(sheet) {
  if (sheet.getLastRow() < 2) return new Set();
  return new Set(
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat().filter(Boolean)
  );
}

function rebuildApplications_(spreadsheet = configuredSpreadsheet_()) {
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

  replaceDataRows_(target, APPLICATION_HEADERS.length, rows);
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (currentHeaders.join('|') !== headers.join('|')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function ensurePlainSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function runWithDebug_(operation, action, context = {}) {
  try {
    return action();
  } catch (error) {
    const debug = writeErrorReport_(operation, error, context);
    throw new Error(
      `${operation} falhou: ${String(error.message || error)}. Relatorio: ${debug.path}`
    );
  }
}

function runStepsWithDebug_(operation, steps) {
  const failures = [];
  steps.forEach(([step, action]) => {
    try {
      action();
      SpreadsheetApp.flush();
    } catch (error) {
      const debug = writeErrorReport_(`${operation}/${step}`, error, { step });
      failures.push(`${step}: ${String(error.message || error)} (${debug.path})`);
    }
  });

  if (failures.length > 0) {
    throw new Error(
      `${operation} terminou parcialmente com ${failures.length} erro(s):\n${failures.join('\n')}`
    );
  }
}

function writeErrorReport_(operation, error, context = {}) {
  try {
    const now = new Date();
    const day = Utilities.formatDate(now, DEBUG_TIME_ZONE, 'yyyy-MM-dd');
    const time = Utilities.formatDate(now, DEBUG_TIME_ZONE, 'HH-mm-ss');
    const root = getOrCreateFolder_(DriveApp.getRootFolder(), DEBUG_ROOT_FOLDER);
    const daily = getOrCreateFolder_(root, day);
    const safeOperation = String(operation || 'erro').replace(/[^a-zA-Z0-9_-]+/g, '-');
    const suffix = Utilities.getUuid().slice(0, 8);
    const fileName = `${time}-${safeOperation}-${suffix}.json`;
    const report = {
      timestamp: Utilities.formatDate(now, DEBUG_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      apiVersion: API_VERSION,
      operation,
      spreadsheet: {
        id: safeSpreadsheetId_(),
        url: SPREADSHEET_URL,
        tabs: SHEETS,
      },
      error: {
        name: String(error?.name || 'Error'),
        message: String(error?.message || error),
        stack: String(error?.stack || ''),
      },
      context,
    };
    const file = daily.createFile(fileName, JSON.stringify(report, null, 2), MimeType.PLAIN_TEXT);
    return {
      path: `${DEBUG_ROOT_FOLDER}/${day}/${fileName}`,
      url: file.getUrl(),
    };
  } catch (debugError) {
    console.error(`Falha ao salvar debug: ${String(debugError.message || debugError)}`);
    return {
      path: `debug indisponivel: ${String(debugError.message || debugError)}`,
      url: '',
    };
  }
}

function getOrCreateFolder_(parent, name) {
  const matches = parent.getFoldersByName(name);
  return matches.hasNext() ? matches.next() : parent.createFolder(name);
}

function safeSpreadsheetId_() {
  try {
    return spreadsheetIdFromUrl_();
  } catch (error) {
    return '';
  }
}

function configuredSpreadsheet_() {
  return SpreadsheetApp.openById(spreadsheetIdFromUrl_());
}

function spreadsheetIdFromUrl_() {
  const match = SPREADSHEET_URL.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error('Configure SPREADSHEET_URL com o link completo da planilha.');
  return match[1];
}

function replaceDataRows_(sheet, columnCount, rows) {
  const currentRowCount = Math.max(0, sheet.getLastRow() - 1);
  const writeCount = Math.max(currentRowCount, rows.length);
  if (writeCount === 0) return;

  const values = Array.from({ length: writeCount }, (_, index) => {
    if (index >= rows.length) return Array(columnCount).fill('');
    const row = rows[index].slice(0, columnCount);
    while (row.length < columnCount) row.push('');
    return row;
  });
  sheet.getRange(2, 1, writeCount, columnCount).setValues(values);
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
