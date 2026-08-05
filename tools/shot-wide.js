// Широкие кадры «панель рядом с вакансией» — для лендинга и Chrome Web Store.
//
// Слева — НАСТОЯЩАЯ страница вакансии с hh.ru, справа — панель расширения с
// разбором этой же вакансии. Кадр собирается композицией двух снимков внутри
// нарисованной рамки браузера, потому что снять реальный side panel из
// headless Chromium нельзя: панель живёт в UI браузера, а не на странице.
//
// Ответ модели задан заранее (см. tools/shot.js) — живой запрос требует ключа
// и каждый раз возвращает другой текст. Всё остальное настоящее: и вёрстка
// панели, и страница вакансии.
//
// Запуск: node tools/shot-wide.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8722;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const { VACANCY, buildShim } = require('./shot-data');

// Размеры кадров. 1280×800 — обязательный размер скриншота Chrome Web Store.
const FRAMES = [
  { file: 'shot-wide.jpg', width: 1440, height: 900 },
  { file: 'store-1280x800.jpg', width: 1280, height: 800 },
];

const PANEL_WIDTH = 400;
const CHROME_HEIGHT = 76; // высота нарисованной шапки браузера

function startServer() {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
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

// Композитный кадр: рамка браузера + две картинки встык, как это и выглядит
// при открытом side panel.
function composeHtml(vacancyDataUri, panelDataUri, width, height) {
  const contentHeight = height - CHROME_HEIGHT;
  const pageWidth = width - PANEL_WIDTH;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${width}px; height: ${height}px; overflow: hidden;
           font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #DEE1E6; }
    .chrome { height: ${CHROME_HEIGHT}px; background: #DEE1E6; display: flex; flex-direction: column; }
    .tabs { height: 36px; display: flex; align-items: flex-end; padding: 6px 10px 0; gap: 6px; }
    .tab { background: #fff; border-radius: 8px 8px 0 0; height: 30px; display: flex; align-items: center;
           gap: 8px; padding: 0 14px; font-size: 12px; color: #3C4043; max-width: 260px; }
    .tab .fav { width: 14px; height: 14px; border-radius: 3px; background: #D6001C; flex: none; }
    .tab span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar { height: 40px; background: #fff; display: flex; align-items: center; gap: 12px; padding: 0 12px; }
    .nav { display: flex; gap: 14px; color: #5F6368; font-size: 15px; }
    .url { flex: 1; height: 26px; background: #F1F3F4; border-radius: 13px; display: flex; align-items: center;
           padding: 0 14px; font-size: 12px; color: #3C4043; gap: 8px; }
    .lock { color: #5F6368; font-size: 10px; }
    .ext { width: 24px; height: 24px; border-radius: 6px; background: #FF9500; flex: none;
           display: grid; place-items: center; color: #fff; font-size: 12px; font-weight: 700; }
    .content { height: ${contentHeight}px; display: flex; }
    .page { width: ${pageWidth}px; height: 100%; overflow: hidden; background: #fff; }
    .page img { width: ${pageWidth}px; display: block; }
    .panel { width: ${PANEL_WIDTH}px; height: 100%; overflow: hidden;
             border-left: 1px solid #DADCE0; background: #F2F2F7; }
    .panel img { width: ${PANEL_WIDTH}px; display: block; }
  </style></head><body>
    <div class="chrome">
      <div class="tabs">
        <div class="tab"><span class="fav"></span><span>${VACANCY.title}</span></div>
      </div>
      <div class="bar">
        <div class="nav"><span>←</span><span>→</span><span>⟳</span></div>
        <div class="url"><span class="lock">🔒</span><span>${VACANCY.url}</span></div>
        <div class="ext">JF</div>
      </div>
    </div>
    <div class="content">
      <div class="page"><img src="${vacancyDataUri}"></div>
      <div class="panel"><img src="${panelDataUri}"></div>
    </div>
  </body></html>`;
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();

  for (const frame of FRAMES) {
    const contentHeight = frame.height - CHROME_HEIGHT;
    const pageWidth = frame.width - PANEL_WIDTH;

    // 1. Настоящая страница вакансии.
    const vacancyCtx = await browser.newContext({
      viewport: { width: pageWidth, height: contentHeight },
      userAgent: UA, locale: 'ru-RU', deviceScaleFactor: 2,
    });
    const vacancyPage = await vacancyCtx.newPage();
    await vacancyPage.goto(VACANCY.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await vacancyPage.waitForTimeout(3500);
    // Подтверждение региона закрываем кнопкой — ровно как это сделал бы
    // пользователь. Прятать его селектором ненадёжно: на разной ширине hh.ru
    // рисует разные компоненты подсказки.
    for (const label of ['Всё верно', 'Да, верно', 'Верно']) {
      const btn = vacancyPage.getByRole('button', { name: label });
      if (await btn.count().catch(() => 0)) {
        await btn.first().click({ timeout: 3000 }).catch(() => {});
        break;
      }
    }
    await vacancyPage.waitForTimeout(600);

    // Cookie-информер прижат к низу и перекрывает текст. Шапку сайта
    // намеренно оставляем — по ней видно, что это настоящий hh.ru.
    //
    // Скрываем, а не удаляем, и только по точным селекторам: первая версия
    // чистила по [class*="cookie"], совпала с элементом-предком и снесла
    // страницу целиком — body становился null, а кадр выходил пустым белым.
    await vacancyPage.evaluate(() => {
      const desc = document.querySelector('[data-qa="vacancy-description"]');
      const selectors = ['[data-qa="cookies-policy-informer"]', '[class*="magritte-drop-base"]'];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (desc && el.contains(desc)) return; // страховка от самоуничтожения
          el.style.setProperty('display', 'none', 'important');
        });
      });
    }).catch(() => {});

    // Прокручиваем к описанию, чтобы в кадр попали требования, а не шапка.
    await vacancyPage.evaluate(() => {
      const el = document.querySelector('[data-qa="vacancy-description"]');
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90);
    }).catch(() => {});
    await vacancyPage.waitForTimeout(900);

    // Проверяем, что страница жива и содержит текст: пустой белый кадр
    // выглядит как «расширение не работает» и молча уехал бы в витрину.
    const vacancyOk = await vacancyPage.evaluate(() =>
      !!document.body && document.body.innerText.trim().length > 500);
    if (!vacancyOk) {
      throw new Error('Страница вакансии не отрисовалась — кадр был бы пустым. Проверь URL и доступность hh.ru.');
    }
    const vacancyShot = await vacancyPage.screenshot({ type: 'jpeg', quality: 92 });
    await vacancyCtx.close();

    // 2. Панель с разбором этой же вакансии.
    const panelCtx = await browser.newContext({
      viewport: { width: PANEL_WIDTH, height: contentHeight }, deviceScaleFactor: 2,
    });
    const panelPage = await panelCtx.newPage();
    await panelPage.addInitScript(buildShim());
    await panelPage.goto(`http://127.0.0.1:${PORT}/sidepanel/panel.html`, { waitUntil: 'load' });
    await panelPage.waitForTimeout(600);
    await panelPage.fill('#vacancy-text', VACANCY.description);
    await panelPage.click('#btn-check');
    await panelPage.waitForSelector('#result:not([hidden])', { timeout: 15000 });
    await panelPage.waitForTimeout(400);
    // Прокручиваем к вердикту — ради него кадр и делается. Отступ равен
    // высоте липкой шапки панели, иначе она накрывает сам вердикт.
    await panelPage.evaluate(() => {
      const el = document.getElementById('result');
      const nav = document.querySelector('.ios-nav');
      const navH = nav ? nav.getBoundingClientRect().height : 0;
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - navH - 10);
    });
    await panelPage.waitForTimeout(400);
    const panelShot = await panelPage.screenshot({ type: 'jpeg', quality: 92 });
    await panelCtx.close();

    // 3. Композиция в рамке браузера.
    const composeCtx = await browser.newContext({
      viewport: { width: frame.width, height: frame.height }, deviceScaleFactor: 2,
    });
    const composePage = await composeCtx.newPage();
    await composePage.setContent(composeHtml(
      'data:image/jpeg;base64,' + vacancyShot.toString('base64'),
      'data:image/jpeg;base64,' + panelShot.toString('base64'),
      frame.width, frame.height
    ), { waitUntil: 'load' });
    await composePage.waitForTimeout(500);
    await composePage.screenshot({ path: path.join(ROOT, 'site', 'public', frame.file), type: 'jpeg', quality: 92 });
    await composeCtx.close();

    console.log(`ok    site/public/${frame.file}  (${frame.width}×${frame.height})`);
  }

  await browser.close();
  server.close();
  console.log('\nСлева — настоящая страница вакансии с hh.ru, справа — панель с разбором.');
})();
