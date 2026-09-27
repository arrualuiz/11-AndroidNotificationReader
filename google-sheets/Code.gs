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
  transactionsSheet: 'SHEET_TRANSACTIONS',
  creditCardsSheet: 'SHEET_CREDIT_CARDS',
  dashboardSheet: 'SHEET_DASHBOARD',
  financialDashboardSheet: 'SHEET_FINANCIAL_DASHBOARD',
  helpSheet: 'SHEET_HELP',
  backupSheet: 'SHEET_BACKUP',
});

const API_VERSION = '0.7.1';

const TABLE_NAMES = Object.freeze({
  notifications: 'TodasNotificacoes',
  categories: 'CatalogoCategorias',
  applications: 'ResumoAplicativos',
  financial: 'NotificacoesFinanceiras',
  transactions: 'LancamentosFinanceiros',
  creditCards: 'CatalogoCartoes',
});

const GREEN_TABLE_COLORS = Object.freeze({
  header: '#147A67',
  firstBand: '#E3F3EA',
  secondBand: '#FFFFFF',
  border: '#B7D8C8',
  text: '#18312B',
});

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
const TRANSACTION_HEADERS = [
  'Data e hora',
  'Data',
  'Hora',
  'Instituicao',
  'Tipo',
  'Direcao',
  'Valor',
  'Estabelecimento',
  'Grupo',
  'Cartao final',
  'Cartao virtual?',
  'ID notificacao',
  'Titulo original',
  'Texto original',
  'Pacote',
];
const TRANSACTION_COLUMNS = Object.freeze({
  dateTime: 0,
  date: 1,
  time: 2,
  institution: 3,
  type: 4,
  direction: 5,
  amount: 6,
  merchant: 7,
  group: 8,
  cardFinal: 9,
  virtualCard: 10,
  notificationId: 11,
  title: 12,
  text: 13,
  packageName: 14,
});
const CREDIT_CARD_HEADERS = [
  'Instituicao',
  'Final',
  'Tipo',
  'Apelido',
  'Titular',
  'Uso principal',
  'Primeira notificacao',
  'Ultima notificacao',
  'Compras aprovadas',
  'Total observado',
  'Revisar?',
];
const CREDIT_CARD_COLUMNS = Object.freeze({
  institution: 0,
  cardFinal: 1,
  type: 2,
  nickname: 3,
  holder: 4,
  primaryUse: 5,
  firstSeen: 6,
  lastSeen: 7,
  approvedPurchases: 8,
  observedTotal: 9,
  review: 10,
});
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
    ['preparar-Lancamentos', () => ensureSheet_(spreadsheet, config.sheets.transactions, TRANSACTION_HEADERS)],
    ['preparar-Cartoes', () => ensureSheet_(spreadsheet, config.sheets.creditCards, CREDIT_CARD_HEADERS)],
    ['preparar-Dashboard', () => ensurePlainSheet_(spreadsheet, config.sheets.dashboard)],
    ['preparar-Dashboard-financeiro', () => ensurePlainSheet_(spreadsheet, config.sheets.financialDashboard)],
    ['preparar-Ajuda', () => ensurePlainSheet_(spreadsheet, config.sheets.help)],
    ['catalogar-categorias', () => syncCategoryCatalog_(spreadsheet, config)],
    ['categorizar-historico', () => updateNotificationCategories_(spreadsheet, config)],
    ['reconstruir-Financeiro', () => rebuildFinancial_(spreadsheet, config)],
    ['reconstruir-Cartoes', () => rebuildCreditCards_(spreadsheet, config)],
    ['reconstruir-Lancamentos', () => rebuildTransactions_(spreadsheet, config)],
    ['reconstruir-Aplicativos', () => rebuildApplications_(spreadsheet, config)],
    ['reconstruir-Dashboard', () => rebuildDashboard_(spreadsheet, config)],
    ['reconstruir-Dashboard-financeiro', () => rebuildFinancialDashboard_(spreadsheet, config)],
    ['padronizar-tabelas', () => configureTables_(spreadsheet, config)],
  ]);
  return `Planilha preparada: ${spreadsheet.getName()} (${spreadsheet.getId()})`;
}

/**
 * Execute uma vez para atualizar as abas de resumo fora do recebimento do Android.
 */
function configurarAtualizacaoAutomatica() {
  return runWithDebug_('configurarAtualizacaoAutomatica', () => {
    const config = configuredProperties_();
    ScriptApp.getProjectTriggers()
      .filter((trigger) => ['atualizarResumos', 'atualizarDashboardAoEditar'].includes(trigger.getHandlerFunction()))
      .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

    ScriptApp.newTrigger('atualizarResumos')
      .timeBased()
      .everyMinutes(5)
      .create();
    ScriptApp.newTrigger('atualizarDashboardAoEditar')
      .forSpreadsheet(config.spreadsheetId)
      .onEdit()
      .create();
  });
}

function atualizarDashboardAoEditar(event) {
  if (!event?.range) return;
  const config = configuredProperties_();
  const range = event.range;
  if (
    range.getSheet().getName() !== config.sheets.financialDashboard ||
    range.getRow() > 3 || range.getLastRow() < 3 ||
    range.getColumn() > 4 || range.getLastColumn() < 2
  ) return;
  rebuildFinancialDashboard_(configuredSpreadsheet_(config), config);
}

function atualizarResumos() {
  const config = configuredProperties_();
  const spreadsheet = runWithDebug_('atualizarResumos/abrir-planilha', () => configuredSpreadsheet_(config));
  runStepsWithDebug_('atualizarResumos', [
    ['catalogar-categorias', () => syncCategoryCatalog_(spreadsheet, config)],
    ['categorizar-historico', () => updateNotificationCategories_(spreadsheet, config)],
    ['reconstruir-Financeiro', () => rebuildFinancial_(spreadsheet, config)],
    ['reconstruir-Cartoes', () => rebuildCreditCards_(spreadsheet, config)],
    ['reconstruir-Lancamentos', () => rebuildTransactions_(spreadsheet, config)],
    ['reconstruir-Aplicativos', () => rebuildApplications_(spreadsheet, config)],
    ['reconstruir-Dashboard', () => rebuildDashboard_(spreadsheet, config)],
    ['reconstruir-Dashboard-financeiro', () => rebuildFinancialDashboard_(spreadsheet, config)],
  ]);
}

