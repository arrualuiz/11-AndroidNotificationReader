const PROPERTY_KEYS = Object.freeze({
  token: 'SYNC_TOKEN',
  spreadsheetId: 'SPREADSHEET_ID',
  debugParentFolderId: 'DEBUG_PARENT_FOLDER_ID',
  debugFolderName: 'DEBUG_FOLDER_NAME',
  debugTimeZone: 'DEBUG_TIME_ZONE',
  notificationsSheet: 'SHEET_NOTIFICATIONS',
  categoriesSheet: 'SHEET_CATEGORIES',
  applicationsSheet: 'SHEET_APPLICATIONS',
  financialSheet: 'SHEET_FINANCIAL',
  dashboardSheet: 'SHEET_DASHBOARD',
  helpSheet: 'SHEET_HELP',
});

const API_VERSION = '0.6.0';

const NOTIFICATION_HEADERS = [
  'Recebido em',
  'Aplicativo',
  'Titulo',
  'Texto',
  'Categoria',
  'ID',
  'Sensivel?',
  'Data notificacao',
  'Pacote',
  'Chave fonte',
  'Device ID',
];

const NOTIFICATION_COLUMNS = Object.freeze({
  receivedAt: 0,
  appName: 1,
  title: 2,
  text: 3,
  category: 4,
  id: 5,
  sensitive: 6,
  postedAt: 7,
  packageName: 8,
  sourceKey: 9,
  deviceId: 10,
});

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
 * Execute uma vez depois de importar a planilha-modelo.
 */
