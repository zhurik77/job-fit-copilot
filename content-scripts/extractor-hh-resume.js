// Экстрактор резюме hh.ru (страница /resume/<id> в личном кабинете соискателя,
// доступна только залогиненному владельцу резюме).
// Селекторы — реальные data-qa, снятые вживую 2026-07-29 с рабочей страницы резюме
// (не хэшированные magritte-CSS-классы — те меняются при каждом деплое hh.ru).
// Если импорт перестанет работать: DevTools → Elements → искать data-qa="resume-..." заново.
(function () {
  if (window.__jfcResumeExtractorInstalled) return; // защита от повторного внедрения
  window.__jfcResumeExtractorInstalled = true;

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function text(el) {
    return el && el.innerText ? el.innerText.trim() : '';
  }

  // Убирает хвостовые метки самих кнопок раскрытия ("Развернуть"/"Свернуть"),
  // которые innerText прихватывает вместе с текстом описания.
  function stripToggleLabel(s) {
    return s.replace(/\n*(Развернуть|Свернуть)\s*$/i, '').trim();
  }

  // hh.ru рендерит часть блоков (доп. должности в одной компании, полный текст
  // "О себе") только после клика "Развернуть" — до клика их нет в DOM вообще,
  // это не CSS-обрезка. Кликаем всё, что найдём, внутри интересующих карточек.
  function clickExpandButtons(root) {
    if (!root) return false;
    const buttons = Array.from(root.querySelectorAll('button'))
      .filter(b => /^развернуть$/i.test((b.innerText || '').trim()));
    buttons.forEach(b => b.click());
    return buttons.length > 0;
  }

  async function extractResume() {
    const expCard = document.querySelector('[data-qa="resume-list-card-experience"]');
    const aboutCard = document.querySelector('[data-qa="resume-about-card"]');
    // Не через || — нужно кликнуть оба блока, а не остановиться на первом true.
    const clickedExp = clickExpandButtons(expCard);
    const clickedAbout = clickExpandButtons(aboutCard);
    if (clickedExp || clickedAbout) await sleep(300); // дать React перерендерить раскрытые блоки

    const title = text(document.querySelector('[data-qa="resume-block-title-position"]'));
    const salary = text(document.querySelector('[data-qa="resume-block-salary"]'));

    const experience = [];
    document.querySelectorAll('[data-qa="profile-experience-company-card"]').forEach(co => {
      const cells = co.querySelectorAll('[data-qa="cell-text-content"]');
      const company = cells.length ? text(cells[0]) : '';
      co.querySelectorAll('[data-qa="magritte-stepper-step-content"]').forEach(step => {
        const stepText = stripToggleLabel(text(step));
        if (stepText) experience.push({ company, text: stepText });
      });
    });

    const education = Array.from(
      document.querySelectorAll('[data-qa="resume-list-card-education"] [data-qa^="resume-list-card-education-item-"]')
    ).map(el => stripToggleLabel(text(el))).filter(Boolean);

    const skills = Array.from(
      document.querySelectorAll('[data-qa="skills-card"] [data-qa^="skill-tag-"]')
    ).map(text).filter(Boolean);

    const about = stripToggleLabel(text(document.querySelector('[data-qa="resume-about-card"]')));

    return { title, salary, experience, education, skills, about, url: location.href };
  }

  // Собирает единый читаемый текст профиля из структурных полей — то, что
  // реально уходит в системный промпт fit-check/письма и в textarea для правки.
  function formatResumeText(r) {
    const parts = [];
    if (r.title) parts.push(r.title + (r.salary ? ' — ' + r.salary : ''));

    if (r.experience.length) {
      const blocks = r.experience.map(e => (e.company ? e.company + '\n' : '') + e.text);
      parts.push('Опыт работы:\n\n' + blocks.join('\n\n---\n\n'));
    }

    if (r.skills.length) parts.push('Навыки: ' + r.skills.join(', '));

    if (r.education.length) {
      parts.push('Образование:\n' + r.education.map(e => '— ' + e).join('\n'));
    }

    if (r.about) parts.push('О себе:\n' + r.about);

    return parts.join('\n\n');
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'EXTRACT_RESUME') {
      extractResume().then(resume => {
        sendResponse({ ...resume, text: formatResumeText(resume) });
      });
      return true; // канал остаётся открытым для асинхронного ответа
    }
  });
})();