function configurarTabelas() {
  return runWithDebug_('configurarTabelas', () => {
    const config = configuredProperties_();
    const spreadsheet = configuredSpreadsheet_(config);
    const result = configureTables_(spreadsheet, config);
    console.log(JSON.stringify(result, null, 2));
    return JSON.stringify(result);
  });
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
      ['reconstruir-Cartoes', () => rebuildCreditCards_(spreadsheet, config)],
      ['reconstruir-Lancamentos', () => rebuildTransactions_(spreadsheet, config)],
      ['reconstruir-Aplicativos', () => rebuildApplications_(spreadsheet, config)],
      ['reconstruir-Dashboard', () => rebuildDashboard_(spreadsheet, config)],
      ['reconstruir-Dashboard-financeiro', () => rebuildFinancialDashboard_(spreadsheet, config)],
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
      const resolvedCategory = resolveNotificationCategory_(
        rule?.category || clean_(item.category, 100),
        packageName,
        appName,
        title,
        text
      );
      rows.push([
        safeDate_(item.postedAt),
        resolvedCategory,
        title,
        text,
        appName,
        id,
        new Date(),
        Boolean(rule?.sensitive) || ['Financeiro', 'Seguranca'].includes(resolvedCategory),
        packageName,
        clean_(item.sourceKey, 500),
        clean_(payload.deviceId, 300),
      ]);
      existingIds.add(id);
    });

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, NOTIFICATION_HEADERS.length).setValues(rows);
      runBestEffortSteps_('doPost', [
        ['catalogar-categorias', () => syncCategoryCatalog_(spreadsheet, config)],
        ['categorizar-historico', () => updateNotificationCategories_(spreadsheet, config)],
        ['reconstruir-Financeiro', () => rebuildFinancial_(spreadsheet, config)],
        ['reconstruir-Cartoes', () => rebuildCreditCards_(spreadsheet, config)],
        ['reconstruir-Lancamentos', () => rebuildTransactions_(spreadsheet, config)],
        ['reconstruir-Aplicativos', () => rebuildApplications_(spreadsheet, config)],
        ['reconstruir-Dashboard', () => rebuildDashboard_(spreadsheet, config)],
        ['reconstruir-Dashboard-financeiro', () => rebuildFinancialDashboard_(spreadsheet, config)],
      ], {
        deviceId: clean_(payload.deviceId, 300),
        rowCount: rows.length,
      });
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
    const category = resolveNotificationCategory_(
      rule?.category || '',
      packageName,
      appName,
      row[NOTIFICATION_COLUMNS.title],
      row[NOTIFICATION_COLUMNS.text]
    );
    categories.push([category]);
    sensitiveValues.push([Boolean(rule?.sensitive) ||
      booleanValue_(row[NOTIFICATION_COLUMNS.sensitive]) ||
      ['Financeiro', 'Seguranca'].includes(category)]);
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
        .filter((row) => isFinancialEventRow_(row))
    : [];

  replaceDataRows_(target, FINANCIAL_HEADERS.length, rows);
}

function isFinancialEventRow_(row) {
  if (isCommerceOrderStatus_(
    row[NOTIFICATION_COLUMNS.packageName],
    row[NOTIFICATION_COLUMNS.appName],
    row[NOTIFICATION_COLUMNS.title],
    row[NOTIFICATION_COLUMNS.text]
  )) return false;
  return isFinancialEventContent_(
    row[NOTIFICATION_COLUMNS.title],
    row[NOTIFICATION_COLUMNS.text]
  );
}

function resolveNotificationCategory_(configuredCategory, packageName, appName, title, text) {
  if (looksLikeSecret_(text)) return 'Seguranca';
  if (isCommerceOrderStatus_(packageName, appName, title, text)) return 'Compras';
  if (isFinancialEventContent_(title, text)) return 'Financeiro';
  const automatic = automaticCategory_(packageName, appName, title, text);
  const configured = String(configuredCategory || '').trim();
  if (configured && !['Sem categoria', 'Financeiro', 'Outros'].includes(configured)) return configured;
  if (configured === 'Outros' && automatic !== 'Outros') return automatic;
  if (configured === 'Financeiro' && automatic !== 'Promocoes') return 'Financeiro';
  return automatic;
}

function isCommerceOrderStatus_(packageName, appName, title, text) {
  const app = normalize_([packageName, appName].join(' '));
  const content = normalize_([title, text].join(' '));
  const commerceApp = containsAny_(app, ['shopee', 'mercadolibre', 'mercado livre', 'amazon', 'shein', 'com.zzkko']);
  return commerceApp && /pagamento (?:confirmado|aprovado)|pedido .*pago/.test(content);
}

function looksLikeSecret_(value) {
  const text = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{28,}$/.test(text) ||
    /(?:token|chave|secret|senha)\s*[:=]\s*[a-zA-Z0-9_-]{16,}/i.test(text);
}

function isFinancialEventContent_(title, text) {
  const source = normalize_([title, text].join(' '));
  return [
    /compra(?: no cartao| no credito| aprovada| de r\$).*aprovad/,
    /compra.*(?:cartao|credito).*r\$/,
    /pix (?:foi )?(?:enviado|recebido)/,
    /transferencia (?:enviada|recebida|realizada)/,
    /pagamento (?:aprovado|confirmado|realizado)/,
    /boleto (?:pago|disponivel|emitido)/,
    /novo boleto/,
    /fatura (?:fechada|disponivel|vence|vencimento)/,
    /saque (?:realizado|aprovado)/,
    /deposito (?:recebido|confirmado)/,
  ].some((pattern) => pattern.test(source));
}

function isKnownFinancialApp_(packageName, appName) {
  const source = normalize_([packageName, appName].join(' '));
  return containsAny_(source, [
    'santander', 'c6bank', 'c6 bank', 'intermedium', 'banco inter', 'bancointer',
    'br.com.inter', 'caixa tem', 'br.gov.caixa', 'com.caixa', 'nubank',
    'com.nu.production', 'neon', 'riachuelo', 'midway',
  ]);
}

