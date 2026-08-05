// Отчёты — единственная часть расширения, которая покидает браузер:
// пользователь скачивает .html и открывает его без CSP расширения.
// Поэтому проверяем три вещи: файл самодостаточен, весь текст модели
// экранирован, а цифры и геометрия дуг соответствуют входным данным.

const test = require('node:test');
const assert = require('node:assert');
const { loadPanelExports } = require('../tools/panel-harness');

const panel = loadPanelExports();
const XSS = '<img src=x onerror="alert(1)">';

const AUDIT = {
  overall_ats_score: 78,
  score_breakdown: {
    keyword_match_score: 82,
    structure_score: 70,
    experience_relevance_score: 88,
    metrics_density_score: 45,
    issues: [{ area: 'Плотность метрик', issue: XSS, impact: 'Снижает ранжирование' }],
  },
  value_proposition: 'AI-автоматизатор бизнес-процессов с 7+ годами опыта.',
  experience_breakdown: [
    { company: 'UniversityID', issues: ['пассивные конструкции'], suggested_rewrite: 'Спроектировал CRM-логику' },
  ],
  hh_ranking_factors: {
    last_update: 'сегодня', search_status: 'активно ищу',
    card_preview_density: 'высокая', notes: XSS,
  },
  target_roles: {
    core: [{ title_ru: 'AI-аналитик', title_en: 'AI Analyst', match_percent: 95, reasoning: 'прямое попадание' }],
    transferable: [], growth: [],
  },
  keyword_matrix: {
    core: { hard_skills_tools: ['Python', XSS], domain_methodology: ['unit-экономика'], action_verbs: ['внедрил'] },
  },
  optimization_checklist: [{ action: 'Добавить метрики', target_section: 'Опыт', why: 'поднимет конверсию' }],
};

const HISTORY = [
  { title: XSS, source: 'hh.ru', verdict: 'ОТКЛИКАТЬСЯ', score: 82, applied: true, date: new Date().toISOString() },
  {
    title: 'Бизнес-аналитик', source: 'LinkedIn', verdict: 'ПРОПУСТИТЬ', score: 32, applied: false,
    date: new Date(Date.now() - 40 * 86400 * 1000).toISOString(),
  },
];

test('ATS-отчёт: самодостаточный HTML без внешних запросов', () => {
  const html = panel.buildAtsAuditReportHtml(AUDIT, 'AI-automation');
  assert.ok(html.startsWith('<!doctype html>'), 'должен быть полноценный документ');
  assert.ok(html.length > 3000, 'отчёт подозрительно короткий');
  // Единственная разрешённая внешняя ссылка — репозиторий в подвале.
  const externals = html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/g) || [];
  assert.ok(
    externals.every(u => u.includes('github.com/zhurik77/jobfitcopilot')),
    'отчёт не должен тянуть внешние ресурсы: ' + externals.join(', ')
  );
});

test('ATS-отчёт: вывод модели экранирован во всех разделах', () => {
  const html = panel.buildAtsAuditReportHtml(AUDIT, 'AI-automation');
  assert.ok(!html.includes('<img src=x'), 'HTML модели попал в разметку без экранирования');
  assert.ok(html.includes('&lt;img src=x'), 'payload должен остаться видимым текстом');
  // Три раздела содержат payload — ни один не должен его пропустить.
  const escapedCount = (html.match(/&lt;img src=x/g) || []).length;
  assert.strictEqual(escapedCount, 3, 'ожидались 3 экранированных вхождения, найдено ' + escapedCount);
});

test('ATS-отчёт: геометрия дуги соответствует баллу', () => {
  const html = panel.buildAtsAuditReportHtml(AUDIT, 'AI-automation');
  const m = html.match(/stroke-dasharray="([\d.]+)"\s+stroke-dashoffset="([\d.]+)"/);
  assert.ok(m, 'дуга индекса не найдена');
  const filledPercent = (1 - Number(m[2]) / Number(m[1])) * 100;
  // Регрессия v0.4.4: dasharray был зашит под r=30 при реальном r=52,
  // из-за чего 78 закрашивало ~45% кольца.
  assert.ok(Math.abs(filledPercent - 78) < 0.5, 'дуга закрашена на ' + filledPercent.toFixed(1) + '% вместо 78%');
});

test('ATS-отчёт: имя аудируемого резюме попадает в шапку', () => {
  const html = panel.buildAtsAuditReportHtml(AUDIT, 'Business Analyst');
  assert.ok(html.includes('Business Analyst'), 'при мульти-резюме без имени непонятно, что аудировали');
});

test('ATS-отчёт: пустой ответ модели не роняет сборку', () => {
  const html = panel.buildAtsAuditReportHtml({ overall_ats_score: 40 }, 'Пустой');
  assert.ok(html.includes('Модель не вернула'), 'пустые разделы должны помечаться явно');
  assert.ok(html.includes('требует переработки'), 'вердикт для низкого балла');
});

test('Аналитика: агрегаты считаются верно', () => {
  const html = panel.buildAnalyticsReportHtml(HISTORY);
  assert.ok(html.includes('>57<'), 'средний индекс (82+32)/2 = 57');
  assert.ok(html.includes('1 / 1'), 'одна проверка за 7 дней, одна за 30');
  assert.ok(html.includes('Бизнес-аналитик') && html.includes('LinkedIn'), 'обе записи в таблице');
});

test('Аналитика: вывод модели экранирован', () => {
  const html = panel.buildAnalyticsReportHtml(HISTORY);
  assert.ok(!html.includes('<img src=x'), 'заголовок вакансии не экранирован');
});

test('Аналитика: пустая история даёт честную заглушку, а не падение', () => {
  const html = panel.buildAnalyticsReportHtml([]);
  assert.ok(html.includes('Ни одной проверки'));
  // Деление на ноль в среднем индексе — самый вероятный способ уронить отчёт.
  assert.ok(!html.includes('NaN'), 'в отчёте не должно быть NaN');
});

test('scoreKind: пороги 75 / 50', () => {
  assert.strictEqual(panel.scoreKind(100), 'good');
  assert.strictEqual(panel.scoreKind(75), 'good');
  assert.strictEqual(panel.scoreKind(74), 'mid');
  assert.strictEqual(panel.scoreKind(50), 'mid');
  assert.strictEqual(panel.scoreKind(49), 'bad');
  assert.strictEqual(panel.scoreKind(0), 'bad');
});

test('esc: покрывает все опасные символы и пустые значения', () => {
  assert.strictEqual(panel.esc(null), '');
  assert.strictEqual(panel.esc(undefined), '');
  assert.strictEqual(panel.esc('<&>"\''), '&lt;&amp;&gt;&quot;&#39;');
  assert.strictEqual(panel.esc(42), '42');
});

test('computeScore: база 50 плюс дельты, с ограничением 0..100', () => {
  assert.strictEqual(panel.computeScore({ ledger: [{ delta: 20 }, { delta: -5 }] }), 65);
  assert.strictEqual(panel.computeScore({ ledger: [{ delta: -80 }] }), 0, 'нижняя граница');
  assert.strictEqual(panel.computeScore({ ledger: [{ delta: 90 }] }), 100, 'верхняя граница');
  assert.strictEqual(panel.computeScore({ ledger: [{ delta: 'мусор' }] }), 50, 'нечисловая дельта = 0');
  // Без ledger индекс берётся из готового поля score (записи старой истории).
  assert.strictEqual(panel.computeScore({ score: 71 }), 71);
  assert.strictEqual(panel.computeScore({}), 0, 'нет ни ledger, ни score');
});
