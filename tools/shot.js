// Одноразовый скрипт для честных скриншотов статичной вёрстки panel.html
// (без AI-сгенерированных данных) в размере реального Chrome side panel.
// Запуск вручную: node tools/shot.js (нужен локальный сервер на 8721, см. README).
const { chromium } = require('playwright');

const TAB_TITLES = {
  check: 'Fit-Check',
  ats: 'ATS-разбор',
  profile: 'Профиль кандидата',
  analytics: 'Аналитика'
};
const TABS = [
  { tab: 'check', file: 'screenshot-fitcheck.jpg' },
  { tab: 'ats', file: 'screenshot-ats-match.jpg' },
  { tab: 'profile', file: 'screenshot-ats-audit.jpg' },
  { tab: 'analytics', file: 'screenshot-analytics.jpg' }
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 380, height: 812 } });
  await page.goto('http://127.0.0.1:8721/sidepanel/panel.html', { waitUntil: 'load' });
  await page.waitForTimeout(300);

  for (const { tab, file, } of TABS) {
    // Headless Chromium в этом окружении не доставляет обычный click() до
    // обработчика в panel.js (chrome не определён вне контекста расширения,
    // из-за чего часть инициализации падает раньше initTabs()) — переключаем
    // вкладку теми же операциями, что делает activateTab() в panel.js.
    await page.evaluate((name) => {
      document.querySelectorAll('.ios-tab-item, .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === name);
      });
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.hidden = panel.dataset.tab !== name;
      });
      const titleEl = document.getElementById('ios-title');
      if (titleEl) titleEl.textContent = name;
    }, tab);
    const titleEl = page.locator('#ios-title');
    if (await titleEl.count()) await titleEl.evaluate((el, text) => { el.textContent = text; }, TAB_TITLES[tab]);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `docs/${file}`, type: 'jpeg', quality: 90, fullPage: tab === 'analytics' });
    console.log('saved', file);
  }

  await browser.close();
})();