function automaticCategory_(packageName, appName, title, text) {
  const source = normalize_([packageName, appName, title, text].join(' '));
  if (looksLikeSecret_(text)) return 'Seguranca';
  if (isCommerceOrderStatus_(packageName, appName, title, text)) return 'Compras';
  if (isFinancialEventContent_(title, text)) return 'Financeiro';
  if (isKnownFinancialApp_(packageName, appName)) return 'Promocoes';
  if (containsAny_(source, ['br.com.serasaexperian.consumidor', ' serasa '])) return 'Promocoes';
  if (containsAny_(source, ['io.cloudwalk.pierre', ' pierre '])) return 'Financas pessoais';
  if (containsAny_(source, ['whatsapp', 'telegram', 'messenger', 'com.google.android.apps.messaging'])) {
    return 'Mensagens';
  }
  if (containsAny_(source, ['instagram', 'com.instagram.android'])) return 'Social';
  if (containsAny_(source, ['ifood', 'rappi', 'uber eats', '99food'])) return 'Entregas';
  if (containsAny_(source, ['duolingo', 'coursera', 'udemy'])) return 'Educacao';
  if (containsAny_(source, ['mercadolibre', 'mercado livre', 'shopee', 'amazon', 'shein', 'com.zzkko'])) {
    return 'Compras';
  }
  if (containsAny_(source, ['codigo de verificacao', 'codigo de seguranca', 'autenticacao'])) {
    return 'Seguranca';
  }
  if (containsAny_(source, ['com.google.android.apps.maps', 'maps']) && source.includes('mapas off-line')) {
    return 'Sistema';
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

function rebuildCreditCards_(spreadsheet, config) {
  const source = spreadsheet.getSheetByName(config.sheets.notifications);
  const target = ensureSheet_(spreadsheet, config.sheets.creditCards, CREDIT_CARD_HEADERS);
  const existing = new Map();
  if (target.getLastRow() >= 2) {
    target.getRange(2, 1, target.getLastRow() - 1, CREDIT_CARD_HEADERS.length).getValues().forEach((row) => {
      const key = creditCardKey_(row[CREDIT_CARD_COLUMNS.institution], row[CREDIT_CARD_COLUMNS.cardFinal]);
      if (key) existing.set(key, row);
    });
  }

  const cards = new Map();
  if (source && source.getLastRow() >= 2) {
    source.getRange(2, 1, source.getLastRow() - 1, NOTIFICATION_HEADERS.length).getValues().forEach((row) => {
      const title = row[NOTIFICATION_COLUMNS.title];
      const text = row[NOTIFICATION_COLUMNS.text];
      const cardFinal = extractCardFinal_([title, text].join(' '));
      if (!cardFinal) return;
      const institution = String(row[NOTIFICATION_COLUMNS.appName] || 'Desconhecido').trim();
      const key = creditCardKey_(institution, cardFinal);
      const seenAt = dateValue_(row[NOTIFICATION_COLUMNS.postedAt]);
      const current = cards.get(key) || {
        institution,
        cardFinal,
        firstSeen: seenAt,
        lastSeen: seenAt,
        approvedPurchases: 0,
        observedTotal: 0,
        groups: new Map(),
      };
      if (seenAt && (!current.firstSeen || seenAt < current.firstSeen)) current.firstSeen = seenAt;
      if (seenAt && (!current.lastSeen || seenAt > current.lastSeen)) current.lastSeen = seenAt;

      const transaction = parseFinancialTransaction_(row, config.debugTimeZone);
      if (transaction && transaction[TRANSACTION_COLUMNS.type] === 'Compra') {
        current.approvedPurchases += 1;
        current.observedTotal += Number(transaction[TRANSACTION_COLUMNS.amount]) || 0;
        const group = transaction[TRANSACTION_COLUMNS.group];
        current.groups.set(group, (current.groups.get(group) || 0) + 1);
      }
      cards.set(key, current);
    });
  }

  existing.forEach((row, key) => {
    if (!cards.has(key)) {
      cards.set(key, {
        institution: row[CREDIT_CARD_COLUMNS.institution],
        cardFinal: row[CREDIT_CARD_COLUMNS.cardFinal],
        firstSeen: row[CREDIT_CARD_COLUMNS.firstSeen],
        lastSeen: row[CREDIT_CARD_COLUMNS.lastSeen],
        approvedPurchases: Number(row[CREDIT_CARD_COLUMNS.approvedPurchases]) || 0,
        observedTotal: Number(row[CREDIT_CARD_COLUMNS.observedTotal]) || 0,
        groups: new Map(),
      });
    }
  });

  const rows = Array.from(cards.entries())
    .sort((left, right) => left[1].institution.localeCompare(right[1].institution) || left[1].cardFinal.localeCompare(right[1].cardFinal))
    .map(([key, card]) => {
      const previous = existing.get(key) || [];
      const inferredUse = Array.from(card.groups.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Geral';
      const type = String(previous[CREDIT_CARD_COLUMNS.type] || 'Nao informado').trim();
      return [
        card.institution,
        card.cardFinal,
        type,
        previous[CREDIT_CARD_COLUMNS.nickname] || '',
        previous[CREDIT_CARD_COLUMNS.holder] || '',
        previous[CREDIT_CARD_COLUMNS.primaryUse] || inferredUse,
        card.firstSeen || '',
        card.lastSeen || '',
        card.approvedPurchases,
        card.observedTotal,
        type === 'Nao informado',
      ];
    });

  const newSheet = target.getLastRow() < 2;
  replaceDataRows_(target, CREDIT_CARD_HEADERS.length, rows);
  target.getRange('C1').setNote('Escolha Nao informado, Virtual ou Fisico. A escolha sera preservada.');
  target.getRange('F1').setNote('Uso padrao aplicado quando o estabelecimento nao puder ser reconhecido.');
  if (newSheet) {
    const typeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Nao informado', 'Virtual', 'Fisico'], true)
      .setAllowInvalid(false)
      .build();
    const useRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Geral', 'Assinaturas', 'Comida na rua', 'Compras', 'Outro'], true)
      .setAllowInvalid(true)
      .build();
    target.getRange(2, CREDIT_CARD_COLUMNS.type + 1, Math.max(rows.length, 100), 1).setDataValidation(typeRule);
    target.getRange(2, CREDIT_CARD_COLUMNS.primaryUse + 1, Math.max(rows.length, 100), 1).setDataValidation(useRule);
  }
}

function readCreditCardRules_(spreadsheet, config) {
  const sheet = spreadsheet.getSheetByName(config.sheets.creditCards);
  const rules = new Map();
  if (!sheet || sheet.getLastRow() < 2) return rules;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, CREDIT_CARD_HEADERS.length).getValues().forEach((row) => {
    const key = creditCardKey_(row[CREDIT_CARD_COLUMNS.institution], row[CREDIT_CARD_COLUMNS.cardFinal]);
    if (!key) return;
    rules.set(key, {
      type: String(row[CREDIT_CARD_COLUMNS.type] || 'Nao informado').trim(),
      primaryUse: String(row[CREDIT_CARD_COLUMNS.primaryUse] || 'Geral').trim(),
    });
  });
  return rules;
}

function creditCardKey_(institution, cardFinal) {
  const finalDigits = String(cardFinal || '').replace(/\D/g, '').slice(-4);
  if (!finalDigits) return '';
  return `${normalize_(institution).trim()}|${finalDigits}`;
}

function rebuildTransactions_(spreadsheet, config) {
  const source = spreadsheet.getSheetByName(config.sheets.notifications);
  const target = ensureSheet_(spreadsheet, config.sheets.transactions, TRANSACTION_HEADERS);
  const cardRules = readCreditCardRules_(spreadsheet, config);
  const transactions = [];

  if (source && source.getLastRow() >= 2) {
    source
      .getRange(2, 1, source.getLastRow() - 1, NOTIFICATION_HEADERS.length)
      .getValues()
      .forEach((row) => {
        const transaction = parseFinancialTransaction_(row, config.debugTimeZone, cardRules);
        if (transaction) transactions.push(transaction);
      });
  }

  transactions.sort((left, right) => left[TRANSACTION_COLUMNS.dateTime] - right[TRANSACTION_COLUMNS.dateTime]);
  replaceDataRows_(target, TRANSACTION_HEADERS.length, transactions);
}

function parseFinancialTransaction_(row, timeZone, cardRules = new Map()) {
  const title = String(row[NOTIFICATION_COLUMNS.title] || '').trim();
  const text = String(row[NOTIFICATION_COLUMNS.text] || '').trim();
  const normalized = normalize_([title, text].join(' '));
  if (/compra recusada|recusad|nao foi aprovada|nao aprovada/.test(normalized)) return null;
  const amount = extractMoney_(text) ?? extractMoney_(title);
  if (!amount || amount <= 0) return null;

  let type = '';
  let direction = '';
  if (/compra.*aprovad/.test(normalized)) {
    type = 'Compra';
    direction = 'Saida';
  } else if (/pix (?:foi )?enviado/.test(normalized)) {
    type = 'Pix enviado';
    direction = 'Saida';
  } else if (/pix (?:foi )?recebido/.test(normalized)) {
    type = 'Pix recebido';
    direction = 'Entrada';
  } else if (/transferencia enviada|pagamento (?:aprovado|confirmado|realizado)|boleto pago/.test(normalized)) {
    type = normalized.includes('boleto') ? 'Boleto pago' : 'Pagamento';
    direction = 'Saida';
  } else if (/transferencia recebida|deposito (?:recebido|confirmado)/.test(normalized)) {
    type = 'Transferencia recebida';
    direction = 'Entrada';
  } else if (/saque (?:realizado|aprovado)/.test(normalized)) {
    type = 'Saque';
    direction = 'Saida';
  } else {
    return null;
  }

  const dateTime = extractTransactionDate_(text) ||
    dateValue_(row[NOTIFICATION_COLUMNS.postedAt]) ||
    dateValue_(row[NOTIFICATION_COLUMNS.receivedAt]);
  if (!dateTime) return null;

  const merchant = extractMerchant_(text, type);
  const institution = String(row[NOTIFICATION_COLUMNS.appName] || 'Desconhecido').trim();
  const cardFinal = extractCardFinal_(text);
  const cardRule = cardRules.get(creditCardKey_(institution, cardFinal));
  const detectedGroup = classifySpending_(merchant, title, text, type);
  const group = cardRule?.primaryUse && !['Geral', 'Outro'].includes(cardRule.primaryUse) && detectedGroup === 'Outros'
    ? cardRule.primaryUse
    : detectedGroup;
  const virtualCard = cardRule?.type === 'Virtual'
    ? true
    : cardRule?.type === 'Fisico'
      ? false
      : /cartao virtual/i.test(normalize_(text));
  return [
    dateTime,
    new Date(dateTime.getFullYear(), dateTime.getMonth(), dateTime.getDate()),
    Utilities.formatDate(dateTime, timeZone, 'HH:mm'),
    institution,
    type,
    direction,
    amount,
    merchant,
    group,
    cardFinal,
    virtualCard,
    String(row[NOTIFICATION_COLUMNS.id] || '').trim(),
    title,
    text,
    String(row[NOTIFICATION_COLUMNS.packageName] || '').trim(),
  ];
}

function extractMoney_(value) {
  const match = String(value || '').match(/R\$\s*([\d.]+,\d{2}|[\d,]+\.\d{2}|\d+)/i);
  if (!match) return null;
  const raw = match[1].replace(/[^\d.,]/g, '');
  const decimalSeparator = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
  const normalizedAmount = decimalSeparator === ','
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,/g, '');
  const amount = Number(normalizedAmount);
  return Number.isFinite(amount) ? amount : null;
}

function extractCardFinal_(value) {
  const match = String(value || '').match(
    /(?:cart[aã]o(?: virtual)?(?: com)? final|final)\s*([\d*xX• -]{4,30})/i
  );
  if (!match) return '';
  return match[1].replace(/\D/g, '').slice(-4);
}

function extractTransactionDate_(value) {
  const match = normalize_(value).match(
    /(?:dia|em)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,\s*|\s+)as\s+(\d{1,2}):(\d{2})/
  );
  if (!match) return null;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  return new Date(year, Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]));
}

