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
// Запуск: node tools/shot.js [--landing]
//   без флага  — 4 скриншота панели в docs/ для README
//   --landing  — плюс широкие кадры для лендинга

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

// ---------- фактура ----------

const RESUME_TEXT = `AI-автоматизатор бизнес-процессов — от 180 000 ₽

Опыт работы:

UniversityID · Руководитель направления · 2025 — наст. время
Руководил командой из 12 человек над MVP цифровой платформы. Проектировал
CRM-логику, внедрил автоматизацию на Python и REST API, настроил интеграции
с MongoDB. Год работы с LLM: промпт-инжиниринг, интеграция моделей в процессы.

---

МакЮниверс · Аналитик e-commerce · 2022 — 2025
Товарная аналитика и unit-экономика на Wildberries и Ozon. Работа с
поставщиками, 3 командировки в Китай.

---

Сервисный центр · Инженер · 2018 — 2022
Диагностика и ремонт техники. 2 место WorldSkills Russia 2021.

Навыки: Python, REST API, MongoDB, SQL, Промпт-инжиниринг, n8n, Zapier,
Бизнес-анализ, Сбор требований, unit-экономика, Wildberries, Ozon, Английский B2

Образование:
— МГТУ — Информационные системы, 2022

О себе:
Автоматизирую бизнес-процессы с помощью AI-инструментов. Ищу роли на стыке
аналитики и внедрения ИИ.`;

const VACANCY = {
  title: 'AI Automation Specialist',
  company: 'Финтех-продукт',
  salary: '180 000 — 240 000 ₽',
  url: 'https://hh.ru/vacancy/00000000',
  source: 'hh.ru',
  description: `Ищем специалиста по автоматизации бизнес-процессов.

Требования:
— Python, REST API, работа с интеграциями
— Опыт с n8n / Zapier / Make
— Опыт работы с LLM и промпт-инжинирингом
— Развёртывание сервисов в Kubernetes

Будет плюсом:
— SQL, MongoDB
— Опыт в e-commerce`,
};

const FIT_RESULT = {
  title: 'AI Automation Specialist',
  verdict: 'ОТКЛИКАТЬСЯ',
  ledger: [
    { text: 'Стек совпадает: Python, REST API — оба в требованиях и оба в опыте', delta: 18 },
    { text: 'Домен: автоматизация бизнес-процессов — прямой целевой трек', delta: 12 },
    { text: 'n8n/Zapier указаны в резюме и в требованиях — прямое попадание', delta: 8 },
    { text: 'Нет опыта с Kubernetes, а он в обязательных требованиях', delta: -10 },
  ],
  reasoning: 'Прямое попадание в целевой трек кандидата: автоматизация на Python и REST API плюс n8n закрывают три требования из четырёх. Единственный реальный разрыв — Kubernetes.',
  selling_points: ['Год работы с LLM и промпт-инжинирингом', 'n8n в продакшене, а не в пет-проекте'],
  flags: ['Kubernetes в обязательных требованиях — опыта нет'],
  effort_minutes: 12,
  booster: { text: 'Упомянуть кейс с n8n в сопроводительном письме', delta: 8 },
};

const ATS_RESULT = {
  overall_match_score: 74,
  hard_requirements_coverage_percent: 75,
  nice_to_have_coverage_percent: 100,
  hard_requirements: [
    { requirement: 'Python, REST API, работа с интеграциями', status: 'covered', matched_as: 'Python и REST API в UniversityID: автоматизация и интеграции с MongoDB' },
    { requirement: 'Опыт с n8n / Zapier / Make', status: 'covered', matched_as: 'n8n, Zapier в разделе навыков' },
    { requirement: 'Опыт работы с LLM и промпт-инжинирингом', status: 'covered', matched_as: '«Год работы с LLM: промпт-инжиниринг, интеграция моделей в процессы»' },
    { requirement: 'Развёртывание сервисов в Kubernetes', status: 'missing', matched_as: null, note: null },
  ],
  nice_to_have: [
    { requirement: 'SQL, MongoDB', status: 'covered', matched_as: 'SQL и MongoDB в навыках' },
    { requirement: 'Опыт в e-commerce', status: 'covered', matched_as: 'Аналитик e-commerce, Wildberries и Ozon, 2022–2025' },
  ],
  critical_gaps: ['Развёртывание сервисов в Kubernetes'],
  honest_gap_warning: 'Kubernetes отсутствует не как формулировка, а как навык — дописывать его в резюме нельзя.',
  actionable_edits: [
    {
      resume_section: 'Ключевые навыки',
      current_gap: 'Опыт с LLM не вынесен в навыки, хотя описан в опыте',
      suggested_text: 'Интеграция LLM в бизнес-процессы, промпт-инжиниринг',
      honesty_check: 'Формулировка опирается на строку «Год работы с LLM» из UniversityID, нового опыта не приписывает.',
    },
  ],
};

