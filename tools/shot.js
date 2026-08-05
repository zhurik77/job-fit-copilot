// Скриншоты панели для README и лендинга.
//
// Панель снимается в реальном Chromium в ширину настоящего Chrome side panel,
// но с ЗАРАНЕЕ ЗАДАННЫМИ ответами модели: живой запрос требует API-ключа и
// каждый раз возвращает другой текст, из-за чего скриншоты было бы невозможно
// воспроизвести. Разметка, стили и вся логика отрисовки — настоящие; заранее
// задан только JSON, который в бою пришёл бы от провайдера.
//
// Данные разбора взяты из реального прогона по вакансии автоматизатора
// (n8n / Python / REST API) на профиле автора, а не выдуманы.
//
// Запуск: node tools/shot.js  (npm run shots)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8721;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const { VACANCY, buildShim } = require('./shot-data');

// ---------- съёмка ----------

const TAB_TITLES = { check: 'Fit-Check', ats: 'ATS-разбор', profile: 'Профиль кандидата', analytics: 'Аналитика', history: 'Журнал' };

const SHOTS = [
  {
    tab: 'check', file: 'screenshot-fitcheck.jpg',
    // Прогоняем реальный обработчик кнопки — отрисовка результата настоящая.
    async prepare(page) {
      await page.fill('#vacancy-text', VACANCY.description);
      await page.click('#btn-check');
      await page.waitForSelector('#result:not([hidden])', { timeout: 10000 });
    },
  },
  {
    tab: 'ats', file: 'screenshot-ats-match.jpg',
    async prepare(page) {
      await page.click('#btn-ats-check');
      await page.waitForSelector('#ats-result:not([hidden])', { timeout: 10000 });
    },
  },
  {
    tab: 'profile', file: 'screenshot-ats-audit.jpg',
    async prepare(page) {
      await page.click('#btn-review-resume');
      await page.waitForSelector('#resume-review-result:not([hidden])', { timeout: 10000 });
    },
  },
  {
    tab: 'ats', file: 'screenshot-compare.jpg',
    async prepare(page) {
      await page.click('#btn-ats-compare-all');
      await page.waitForSelector('#ats-compare-result:not([hidden])', { timeout: 20000 });
    },
  },
  { tab: 'analytics', file: 'screenshot-analytics.jpg', fullPage: true },
];

function startServer() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(r => server.listen(PORT, () => r(server)));
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const shim = buildShim();

  // Заглушка собирается конкатенацией, поэтому её легко сломать незаметно —
  // проверяем синтаксис до запуска браузера, иначе ошибка проявится как
  // невнятный таймаут ожидания селектора.
  try {
    new Function(shim);
  } catch (err) {
    const dump = path.join(ROOT, 'shim-debug.js');
    fs.writeFileSync(dump, shim);
    console.error('Заглушка chrome.* не парсится: ' + err.message);
    console.error('Текст сохранён в ' + dump);
    await browser.close();
    server.close();
    process.exit(1);
  }
  const problems = [];

  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2 });
    // Ошибки печатаем сразу: если подготовка кадра зависнет, важно видеть
    // причину, а не только таймаут ожидания селектора.
    const errors = [];
    const note = (text) => { errors.push(text); console.error('    ! ' + text); };
    page.on('pageerror', e => note(e.message));
    page.on('console', m => { if (m.type() === 'error') note(m.text()); });

    await page.addInitScript(shim);
    await page.goto(`http://127.0.0.1:${PORT}/sidepanel/panel.html`, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Переключаем вкладку тем же кодом, что и клик пользователя.
    await page.click(`.ios-tab-item[data-tab="${shot.tab}"]`);
    await page.waitForTimeout(250);
    const titleEl = page.locator('#ios-title');
    if (await titleEl.count()) {
      await titleEl.evaluate((el, t) => { el.textContent = t; }, TAB_TITLES[shot.tab]);
    }

    if (shot.prepare) await shot.prepare(page);
    await page.waitForTimeout(400);

    // Таббар зафиксирован на экране, а при полностраничной съёмке fixed-элемент
    // рисуется на своей экранной позиции — посреди длинной страницы, прорезая
    // контент. Возвращаем его в поток: в разметке он последний элемент body,
    // поэтому встаёт ровно под контентом, как и выглядит внизу реальной панели.
    await page.addStyleTag({
      content: '.ios-tabbar { position: static !important; } body { padding-bottom: 0 !important; }',
    });
    await page.waitForTimeout(120);

    await page.screenshot({
      path: path.join(ROOT, 'site', 'public', shot.file),
      type: 'jpeg', quality: 92,
      fullPage: shot.fullPage !== false,
    });

    if (errors.length) problems.push(`${shot.file}: ${errors.join(' | ')}`);
    console.log(`${errors.length ? 'ОШИБКИ' : 'ok    '}  site/public/${shot.file}`);
    await page.close();
  }

  await browser.close();
  server.close();

  if (problems.length) {
    problems.forEach(p => console.error('  ' + p));
    process.exit(1);
  }
  console.log('\nГотово. Скриншоты — настоящая вёрстка панели, заранее задан только ответ модели.');
})();
