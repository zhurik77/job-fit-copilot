// Экстрактор вакансий hh.ru.
// ⚠️ CSS-селекторы ориентировочные: вёрстка hh.ru меняется, при сбоях
// сверяться с DevTools на реальной странице вакансии.
(function () {
  if (window.__jfcExtractorInstalled) return; // защита от повторного внедрения через chrome.scripting
  window.__jfcExtractorInstalled = true;

  function pick(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el && el.innerText && el.innerText.trim()) return el.innerText.trim();
    }
    return '';
  }

  function extractVacancy() {
    const title = pick([
      'h1[data-qa="vacancy-title"]',
      '[data-qa="vacancy-title"]',
      '.vacancy-title',
      'h1'
    ]);
    const company = pick([
      '[data-qa="vacancy-company-name"]',
      '.vacancy-company-name',
      '.vacancy-company-name-wrapper'
    ]);
    const salary = pick([
      '[data-qa="vacancy-salary"]',
      '[data-qa="vacancy-salary-compensation-type-net"]',
      '[data-qa="vacancy-salary-compensation-type-gross"]',
      '.vacancy-salary'
    ]);
    let description = pick([
      '[data-qa="vacancy-description"]',
      '.vacancy-description',
      '.g-user-content'
    ]);

    const skills = Array.from(
      document.querySelectorAll('[data-qa="skills-element"], [data-qa="bloko-tag__text"]')
    ).map(el => el.innerText.trim()).filter(Boolean);
    if (skills.length) description += '\n\nКлючевые навыки: ' + skills.join(', ');

    return { title, company, salary, description, url: location.href, source: 'hh.ru' };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'EXTRACT_VACANCY') sendResponse(extractVacancy());
  });
})();