const AUDIT_RESULT = {
  overall_ats_score: 78,
  score_breakdown: {
    keyword_match_score: 82, structure_score: 74,
    experience_relevance_score: 88, metrics_density_score: 61,
    issues: [
      { area: 'Плотность метрик', issue: 'В двух местах работы из трёх нет измеримых результатов', impact: 'Рекрутер не видит масштаб задач, резюме проигрывает в ранжировании' },
      { area: 'Структура', issue: 'Раздел «О себе» дублирует заголовок и не добавляет фактов', impact: 'Первые строки карточки hh.ru тратятся впустую' },
    ],
  },
  value_proposition: 'Специалист на стыке бизнес-анализа и внедрения AI: семь лет пути от инженера до руководителя направления, с подтверждённым опытом автоматизации на Python и LLM.',
  experience_breakdown: [
    { company: 'UniversityID · Руководитель направления', issues: ['«Руководил командой» — пассивная формулировка без результата'], suggested_rewrite: 'Собрал и вывел команду из 12 человек на релиз MVP платформы за 7 месяцев' },
    { company: 'МакЮниверс · Аналитик e-commerce', issues: ['Нет цифр по обороту и марже'], suggested_rewrite: 'Вёл unit-экономику ассортимента на Wildberries и Ozon, отобрал поставщиков по 3 командировкам в Китай' },
  ],
  hh_ranking_factors: {
    last_update: 'обновлено 3 дня назад — в зелёной зоне',
    search_status: 'статус «активно ищу» проставлен',
    card_preview_density: 'средняя: в первых двух предложениях два ключевых термина из четырёх',
    notes: 'Вынести Python и LLM в первое предложение раздела «О себе» — именно оно попадает в карточку выдачи.',
  },
  target_roles: {
    core: [
      { title_ru: 'Специалист по AI-автоматизации', title_en: 'AI Automation Specialist', match_percent: 92, reasoning: 'Python, REST API, n8n и LLM — весь профиль совпадает' },
      { title_ru: 'Инженер по автоматизации процессов', title_en: 'Process Automation Engineer', match_percent: 86, reasoning: 'Автоматизация и интеграции подтверждены опытом в UniversityID' },
    ],
    transferable: [
      { title_ru: 'Бизнес-аналитик', title_en: 'Business Analyst', match_percent: 71, reasoning: 'Сбор требований и проектирование CRM-логики есть, но без BA-трека в найме' },
    ],
    growth: [
      { title_ru: 'Продакт-менеджер AI-продукта', title_en: 'AI Product Manager', match_percent: 48, reasoning: 'Не хватает трек-рекорда владения метриками продукта и работы с P&L' },
    ],
  },
  keyword_matrix: {
    core: {
      hard_skills_tools: ['Python', 'REST API', 'n8n', 'Zapier', 'MongoDB', 'SQL', 'LLM'],
      domain_methodology: ['автоматизация процессов', 'промпт-инжиниринг', 'unit-экономика', 'сбор требований'],
      action_verbs: ['внедрил', 'спроектировал', 'автоматизировал', 'интегрировал'],
    },
  },
  optimization_checklist: [
    { action: 'Добавить измеримый результат к каждому месту работы', target_section: 'Опыт работы', why: 'Плотность метрик — 20% итогового ATS-балла, сейчас она ниже всех' },
    { action: 'Вынести Python и LLM в первое предложение', target_section: 'О себе', why: 'Именно эти строки попадают в карточку выдачи hh.ru' },
  ],
};

