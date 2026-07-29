// Экстрактор вакансий Upwork.
// ⚠️ Селекторы ориентировочные, при сбоях сверяться с DevTools.
(function () {
  if (window.__jfcExtractorInstalled) return;
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
      '[data-test="job-header"] h4',
      '.job-details-card h4',
      'h4.h5',
      'h1'
    ]);
    // Имя клиента Upwork обычно не показывает — берём блок активности клиента, если есть.
    const company = pick([
      '[data-test="client-info"]',
      '[data-test="ClientActivity"]'
    ]);
    const salary = pick([
      '[data-test="Budget"]',
      '[data-test="budget"]',
      '[data-test="HourlyRate"]'
    ]);
    let description = pick([
      '[data-test="Description"]',
      '[data-test="job-description"]',
      '.job-description'
    ]);

    // Требуемые навыки из сегмента "Skills and Expertise".
    const skills = Array.from(
      document.querySelectorAll('[data-test="Skill"], [data-test="Attrs"] [data-test="Attr"], .skills-list .air3-token')
    ).map(el => el.innerText.trim()).filter(Boolean);
    if (skills.length) description += '\n\nSkills: ' + skills.join(', ');

    return { title, company, salary, description, url: location.href, source: 'upwork' };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'EXTRACT_VACANCY') sendResponse(extractVacancy());
  });
})();