function extractMerchant_(value, type) {
  if (type !== 'Compra') return type;
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const patterns = [
    /\bem\s+(.+?)\s+para o cart[aã]o/i,
    /,\s*em\s+([^,]+),\s*(?:foi\s+)?aprovada/i,
    /\bem\s+(.+?)\s+aprovada no cart[aã]o/i,
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  return match ? match[1].trim().replace(/\s{2,}/g, ' ').slice(0, 180) : 'Nao identificado';
}

function classifySpending_(merchant, title, text, type) {
  const source = normalize_([merchant, title, text].join(' '));
  if (source.includes('shopee')) return 'Shopee';
  if (source.includes('ifood') || source.includes('ifd*')) return 'iFood';
  if (containsAny_(source, ['uber', '99app', '99 pop'])) return 'Uber';
  if (containsAny_(source, [
    'restaurante', 'lanch', 'pizz', 'burger', 'hamburg', 'frit', 'gulla', 'cafe',
    'coffee', 'bar ', 'padaria', 'panificadora', 'sorvete', 'acai', 'vending',
  ])) return 'Comida na rua';
  if (containsAny_(source, ['posto ', 'combustivel', 'shell', 'ipiranga', 'petrobras'])) return 'Combustivel';
  if (containsAny_(source, [
    'spotify', 'apple.com/bill', 'netflix', 'amazon prime', 'youtube', 'google one',
    'google drive', 'icloud', 'capcut', 'chatgpt', 'openai', 'dropbox',
  ])) {
    return 'Assinaturas';
  }
  if (type === 'Pix enviado') return 'Pix enviado';
  if (type === 'Saque') return 'Saque';
  return 'Outros';
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

  const clearRows = Math.max(target.getLastRow(), 30);
  target.getCharts().forEach((chart) => target.removeChart(chart));
  target.getRange(1, 1, clearRows, 8).breakApart().clear();
  target.setHiddenGridlines(true);
  target.setFrozenRows(2);
  target.getRange(1, 1, clearRows, 8).setFontFamily('Arial').setFontColor('#18312B');

  target.getRange('A1:H1')
    .merge()
    .setValue('Notifica Arquivo - Dashboard')
    .setBackground('#17372F')
    .setFontColor('#FFFFFF')
    .setFontSize(18)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');
  target.setRowHeight(1, 42);

  const updatedAt = Utilities.formatDate(new Date(), config.debugTimeZone, 'dd/MM/yyyy HH:mm');
  target.getRange('A2:H2')
    .merge()
    .setValue(`Atualizado em ${updatedAt}. O backup nao entra nos indicadores.`)
    .setBackground('#EDF6F1')
    .setFontColor('#49635B')
    .setFontSize(10)
    .setFontStyle('italic')
    .setVerticalAlignment('middle');
  target.setRowHeight(2, 28);

  const metrics = [
    { columns: 'A:B', label: 'Total de notificacoes', value: rows.length, color: '#DDEFE7' },
    { columns: 'C:D', label: 'Recebidas hoje', value: receivedToday, color: '#E8F1F6' },
    { columns: 'E:F', label: 'Aplicativos', value: applications.size, color: '#EAEDEB' },
    { columns: 'G:H', label: 'Conteudos sensiveis', value: sensitiveCount, color: '#F8E5E3' },
  ];
  metrics.forEach((metric) => {
    target.getRange(`${metric.columns.split(':')[0]}4:${metric.columns.split(':')[1]}4`)
      .merge()
      .setValue(metric.label)
      .setBackground(metric.color)
      .setFontWeight('bold')
      .setFontSize(10)
      .setHorizontalAlignment('center');
    target.getRange(`${metric.columns.split(':')[0]}5:${metric.columns.split(':')[1]}6`)
      .merge()
      .setValue(metric.value)
      .setBackground(metric.color)
      .setFontWeight('bold')
      .setFontSize(24)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
  });

  target.getRange('A8:B8')
    .merge()
    .setValue('Notificacoes por categoria')
    .setBackground(GREEN_TABLE_COLORS.header)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');
  target.getRange('D8:E8')
    .merge()
    .setValue('Aplicativos com mais notificacoes')
    .setBackground(GREEN_TABLE_COLORS.header)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');
  target.getRange('A9:B9').setValues([['Categoria', 'Quantidade']]);
  target.getRange('D9:E9').setValues([['Aplicativo', 'Quantidade']]);
  target.getRange('A9:B9').setBackground('#CFE7DB').setFontWeight('bold');
  target.getRange('D9:E9').setBackground('#CFE7DB').setFontWeight('bold');

  const detailCount = Math.max(categoryNames.length, applicationRows.length, 1);
  const categoryMatrix = Array.from({ length: detailCount }, (_, index) => {
    const category = categoryNames[index];
    return [category || '', category ? categories.get(category) || 0 : ''];
  });
  const applicationMatrix = Array.from({ length: detailCount }, (_, index) => {
    const application = applicationRows[index];
    return [application ? application.name : '', application ? application.count : ''];
  });
  target.getRange(10, 1, detailCount, 2).setValues(categoryMatrix);
  target.getRange(10, 4, detailCount, 2).setValues(applicationMatrix);
  applyAlternatingBackgrounds_(target.getRange(10, 1, detailCount, 2));
  applyAlternatingBackgrounds_(target.getRange(10, 4, detailCount, 2));
  target.getRange(8, 1, detailCount + 2, 2).setBorder(true, true, true, true, true, true, '#B7D8C8', SpreadsheetApp.BorderStyle.SOLID);
  target.getRange(8, 4, detailCount + 2, 2).setBorder(true, true, true, true, true, true, '#B7D8C8', SpreadsheetApp.BorderStyle.SOLID);

  const categoryDataRows = categoryNames.length;
  if (categoryDataRows > 0) {
    const chart = target.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(target.getRange(9, 1, categoryDataRows + 1, 2))
      .setPosition(8, 7, 0, 0)
      .setOption('title', 'Distribuicao por categoria')
      .setOption('pieHole', 0.35)
      .setOption('legend', { position: 'right' })
      .setOption('backgroundColor', '#FFFFFF')
      .build();
    target.insertChart(chart);
  }

  [155, 95, 28, 220, 95, 28, 140, 140].forEach((width, index) => {
    target.setColumnWidth(index + 1, width);
  });
  target.getRange(1, 1, detailCount + 9, 8).setVerticalAlignment('middle');
}

function rebuildFinancialDashboard_(spreadsheet, config) {
  const transactionSheet = ensureSheet_(spreadsheet, config.sheets.transactions, TRANSACTION_HEADERS);
  const target = ensurePlainSheet_(spreadsheet, config.sheets.financialDashboard);
  const previousStart = dateValue_(target.getRange('B3').getValue());
  const previousEnd = dateValue_(target.getRange('D3').getValue());
  const allRows = transactionSheet.getLastRow() >= 2
    ? transactionSheet.getRange(2, 1, transactionSheet.getLastRow() - 1, TRANSACTION_HEADERS.length).getValues()
    : [];
  const datedRows = allRows.filter((row) => dateValue_(row[TRANSACTION_COLUMNS.dateTime]));
  const dates = datedRows.map((row) => dateValue_(row[TRANSACTION_COLUMNS.dateTime]));
  const today = new Date();
  const defaultStart = dates.length > 0
    ? new Date(Math.min(...dates.map((date) => date.getTime())))
    : new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultEnd = dates.length > 0
    ? new Date(Math.max(today.getTime(), ...dates.map((date) => date.getTime())))
    : today;
  const start = startOfDay_(previousStart || defaultStart);
  const end = endOfDay_(previousEnd || defaultEnd);
  const outgoing = datedRows.filter((row) => {
    const date = dateValue_(row[TRANSACTION_COLUMNS.dateTime]);
    return row[TRANSACTION_COLUMNS.direction] === 'Saida' && date >= start && date <= end;
  });

  const byGroup = sumTransactionsBy_(outgoing, TRANSACTION_COLUMNS.group);
  const byMerchant = sumTransactionsBy_(outgoing, TRANSACTION_COLUMNS.merchant);
  const byInstitution = sumTransactionsBy_(outgoing, TRANSACTION_COLUMNS.institution);
  const byCard = new Map();
  const byHour = new Map();
  outgoing.forEach((row) => {
    const date = dateValue_(row[TRANSACTION_COLUMNS.dateTime]);
    const hour = `${Utilities.formatDate(date, config.debugTimeZone, 'HH')}h`;
    const current = byHour.get(hour) || { name: hour, amount: 0, count: 0 };
    current.amount += Number(row[TRANSACTION_COLUMNS.amount]) || 0;
    current.count += 1;
    byHour.set(hour, current);

    const cardFinal = String(row[TRANSACTION_COLUMNS.cardFinal] || '').trim();
    if (cardFinal) {
      const virtual = booleanValue_(row[TRANSACTION_COLUMNS.virtualCard]);
      const cardName = `${row[TRANSACTION_COLUMNS.institution]} final ${cardFinal}${virtual ? ' (virtual)' : ''}`;
      const card = byCard.get(cardName) || { name: cardName, amount: 0, count: 0 };
      card.amount += Number(row[TRANSACTION_COLUMNS.amount]) || 0;
      card.count += 1;
      byCard.set(cardName, card);
    }
  });

  const total = outgoing.reduce((sum, row) => sum + (Number(row[TRANSACTION_COLUMNS.amount]) || 0), 0);
  const virtualTotal = outgoing
    .filter((row) => booleanValue_(row[TRANSACTION_COLUMNS.virtualCard]))
    .reduce((sum, row) => sum + (Number(row[TRANSACTION_COLUMNS.amount]) || 0), 0);
  const clearRows = Math.max(target.getLastRow(), 55);
  target.getCharts().forEach((chart) => target.removeChart(chart));
  target.getRange(1, 1, clearRows, 14).breakApart().clear();
  target.setHiddenGridlines(true);
  target.setFrozenRows(3);
  target.getRange(1, 1, clearRows, 14).setFontFamily('Arial').setFontColor(GREEN_TABLE_COLORS.text);

  target.getRange('A1:N1').merge()
    .setValue('Notifica Arquivo - Dashboard financeiro')
    .setBackground('#17372F').setFontColor('#FFFFFF').setFontSize(18).setFontWeight('bold');
  target.setRowHeight(1, 42);
  target.getRange('A2:N2').merge()
    .setValue(`Atualizado em ${Utilities.formatDate(new Date(), config.debugTimeZone, 'dd/MM/yyyy HH:mm')}. Somente movimentacoes reconhecidas entram nos valores.`)
    .setBackground('#EDF6F1').setFontColor('#49635B').setFontSize(10).setFontStyle('italic');

  target.getRange('A3').setValue('Inicio').setFontWeight('bold');
  target.getRange('B3').setValue(start).setNumberFormat('dd/MM/yyyy').setBackground('#FFF6D9');
  target.getRange('C3').setValue('Fim').setFontWeight('bold');
  target.getRange('D3').setValue(end).setNumberFormat('dd/MM/yyyy').setBackground('#FFF6D9');
  const dateValidation = SpreadsheetApp.newDataValidation().requireDate().build();
  target.getRange('B3').setDataValidation(dateValidation).setNote('Edite a data para filtrar o dashboard.');
  target.getRange('D3').setDataValidation(dateValidation).setNote('Edite a data para filtrar o dashboard.');

  const metrics = [
    ['A4:B4', 'A5:B6', 'Total gasto', total, '#DDEFE7'],
    ['C4:D4', 'C5:D6', 'Movimentacoes', outgoing.length, '#E8F1F6'],
    ['E4:F4', 'E5:F6', 'Ticket medio', outgoing.length ? total / outgoing.length : 0, '#EAEDEB'],
    ['G4:H4', 'G5:H6', 'Cartao virtual', virtualTotal, '#F8E5E3'],
  ];
  metrics.forEach(([labelRange, valueRange, label, value, color], index) => {
    target.getRange(labelRange).merge().setValue(label).setBackground(color).setFontWeight('bold').setHorizontalAlignment('center');
    target.getRange(valueRange).merge().setValue(value).setBackground(color).setFontWeight('bold').setFontSize(22)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    if (index !== 1) target.getRange(valueRange).setNumberFormat('R$ #,##0.00');
  });

  const focusGroups = ['Shopee', 'iFood', 'Uber', 'Comida na rua'];
  focusGroups.forEach((group, index) => {
    const column = 1 + index * 2;
    target.getRange(8, column, 1, 2).merge().setValue(group).setBackground('#CFE7DB').setFontWeight('bold').setHorizontalAlignment('center');
    target.getRange(9, column, 2, 2).merge().setValue(byGroup.get(group)?.amount || 0)
      .setNumberFormat('R$ #,##0.00').setFontWeight('bold').setFontSize(18).setHorizontalAlignment('center').setVerticalAlignment('middle');
  });

  const groupRows = mapToSortedRows_(byGroup);
  const merchantRows = mapToSortedRows_(byMerchant);
  const institutionRows = mapToSortedRows_(byInstitution);
  const cardRows = mapToSortedRows_(byCard);
  const hourRows = Array.from(byHour.values()).sort((a, b) => a.name.localeCompare(b.name));
  writeDashboardTable_(target, 12, 1, 'Gastos por grupo', groupRows);
  writeDashboardTable_(target, 12, 4, 'Gastos por estabelecimento', merchantRows);
  writeDashboardTable_(target, 12, 7, 'Gastos por horario', hourRows);
  writeDashboardTable_(target, 12, 10, 'Gastos por instituicao', institutionRows);
  writeDashboardTable_(target, 12, 13, 'Gastos por cartao', cardRows);

  const chartRow = 16 + Math.max(
    groupRows.length,
    merchantRows.length,
    hourRows.length,
    institutionRows.length,
    cardRows.length,
    1
  );
  insertFinancialCharts_(target, groupRows.length, merchantRows.length, hourRows.length, chartRow);
  [170, 110, 24, 230, 110, 24, 120, 110, 24, 180, 110, 24, 120, 120]
    .forEach((width, index) => target.setColumnWidth(index + 1, width));
}

function sumTransactionsBy_(rows, column) {
  const result = new Map();
  rows.forEach((row) => {
    const name = String(row[column] || 'Nao identificado').trim() || 'Nao identificado';
    const current = result.get(name) || { name, amount: 0, count: 0 };
    current.amount += Number(row[TRANSACTION_COLUMNS.amount]) || 0;
    current.count += 1;
    result.set(name, current);
  });
  return result;
}

function mapToSortedRows_(map) {
  return Array.from(map.values()).sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name));
}