// Резюме «Business Analyst» под вакансию автоматизатора объективно слабее:
// закрывает одно обязательное требование из четырёх. Именно ради такого
// сравнения и существует мульти-резюме.
const ATS_RESULT_BA = {
  overall_match_score: 41,
  hard_requirements_coverage_percent: 25,
  nice_to_have_coverage_percent: 50,
  hard_requirements: [
    { requirement: 'Python, REST API, работа с интеграциями', status: 'missing', matched_as: null },
    { requirement: 'Опыт с n8n / Zapier / Make', status: 'missing', matched_as: null },
    { requirement: 'Опыт работы с LLM и промпт-инжинирингом', status: 'missing', matched_as: null },
    { requirement: 'Развёртывание сервисов в Kubernetes', status: 'missing', matched_as: null },
  ],
  nice_to_have: [
    { requirement: 'SQL, MongoDB', status: 'covered', matched_as: 'SQL в навыках' },
    { requirement: 'Опыт в e-commerce', status: 'missing', matched_as: null },
  ],
  critical_gaps: ['Python и REST API', 'n8n / Zapier / Make', 'Опыт с LLM'],
  honest_gap_warning: 'Эта версия резюме собрана под роль бизнес-аналитика и не описывает инженерный опыт — под эту вакансию она проигрывает.',
  actionable_edits: [],
};

const HISTORY = [
  { id: 'JFC-20260805-03', title: 'AI Automation Specialist', source: 'hh.ru', verdict: 'ОТКЛИКАТЬСЯ', score: 78, applied: true, date: iso(0), vacancy: VACANCY, vacancyText: VACANCY.description, result: FIT_RESULT },
  { id: 'JFC-20260805-02', title: 'Бизнес-аналитик (Enterprise)', source: 'hh.ru', verdict: 'ПРОПУСТИТЬ', score: 26, applied: false, date: iso(1), vacancy: { title: 'Бизнес-аналитик (Enterprise)', source: 'hh.ru', description: 'Требуется SAP FI/CO, 3+ года в энтерпрайз-BA, офис Москва.' }, vacancyText: 'Требуется SAP FI/CO, 3+ года в энтерпрайз-BA, офис Москва.' },
  { id: 'JFC-20260804-01', title: 'Automation Engineer (Upwork)', source: 'upwork', verdict: 'ОТКЛИКАТЬСЯ', score: 81, applied: true, date: iso(2), vacancy: { title: 'Automation Engineer', source: 'upwork', description: 'Make.com, Airtable, API integrations.' }, vacancyText: 'Make.com, Airtable, API integrations.' },
  { id: 'JFC-20260802-02', title: 'Специалист по внедрению ИИ', source: 'hh.ru', verdict: 'С ОГОВОРКАМИ', score: 63, applied: false, date: iso(4), vacancy: { title: 'Специалист по внедрению ИИ', source: 'hh.ru', description: 'Внедрение ИИ-ассистентов, обучение сотрудников.' }, vacancyText: 'Внедрение ИИ-ассистентов, обучение сотрудников.' },
  { id: 'JFC-20260801-01', title: 'Data Analyst', source: 'linkedin', verdict: 'ПРОПУСТИТЬ', score: 34, applied: false, date: iso(6), vacancy: { title: 'Data Analyst', source: 'linkedin', description: 'dbt, Airflow, Snowflake, 4+ years.' }, vacancyText: 'dbt, Airflow, Snowflake, 4+ years.' },
  { id: 'JFC-20260730-01', title: 'n8n Automation Consultant', source: 'upwork', verdict: 'ОТКЛИКАТЬСЯ', score: 88, applied: true, date: iso(9), vacancy: { title: 'n8n Automation Consultant', source: 'upwork', description: 'n8n workflows, REST APIs, webhooks.' }, vacancyText: 'n8n workflows, REST APIs, webhooks.' },
  { id: 'JFC-20260728-01', title: 'Продуктовый аналитик', source: 'hh.ru', verdict: 'С ОГОВОРКАМИ', score: 57, applied: false, date: iso(12), vacancy: { title: 'Продуктовый аналитик', source: 'hh.ru', description: 'A/B-тесты, продуктовые метрики, SQL.' }, vacancyText: 'A/B-тесты, продуктовые метрики, SQL.' },
];