function prepararPlanilha() {
  const config = configuredProperties_();
  const spreadsheet = runWithDebug_('prepararPlanilha/abrir-planilha', () => configuredSpreadsheet_(config));
  runStepsWithDebug_('prepararPlanilha', [
    ['preparar-Notificacoes', () => ensureNotificationSheet_(spreadsheet, config.sheets.notifications)],
    ['preparar-Categorias', () => ensureSheet_(spreadsheet, config.sheets.categories, CATEGORY_HEADERS)],
    ['preparar-Aplicativos', () => ensureSheet_(spreadsheet, config.sheets.applications, APPLICATION_HEADERS)],
    ['preparar-Financeiro', () => ensureNotificationSheet_(spreadsheet, config.sheets.financial)],
    ['preparar-Dashboard', () => ensurePlainSheet_(spreadsheet, config.sheets.dashboard)],
    ['preparar-Ajuda', () => ensurePlainSheet_(spreadsheet, config.sheets.help)],
    ['catalogar-categorias', () => syncCategoryCatalog_(spreadsheet, config)],
    ['categorizar-historico', () => updateNotificationCategories_(spreadsheet, config)],
    ['reconstruir-Financeiro', () => rebuildFinancial_(spreadsheet, config)],
    ['reconstruir-Aplicativos', () => rebuildApplications_(spreadsheet, config)],
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
  const config = configuredProperties_();
  const spreadsheet = runWithDebug_('atualizarResumos/abrir-planilha', () => configuredSpreadsheet_(config));
  runStepsWithDebug_('atualizarResumos', [
    ['catalogar-categorias', () => syncCategoryCatalog_(spreadsheet, config)],
    ['categorizar-historico', () => updateNotificationCategories_(spreadsheet, config)],
    ['reconstruir-Financeiro', () => rebuildFinancial_(spreadsheet, config)],
    ['reconstruir-Aplicativos', () => rebuildApplications_(spreadsheet, config)],
  ]);
}

function diagnosticarConfiguracao() {
  return runWithDebug_('diagnosticarConfiguracao', () => {
    const config = configuredProperties_();
    const spreadsheet = configuredSpreadsheet_(config);
    const result = {
      ok: true,
      apiVersion: API_VERSION,
      spreadsheetId: spreadsheet.getId(),
      spreadsheetName: spreadsheet.getName(),
      tabs: Object.values(config.sheets).map((name) => ({
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
    const config = configuredProperties_();
    payload = JSON.parse(event.postData.contents || '{}');
    if (payload.token !== config.token) {
      return json_({ ok: false, error: 'Token invalido.' });
    }

    const spreadsheet = configuredSpreadsheet_(config);
    const sheet = spreadsheet.getSheetByName(config.sheets.notifications);
    if (!sheet) {
      return json_({
        ok: false,
        apiVersion: API_VERSION,
        error: `Aba ${config.sheets.notifications} nao encontrada. Execute prepararPlanilha uma vez.`,
      });
    }
    const rules = readCategoryRules_(spreadsheet, config);
    const existingIds = readExistingIds_(sheet);
    const financialSheet = ensureNotificationSheet_(spreadsheet, config.sheets.financial);
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
        new Date(),
        appName,
        title,
        text,
        resolvedCategory,
        id,
        rule ? rule.sensitive : resolvedCategory === 'Financeiro',
        safeDate_(item.postedAt),
        packageName,
        clean_(item.sourceKey, 500),
        clean_(payload.deviceId, 300),
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
        syncCategoryCatalog_(spreadsheet, config);
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
    const config = configuredProperties_();
    const sheet = configuredSpreadsheet_(config).getSheetByName(config.sheets.notifications);
    if (!sheet || sheet.getLastRow() < 2) return;
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const kept = values.filter((row) => !String(row[NOTIFICATION_COLUMNS.id]).startsWith('EXEMPLO-'));
    replaceDataRows_(sheet, sheet.getLastColumn(), kept);
    atualizarResumos();
  });
}

function readCategoryRules_(spreadsheet, config) {
  const sheet = spreadsheet.getSheetByName(config.sheets.categories);
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

function syncCategoryCatalog_(spreadsheet, config) {
  const source = spreadsheet.getSheetByName(config.sheets.notifications);
  const target = ensureSheet_(spreadsheet, config.sheets.categories, CATEGORY_HEADERS);
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
      const packageName = String(row[NOTIFICATION_COLUMNS.packageName] || '').trim();
      if (!packageName || existingPackages.has(packageName) || newApps.has(packageName)) return;
      const appName = String(row[NOTIFICATION_COLUMNS.appName] || packageName).trim();
      const category = automaticCategory_(
        packageName,
        appName,
        row[NOTIFICATION_COLUMNS.title],
        row[NOTIFICATION_COLUMNS.text]
      );
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

function updateNotificationCategories_(spreadsheet, config) {
  const sheet = spreadsheet.getSheetByName(config.sheets.notifications);
  if (!sheet || sheet.getLastRow() < 2) return;

  const rules = readCategoryRules_(spreadsheet, config);
  const rowCount = sheet.getLastRow() - 1;
  const rows = sheet.getRange(2, 1, rowCount, NOTIFICATION_HEADERS.length).getValues();
  const categories = [];
  const sensitiveValues = [];

  rows.forEach((row) => {
    const packageName = String(row[NOTIFICATION_COLUMNS.packageName] || '').trim();
    const appName = String(row[NOTIFICATION_COLUMNS.appName] || packageName).trim();
    const rule = rules.get(packageName);
    const automatic = automaticCategory_(
      packageName,
      appName,
      row[NOTIFICATION_COLUMNS.title],
      row[NOTIFICATION_COLUMNS.text]
    );
    const current = String(row[NOTIFICATION_COLUMNS.category] || '').trim();
    const category = rule?.category && rule.category !== 'Sem categoria'
      ? rule.category
      : current && current !== 'Sem categoria'
        ? current
        : automatic;
    categories.push([category]);
    sensitiveValues.push([
      rule ? rule.sensitive : row[NOTIFICATION_COLUMNS.sensitive] === true || category === 'Financeiro',
    ]);
  });

  sheet.getRange(2, NOTIFICATION_COLUMNS.category + 1, rowCount, 1).setValues(categories);
  sheet.getRange(2, NOTIFICATION_COLUMNS.sensitive + 1, rowCount, 1).setValues(sensitiveValues);
}

function rebuildFinancial_(spreadsheet, config) {
  const source = spreadsheet.getSheetByName(config.sheets.notifications);
  const target = ensureNotificationSheet_(spreadsheet, config.sheets.financial);
  const rows = source && source.getLastRow() >= 2
    ? source
        .getRange(2, 1, source.getLastRow() - 1, NOTIFICATION_HEADERS.length)
        .getValues()
        .filter((row) => isFinancialRow_(row))
    : [];

  replaceDataRows_(target, FINANCIAL_HEADERS.length, rows);
}

function isFinancialRow_(row) {
  return String(row[NOTIFICATION_COLUMNS.category] || '') === 'Financeiro' ||
    automaticCategory_(
      row[NOTIFICATION_COLUMNS.packageName],
      row[NOTIFICATION_COLUMNS.appName],
      row[NOTIFICATION_COLUMNS.title],
      row[NOTIFICATION_COLUMNS.text]
    ) === 'Financeiro';
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
    sheet
      .getRange(2, NOTIFICATION_COLUMNS.id + 1, sheet.getLastRow() - 1, 1)
      .getDisplayValues()
      .flat()
      .filter(Boolean)
  );
}

function rebuildApplications_(spreadsheet, config) {
  const resolvedConfig = config || configuredProperties_();
  const resolvedSpreadsheet = spreadsheet || configuredSpreadsheet_(resolvedConfig);
  const source = resolvedSpreadsheet.getSheetByName(resolvedConfig.sheets.notifications);
  const target = ensureSheet_(resolvedSpreadsheet, resolvedConfig.sheets.applications, APPLICATION_HEADERS);
  const groups = new Map();

  if (source && source.getLastRow() >= 2) {
    source.getRange(2, 1, source.getLastRow() - 1, NOTIFICATION_HEADERS.length).getValues().forEach((row) => {
      const packageName = String(row[NOTIFICATION_COLUMNS.packageName] || '').trim();
      if (!packageName) return;
      const postedAt = row[NOTIFICATION_COLUMNS.postedAt];
      const date = postedAt instanceof Date ? postedAt : new Date(postedAt);
      const current = groups.get(packageName) || {
        packageName,
        appName: String(row[NOTIFICATION_COLUMNS.appName] || packageName),
        category: String(row[NOTIFICATION_COLUMNS.category] || 'Sem categoria'),
        count: 0,
        first: date,
        last: date,
        sensitive: row[NOTIFICATION_COLUMNS.sensitive] === true,
      };
      current.count += 1;
      if (date < current.first) current.first = date;
      if (date > current.last) current.last = date;
      current.category = String(row[NOTIFICATION_COLUMNS.category] || current.category);
      current.sensitive = current.sensitive || row[NOTIFICATION_COLUMNS.sensitive] === true;
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

function ensureNotificationSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  const currentColumnCount = Math.max(sheet.getLastColumn(), NOTIFICATION_HEADERS.length);
  const currentHeaders = sheet
    .getRange(1, 1, 1, currentColumnCount)
    .getDisplayValues()[0]
    .map((value) => String(value || '').trim());
  const relevantHeaders = currentHeaders.slice(0, Math.max(
    NOTIFICATION_HEADERS.length,
    currentHeaders.reduce((last, value, index) => value ? index + 1 : last, 0)
  ));

  if (relevantHeaders.slice(0, NOTIFICATION_HEADERS.length).join('|') === NOTIFICATION_HEADERS.join('|')) {
    return sheet;
  }

  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  if (rowCount === 0) {
    sheet.getRange(1, 1, 1, NOTIFICATION_HEADERS.length).setValues([NOTIFICATION_HEADERS]);
    return sheet;
  }

  const indexByHeader = new Map(
    relevantHeaders.map((header, index) => [headerKey_(header), index])
  );
  const missing = NOTIFICATION_HEADERS.filter((header) => !indexByHeader.has(headerKey_(header)));
  if (missing.length > 0) {
    throw new Error(
      `A aba ${name} possui dados, mas faltam cabecalhos para migracao: ${missing.join(', ')}`
    );
  }

  const existingRows = sheet
    .getRange(2, 1, rowCount, relevantHeaders.length)
    .getValues();
  const reorderedRows = existingRows.map((row) =>
    NOTIFICATION_HEADERS.map((header) => row[indexByHeader.get(headerKey_(header))])
  );

  sheet
    .getRange(1, 1, reorderedRows.length + 1, NOTIFICATION_HEADERS.length)
    .setValues([NOTIFICATION_HEADERS, ...reorderedRows]);
  return sheet;
}

function headerKey_(value) {
  return normalize_(value).replace(/[^a-z0-9]+/g, ' ').trim();
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
    const config = configuredProperties_();
    const now = new Date();
    const day = Utilities.formatDate(now, config.debugTimeZone, 'yyyy-MM-dd');
    const time = Utilities.formatDate(now, config.debugTimeZone, 'HH-mm-ss');
    const debugParent = DriveApp.getFolderById(config.debugParentFolderId);
    const root = getOrCreateFolder_(debugParent, config.debugFolderName);
    const daily = getOrCreateFolder_(root, day);
    const safeOperation = String(operation || 'erro').replace(/[^a-zA-Z0-9_-]+/g, '-');
    const suffix = Utilities.getUuid().slice(0, 8);
    const fileName = `${time}-${safeOperation}-${suffix}.json`;
    const report = {
      timestamp: Utilities.formatDate(now, config.debugTimeZone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      apiVersion: API_VERSION,
      operation,
      spreadsheet: {
        id: config.spreadsheetId,
        tabs: config.sheets,
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
      path: `${config.debugFolderName}/${day}/${fileName}`,
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

function configuredSpreadsheet_(config = configuredProperties_()) {
  return SpreadsheetApp.openById(config.spreadsheetId);
}

function configuredProperties_() {
  const values = PropertiesService.getScriptProperties().getProperties();
  const missing = Object.values(PROPERTY_KEYS).filter((key) => !String(values[key] || '').trim());
  if (missing.length > 0) {
    throw new Error(`Configure as Script Properties ausentes: ${missing.join(', ')}`);
  }

  return {
    token: String(values[PROPERTY_KEYS.token]).trim(),
    spreadsheetId: spreadsheetIdFromValue_(values[PROPERTY_KEYS.spreadsheetId]),
    debugParentFolderId: folderIdFromValue_(values[PROPERTY_KEYS.debugParentFolderId]),
    debugFolderName: String(values[PROPERTY_KEYS.debugFolderName]).trim(),
    debugTimeZone: String(values[PROPERTY_KEYS.debugTimeZone]).trim(),
    sheets: {
      notifications: String(values[PROPERTY_KEYS.notificationsSheet]).trim(),
      categories: String(values[PROPERTY_KEYS.categoriesSheet]).trim(),
      applications: String(values[PROPERTY_KEYS.applicationsSheet]).trim(),
      financial: String(values[PROPERTY_KEYS.financialSheet]).trim(),
      dashboard: String(values[PROPERTY_KEYS.dashboardSheet]).trim(),
      help: String(values[PROPERTY_KEYS.helpSheet]).trim(),
    },
  };
}

function spreadsheetIdFromValue_(value) {
  const text = String(value || '').trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = match ? match[1] : text;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Script Property ${PROPERTY_KEYS.spreadsheetId} invalida.`);
  }
  return id;
}

function folderIdFromValue_(value) {
  const text = String(value || '').trim();
  const match = text.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  const id = match ? match[1] : text;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Script Property ${PROPERTY_KEYS.debugParentFolderId} invalida.`);
  }
  return id;
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