function writeDashboardTable_(sheet, row, column, title, items) {
  const count = Math.max(items.length, 1);
  sheet.getRange(row, column, 1, 2).merge().setValue(title)
    .setBackground(GREEN_TABLE_COLORS.header).setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange(row + 1, column, 1, 2).setValues([['Nome', 'Valor']]).setBackground('#CFE7DB').setFontWeight('bold');
  const values = items.length > 0 ? items.map((item) => [item.name, item.amount]) : [['Sem dados', 0]];
  sheet.getRange(row + 2, column, count, 2).setValues(values);
  sheet.getRange(row + 2, column + 1, count, 1).setNumberFormat('R$ #,##0.00');
  applyAlternatingBackgrounds_(sheet.getRange(row + 2, column, count, 2));
  sheet.getRange(row, column, count + 2, 2).setBorder(true, true, true, true, true, true, GREEN_TABLE_COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
}

function insertFinancialCharts_(sheet, groupCount, merchantCount, hourCount, chartRow) {
  if (groupCount > 0) {
    sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.PIE)
      .addRange(sheet.getRange(13, 1, groupCount + 1, 2)).setPosition(chartRow, 1, 0, 0)
      .setOption('title', 'Onde o dinheiro foi gasto').setOption('pieHole', 0.35).build());
  }
  if (hourCount > 0) {
    sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.COLUMN)
      .addRange(sheet.getRange(13, 7, hourCount + 1, 2)).setPosition(chartRow, 7, 0, 0)
      .setOption('title', 'Gastos por hora').setOption('legend', { position: 'none' }).build());
  }
  if (merchantCount > 0) {
    sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.BAR)
      .addRange(sheet.getRange(13, 4, Math.min(merchantCount, 10) + 1, 2)).setPosition(chartRow + 18, 1, 0, 0)
      .setOption('title', 'Maiores estabelecimentos').setOption('legend', { position: 'none' }).build());
  }
}

