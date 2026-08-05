// Логика вкладки «Профиль» и сравнения версий резюме.
// Ранжирование проверяется отдельно: от него зависит единственный ответ,
// ради которого функция существует — какое резюме отправлять.

const test = require('node:test');
const assert = require('node:assert');
const { loadPanelExports } = require('./harness');

const panel = loadPanelExports();

test('rankResumeMatches: обязательные требования важнее общего балла', () => {
  const ranked = panel.rankResumeMatches([
    { resume: { name: 'высокий общий' }, hard: 60, overall: 92 },
    { resume: { name: 'высокие обязательные' }, hard: 88, overall: 70 },
  ]);
  assert.strictEqual(ranked[0].resume.name, 'высокие обязательные',
    'резюме с дырой в обязательном требовании не должно побеждать по общему баллу');
});

test('rankResumeMatches: общий балл — тай-брейк при равных обязательных', () => {
  const ranked = panel.rankResumeMatches([
    { resume: { name: 'слабее' }, hard: 75, overall: 60 },
    { resume: { name: 'сильнее' }, hard: 75, overall: 81 },
  ]);
  assert.strictEqual(ranked[0].resume.name, 'сильнее');
});

test('rankResumeMatches: непосчитанные резюме исключаются из рейтинга', () => {
  const ranked = panel.rankResumeMatches([
    { resume: { name: 'упало' }, failed: true, reason: 'RATE_LIMIT' },
    { resume: { name: 'посчиталось' }, hard: 40, overall: 40 },
  ]);
  assert.strictEqual(ranked.length, 1);
  assert.strictEqual(ranked[0].resume.name, 'посчиталось');
});

test('rankResumeMatches: все резюме упали — пустой рейтинг, а не исключение', () => {
  assert.deepStrictEqual(panel.rankResumeMatches([{ failed: true }, { failed: true }]), []);
  assert.deepStrictEqual(panel.rankResumeMatches([]), []);
});

test('rankResumeMatches: не мутирует переданный массив', () => {
  const input = [
    { resume: { name: 'a' }, hard: 10, overall: 10 },
    { resume: { name: 'b' }, hard: 90, overall: 90 },
  ];
  panel.rankResumeMatches(input);
  assert.strictEqual(input[0].resume.name, 'a', 'исходный порядок должен сохраниться');
});

test('splitExperienceHeading: делит "Компания · Должность · период"', () => {
  const r = panel.splitExperienceHeading('UniversityID · Руководитель · 2025 — наст. время');
  assert.strictEqual(r.title, 'UniversityID');
  assert.strictEqual(r.meta, 'Руководитель · 2025 — наст. время');
});

test('splitExperienceHeading: заголовок без разделителей остаётся целым', () => {
  const r = panel.splitExperienceHeading('Фриланс');
  assert.strictEqual(r.title, 'Фриланс');
  assert.strictEqual(r.meta, '');
});

test('splitExperienceHeading: пустое значение не роняет разбор', () => {
  assert.deepStrictEqual(panel.splitExperienceHeading(''), { title: '', meta: '' });
  assert.deepStrictEqual(panel.splitExperienceHeading(undefined), { title: '', meta: '' });
});
