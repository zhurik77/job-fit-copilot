// Фактура для скриншотов: резюме, настоящая вакансия с hh.ru, заранее
// заданные ответы модели и заглушка chrome.* — общая для tools/shot.js
// (кадры панели) и tools/shot-wide.js (панель рядом с вакансией).

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

// Настоящая вакансия с hh.ru (открытая публикация на момент съёмки).
// Требования ниже — дословно из неё, поэтому разбор ссылается на реальный
// текст, а не на выдуманный.
const VACANCY = {
  title: 'Специалист по автоматизации бизнес-процессов (n8n, AI, Битрикс24)',
  company: 'АО Спецавтобаза №1',
  salary: 'до 200 000 ₽ за месяц, на руки',
  url: 'https://hh.ru/vacancy/135794586',
  source: 'hh.ru',
  description: `Задачи:
Анализировать бизнес-процессы, находить узкие места и участки ручного труда;
Проектировать и собирать рабочие процессы в n8n (сложные воркфлоу, sub-workflows, ИИ-агенты);
Настраивать интеграции по REST API и вебхукам, обрабатывать данные в JSON;
Связывать внешние системы с Битрикс24, консолидировать данные в PostgreSQL;
Настраивать дашборды (Metabase) и автоматическую отчётность;
Разворачивать и обслуживать решения на Linux / VPS (SSH, терминал).

Кого мы ждём:
Опыт работы с n8n (или аналогами: Make, Zapier, Integromat);
Понимание REST API, вебхуков, JSON (Headers, Body, Query);
Уверенное использование нейросетей (ChatGPT / Claude) для сборки решений;
Умение читать и править JavaScript (в т.ч. сгенерированный ИИ);
Базовые SQL / PostgreSQL;
Базовое понимание серверов: Linux / VPS, SSH, терминал;
Автономность, обучаемость, системное мышление.

Будет плюсом: интеграции с Битрикс24 / amoCRM, Telegram Bot API,
базовый Python, навыки system design.`,
};

// Честный разбор этой вакансии под профиль автора: три требования закрыты,
// три — нет. Вердикт «С ОГОВОРКАМИ», а не бодрое «ОТКЛИКАТЬСЯ»: инструмент
// и создавался, чтобы не льстить.
const FIT_RESULT = {
  title: 'Автоматизация процессов (n8n, AI)',
  verdict: 'С ОГОВОРКАМИ',
  ledger: [
    { text: 'n8n в обязательных требованиях и в навыках резюме — прямое попадание', delta: 16 },
    { text: 'REST API и работа с JSON: подтверждено интеграциями в UniversityID', delta: 12 },
    { text: 'Нейросети для сборки решений — год работы с LLM и промпт-инжинирингом', delta: 10 },
    { text: 'Linux / VPS, SSH в обязательных — в резюме не упоминается ни разу', delta: -12 },
    { text: 'Требуется править JavaScript, в резюме заявлен только Python', delta: -8 },
    { text: 'PostgreSQL в задачах, в резюме — SQL и MongoDB, точного совпадения нет', delta: -5 },
  ],
  reasoning: 'Ядро вакансии — n8n, REST API и нейросети — закрыто напрямую и подтверждено опытом в UniversityID. Но три требования из обязательного списка не покрыты: администрирование Linux/VPS, JavaScript и PostgreSQL. Это не вопрос формулировок, такого опыта в резюме нет.',
  selling_points: [
    'n8n и REST API в продакшене, а не в пет-проекте',
    'Год интеграции LLM в бизнес-процессы — ровно то, что вакансия называет «уверенным использованием нейросетей»',
    'Портфолио важнее стажа: MVP платформы UniversityID с командой 12 человек',
  ],
  flags: [
    'Linux / VPS и SSH — обязательное требование, опыта нет',
    'JavaScript придётся править с первого дня',
  ],
  effort_minutes: 18,
  booster: { text: 'Собрать демо-воркфлоу на n8n и приложить ссылкой — вакансия прямо говорит, что портфолио важнее диплома', delta: 9 },
};

const ATS_RESULT = {
  overall_match_score: 63,
  hard_requirements_coverage_percent: 57,
  nice_to_have_coverage_percent: 75,
  hard_requirements: [
    { requirement: 'Опыт работы с n8n (или Make, Zapier, Integromat)', status: 'covered', matched_as: 'n8n и Zapier в разделе навыков' },
    { requirement: 'Понимание REST API, вебхуков, JSON', status: 'covered', matched_as: 'REST API и интеграции в UniversityID' },
    { requirement: 'Уверенное использование нейросетей для сборки решений', status: 'covered', matched_as: '«Год работы с LLM: промпт-инжиниринг, интеграция моделей в процессы»' },
    { requirement: 'Умение читать и править JavaScript', status: 'missing', matched_as: null },
    { requirement: 'Базовые SQL / PostgreSQL', status: 'partially_covered', matched_as: 'SQL и MongoDB в навыках', note: 'SQL есть, конкретно PostgreSQL не заявлен' },
    { requirement: 'Linux / VPS, SSH, терминал', status: 'missing', matched_as: null },
    { requirement: 'Автономность и системное мышление', status: 'covered', matched_as: 'Руководство командой 12 человек и вывод MVP в релиз' },
  ],
  nice_to_have: [
    { requirement: 'Базовый Python', status: 'covered', matched_as: 'Python — первый пункт в навыках' },
    { requirement: 'Интеграции с Битрикс24 / amoCRM', status: 'covered', matched_as: 'Проектирование CRM-логики в UniversityID' },
    { requirement: 'Telegram Bot API', status: 'missing', matched_as: null },
    { requirement: 'Навыки system design', status: 'covered', matched_as: 'Проектирование интеграций и CRM-логики' },
  ],
  critical_gaps: ['Умение читать и править JavaScript', 'Linux / VPS, SSH, терминал'],
  honest_gap_warning: 'JavaScript и администрирование Linux отсутствуют не как формулировки, а как навыки. Дописывать их в резюме нельзя — проверят на первом же техническом собеседовании.',
  actionable_edits: [
    {
      resume_section: 'Ключевые навыки',
      current_gap: 'Опыт с LLM описан в опыте, но не вынесен в навыки — ATS его не увидит',
      suggested_text: 'Интеграция LLM в бизнес-процессы, промпт-инжиниринг',
      honesty_check: 'Опирается на строку «Год работы с LLM» из UniversityID, нового опыта не приписывает.',
    },
    {
      resume_section: 'Опыт работы — UniversityID',
      current_gap: 'Вебхуки и JSON не названы явно, хотя вакансия требует их отдельным пунктом',
      suggested_text: 'Настраивал интеграции по REST API: обмен данными в JSON между сервисами',
      honesty_check: 'Переформулировка уже описанных интеграций, новых систем не добавляет.',
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
  { id: 'JFC-20260805-03', title: 'Автоматизация процессов (n8n, AI)', source: 'hh.ru', verdict: 'С ОГОВОРКАМИ', score: 63, applied: false, date: iso(0), vacancy: VACANCY, vacancyText: VACANCY.description, result: FIT_RESULT },
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


module.exports = { RESUME_TEXT, VACANCY, FIT_RESULT, ATS_RESULT, ATS_RESULT_BA, AUDIT_RESULT, HISTORY, buildShim };