function startOfDay_(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay_(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function configureTables_(spreadsheet, config) {
  const definitions = [
    {
      sheetName: config.sheets.notifications,
      tableName: TABLE_NAMES.notifications,
      columnCount: NOTIFICATION_HEADERS.length,
      widths: [150, 120, 220, 360, 170, 320, 150, 95, 230, 320, 260],
    },
    {
      sheetName: config.sheets.categories,
      tableName: TABLE_NAMES.categories,
      columnCount: CATEGORY_HEADERS.length,
      widths: [250, 190, 145, 95, 110],
    },
    {
      sheetName: config.sheets.applications,
      tableName: TABLE_NAMES.applications,
      columnCount: APPLICATION_HEADERS.length,
      widths: [250, 190, 145, 105, 160, 160, 110],
    },
    {
      sheetName: config.sheets.financial,
      tableName: TABLE_NAMES.financial,
      columnCount: FINANCIAL_HEADERS.length,
      widths: [150, 120, 220, 360, 170, 320, 150, 95, 230, 320, 260],
    },
    {
      sheetName: config.sheets.transactions,
      tableName: TABLE_NAMES.transactions,
      columnCount: TRANSACTION_HEADERS.length,
      widths: [155, 110, 75, 150, 130, 95, 110, 230, 145, 105, 115, 320, 220, 360, 230],
    },
    {
      sheetName: config.sheets.creditCards,
      tableName: TABLE_NAMES.creditCards,
      columnCount: CREDIT_CARD_HEADERS.length,
      widths: [165, 85, 125, 180, 150, 145, 160, 160, 135, 130, 95],
    },
  ];

  definitions.forEach((definition) => {
    const sheet = spreadsheet.getSheetByName(definition.sheetName);
    if (!sheet) throw new Error(`Aba ${definition.sheetName} nao encontrada.`);
    applyGreenSheetStyle_(sheet, definition.columnCount, definition.widths);
    definition.sheetId = sheet.getSheetId();
    definition.rowCount = Math.max(sheet.getLastRow(), 2);
  });

  const categoriesSheet = spreadsheet.getSheetByName(config.sheets.categories);
  const categoryRuleRows = Math.max(categoriesSheet.getLastRow() - 1, 1);
  const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  categoriesSheet.getRange(2, 4, categoryRuleRows, 2).setDataValidation(checkboxRule);
  categoriesSheet.getRange('D1').setNote(
    'TRUE aceita novas notificacoes deste pacote. FALSE descarta apenas as proximas no servidor.'
  );
  categoriesSheet.getRange('E1').setNote(
    'Marca conteudo privado. Nao apaga nem criptografa a notificacao.'
  );
  spreadsheet.getSheetByName(config.sheets.notifications).getRange('H1').setNote(
    'TRUE indica conteudo privado e entra no indicador de sensiveis do Dashboard.'
  );

  const tableResult = syncNativeTables_(spreadsheet, definitions);
  return {
    ok: true,
    apiVersion: API_VERSION,
    tables: tableResult,
  };
}

function applyGreenSheetStyle_(sheet, columnCount, widths) {
  const rowCount = Math.max(sheet.getLastRow(), 2);
  const bodyRowCount = Math.max(rowCount - 1, 1);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columnCount)
    .setBackground(GREEN_TABLE_COLORS.header)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 34);
  sheet.getRange(2, 1, bodyRowCount, columnCount)
    .setFontColor(GREEN_TABLE_COLORS.text)
    .setVerticalAlignment('middle')
    .setWrap(false);
  applyAlternatingBackgrounds_(sheet.getRange(2, 1, bodyRowCount, columnCount));
  sheet.getRange(1, 1, rowCount, columnCount)
    .setBorder(true, true, true, true, true, true, GREEN_TABLE_COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
  widths.forEach((width, index) => sheet.setColumnWidth(index + 1, width));
}

function applyAlternatingBackgrounds_(range) {
  const colors = Array.from({ length: range.getNumRows() }, (_, rowIndex) =>
    Array(range.getNumColumns()).fill(
      rowIndex % 2 === 0 ? GREEN_TABLE_COLORS.firstBand : GREEN_TABLE_COLORS.secondBand
    )
  );
  range.setBackgrounds(colors);
}

function syncNativeTables_(spreadsheet, definitions) {
  const spreadsheetId = spreadsheet.getId();
  const fields = encodeURIComponent('sheets(properties(sheetId,title),tables(tableId,name,range))');
  const metadata = sheetsApiRequest_(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=${fields}`,
    'get'
  );
  const sheetResources = metadata.sheets || [];
  const requests = [];
  const results = [];

  definitions.forEach((definition) => {
    const resource = sheetResources.find((item) => item.properties?.sheetId === definition.sheetId);
    if (!resource) throw new Error(`Aba ${definition.sheetName} nao retornada pela API do Sheets.`);
    const tables = resource.tables || [];
    const table = tables.find((item) => item.name === definition.tableName) || tables[0];
    const tableDefinition = {
      name: definition.tableName,
      range: {
        sheetId: definition.sheetId,
        startRowIndex: 0,
        endRowIndex: definition.rowCount,
        startColumnIndex: 0,
        endColumnIndex: definition.columnCount,
      },
      rowsProperties: greenTableRowsProperties_(),
    };

    if (table) {
      requests.push({
        updateTable: {
          table: { ...tableDefinition, tableId: table.tableId },
          fields: 'name,range,rowsProperties',
        },
      });
      results.push({ sheet: definition.sheetName, name: definition.tableName, action: 'updated' });
    } else {
      requests.push({ addTable: { table: tableDefinition } });
      results.push({ sheet: definition.sheetName, name: definition.tableName, action: 'created' });
    }
  });

  if (requests.length > 0) {
    sheetsApiRequest_(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      'post',
      { requests }
    );
  }
  return results;
}

function greenTableRowsProperties_() {
  return {
    headerColorStyle: { rgbColor: rgbColorFromHex_(GREEN_TABLE_COLORS.header) },
    firstBandColorStyle: { rgbColor: rgbColorFromHex_(GREEN_TABLE_COLORS.firstBand) },
    secondBandColorStyle: { rgbColor: rgbColorFromHex_(GREEN_TABLE_COLORS.secondBand) },
  };
}

function rgbColorFromHex_(hex) {
  const value = String(hex || '').replace('#', '');
  return {
    red: parseInt(value.slice(0, 2), 16) / 255,
    green: parseInt(value.slice(2, 4), 16) / 255,
    blue: parseInt(value.slice(4, 6), 16) / 255,
  };
}

function sheetsApiRequest_(url, method, payload) {
  const options = {
    method,
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    muteHttpExceptions: true,
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`Google Sheets API respondeu ${status}: ${clean_(body, 700)}`);
  }
  return body ? JSON.parse(body) : {};
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

function runBestEffortSteps_(operation, steps, context = {}) {
  const failures = [];
  steps.forEach(([step, action]) => {
    try {
      action();
      SpreadsheetApp.flush();
    } catch (error) {
      const debug = writeErrorReport_(`${operation}/${step}`, error, { ...context, step });
      failures.push({ step, error: String(error.message || error), debugReport: debug.path });
    }
  });
  if (failures.length > 0) console.error(JSON.stringify({ operation, failures }));
  return failures;
}

function writeErrorReport_(operation, error, context = {}) {
  try {
    const values = PropertiesService.getScriptProperties().getProperties();
    const debugTimeZone = String(
      values[PROPERTY_KEYS.debugTimeZone] || Session.getScriptTimeZone() || 'Etc/UTC'
    ).trim();
    const debugFolderName = String(
      values[PROPERTY_KEYS.debugFolderName] || 'NotificaArquivo-Debug'
    ).trim();
    const now = new Date();
    const day = Utilities.formatDate(now, debugTimeZone, 'yyyy-MM-dd');
    const time = Utilities.formatDate(now, debugTimeZone, 'HH-mm-ss');
    let debugParent = DriveApp.getRootFolder();
    let usedDriveRoot = true;
    try {
      const configuredParentId = folderIdFromValue_(values[PROPERTY_KEYS.debugParentFolderId]);
      debugParent = DriveApp.getFolderById(configuredParentId);
      debugParent.getName();
      usedDriveRoot = false;
    } catch (parentError) {
      console.error(`Pasta de debug configurada indisponivel; usando Meu Drive: ${String(parentError.message || parentError)}`);
    }
    const root = getOrCreateFolder_(debugParent, debugFolderName);
    const daily = getOrCreateFolder_(root, day);
    const safeOperation = String(operation || 'erro').replace(/[^a-zA-Z0-9_-]+/g, '-');
    const suffix = Utilities.getUuid().slice(0, 8);
    const fileName = `${time}-${safeOperation}-${suffix}.json`;
    const report = {
      timestamp: Utilities.formatDate(now, debugTimeZone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      apiVersion: API_VERSION,
      operation,
      debugStorage: {
        usedDriveRoot,
        requestedParentId: safePropertyId_(values[PROPERTY_KEYS.debugParentFolderId]),
      },
      spreadsheet: {
        id: safePropertyId_(values[PROPERTY_KEYS.spreadsheetId]),
        tabs: {
          notifications: values[PROPERTY_KEYS.notificationsSheet] || '',
          categories: values[PROPERTY_KEYS.categoriesSheet] || '',
          applications: values[PROPERTY_KEYS.applicationsSheet] || '',
          financial: values[PROPERTY_KEYS.financialSheet] || '',
          transactions: values[PROPERTY_KEYS.transactionsSheet] || '',
          creditCards: values[PROPERTY_KEYS.creditCardsSheet] || '',
          dashboard: values[PROPERTY_KEYS.dashboardSheet] || '',
          financialDashboard: values[PROPERTY_KEYS.financialDashboardSheet] || '',
          help: values[PROPERTY_KEYS.helpSheet] || '',
          backup: values[PROPERTY_KEYS.backupSheet] || '',
        },
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
      path: `${usedDriveRoot ? 'Meu Drive/' : ''}${debugFolderName}/${day}/${fileName}`,
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

function safePropertyId_(value) {
  const text = String(value || '').trim();
  const match = text.match(/\/(?:spreadsheets\/d|folders)\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : text;
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
      transactions: String(values[PROPERTY_KEYS.transactionsSheet]).trim(),
      creditCards: String(values[PROPERTY_KEYS.creditCardsSheet]).trim(),
      dashboard: String(values[PROPERTY_KEYS.dashboardSheet]).trim(),
      financialDashboard: String(values[PROPERTY_KEYS.financialDashboardSheet]).trim(),
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
