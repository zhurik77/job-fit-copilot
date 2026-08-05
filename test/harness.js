// Загружает sidepanel/panel.js вне Chrome, чтобы его чистые функции
// (сборка отчётов, экранирование, пороги оценок) можно было проверять
// обычным `node --test` без запуска браузера.
//
// panel.js — это IIFE без экспортов: он рассчитан на <script> в панели
// расширения. Поэтому мы дописываем в конец IIFE одну строку, кладущую
// нужные функции в globalThis.__panelExports, и выполняем результат с
// минимальными заглушками chrome/DOM. Сам файл на диске не меняется.

const fs = require('fs');
const path = require('path');

const PANEL_PATH = path.join(__dirname, '..', 'sidepanel', 'panel.js');

const EXPORTED = [
  'buildAtsAuditReportHtml',
  'buildAnalyticsReportHtml',
  'esc',
  'scoreKind',
  'computeScore',
  'rankResumeMatches',
  'splitExperienceHeading',
];

function stubElement() {
  const noop = () => {};
  const node = {
    style: {},
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop,
    removeChild: noop,
    replaceChildren: noop,
    insertBefore: noop,
    remove: noop,
    addEventListener: noop,
    setAttribute: noop,
    getAttribute: () => '52',
    focus: noop,
    click: noop,
    querySelector: () => stubElement(),
    querySelectorAll: () => [],
    textContent: '',
    innerHTML: '',
    value: '',
    hidden: false,
    disabled: false,
  };
  return node;
}

function installStubs() {
  const noop = () => {};
  globalThis.document = {
    getElementById: () => stubElement(),
    createElement: () => stubElement(),
    querySelectorAll: () => [],
    body: stubElement(),
    addEventListener: noop,
  };
  globalThis.window = { addEventListener: noop, open: noop };
  globalThis.navigator = { clipboard: { writeText: async () => {} } };
  globalThis.URL = { createObjectURL: () => 'blob:stub', revokeObjectURL: noop };
  globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
  globalThis.chrome = {
    runtime: {
      getManifest: () => ({ version: require('../manifest.json').version }),
      sendMessage: async () => ({ ok: false }),
      openOptionsPage: noop,
    },
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
    tabs: {
      create: noop,
      query: async () => [],
      onUpdated: { addListener: noop },
      onActivated: { addListener: noop },
    },
    scripting: { executeScript: async () => [] },
  };
  globalThis.JFC = {
    DEFAULT_PROFILE: '',
    MODELS: { deepseek: { label: 'DeepSeek' } },
    DEFAULT_MODEL: 'deepseek',
    genId: () => 'p_test',
    ensureSavedResumes: async () => ({ savedResumes: [], activeResumeId: null }),
  };
}

function loadPanelExports() {
  installStubs();

  const src = fs.readFileSync(PANEL_PATH, 'utf8');
  const marker = /\}\)\(\);\s*$/;
  if (!marker.test(src)) {
    throw new Error('panel.js больше не заканчивается на })(); — обнови harness.js');
  }
  const instrumented = src.replace(
    marker,
    `  globalThis.__panelExports = { ${EXPORTED.join(', ')} };\n})();\n`
  );

  // Инициализация панели вешает обработчики и дёргает асинхронные загрузки,
  // которым нечего вернуть из заглушек — их отказы для нас не значимы,
  // важен только момент, когда экспорт уже сформирован.
  const onRejection = () => {};
  process.on('unhandledRejection', onRejection);
  try {
    (0, eval)(instrumented);
  } catch (err) {
    throw new Error('panel.js не выполнился под заглушками: ' + err.message);
  }

  const exported = globalThis.__panelExports;
  if (!exported) throw new Error('panel.js не отдал экспорт — проверь имена в EXPORTED');

  const missing = EXPORTED.filter(name => typeof exported[name] !== 'function');
  if (missing.length) {
    throw new Error('panel.js не содержит функций: ' + missing.join(', '));
  }
  return exported;
}

module.exports = { loadPanelExports };
