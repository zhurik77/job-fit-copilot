// Гейт, которого не хватало: до v0.4.5 единственной автоматической проверкой
// был `node --check`, а он видит только синтаксис. Из-за этого в релиз уехали
// вызовы buildAtsAuditReportHtml/buildAnalyticsReportHtml, которых не
// существовало, и ReferenceError на ensureSavedResumes в options.js.
// Правило no-undef ловит ровно этот класс ошибок.

// Проглоченная ошибка в catch и `_`-заглушка в деструктуризации — осознанный
// приём в этом коде (сетевые сбои и необязательные поля), а не забытый мусор.
const UNUSED_VARS = {
  args: 'none',
  caughtErrors: 'none',
  varsIgnorePattern: '^_',
};

const browserGlobals = {
  document: 'readonly',
  window: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
  Blob: 'readonly',
  URL: 'readonly',
  confirm: 'readonly',
  globalThis: 'readonly',
};

module.exports = [
  {
    ignores: ['node_modules/**', 'docs/**'],
  },
  {
    // Расширение: sidepanel, options, content scripts.
    files: ['sidepanel/**/*.js', 'options/**/*.js', 'content-scripts/**/*.js', 'shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserGlobals, chrome: 'readonly', JFC: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', UNUSED_VARS],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    // Service worker: нет DOM, зато есть importScripts.
    files: ['background.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        chrome: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        globalThis: 'readonly',
        importScripts: 'readonly',
        JFC: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', UNUSED_VARS],
    },
  },
  {
    // Node-скрипты: тесты и инструменты сборки скриншотов.
    // document/window здесь легальны: код внутри page.evaluate() исполняется
    // в браузере Playwright, хотя лежит в Node-файле.
    files: ['tools/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        globalThis: 'readonly',
        setTimeout: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', UNUSED_VARS],
    },
  },
];
