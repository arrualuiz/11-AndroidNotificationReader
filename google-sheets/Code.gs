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
  backupSheet: 'SHEET_BACKUP',
});

const API_VERSION = '0.6.1';

const NOTIFICATION_HEADERS = [
  'Data notificacao',
  'Categoria',
  'Titulo',
  'Texto',
  'Aplicativo',
  'ID',
  'Recebido em',
  'Sensivel?',
  'Pacote',
  'Chave fonte',
  'Device ID',
];

const NOTIFICATION_COLUMNS = Object.freeze({
  postedAt: 0,
  category: 1,
  title: 2,
  text: 3,
  appName: 4,
  id: 5,
  receivedAt: 6,
  sensitive: 7,
  packageName: 8,
  sourceKey: 9,
  deviceId: 10,
});

const PREVIOUS_NOTIFICATION_COLUMNS = Object.freeze({
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

const LEGACY_NOTIFICATION_COLUMNS = Object.freeze({
  id: 0,
  deviceId: 1,
  sourceKey: 2,
  packageName: 3,
  appName: 4,
  title: 5,
  text: 6,
  postedAt: 7,
  category: 8,
  sensitive: 9,
  receivedAt: 10,
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
    ['preparar-Notificacoes', () => ensureNotificationSheet_(
      spreadsheet,
      config.sheets.notifications,
      config.sheets.backup
    )],
    ['preparar-Categorias', () => ensureSheet_(spreadsheet, config.sheets.categories, CATEGORY_HEADERS)],
    ['preparar-Aplicativos', () => ensureSheet_(spreadsheet, config.sheets.applications, APPLICATION_HEADERS)],
    ['preparar-Financeiro', () => ensureNotificationSheet_(spreadsheet, config.sheets.financial)],
    ['preparar-Dashboard', () => ensurePlainSheet_(spreadsheet, config.sheets.dashboard)],
    ['preparar-Ajuda', () => ensurePlainSheet_(spreadsheet, config.sheets.help)],
    ['catalogar-categorias', () => syncCategoryCatalog_(spreadsheet, config)],
    ['categorizar-historico', () => updateNotificationCategories_(spreadsheet, config)],
    ['reconstruir-Financeiro', () => rebuildFinancial_(spreadsheet, config)],
    ['reconstruir-Aplicativos', () => rebuildApplications_(spreadsheet, config)],
    ['reconstruir-Dashboard', () => rebuildDashboard_(spreadsheet, config)],
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
    ['reconstruir-Dashboard', () => rebuildDashboard_(spreadsheet, config)],
  ]);
}

/**
 * Faz backup da aba bruta e corrige linhas gravadas em ordens diferentes.
 * Execute uma vez ao atualizar da API 0.6.0 para 0.6.1.
 */
function recuperarDadosMisturados() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Planilha ocupada. Tente novamente.');

  try {
    const config = configuredProperties_();
    const spreadsheet = configuredSpreadsheet_(config);
    const source = spreadsheet.getSheetByName(config.sheets.notifications);
    if (!source) throw new Error(`Aba ${config.sheets.notifications} nao encontrada.`);

    const result = repairNotificationSheet_(
      spreadsheet,
      source,
      config.sheets.backup,
      true
    );
    runStepsWithDebug_('recuperarDadosMisturados', [
      ['catalogar-categorias', () => syncCategoryCatalog_(spreadsheet, config)],
      ['categorizar-historico', () => updateNotificationCategories_(spreadsheet, config)],
      ['reconstruir-Financeiro', () => rebuildFinancial_(spreadsheet, config)],
      ['reconstruir-Aplicativos', () => rebuildApplications_(spreadsheet, config)],
      ['reconstruir-Dashboard', () => rebuildDashboard_(spreadsheet, config)],
    ]);
    SpreadsheetApp.flush();
    console.log(JSON.stringify(result, null, 2));
    return JSON.stringify(result);
  } catch (error) {
    const debug = writeErrorReport_('recuperarDadosMisturados', error);
    throw new Error(`${String(error.message || error)}. Relatorio: ${debug.path}`);
  } finally {
    lock.releaseLock();
  }
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
        safeDate_(item.postedAt),
        resolvedCategory,
        title,
        text,
        appName,
        id,
        new Date(),
        rule ? rule.sensitive : resolvedCategory === 'Financeiro',
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

function rebuildDashboard_(spreadsheet, config) {
  const source = spreadsheet.getSheetByName(config.sheets.notifications);
  const target = ensurePlainSheet_(spreadsheet, config.sheets.dashboard);
  const rows = source && source.getLastRow() >= 2
    ? source
        .getRange(2, 1, source.getLastRow() - 1, NOTIFICATION_HEADERS.length)
        .getValues()
        .filter((row) => String(row[NOTIFICATION_COLUMNS.id] || '').trim())
    : [];
  const categories = new Map();
  const applications = new Map();
  const today = Utilities.formatDate(new Date(), config.debugTimeZone, 'yyyy-MM-dd');
  let receivedToday = 0;
  let sensitiveCount = 0;

  rows.forEach((row) => {
    const category = String(row[NOTIFICATION_COLUMNS.category] || 'Sem categoria').trim() || 'Sem categoria';
    const packageName = String(row[NOTIFICATION_COLUMNS.packageName] || '').trim();
    const appName = String(row[NOTIFICATION_COLUMNS.appName] || packageName || 'Desconhecido').trim();
    const appKey = packageName || appName;
    const postedAt = dateValue_(row[NOTIFICATION_COLUMNS.postedAt]);

    categories.set(category, (categories.get(category) || 0) + 1);
    if (appKey) {
      const current = applications.get(appKey) || { name: appName, count: 0 };
      current.count += 1;
      applications.set(appKey, current);
    }
    if (postedAt && Utilities.formatDate(postedAt, config.debugTimeZone, 'yyyy-MM-dd') === today) {
      receivedToday += 1;
    }
    if (booleanValue_(row[NOTIFICATION_COLUMNS.sensitive])) sensitiveCount += 1;
  });

  const preferredCategories = [
    'Financeiro',
    'Mensagens',
    'Trabalho',
    'Sistema',
    'Seguranca',
    'Compras',
    'Sem categoria',
  ];
  const categoryNames = preferredCategories.concat(
    Array.from(categories.keys())
      .filter((name) => !preferredCategories.includes(name))
      .sort((a, b) => a.localeCompare(b))
  );
  const applicationRows = Array.from(applications.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  target.getRange('A1').setValue('Notifica Arquivo - Dashboard');
  target.getRange('A2').setValue('Resumo dos dados recebidos do Android. A aba de backup nao entra nos indicadores.');
  target.getRange('A4').setValue('Total');
  target.getRange('C4').setValue('Hoje');
  target.getRange('E4').setValue('Aplicativos');
  target.getRange('G4').setValue('Sensiveis');
  target.getRange('A5').setValue(rows.length);
  target.getRange('C5').setValue(receivedToday);
  target.getRange('E5').setValue(applications.size);
  target.getRange('G5').setValue(sensitiveCount);

  const previousRows = Math.max(1, target.getLastRow() - 7);
  const writeCount = Math.max(previousRows, categoryNames.length + 1, applicationRows.length + 1);
  const matrix = Array.from({ length: writeCount }, (_, index) => {
    if (index === 0) return ['Categoria', 'Quantidade', '', 'Aplicativo', 'Quantidade'];
    const category = categoryNames[index - 1];
    const application = applicationRows[index - 1];
    return [
      category || '',
      category ? categories.get(category) || 0 : '',
      '',
      application ? application.name : '',
      application ? application.count : '',
    ];
  });
  target.getRange(8, 1, matrix.length, matrix[0].length).setValues(matrix);
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (currentHeaders.join('|') !== headers.join('|')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function ensureNotificationSheet_(spreadsheet, name, backupName) {
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

  repairNotificationSheet_(spreadsheet, sheet, backupName, Boolean(backupName));
  return sheet;
}

function repairNotificationSheet_(spreadsheet, sheet, backupName, createBackup) {
  const width = Math.max(sheet.getLastColumn(), NOTIFICATION_HEADERS.length);
  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  const rows = rowCount > 0 ? sheet.getRange(2, 1, rowCount, width).getValues() : [];
  const backupSheet = createBackup
    ? createRawBackupSheet_(spreadsheet, backupName, headers, rows)
    : null;
  const normalized = normalizeNotificationRows_(rows, notificationColumnsFromHeaders_(headers));

  sheet.getRange(1, 1, 1, NOTIFICATION_HEADERS.length).setValues([NOTIFICATION_HEADERS]);
  replaceDataRows_(sheet, NOTIFICATION_HEADERS.length, normalized.rows);

  return {
    ok: true,
    apiVersion: API_VERSION,
    sourceSheet: sheet.getName(),
    backupSheet: backupSheet ? backupSheet.getName() : null,
    inputRows: normalized.inputRows,
    recoveredRows: normalized.rows.length,
    duplicatesRemoved: normalized.duplicates,
    unresolvedRows: normalized.unresolved,
    detectedSchemas: normalized.schemas,
  };
}

function createRawBackupSheet_(spreadsheet, requestedName, headers, rows) {
  const baseName = String(requestedName || 'Backup dados').trim().slice(0, 100);
  let name = baseName;
  if (spreadsheet.getSheetByName(name)) {
    const stamp = Utilities.formatDate(new Date(), configuredProperties_().debugTimeZone, 'yyyy-MM-dd HHmmss');
    name = `${baseName.slice(0, 82)} ${stamp}`;
    let suffix = 2;
    while (spreadsheet.getSheetByName(name)) {
      name = `${baseName.slice(0, 78)} ${stamp} ${suffix}`;
      suffix += 1;
    }
  }

  const backup = spreadsheet.insertSheet(name);
  const width = Math.max(headers.length, NOTIFICATION_HEADERS.length);
  const matrix = [headers, ...rows].map((row) => {
    const copy = row.slice(0, width);
    while (copy.length < width) copy.push('');
    return copy;
  });
  backup.getRange(1, 1, matrix.length, width).setValues(matrix);
  return backup;
}

function normalizeNotificationRows_(rows, headerColumns) {
  const schemas = [
    ['nova', NOTIFICATION_COLUMNS],
    ['anterior', PREVIOUS_NOTIFICATION_COLUMNS],
    ['legada', LEGACY_NOTIFICATION_COLUMNS],
  ];
  const byId = new Map();
  const schemaCounts = {};
  let duplicates = 0;
  let unresolved = 0;
  let inputRows = 0;

  rows.forEach((row, sourceIndex) => {
    if (!row.some((value) => String(value ?? '').trim())) return;
    inputRows += 1;

    const ranked = schemas
      .map(([name, columns]) => ({ name, columns, score: notificationSchemaScore_(row, columns) }))
      .sort((a, b) => b.score - a.score);
    const selected = ranked[0].score >= 5
      ? ranked[0]
      : { name: 'cabecalho', columns: headerColumns, score: 0 };
    const normalizedRow = canonicalNotificationRow_(row, selected.columns);
    const id = String(normalizedRow[NOTIFICATION_COLUMNS.id] || '').trim();
    if (!id) {
      unresolved += 1;
      return;
    }

    schemaCounts[selected.name] = (schemaCounts[selected.name] || 0) + 1;
    const candidate = { row: normalizedRow, sourceIndex };
    if (!byId.has(id)) {
      byId.set(id, candidate);
      return;
    }

    duplicates += 1;
    const existing = byId.get(id);
    if (notificationCompleteness_(candidate.row) > notificationCompleteness_(existing.row)) {
      byId.set(id, candidate);
    }
  });

  const normalizedRows = Array.from(byId.values())
    .sort((a, b) => {
      const left = dateValue_(a.row[NOTIFICATION_COLUMNS.postedAt]);
      const right = dateValue_(b.row[NOTIFICATION_COLUMNS.postedAt]);
      if (left && right && left.getTime() !== right.getTime()) return left - right;
      if (left && !right) return -1;
      if (!left && right) return 1;
      return a.sourceIndex - b.sourceIndex;
    })
    .map((item) => item.row);

  return {
    rows: normalizedRows,
    inputRows,
    duplicates,
    unresolved,
    schemas: schemaCounts,
  };
}

function notificationColumnsFromHeaders_(headers) {
  const fields = {
    'data notificacao': 'postedAt',
    categoria: 'category',
    titulo: 'title',
    texto: 'text',
    aplicativo: 'appName',
    id: 'id',
    'recebido em': 'receivedAt',
    sensivel: 'sensitive',
    pacote: 'packageName',
    'chave fonte': 'sourceKey',
    'device id': 'deviceId',
  };
  const columns = {};
  headers.forEach((header, index) => {
    const field = fields[headerKey_(header)];
    if (field) columns[field] = index;
  });
  return columns;
}

function notificationSchemaScore_(row, columns) {
  let score = 0;
  if (looksLikeNotificationId_(row[columns.id])) score += 5;
  if (looksLikePackage_(row[columns.packageName])) score += 2;
  if (looksLikeDate_(row[columns.postedAt])) score += 2;
  if (looksLikeDate_(row[columns.receivedAt])) score += 1;
  if (looksLikeBoolean_(row[columns.sensitive])) score += 2;
  return score;
}

function canonicalNotificationRow_(row, columns) {
  const postedAt = dateValue_(row[columns.postedAt]) || row[columns.postedAt] || '';
  const receivedAt = dateValue_(row[columns.receivedAt]) || row[columns.receivedAt] || '';
  return [
    postedAt,
    String(row[columns.category] || 'Sem categoria').trim() || 'Sem categoria',
    row[columns.title] || '',
    row[columns.text] || '',
    row[columns.appName] || '',
    String(row[columns.id] || '').trim(),
    receivedAt,
    booleanValue_(row[columns.sensitive]),
    row[columns.packageName] || '',
    row[columns.sourceKey] || '',
    row[columns.deviceId] || '',
  ];
}

function notificationCompleteness_(row) {
  return row.reduce((score, value) => score + (String(value ?? '').trim() ? 1 : 0), 0);
}

function looksLikeNotificationId_(value) {
  const text = String(value || '').trim();
  return /^EXEMPLO-/i.test(text) || /:\d{10,}$/.test(text);
}

function looksLikePackage_(value) {
  const text = String(value || '').trim();
  return text === 'android' || /^[a-zA-Z][\w-]*(\.[\w-]+)+$/.test(text);
}

function looksLikeDate_(value) {
  return Boolean(dateValue_(value));
}

function looksLikeBoolean_(value) {
  if (typeof value === 'boolean') return true;
  return ['true', 'false', 'verdadeiro', 'falso', 'sim', 'nao', 'não', '1', '0']
    .includes(normalize_(value).trim());
}

function booleanValue_(value) {
  if (typeof value === 'boolean') return value;
  return ['true', 'verdadeiro', 'sim', '1'].includes(normalize_(value).trim());
}

function dateValue_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && value > 10000000000) {
    const timestampDate = new Date(value);
    return Number.isNaN(timestampDate.getTime()) ? null : timestampDate;
  }

  const text = String(value || '').trim();
  if (!text) return null;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
  }
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
  }
  return null;
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
      backup: String(values[PROPERTY_KEYS.backupSheet]).trim(),
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
