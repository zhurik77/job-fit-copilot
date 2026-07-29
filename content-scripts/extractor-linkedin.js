// Экстрактор вакансий LinkedIn.
// LinkedIn — SPA: описание подгружается с задержкой, панель повторяет
// запрос несколько раз, пока description не станет непустым.
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
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      'h1.t-24',
      'h1'
    ]);
    const company = pick([
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name'
    ]);
    // Инсайты верхней карточки (локация, занятость, иногда вилка зарплаты).
    const salary = pick([
      '.job-details-jobs-unified-top-card__job-insight',
      '.jobs-unified-top-card__job-insight'
    ]);
    const description = pick([
      '#job-details',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      'article.jobs-description__container'
    ]);

    return { title, company, salary, description, url: location.href, source: 'linkedin' };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'EXTRACT_VACANCY') sendResponse(extractVacancy());
  });
})();