function iso(daysAgo) {
  return new Date(Date.now() - daysAgo * 86400 * 1000).toISOString();
}

// ---------- заглушка chrome.* ----------

function buildShim() {
  return `
    const __store = {
      savedResumes: [
        { id: 'r_ai', name: 'AI-автоматизатор', source: 'hh-import',
          sourceUrl: 'https://hh.ru/resume/demo', updatedAt: ${Date.now() - 3 * 86400000},
          atsScore: 78, atsScoreAt: ${Date.now() - 86400000},
          text: ${JSON.stringify(RESUME_TEXT)} },
        { id: 'r_ba', name: 'Business Analyst', updatedAt: ${Date.now() - 9 * 86400000},
          text: 'Бизнес-аналитик. Сбор требований, BPMN, SQL, работа со стейкхолдерами.' },
      ],
      activeResumeId: 'r_ai',
      model: 'deepseek',
      apiKeys: { deepseek: 'nvapi-demo-key' },
      letterLang: 'auto',
      lettersCount: 9,
      history: ${JSON.stringify(HISTORY)},
      ats_audit_history: [{ resumeId: 'r_ai', date: ${JSON.stringify(iso(11))}, overall_ats_score: 71 }],
    };
    const RESULTS = {
      ANALYZE_FIT: ${JSON.stringify(FIT_RESULT)},
      MATCH_ATS: ${JSON.stringify(ATS_RESULT)},
      REVIEW_RESUME: ${JSON.stringify(AUDIT_RESULT)},
      WRITE_LETTER: 'Здравствуйте!\\n\\nУвидел вакансию AI Automation Specialist. В UniversityID я собрал автоматизацию на Python и REST API и вывел её в продакшен вместе с n8n — это ровно тот контур, который описан в требованиях.\\n\\nОтдельно про LLM: последний год интегрирую модели в бизнес-процессы, включая промпт-инжиниринг под конкретные задачи команды.\\n\\nСразу обозначу разрыв: промышленного опыта с Kubernetes у меня нет.\\n\\nГотов обсудить детали.',
    };
    window.chrome = {
      runtime: {
        getManifest: () => ({ version: ${JSON.stringify(require('../manifest.json').version)} }),
        sendMessage: async (msg) => {
          await new Promise(r => setTimeout(r, 30));
          // ATS-ответ зависит от присланного резюме — иначе сравнение версий
          // выдало бы для всех одинаковый результат и потеряло смысл.
          if (msg.type === 'MATCH_ATS') {
            const isBA = String(msg.fullResume || '').includes('Бизнес-аналитик');
            return { ok: true, result: isBA ? ${JSON.stringify(ATS_RESULT_BA)} : ${JSON.stringify(ATS_RESULT)} };
          }
          const res = RESULTS[msg.type];
          return res ? { ok: true, result: res } : { ok: false, code: 'API', message: 'нет заготовки' };
        },
        openOptionsPage: () => {},
        onMessage: { addListener: () => {} },
      },
      storage: { local: {
        get: async (k) => { const l = Array.isArray(k) ? k : [k]; const o = {}; l.forEach(x => { if (x in __store) o[x] = __store[x]; }); return o; },
        set: async (o) => { Object.assign(__store, o); },
        remove: async (k) => { (Array.isArray(k) ? k : [k]).forEach(x => delete __store[x]); },
      } },
      tabs: {
        create: () => {},
        query: async () => [{ id: 1, url: ${JSON.stringify(VACANCY.url)} }],
        sendMessage: async () => (${JSON.stringify(VACANCY)}),
        onUpdated: { addListener: () => {} },
        onActivated: { addListener: () => {} },
      },
      scripting: { executeScript: async () => [{ result: ${JSON.stringify(VACANCY)} }] },
      sidePanel: { setPanelBehavior: async () => {} },
    };
  `;
}

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
      path: path.join(ROOT, 'docs', shot.file),
      type: 'jpeg', quality: 92,
      fullPage: shot.fullPage !== false,
    });

    if (errors.length) problems.push(`${shot.file}: ${errors.join(' | ')}`);
    console.log(`${errors.length ? 'ОШИБКИ' : 'ok    '}  docs/${shot.file}`);
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
