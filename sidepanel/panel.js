// Job Fit Copilot — логика side panel (редизайн 2026-07-27: ledger-разбор, вердикты-решения).
(function () {
  const { DEFAULT_PROFILE, MODELS, DEFAULT_MODEL, genId, ensureSavedResumes } = globalThis.JFC;
  const $ = id => document.getElementById(id);

  async function getActiveModelKey() {
    const { model } = await chrome.storage.local.get('model');
    return (model && MODELS[model]) ? model : DEFAULT_MODEL;
  }

  async function hasApiKeyForActiveModel() {
    const modelKey = await getActiveModelKey();
    const { apiKeys } = await chrome.storage.local.get('apiKeys');
    return { modelKey, ok: !!(apiKeys && apiKeys[modelKey]) };
  }

  const vacancyTextarea = $('vacancy-text');
  const metaEl = $('vacancy-meta');
  const checkBtn = $('btn-check');
  const errorEl = $('error');
  const openSettingsBtn = $('btn-open-settings');
  const loadingEl = $('loading');
  const resultEl = $('result');
  const historyEl = $('history');

  // Версия — только из manifest.json, единственный источник правды: так UI
  // и подпись в выгруженном отчёте не могут разойтись с реальным релизом.
  const APP_VERSION = (chrome.runtime && chrome.runtime.getManifest)
    ? 'v' + chrome.runtime.getManifest().version
    : '';

  const VERDICTS = ['ОТКЛИКАТЬСЯ', 'С ОГОВОРКАМИ', 'ПРОПУСТИТЬ'];
  const HISTORY_LIMIT = 50;
  const BASE_SCORE = 50;

  // Данные последней успешно прочитанной вакансии (для истории и языка письма).
  let currentVacancy = { title: '', company: '', salary: '', description: '', url: '', source: '' };
  let historyCount = 0;

  // ---------- утилиты ----------

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Любая строка, пришедшая от модели, прежде чем попасть в innerHTML.
  // Текст вакансии мы не контролируем, модель переносит его в ответ дословно,
  // а выгруженный .html-отчёт открывается уже без CSP расширения — так что
  // экранируем везде, а не только там, где «наверное, безопасно».
  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
  }

  // Отправка сообщения background.js с повтором при RATE_LIMIT (перегружен провайдер
  // выбранной модели) или PARSE_ERROR (модель обрезала/сломала JSON — часто
  // случайность, следующая попытка обычно проходит) и текстовым статусом
  // хода выполнения в labelEl.
  const RETRY_PLAN = {
    RATE_LIMIT: { delays: [3000, 8000, 20000], label: 'Лимит провайдера занят' },
    PARSE_ERROR: { delays: [1500, 4000], label: 'Модель вернула кривой ответ' }
  };
  async function sendWithRetry(msg, labelEl, baseLabel) {
    let plan = null;
    for (let attempt = 1; ; attempt++) {
      if (labelEl) {
        labelEl.textContent = (attempt === 1 || !plan)
          ? baseLabel
          : baseLabel + ` (попытка ${attempt}/${1 + plan.delays.length})`;
      }
      const resp = await chrome.runtime.sendMessage(msg);
      plan = resp && !resp.ok ? RETRY_PLAN[resp.code] : null;
      if (!plan || attempt > plan.delays.length) return resp;

      const waitMs = plan.delays[attempt - 1];
      for (let leftMs = waitMs; leftMs > 0; leftMs -= 1000) {
        if (labelEl) {
          labelEl.textContent = `${plan.label}, повтор через ${Math.ceil(leftMs / 1000)} с… (попытка ${attempt + 1}/${1 + plan.delays.length})`;
        }
        await sleep(1000);
      }
    }
  }

  function showError(text) {
    errorEl.textContent = text;
  }

  function clearError() {
    errorEl.textContent = '';
    openSettingsBtn.hidden = true;
  }

  function showNoApiKey(modelKey) {
    const label = modelKey && MODELS[modelKey] ? MODELS[modelKey].label : 'выбранной модели';
    showError('Не указан API-ключ для модели «' +label + '». Добавь его в настройках — без ключа запросы не отправляются.');
    openSettingsBtn.hidden = false;
  }

  function flashButton(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = old; }, 1400);
  }

  // Цветовой тип вердикта; старые значения из истории маппим на те же цвета.
  function verdictKind(v) {
    if (v === 'ОТКЛИКАТЬСЯ' || v === 'ТВОЯ НИША') return 'good';
    if (v === 'С ОГОВОРКАМИ' || v === 'ПОГРАНИЧНО') return 'mid';
    if (v === 'ПРОПУСТИТЬ' || v === 'МИМО') return 'bad';
    return 'neutral';
  }

  function sourceLabel(s) {
    return { 'hh.ru': 'hh.ru', linkedin: 'LinkedIn', upwork: 'Upwork' }[s] || '';
  }

  // Индекс считаем сами: база 50 + сумма дельт разбора (расхождение с разбивкой исключено).
  function computeScore(parsed) {
    if (Array.isArray(parsed.ledger) && parsed.ledger.length) {
      const sum = parsed.ledger.reduce((s, it) => s + (Number(it && it.delta) || 0), 0);
      return Math.max(0, Math.min(100, Math.round(BASE_SCORE + sum)));
    }
    return Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  }

  // Длину окружности берём из самого элемента, а не из константы: до v0.4.5
  // здесь было зашитое 188.5 (2π·30), тогда как в разметке r=52 (окружность
  // 326.7) — из-за чего индекс 100 закрашивал кольцо на 58%, а индекс 0
  // рисовал дугу на 42%. Число в центре при этом было верным, поэтому
  // расхождение бросалось в глаза.
  function arcCircumference(arcEl) {
    // getTotalLength() точнее, но у скрытого (hidden) контейнера возвращает 0 —
    // поэтому считаем из атрибута r, который есть всегда.
    const r = Number(arcEl.getAttribute('r')) || 0;
    return 2 * Math.PI * r;
  }

  // Дуга-индекс: заполняет число в центре и SVG-дугу вокруг него по kind (good/mid/bad).
  function setArc(arcEl, percent, kind) {
    if (!arcEl) return;
    const circumference = arcCircumference(arcEl);
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    arcEl.style.strokeDasharray = String(circumference);
    arcEl.style.strokeDashoffset = String(circumference * (1 - clamped / 100));
    arcEl.setAttribute('class', 'gauge-fill ' + kind);
  }

  // Порог совпадения → цветовой класс. Один источник правды для всех дуг.
  function scoreKind(score) {
    if (score >= 75) return 'good';
    if (score >= 50) return 'mid';
    return 'bad';
  }

  function setGauge(numId, arcId, score, kind) {
    const numEl = $(numId);
    if (numEl) {
      numEl.textContent = score;
      numEl.className = 'gauge-num ' + kind;
    }
    setArc($(arcId), score, kind);
  }

  // Номер проверки в реестре: JFC-YYYYMMDD-NN (NN — порядковый номер за сессию истории).
  function makeCheckId() {
    const d = new Date();
    const ymd = String(d.getFullYear()) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    return 'JFC-' + ymd + '-' + String(historyCount + 1).padStart(2, '0');
  }

  // ---------- профиль (именованные профили, несколько резюме) ----------

  let resumesCache = [];
  let activeResumeIdCache = null;

  function renderProfileSelect() {
    const select = $('profile-select');
    select.innerHTML = '';
    resumesCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + (p.source === 'hh-import' ? ' (hh.ru)' : '');
      select.appendChild(opt);
    });
    select.value = activeResumeIdCache;
  }

  async function loadProfile() {
    const { savedResumes, activeResumeId } = await ensureSavedResumes();
    resumesCache = savedResumes;
    activeResumeIdCache = activeResumeId;
    renderProfileSelect();
    const active = resumesCache.find(p => p.id === activeResumeIdCache);
    $('profile-text').value = (active && active.text) || DEFAULT_PROFILE;
    renderProfileStructuredView(active);
  }

  $('profile-select').addEventListener('change', async (e) => {
    activeResumeIdCache = e.target.value;
    await chrome.storage.local.set({ activeResumeId: activeResumeIdCache });
    const active = resumesCache.find(p => p.id === activeResumeIdCache);
    $('profile-text').value = (active && active.text) || '';
    $('profile-import-status').textContent = '';
    renderProfileStructuredView(active);
  });

  $('btn-save-profile').addEventListener('click', async () => {
    const active = resumesCache.find(p => p.id === activeResumeIdCache);
    if (active) {
      active.text = $('profile-text').value;
      active.updatedAt = Date.now();
      await chrome.storage.local.set({ savedResumes: resumesCache });
      updateProfileTextHint(active);
      renderProfileSummary(active, active.structured || parseImportedText(active.text));
      // Тот же список питает селектор резюме во вкладке ATS — обновляем,
      // иначе там останется прежний текст до перезагрузки панели.
      await populateAtsResumeSelect();
    }
    flashButton($('btn-save-profile'), 'Сохранено ✓');
  });

  // Карточный просмотр структурных данных резюме (когда профиль импортирован
  // с hh.ru) поверх голого текста в textarea — опыт отдельными блоками,
  // навыки чипами, а не одной простынёй.
  // Профили, импортированные до появления поля structured, его не имеют —
  // восстанавливаем структуру из уже сохранённого текста по тем же маркерам,
  // которыми его собрал extractor-hh-resume.js (formatResumeText), без
  // повторного похода на hh.ru.
  function parseImportedText(text) {
    if (!text) return null;
    const sections = text.split(/\n\n(?=Опыт работы:|Навыки:|Образование:|О себе:)/);
    const firstLine = (sections[0] || '').split('\n')[0] || '';
    const dashIdx = firstLine.lastIndexOf(' — ');
    const result = {
      title: dashIdx > -1 ? firstLine.slice(0, dashIdx) : firstLine,
      salary: dashIdx > -1 ? firstLine.slice(dashIdx + 3) : '',
      experience: [], education: [], skills: [], about: ''
    };

    for (const sec of sections.slice(1)) {
      if (sec.startsWith('Опыт работы:')) {
        const body = sec.replace(/^Опыт работы:\n\n/, '');
        result.experience = body.split('\n\n---\n\n').map(block => {
          const lines = block.split('\n');
          return { company: lines[0] || '', text: lines.slice(1).join('\n').trim() };
        });
      } else if (sec.startsWith('Навыки:')) {
        result.skills = sec.replace(/^Навыки:\s*/, '').split(',').map(x => x.trim()).filter(Boolean);
      } else if (sec.startsWith('Образование:')) {
        result.education = sec.replace(/^Образование:\n/, '').split('\n')
          .map(l => l.replace(/^—\s*/, '').trim()).filter(Boolean);
      } else if (sec.startsWith('О себе:')) {
        result.about = sec.replace(/^О себе:\n/, '').trim();
      }
    }
    return result;
  }

  // Экстрактор hh.ru склеивает заголовок опыта как
  // "Компания · Должность · период" — разбираем обратно, чтобы период
  // и должность не читались одной сплошной жирной строкой.
  function splitExperienceHeading(heading) {
    const parts = String(heading || '').split('·').map(p => p.trim()).filter(Boolean);
    if (parts.length <= 1) return { title: heading || '', meta: '' };
    return { title: parts[0], meta: parts.slice(1).join(' · ') };
  }

  function formatRelativeDate(ts) {
    if (!ts) return '';
    const days = Math.floor((Date.now() - ts) / 86400000);
    if (days <= 0) return 'обновлено сегодня';
    if (days === 1) return 'обновлено вчера';
    if (days < 30) return `обновлено ${days} дн. назад`;
    return 'обновлено ' + new Date(ts).toLocaleDateString('ru-RU');
  }

  // Шапка и сводка резюме. Показывается всегда — даже когда структурных
  // данных нет (резюме введено вручную), потому что ATS-оценка и дата
  // правки актуальны в любом случае.
  function renderProfileSummary(profile, structured) {
    const hero = $('rs-hero');
    const stats = $('rs-stats');
    const badge = $('rs-source-badge');
    if (!profile) {
      hero.hidden = true;
      stats.hidden = true;
      badge.hidden = true;
      return;
    }

    hero.hidden = false;
    stats.hidden = false;

    const s = structured || {};
    $('rs-title').textContent = s.title || profile.name || 'Резюме';
    $('rs-salary').textContent = s.salary || '';
    $('rs-updated').textContent = formatRelativeDate(profile.updatedAt);

    const fromHh = profile.source === 'hh-import';
    badge.hidden = false;
    badge.textContent = fromHh ? 'с hh.ru' : 'вручную';
    badge.className = 'chip chip-mini ' + (fromHh ? 'chip-source' : 'chip-neutral');

    const expCount = Array.isArray(s.experience) ? s.experience.length : 0;
    const skillCount = Array.isArray(s.skills) ? s.skills.length : 0;
    $('rs-stat-exp').textContent = expCount || '—';
    $('rs-stat-skills').textContent = skillCount || '—';

    // ATS-оценка хранится на самом резюме, поэтому переживает перезагрузку
    // панели и переключение между резюме.
    const scoreEl = $('rs-stat-score');
    const labelEl = $('rs-stat-score-label');
    const wrap = $('rs-stat-score-wrap');
    if (typeof profile.atsScore === 'number') {
      scoreEl.textContent = profile.atsScore;
      scoreEl.className = 'rs-stat-num ' + scoreKind(profile.atsScore);
      labelEl.textContent = 'ATS-оценка';
      wrap.classList.add('is-clickable');
      wrap.title = 'Оценка от ' + new Date(profile.atsScoreAt || Date.now()).toLocaleDateString('ru-RU');
    } else {
      scoreEl.textContent = '—';
      scoreEl.className = 'rs-stat-num';
      labelEl.textContent = 'не оценено';
      wrap.classList.remove('is-clickable');
      wrap.removeAttribute('title');
    }
  }

  function renderProfileStructuredView(profile) {
    const el = $('profile-structured');
    let s = profile && profile.structured;
    if (!s && profile && profile.source === 'hh-import') {
      s = parseImportedText(profile.text);
    }

    renderProfileSummary(profile, s);
    updateProfileTextHint(profile);

    if (!s) { el.hidden = true; return; }
    el.hidden = false;

    const expWrap = $('rs-experience');
    expWrap.textContent = '';
    const hasExp = Array.isArray(s.experience) && s.experience.length > 0;
    $('rs-experience-title').hidden = !hasExp;
    if (hasExp) {
      s.experience.forEach(e => {
        const item = document.createElement('div');
        item.className = 'rs-exp-item';
        if (e.company) {
          const { title, meta } = splitExperienceHeading(e.company);
          const co = document.createElement('div');
          co.className = 'rs-exp-company';
          co.textContent = title;
          item.appendChild(co);
          if (meta) {
            const metaEl = document.createElement('div');
            metaEl.className = 'rs-exp-meta';
            metaEl.textContent = meta;
            item.appendChild(metaEl);
          }
        }
        const body = document.createElement('div');
        body.className = 'rs-exp-body';
        body.textContent = e.text || '';
        item.appendChild(body);
        expWrap.appendChild(item);
      });
    }

    const skillsWrap = $('rs-skills');
    skillsWrap.textContent = '';
    const hasSkills = Array.isArray(s.skills) && s.skills.length > 0;
    $('rs-skills-title').hidden = !hasSkills;
    if (hasSkills) {
      s.skills.forEach(sk => {
        const chip = document.createElement('span');
        chip.className = 'chip chip-mini';
        chip.textContent = sk;
        skillsWrap.appendChild(chip);
      });
    }

    const eduWrap = $('rs-education');
    eduWrap.textContent = '';
    const hasEdu = Array.isArray(s.education) && s.education.length > 0;
    $('rs-education-title').hidden = !hasEdu;
    if (hasEdu) {
      s.education.forEach(ed => {
        const item = document.createElement('div');
        item.className = 'rs-edu-item';
        // Маркер рисует CSS — иначе у импортированных записей, уже
        // начинающихся с тире, получалось двойное "— — МГТУ".
        item.textContent = String(ed).replace(/^[—–-]\s*/, '');
        eduWrap.appendChild(item);
      });
    }

    $('rs-about-title').hidden = !s.about;
    $('rs-about').textContent = s.about || '';
  }

  // Подсказка в свёрнутом блоке: сколько символов уйдёт модели. Без неё
  // непонятно, есть ли там вообще текст, пока блок закрыт.
  function updateProfileTextHint(profile) {
    const hint = $('profile-text-len');
    if (!hint) return;
    const len = ((profile && profile.text) || '').trim().length;
    hint.textContent = len ? len.toLocaleString('ru-RU') + ' симв.' : 'пусто';
  }

  // ---------- импорт резюме с hh.ru ----------

  function isResumePageUrl(url) {
    return /^https:\/\/[^/]*hh\.ru\/resume\//.test(url || '');
  }

  async function checkResumeImportAvailability() {
    const tab = await getActiveTab();
    const onResumePage = isResumePageUrl(tab && tab.url);
    $('btn-import-resume').hidden = !onResumePage;
    // На странице резюме сразу открываем вкладку профиля — не нужно искать
    // кнопку импорта самому.
    if (onResumePage) activateTab('profile');
  }

  $('btn-import-resume').addEventListener('click', async () => {
    const statusEl = $('profile-import-status');
    const btn = $('btn-import-resume');
    btn.disabled = true;
    statusEl.textContent = 'Читаю резюме со страницы…';

    const tab = await getActiveTab();
    if (!tab || !isResumePageUrl(tab.url)) {
      statusEl.textContent = 'Открой страницу своего резюме на hh.ru и попробуй снова.';
      btn.disabled = false;
      return;
    }

    let resume = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        resume = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_RESUME' });
        if (resume && resume.text) break;
      } catch (e) {
        // Content script ещё не внедрён (страница открыта до установки расширения).
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/extractor-hh-resume.js'] });
        } catch (_) { /* нет доступа к странице */ }
        await sleep(300);
      }
    }

    if (!resume || !resume.text) {
      statusEl.textContent = 'Не удалось прочитать резюме. Обнови страницу hh.ru и попробуй ещё раз.';
      btn.disabled = false;
      return;
    }

    // Повторный импорт того же резюме (тот же url) обновляет существующий профиль,
    // а не плодит дубликаты.
    let target = resumesCache.find(p => p.sourceUrl === resume.url);
    if (!target) {
      target = {
        id: genId(),
        name: (resume.title || 'Резюме с hh.ru').slice(0, 60),
        source: 'hh-import',
        sourceUrl: resume.url
      };
      resumesCache.push(target);
    }
    target.text = resume.text;
    target.structured = {
      title: resume.title, salary: resume.salary, experience: resume.experience,
      education: resume.education, skills: resume.skills, about: resume.about
    };
    target.updatedAt = Date.now();
    activeResumeIdCache = target.id;

    await chrome.storage.local.set({ savedResumes: resumesCache, activeResumeId: activeResumeIdCache });
    renderProfileSelect();
    $('profile-text').value = target.text;
    renderProfileStructuredView(target);
    // Импортированное резюме сразу доступно для ATS-сравнения без перезагрузки.
    await populateAtsResumeSelect();

    statusEl.textContent = 'Импортировано: ' + (resume.experience ? resume.experience.length : 0) +
      ' мест работы, ' + (resume.skills ? resume.skills.length : 0) + ' навыков, обновлено ' +
      new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    btn.disabled = false;
  });

  // ---------- оценка резюме (без привязки к вакансии) ----------

  $('btn-review-resume').addEventListener('click', async () => {
    const profileText = $('profile-text').value.trim();
    if (!profileText) {
      showError('Сначала укажи текст профиля/резюме.');
      return;
    }
    const keyCheck = await hasApiKeyForActiveModel();
    if (!keyCheck.ok) { showNoApiKey(keyCheck.modelKey); return; }

    clearError();
    $('resume-review-result').hidden = true;
    $('btn-review-resume').disabled = true;
    $('resume-review-loading').style.display = 'block';
    const rrLoadingLabel = $('resume-review-loading-label');

    try {
      const resp = await sendWithRetry({ type: 'REVIEW_RESUME', profile: profileText }, rrLoadingLabel, 'Оцениваю');
      if (!resp) throw new Error('empty response');
      if (!resp.ok) {
        if (resp.code === 'NO_API_KEY') { showError('Не указан API-ключ для модели «' +resp.message + '». Добавь его в настройках — без ключа запросы не отправляются.'); openSettingsBtn.hidden = false; return; }
        if (resp.code === 'PARSE_ERROR') { showError('Модель несколько раз подряд вернула повреждённый ответ. Попробуй ещё раз или переключи модель в настройках.'); openSettingsBtn.hidden = false; return; }
        if (resp.code === 'RATE_LIMIT') { showError('Провайдер перегружен для этой модели даже после повторов. Попробуй позже или переключи модель в настройках.'); openSettingsBtn.hidden = false; return; }
        showError('Ошибка API: ' + (resp.message || 'неизвестная'));
        return;
      }
      renderResumeReview(resp.result);
    } catch (e) {
      showError('Не получилось оценить резюме. Проверь подключение и попробуй ещё раз.');
      console.error(e);
    } finally {
      $('btn-review-resume').disabled = false;
      $('resume-review-loading').style.display = 'none';
    }
  });

  let lastAtsAuditResult = null;

  async function renderResumeReview(parsed) {
    lastAtsAuditResult = parsed;

    const overallScore = Math.round(Number(parsed.overall_ats_score) || computeScore(parsed) || 0);
    setGauge('rr-score', 'rr-score-arc', overallScore, scoreKind(overallScore));

    const verdictTitle = $('rr-verdict-title');
    if (verdictTitle) {
      verdictTitle.textContent = overallScore >= 75
        ? 'Резюме проходит ATS-фильтры'
        : (overallScore >= 50 ? 'Проходит с оговорками' : 'Требует переработки');
      verdictTitle.className = 'rr-verdict-title ' + scoreKind(overallScore);
    }

    // История аудитов ведётся ОТДЕЛЬНО по каждому резюме. Раньше она была
    // общей, и после аудита второго резюме «динамика» сравнивала его с
    // первым — то есть показывала разницу между разными документами,
    // выдавая её за прогресс одного.
    const auditedId = activeResumeIdCache;
    let progressDeltaText = 'Сравнение с прошлым аудитом появится при повторном запуске';
    try {
      const { ats_audit_history } = await chrome.storage.local.get('ats_audit_history');
      const all = Array.isArray(ats_audit_history) ? ats_audit_history : [];
      const mine = all.filter(h => h.resumeId === auditedId);
      if (mine.length > 0) {
        const lastScore = Math.round(Number(mine[0].overall_ats_score) || 0);
        const diff = overallScore - lastScore;
        const when = mine[0].date ? new Date(mine[0].date).toLocaleDateString('ru-RU') : '';
        progressDeltaText = diff === 0
          ? `Без изменений с прошлого аудита (${when})`
          : `${diff > 0 ? '+' : ''}${diff} к прошлому аудиту (было ${lastScore}, ${when})`;
      }
      all.unshift({
        resumeId: auditedId,
        date: new Date().toISOString(),
        overall_ats_score: overallScore,
        result: parsed
      });
      await chrome.storage.local.set({ ats_audit_history: all.slice(0, 20) });
    } catch (e) {
      console.error('Audit history save failed', e);
    }
    if ($('rr-progress-delta')) $('rr-progress-delta').textContent = progressDeltaText;

    // Оценка запоминается на самом резюме, чтобы её было видно в сводке
    // профиля без повторного запуска разбора.
    const audited = resumesCache.find(r => r.id === auditedId);
    if (audited) {
      audited.atsScore = overallScore;
      audited.atsScoreAt = Date.now();
      try {
        await chrome.storage.local.set({ savedResumes: resumesCache });
        renderProfileSummary(audited, audited.structured || parseImportedText(audited.text));
      } catch (e) {
        console.error('ATS score save failed', e);
      }
    }

    // Sub-scores
    const sb = parsed.score_breakdown || {};
    if ($('rr-sub-keywords')) $('rr-sub-keywords').textContent = Math.round(sb.keyword_match_score || overallScore) + '%';
    if ($('rr-sub-structure')) $('rr-sub-structure').textContent = Math.round(sb.structure_score || overallScore) + '%';
    if ($('rr-sub-experience')) $('rr-sub-experience').textContent = Math.round(sb.experience_relevance_score || overallScore) + '%';
    if ($('rr-sub-metrics')) $('rr-sub-metrics').textContent = Math.round(sb.metrics_density_score || overallScore) + '%';

    // Sub-score Issues list
    const issuesWrap = $('rr-score-issues-wrap');
    if (issuesWrap) {
      issuesWrap.innerHTML = '';
      const issues = Array.isArray(sb.issues) ? sb.issues : [];
      issues.forEach(is => {
        const row = document.createElement('div');
        row.className = 'ats-req-item';
        row.style.marginBottom = '4px';
        row.innerHTML = `<div class="ats-req-head"><span class="ats-req-title"><b>${esc(is.area || 'Критерий')}:</b> ${esc(is.issue)}</span></div><div class="meta" style="margin-top:2px;">Влияние: ${esc(is.impact)}</div>`;
        issuesWrap.appendChild(row);
      });
    }

    // Value Prop
    if ($('rr-val-prop')) $('rr-val-prop').textContent = parsed.value_proposition || parsed.reasoning || '';

    // Experience breakdown rewrites
    const expWrap = $('rr-experience-breakdown');
    if (expWrap) {
      expWrap.innerHTML = '';
      const expList = Array.isArray(parsed.experience_breakdown) ? parsed.experience_breakdown : [];
      if (!expList.length && Array.isArray(parsed.action_items)) {
        parsed.action_items.forEach(act => {
          const card = document.createElement('div');
          card.className = 'ats-edit-card';
          card.innerHTML = `<div class="ats-edit-text">${esc(act)}</div>`;
          expWrap.appendChild(card);
        });
      } else {
        expList.forEach(exp => {
          const card = document.createElement('div');
          card.className = 'ats-edit-card';
          card.innerHTML = `
            <div class="ats-edit-section">${esc(exp.company || 'Компания / Опыт')}</div>
            <div class="ats-edit-gap" style="color:var(--red);">Проблема: ${esc(Array.isArray(exp.issues) ? exp.issues.join('; ') : exp.issues)}</div>
            <div class="ats-edit-text" style="color:var(--green-hover);"><b>Переформулировка:</b> ${esc(exp.suggested_rewrite)}</div>
          `;
          expWrap.appendChild(card);
        });
      }
    }

    // hh.ru ranking factors
    const hhBox = $('rr-hh-ranking');
    if (hhBox) {
      const hh = parsed.hh_ranking_factors || {};
      hhBox.innerHTML = `
        <div style="font-size:12.5px; line-height:1.5;">
          <div><b>Обновление:</b> ${esc(hh.last_update || 'не зафиксировано')}</div>
          <div><b>Статус поиска:</b> ${esc(hh.search_status || 'не зафиксировано')}</div>
          <div><b>Плотность превью:</b> ${esc(hh.card_preview_density || 'средняя')}</div>
          ${hh.notes ? `<div class="meta" style="margin-top:4px;">${esc(hh.notes)}</div>` : ''}
        </div>
      `;
    }

    // Target roles (Top 20 roles: 8 core / 7 transferable / 5 growth)
    const rolesWrap = $('rr-target-roles');
    if (rolesWrap) {
      rolesWrap.innerHTML = '';
      const roles = parsed.target_roles || {};
      const categories = [
        { key: 'core', title: 'Core (Прямое попадание — 8)', color: 'chip-good' },
        { key: 'transferable', title: 'Transferable (Смежные навыки — 7)', color: 'chip-mid' },
        { key: 'growth', title: 'Growth (Рост / Смена вектора — 5)', color: 'chip-neutral' }
      ];
      categories.forEach(cat => {
        const list = Array.isArray(roles[cat.key]) ? roles[cat.key] : [];
        if (!list.length) return;
        const groupHead = document.createElement('div');
        groupHead.style.cssText = 'font-weight:700; font-size:13px; margin:8px 0 4px; color:var(--ink);';
        groupHead.textContent = cat.title;
        rolesWrap.appendChild(groupHead);

        list.forEach(r => {
          const row = document.createElement('div');
          row.className = 'ats-req-item';
          row.style.marginBottom = '4px';
          row.innerHTML = `
            <div class="ats-req-head">
              <span class="ats-req-title"><b>${esc(r.title_ru)}</b> / ${esc(r.title_en)}</span>
              <span class="chip chip-mini ${cat.color}">${Math.round(Number(r.match_percent) || 0)}%</span>
            </div>
            <div class="meta" style="margin-top:2px;">${esc(r.reasoning)}</div>
          `;
          rolesWrap.appendChild(row);
        });
      });
    }

    // Keyword Matrix by Clusters
    const kwWrap = $('rr-keyword-matrix');
    if (kwWrap) {
      kwWrap.innerHTML = '';
      const matrix = parsed.keyword_matrix || {};
      ['core', 'transferable', 'growth'].forEach(clusterKey => {
        const cluster = matrix[clusterKey];
        if (!cluster) return;
        const block = document.createElement('div');
        block.className = 'card';
        block.style.cssText = 'background:var(--paper); padding:10px; margin-bottom:8px;';
        const clusterTitle = clusterKey === 'core' ? 'Кластер: Core' : (clusterKey === 'transferable' ? 'Кластер: Transferable' : 'Кластер: Growth');
        block.innerHTML = `
          <div style="font-weight:700; font-size:13px; margin-bottom:6px; color:var(--ink);">${esc(clusterTitle)}</div>
          <div style="margin-bottom:4px;"><b>Hard Skills &amp; Tools:</b> <span class="meta">${esc((cluster.hard_skills_tools || []).join(', '))}</span></div>
          <div style="margin-bottom:4px;"><b>Домен &amp; Методологии:</b> <span class="meta">${esc((cluster.domain_methodology || []).join(', '))}</span></div>
          <div><b>Активные глаголы:</b> <span class="meta">${esc((cluster.action_verbs || []).join(', '))}</span></div>
        `;
        kwWrap.appendChild(block);
      });
    }

    // Optimization Checklist (5 items)
    const checkWrap = $('rr-checklist');
    if (checkWrap) {
      checkWrap.innerHTML = '';
      const checklist = Array.isArray(parsed.optimization_checklist) ? parsed.optimization_checklist : [];
      checklist.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'ats-req-item';
        card.style.marginBottom = '4px';
        card.innerHTML = `
          <div class="ats-req-head">
            <span class="ats-req-title"><b>Шаг ${idx + 1}:</b> ${esc(item.action)}</span>
            <span class="chip chip-mini chip-mid">${esc(item.target_section || 'Раздел')}</span>
          </div>
          <div class="meta" style="margin-top:2px;"><b>Зачем:</b> ${esc(item.why)}</div>
        `;
        checkWrap.appendChild(card);
      });
    }

    $('resume-review-result').hidden = false;
  }

  // ---------- извлечение вакансии со страницы ----------

  function pickExtractorFile(url) {
    if (/^https:\/\/[^/]*hh\.ru\/vacancy\//.test(url)) return 'content-scripts/extractor-hh.js';
    if (/^https:\/\/[^/]*linkedin\.com\/jobs\//.test(url)) return 'content-scripts/extractor-linkedin.js';
    if (/^https:\/\/[^/]*upwork\.com\/jobs\//.test(url)) return 'content-scripts/extractor-upwork.js';
    return null;
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function extractFromActiveTab() {
    const tab = await getActiveTab();
    if (!tab || !tab.url) return;
    const file = pickExtractorFile(tab.url);
    if (!file) return; // не страница вакансии — остаётся ручная вставка

    let data = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        data = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_VACANCY' });
        if (data && (data.description || '').trim().length > 80) break;
        await sleep(900); // SPA могла не догрузить описание — пробуем ещё раз
      } catch (e) {
        // Content script не внедрён (например, страница открыта до установки
        // расширения) — внедряем программно и повторяем запрос.
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] });
        } catch (_) { /* нет доступа к странице — выйдем на ручную вставку */ }
        await sleep(300);
      }
    }

    if (data && (data.title || data.description)) {
      currentVacancy = data;
      if ((data.description || '').trim()) vacancyTextarea.value = data.description.trim();
      renderVacancyMeta(data);
    }
  }

  function renderVacancyMeta(data) {
    const parts = [];
    if (data.title) parts.push(data.title);
    if (data.company) parts.push(data.company);
    const src = sourceLabel(data.source);
    if (src) parts.push(src);
    metaEl.textContent = parts.length
      ? parts.join(' — ')
      : 'Не удалось прочитать вакансию с этой страницы, попробуй вставить текст вручную.';
  }

  $('btn-reextract').addEventListener('click', () => {
    clearError();
    extractFromActiveTab();
  });

  // ---------- fit-check ----------

  checkBtn.addEventListener('click', async () => {
    clearError();
    resultEl.hidden = true;

    const description = vacancyTextarea.value.trim();
    if (!description) {
      showError('Нет текста вакансии. Открой страницу вакансии или вставь текст вручную.');
      return;
    }

    const keyCheck = await hasApiKeyForActiveModel();
    if (!keyCheck.ok) { showNoApiKey(keyCheck.modelKey); return; }

    const profile = $('profile-text').value.trim() || DEFAULT_PROFILE;
    currentVacancy.description = description;

    checkBtn.disabled = true;
    loadingEl.style.display = 'block';
    const loadingLabel = $('loading-label');

    try {
      const resp = await sendWithRetry({
        type: 'ANALYZE_FIT',
        vacancy: currentVacancy,
        profile
      }, loadingLabel, 'Проверяю');
      if (!resp) throw new Error('empty response');
      if (!resp.ok) {
        if (resp.code === 'NO_API_KEY') { showError('Не указан API-ключ для модели «' +resp.message + '». Добавь его в настройках — без ключа запросы не отправляются.'); openSettingsBtn.hidden = false; return; }
        if (resp.code === 'PARSE_ERROR') { showError('Модель несколько раз подряд вернула повреждённый ответ. Попробуй ещё раз или переключи модель в настройках.'); openSettingsBtn.hidden = false; return; }
        if (resp.code === 'RATE_LIMIT') { showError('Провайдер перегружен для этой модели даже после повторов. Попробуй позже или переключи модель в настройках.'); openSettingsBtn.hidden = false; return; }
        showError('Ошибка API: ' + (resp.message || 'неизвестная'));
        return;
      }
      const score = computeScore(resp.result);
      const id = renderResult(resp.result, score);
      await saveToHistory({
        id,
        title: resp.result.title || currentVacancy.title || 'Вакансия',
        source: currentVacancy.source || '',
        url: currentVacancy.url || '',
        verdict: resp.result.verdict,
        score,
        date: new Date().toISOString(),
        vacancy: { ...currentVacancy, description },
        vacancyText: description,
        result: resp.result
      });
    } catch (e) {
      showError('Не получилось проанализировать. Проверь подключение и попробуй ещё раз.');
      console.error(e);
    } finally {
      checkBtn.disabled = false;
      loadingEl.style.display = 'none';
    }
  });

  const SVG_ICONS = {
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    alertTriangle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    alertCircle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
  };

  const VERDICT_ICONS = {
    good: SVG_ICONS.check,
    mid: SVG_ICONS.alertTriangle,
    bad: SVG_ICONS.x
  };

  function renderResult(parsed, score, existingId) {
    const verdict = VERDICTS.includes(parsed.verdict) ? parsed.verdict : 'С ОГОВОРКАМИ';
    const kind = verdictKind(verdict);

    const id = existingId || makeCheckId();
    $('check-id').textContent = '#' + id;
    $('result-id').textContent = '#' + id;

    const chip = $('verdict-chip');
    if (chip) chip.textContent = verdict;

    const banner = $('verdict-banner');
    if (banner) banner.className = 'verdict-banner verdict-' + kind;

    const iconEl = $('verdict-icon');
    if (iconEl) iconEl.innerHTML = VERDICT_ICONS[kind] || '•';

    const barFill = $('verdict-bar-fill');
    if (barFill) {
      barFill.className = 'verdict-bar-fill verdict-' + kind;
      barFill.style.width = Math.max(5, Math.min(100, score)) + '%';
    }

    setGauge('tile-score', 'tile-score-arc', score, kind);

    const effort = Math.round(Number(parsed.effort_minutes));
    $('tile-effort').textContent = effort >= 1 && effort <= 90 ? '~' + effort + ' мин' : '—';

    const booster = parsed.booster && Number(parsed.booster.delta) > 0 ? parsed.booster : null;
    $('tile-boost').textContent = booster ? '+' + Math.round(Number(booster.delta)) : '—';
    if (booster && booster.text) {
      $('booster-delta').textContent = '+' + Math.round(Number(booster.delta));
      $('booster-text').textContent = booster.text;
      $('booster').hidden = false;
    } else {
      $('booster').hidden = true;
    }

    renderLedger(parsed.ledger, score);

    $('reasoning').textContent = parsed.reasoning || '';
    fillList($('selling'), parsed.selling_points);
    fillList($('flags'), parsed.flags);

    $('letter-block').hidden = true;
    resultEl.hidden = false;
    return id;
  }

  function renderLedger(ledger, total) {
    renderLedgerInto($('ledger'), ledger, total, 'индекс');
  }

  function renderLedgerInto(wrap, ledger, total, totalLabel) {
    wrap.textContent = '';

    addLedgerRow(wrap, 'базовый уровень', BASE_SCORE, 'base');

    const items = (Array.isArray(ledger) ? ledger : [])
      .map(item => ({ text: item && item.text, delta: Math.round(Number(item && item.delta) || 0) }))
      .filter(it => it.text && it.delta !== 0);
    // Масштаб баров — по фактическому максимуму этого разбора, а не по
    // потолку ±30 из промпта: иначе типичные дельты (±5..±20) рисуют
    // бледные короткие огрызки бара вместо читаемой диаграммы.
    const maxAbs = items.reduce((m, it) => Math.max(m, Math.abs(it.delta)), 1);
    for (const it of items) {
      addLedgerRow(wrap, it.text, it.delta, it.delta > 0 ? 'pos' : 'neg', maxAbs);
    }

    addLedgerRow(wrap, totalLabel, total, 'total');
  }

  function addLedgerRow(wrap, text, value, cls, maxAbs) {
    const row = document.createElement('div');
    row.className = 'ledger-row' + (cls === 'base' ? ' base' : '') + (cls === 'total' ? ' total' : '');

    const top = document.createElement('div');
    top.className = 'ledger-top';

    const textEl = document.createElement('span');
    textEl.className = 'ledger-text';
    textEl.textContent = text;
    top.appendChild(textEl);

    const isDelta = cls === 'pos' || cls === 'neg';
    // Для base/total число остаётся в шапке строки (там нет бара, показывать негде).
    // Для pos/neg число уходит внутрь заливки бара — не дублируем его дважды.
    if (!isDelta) {
      const deltaEl = document.createElement('span');
      deltaEl.className = 'ledger-delta';
      deltaEl.textContent = String(value);
      top.appendChild(deltaEl);
    }
    row.appendChild(top);

    // Сплошной бар слева направо, длина — доля от самого большого |delta|
    // в этом разборе (минимум 22%, чтобы мелкие факторы не терялись совсем).
    if (isDelta) {
      const track = document.createElement('div');
      track.className = 'ledger-bar-track';
      const fill = document.createElement('div');
      fill.className = 'ledger-bar-fill ' + cls;
      const pct = Math.max(22, Math.abs(value) / maxAbs * 100);
      fill.style.width = pct + '%';
      fill.textContent = (cls === 'pos' ? '+' : '') + value;
      track.appendChild(fill);
      row.appendChild(track);
    }

    wrap.appendChild(row);
  }

  function fillList(ul, items) {
    ul.textContent = '';
    const list = Array.isArray(items) && items.length ? items : ['—'];
    for (const item of list) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    }
  }

  // ---------- сопроводительное письмо ----------

  $('btn-letter').addEventListener('click', async () => {
    clearError();
    const keyCheck = await hasApiKeyForActiveModel();
    if (!keyCheck.ok) { showNoApiKey(keyCheck.modelKey); return; }

    const { letterLang } = await chrome.storage.local.get('letterLang');

    let lang = letterLang || 'auto';
    if (lang === 'auto') {
      // Автоопределение по площадке: hh.ru — русский, LinkedIn/Upwork — английский.
      lang = currentVacancy.source === 'hh.ru' ? 'ru' : (currentVacancy.source ? 'en' : 'ru');
    }

    const profile = $('profile-text').value.trim() || DEFAULT_PROFILE;
    const sellingPoints = Array.from(document.querySelectorAll('#selling li'))
      .map(li => li.textContent).filter(t => t !== '—');
    const flags = Array.from(document.querySelectorAll('#flags li'))
      .map(li => li.textContent).filter(t => t !== '—');
    const tone = $('letter-tone') ? $('letter-tone').value : 'neutral';

    $('letter-block').hidden = true;
    $('letter-loading').style.display = 'block';
    $('btn-letter').disabled = true;
    const letterLoadingLabel = $('letter-loading-label');

    try {
      const resp = await sendWithRetry({
        type: 'WRITE_LETTER',
        vacancy: currentVacancy,
        profile,
        sellingPoints,
        lang,
        tone,
        flags
      }, letterLoadingLabel, 'Пишу письмо');
      if (!resp) throw new Error('empty response');
      if (!resp.ok) {
        if (resp.code === 'NO_API_KEY') { showError('Не указан API-ключ для модели «' +resp.message + '». Добавь его в настройках — без ключа запросы не отправляются.'); openSettingsBtn.hidden = false; return; }
        if (resp.code === 'RATE_LIMIT') { showError('Провайдер перегружен для этой модели даже после повторов. Попробуй позже или переключи модель в настройках.'); openSettingsBtn.hidden = false; return; }
        showError('Не получилось написать письмо: ' + (resp.message || 'ошибка сети'));
        return;
      }
      $('letter-text').value = resp.result;
      $('letter-block').hidden = false;
      const { lettersCount } = await chrome.storage.local.get('lettersCount');
      await chrome.storage.local.set({ lettersCount: (lettersCount || 0) + 1 });
    } catch (e) {
      showError('Не получилось написать письмо. Проверь подключение и попробуй ещё раз.');
      console.error(e);
    } finally {
      $('letter-loading').style.display = 'none';
      $('btn-letter').disabled = false;
    }
  });

  $('btn-copy').addEventListener('click', async () => {
    const text = $('letter-text').value;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = $('letter-text');
      ta.select();
      document.execCommand('copy');
    }
    flashButton($('btn-copy'), 'Скопировано ✓');
  });

  // ---------- журнал ----------

  async function loadHistory() {
    const { history } = await chrome.storage.local.get('history');
    renderHistory(Array.isArray(history) ? history : []);
  }

  async function saveToHistory(entry) {
    try {
      const { history } = await chrome.storage.local.get('history');
      const items = Array.isArray(history) ? history : [];
      items.unshift(entry);
      await chrome.storage.local.set({ history: items.slice(0, HISTORY_LIMIT) });
      renderHistory(items);
    } catch (e) {
      console.error('history save failed', e);
    }
  }

  function renderHistory(items) {
    historyEl.textContent = '';
    historyCount = items.length;
    $('history-count').textContent = items.length ? items.length + ' шт' : '';
    renderAnalytics(items);
    populateAtsHistorySelect(items);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Пока пусто — первая проверка появится здесь';
      historyEl.appendChild(empty);
      return;
    }
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'history-row';

      let titleEl;
      if (it.url) {
        titleEl = document.createElement('a');
        titleEl.href = it.url;
        titleEl.target = '_blank';
        titleEl.rel = 'noopener';
        titleEl.className = 'history-title';
      } else {
        titleEl = document.createElement('span');
        titleEl.className = 'history-title';
      }
      const src = sourceLabel(it.source);
      titleEl.textContent = (src ? src + ' · ' : '') + (it.title || 'Вакансия');
      titleEl.title = it.title || '';

      const appliedBtn = document.createElement('button');
      appliedBtn.type = 'button';
      appliedBtn.className = 'history-applied-toggle' + (it.applied ? ' applied' : '');
      appliedBtn.title = it.applied ? 'Откликнулся — нажми, чтобы снять отметку' : 'Отметить, что откликнулся';
      appliedBtn.textContent = it.applied ? '✓' : '○';
      appliedBtn.addEventListener('click', () => toggleApplied(it));

      const side = document.createElement('span');
      side.className = 'history-side';

      const hasDetail = !!it.result;
      const chip = document.createElement(hasDetail ? 'button' : 'span');
      chip.className = 'chip chip-mini chip-' + verdictKind(it.verdict);
      chip.textContent = it.verdict || '—';
      if (hasDetail) {
        chip.type = 'button';
        chip.title = 'Открыть полный разбор';
        chip.addEventListener('click', () => openHistoryEntry(it));
      }

      const score = document.createElement('span');
      score.className = 'history-score';
      score.textContent = it.score ?? '—';

      side.appendChild(appliedBtn);
      side.appendChild(chip);
      side.appendChild(score);
      row.appendChild(titleEl);
      row.appendChild(side);
      historyEl.appendChild(row);
    }
  }

  // Открывает полный разбор прошлой проверки во вкладке «Проверка» — работает
  // только для записей, сохранённых после введения result/vacancy в историю.
  function openHistoryEntry(entry) {
    if (!entry.result) return;
    if (entry.vacancy) {
      currentVacancy = entry.vacancy;
      vacancyTextarea.value = entry.vacancy.description || '';
      renderVacancyMeta(entry.vacancy);
    }
    clearError();
    renderResult(entry.result, entry.score, entry.id);
    activateTab('check');
  }

  // Строки истории не хранят id — дата проверки (миллисекунды) достаточно
  // уникальна, чтобы найти ту же запись в хранилище и переключить отметку.
  async function toggleApplied(entry) {
    const { history } = await chrome.storage.local.get('history');
    const items = Array.isArray(history) ? history : [];
    const idx = items.findIndex(i => i.date === entry.date && i.title === entry.title && i.url === entry.url);
    if (idx === -1) return;
    items[idx].applied = !items[idx].applied;
    await chrome.storage.local.set({ history: items });
    renderHistory(items);
  }

  async function renderAnalytics(items) {
    const total = items.length;
    const now = Date.now();
    const ms7d = 7 * 86400 * 1000;
    const ms30d = 30 * 86400 * 1000;

    const count7d = items.filter(i => (now - new Date(i.date || 0).getTime()) <= ms7d).length;
    const count30d = items.filter(i => (now - new Date(i.date || 0).getTime()) <= ms30d).length;

    const applied = items.filter(i => i.applied).length;
    const avg = total ? Math.round(items.reduce((s, i) => s + (Number(i.score) || 0), 0) / total) : 0;

    const { lettersCount } = await chrome.storage.local.get('lettersCount');

    if ($('an-total-all')) $('an-total-all').textContent = total || '—';
    if ($('an-total-recent')) $('an-total-recent').textContent = total ? `${count7d} / ${count30d}` : '—';
    if ($('an-applied')) $('an-applied').textContent = total ? applied + ' (' + Math.round(applied / total * 100) + '%)' : '—';
    if ($('an-avg')) $('an-avg').textContent = total ? avg : '—';
    if ($('an-letters')) $('an-letters').textContent = lettersCount || 0;

    renderBestResult(items);

    const verdictCounts = {};
    items.forEach(i => { const v = i.verdict || '—'; verdictCounts[v] = (verdictCounts[v] || 0) + 1; });
    renderVerdictDonut(verdictCounts, total);

    const sourceCounts = {};
    items.forEach(i => { const s = i.source || 'другое'; sourceCounts[s] = (sourceCounts[s] || 0) + 1; });
    const sWrap = $('an-sources');
    if (sWrap) {
      sWrap.textContent = '';
      Object.entries(sourceCounts).forEach(([s, c]) => {
        const chip = document.createElement('span');
        chip.className = 'chip chip-mini chip-source';
        chip.textContent = (sourceLabel(s) || s) + ': ' + c;
        sWrap.appendChild(chip);
      });
    }

    renderWeeklyActivity(items);
    renderHistogram(items);
    renderSparkline(items);
  }

  function renderWeeklyActivity(items) {
    const wrap = $('an-weekly-chart');
    if (!wrap) return;
    wrap.textContent = '';
    if (!items.length) return;

    const now = Date.now();
    const msInWeek = 7 * 86400 * 1000;
    const weeks = [0, 0, 0, 0];

    items.forEach(i => {
      const diff = now - new Date(i.date || 0).getTime();
      const wIdx = Math.floor(diff / msInWeek);
      if (wIdx >= 0 && wIdx < 4) {
        weeks[3 - wIdx]++;
      }
    });

    const maxW = Math.max(...weeks, 1);
    const labels = ['3-4 нед назад', '2-3 нед назад', 'прошлая нед', 'эта неделя'];

    labels.forEach((lbl, idx) => {
      const row = document.createElement('div');
      row.className = 'hist-row';

      const label = document.createElement('span');
      label.className = 'hist-label';
      label.style.width = '90px';
      label.textContent = lbl;

      const track = document.createElement('div');
      track.className = 'hist-track';
      const fill = document.createElement('div');
      fill.className = 'hist-fill';
      fill.style.width = (weeks[idx] ? Math.max(14, weeks[idx] / maxW * 100) : 0) + '%';
      fill.textContent = weeks[idx] || '';
      track.appendChild(fill);

      row.appendChild(label);
      row.appendChild(track);
      wrap.appendChild(row);
    });
  }

  // Самый высокий индекс за всё время — кликабелен (открывает полный разбор),
  // если для этой записи сохранён result (старые записи без него — просто инфо).
  function renderBestResult(items) {
    const el = $('an-best');
    if (!el) return;
    if (!items.length) {
      el.hidden = true;
      el.replaceChildren();
      el.onclick = null;
      el.onkeydown = null;
      return;
    }
    const best = items.reduce((a, b) => (Number(b.score) || 0) > (Number(a.score) || 0) ? b : a);
    el.hidden = false;
    el.replaceChildren();

    const text = document.createElement('div');
    text.className = 'an-best-text';
    const label = document.createElement('div');
    label.className = 'an-best-label';
    label.textContent = 'лучший результат';
    const title = document.createElement('div');
    title.className = 'an-best-title';
    title.textContent = (sourceLabel(best.source) ? sourceLabel(best.source) + ' · ' : '') + (best.title || 'Вакансия');
    text.appendChild(label);
    text.appendChild(title);

    const score = document.createElement('div');
    score.className = 'an-best-score';
    score.textContent = best.score ?? '—';

    el.appendChild(text);
    el.appendChild(score);

    if (best.result) {
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.title = 'Открыть полный разбор';
      el.onclick = () => openHistoryEntry(best);
      el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHistoryEntry(best); } };
    } else {
      el.removeAttribute('role');
      el.removeAttribute('tabindex');
      el.title = '';
      el.onclick = null;
      el.onkeydown = null;
    }
  }

  // Гистограмма по диапазонам индекса — в отличие от текста ledger-факторов
  // (уникален для каждой вакансии), score есть у всех записей, включая старые.
  const HISTOGRAM_BUCKETS = [
    { label: '0–20', min: 0, max: 20 },
    { label: '21–40', min: 21, max: 40 },
    { label: '41–60', min: 41, max: 60 },
    { label: '61–80', min: 61, max: 80 },
    { label: '81–100', min: 81, max: 100 }
  ];
  function renderHistogram(items) {
    const wrap = $('an-histogram');
    wrap.textContent = '';
    if (!items.length) return;

    const counts = HISTOGRAM_BUCKETS.map(b => items.filter(i => {
      const s = Number(i.score) || 0;
      return s >= b.min && s <= b.max;
    }).length);
    const maxCount = Math.max(...counts, 1);

    HISTOGRAM_BUCKETS.forEach((b, idx) => {
      const row = document.createElement('div');
      row.className = 'hist-row';

      const label = document.createElement('span');
      label.className = 'hist-label';
      label.textContent = b.label;

      const track = document.createElement('div');
      track.className = 'hist-track';
      const fill = document.createElement('div');
      fill.className = 'hist-fill';
      fill.style.width = (counts[idx] ? Math.max(14, counts[idx] / maxCount * 100) : 0) + '%';
      fill.textContent = counts[idx] || '';
      track.appendChild(fill);

      row.appendChild(label);
      row.appendChild(track);
      wrap.appendChild(row);
    });
  }

  // Донат вердиктов без внешних библиотек: круг с трекером + один <circle>
  // на вердикт, длина/сдвиг штриха в процентах (окружность r=15.915 ≈ 100).
  const DONUT_KIND_COLOR = { good: 'var(--green)', mid: 'var(--amber)', bad: 'var(--red)', neutral: 'var(--muted)' };
  function renderVerdictDonut(verdictCounts, total) {
    const svg = $('an-donut');
    const legend = $('an-donut-legend');
    const totalEl = $('an-donut-total');
    if (svg) svg.innerHTML = '';
    if (legend) legend.innerHTML = '';
    if (totalEl) totalEl.innerHTML = '';
    if (!total || !svg) return; // пустая история — донат остаётся пустым, без визуального мусора

    if (totalEl) {
      const numEl = document.createElement('div');
      numEl.className = 'num';
      numEl.textContent = String(total);
      const lblEl = document.createElement('div');
      lblEl.className = 'lbl';
      lblEl.textContent = 'всего';
      totalEl.appendChild(numEl);
      totalEl.appendChild(lblEl);
    }

    const ns = 'http://www.w3.org/2000/svg';
    const track = document.createElementNS(ns, 'circle');
    track.setAttribute('cx', '21'); track.setAttribute('cy', '21'); track.setAttribute('r', '15.915');
    track.setAttribute('fill', 'none'); track.setAttribute('stroke-width', '7.5');
    track.style.stroke = 'var(--line)';
    svg.appendChild(track);

    let cumulative = 0;
    for (const [verdict, count] of Object.entries(verdictCounts)) {
      const pct = count / total * 100;
      const color = DONUT_KIND_COLOR[verdictKind(verdict)];

      const seg = document.createElementNS(ns, 'circle');
      seg.setAttribute('cx', '21'); seg.setAttribute('cy', '21'); seg.setAttribute('r', '15.915');
      seg.setAttribute('fill', 'none'); seg.setAttribute('stroke-width', '7.5');
      seg.setAttribute('stroke-dasharray', pct + ' ' + (100 - pct));
      seg.setAttribute('stroke-dashoffset', String(100 - cumulative));
      seg.setAttribute('transform', 'rotate(-90 21 21)');
      seg.style.stroke = color;
      svg.appendChild(seg);
      cumulative += pct;

      const row = document.createElement('div');
      row.className = 'donut-legend-row';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = color;
      row.appendChild(dot);
      row.appendChild(document.createTextNode(verdict + ' · ' + count));
      legend.appendChild(row);
    }
  }

  // Мини-график тренда индекса без внешних библиотек: полилиния по последним
  // проверкам (история хранится от новых к старым — переворачиваем для оси времени).
  function renderSparkline(items) {
    const svg = $('an-sparkline');
    svg.innerHTML = '';
    const scores = items.slice(0, 20).map(i => Number(i.score) || 0).reverse();
    if (scores.length < 2) return;

    const w = 300, h = 80, pad = 6;
    const stepX = (w - pad * 2) / (scores.length - 1);
    const toY = s => h - pad - (Math.max(0, Math.min(100, s)) / 100) * (h - pad * 2);
    const ns = 'http://www.w3.org/2000/svg';

    const baseline = document.createElementNS(ns, 'line');
    baseline.setAttribute('x1', pad); baseline.setAttribute('x2', w - pad);
    baseline.setAttribute('y1', toY(BASE_SCORE)); baseline.setAttribute('y2', toY(BASE_SCORE));
    baseline.setAttribute('stroke-dasharray', '3,3');
    baseline.style.stroke = 'var(--muted)';
    baseline.style.strokeOpacity = '0.4';
    svg.appendChild(baseline);

    const pointCoords = scores.map((s, idx) => [pad + idx * stepX, toY(s)]);
    const points = pointCoords.map(p => p.join(',')).join(' ');

    // Заливка под линией — та же полилиния, замкнутая вниз по нижнему краю.
    const areaPath = 'M ' + points.replace(/ /g, ' L ') +
      ` L ${w - pad},${h - pad} L ${pad},${h - pad} Z`;
    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', areaPath);
    area.style.fill = 'var(--amber)';
    area.style.opacity = '0.14';
    svg.appendChild(area);

    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.style.stroke = 'var(--amber)';
    polyline.style.strokeWidth = '3';
    svg.appendChild(polyline);

    const [lastX, lastY] = pointCoords[pointCoords.length - 1];
    const last = document.createElementNS(ns, 'circle');
    last.setAttribute('cx', lastX);
    last.setAttribute('cy', lastY);
    last.setAttribute('r', 4.5);
    last.style.fill = 'var(--amber)';
    svg.appendChild(last);

    // Подпись последнего значения — прижимаем к краю, если точка близко к правой границе.
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', Math.min(lastX, w - pad - 16));
    label.setAttribute('y', Math.max(9, lastY - 6));
    label.setAttribute('font-family', 'ui-monospace, Consolas, monospace');
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', '800');
    label.style.fill = 'var(--amber-ink)';
    label.textContent = String(scores[scores.length - 1]);
    svg.appendChild(label);
  }

  // ---------- ATS-разбор и управление сохранёнными резюме ----------

  function showAtsError(text) {
    const el = $('ats-error');
    if (el) el.textContent = text;
  }

  function clearAtsError() {
    const el = $('ats-error');
    if (el) el.textContent = '';
  }

  const atsVacancyTextarea = $('ats-vacancy-text');
  let activeAtsResumeId = null;

  async function populateAtsResumeSelect() {
    const select = $('ats-resume-select');
    if (!select) return;
    const { savedResumes, activeResumeId } = await JFC.ensureSavedResumes();
    activeAtsResumeId = activeResumeId;
    select.innerHTML = '';

    savedResumes.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      select.appendChild(opt);
    });

    const newOpt = document.createElement('option');
    newOpt.value = '+new';
    newOpt.textContent = '+ Добавить новое резюме...';
    select.appendChild(newOpt);

    select.value = activeAtsResumeId;
    select._resumes = savedResumes;

    // Сравнивать нечего, пока резюме одно — не показываем кнопку вместо
    // того, чтобы показывать её и ругаться при нажатии.
    const compareBtn = $('btn-ats-compare-all');
    if (compareBtn) {
      const withText = savedResumes.filter(r => r.text && r.text.trim()).length;
      compareBtn.hidden = withText < 2;
      compareBtn.textContent = `Сравнить все резюме (${withText}) под эту вакансию`;
    }

    const currentResume = savedResumes.find(r => r.id === activeAtsResumeId) || savedResumes[0];
    if (currentResume && $('ats-inline-resume')) {
      $('ats-inline-resume').value = currentResume.text || '';
    }
  }

  if ($('ats-resume-select')) {
    $('ats-resume-select').addEventListener('change', async (e) => {
      const select = e.target;
      const resumes = select._resumes || [];
      const val = select.value;
      if (val === '+new') {
        $('ats-new-resume-box').hidden = false;
      } else {
        $('ats-new-resume-box').hidden = true;
        activeAtsResumeId = val;
        await chrome.storage.local.set({ activeResumeId: val });
        const selected = resumes.find(r => r.id === val);
        if (selected && $('ats-inline-resume')) {
          $('ats-inline-resume').value = selected.text || '';
        }
      }
    });
  }

  if ($('btn-toggle-resume-preview')) {
    $('btn-toggle-resume-preview').addEventListener('click', () => {
      const box = $('ats-resume-preview-box');
      if (box) {
        box.hidden = !box.hidden;
        $('btn-toggle-resume-preview').textContent = box.hidden
          ? 'показать/изменить текст резюме ▾'
          : 'скрыть текст резюме ▴';
      }
    });
  }

  if ($('btn-update-resume-text')) {
    $('btn-update-resume-text').addEventListener('click', async () => {
      const text = $('ats-inline-resume').value.trim();
      const { savedResumes } = await JFC.ensureSavedResumes();
      const r = savedResumes.find(x => x.id === activeAtsResumeId);
      if (r) {
        r.text = text;
        r.updatedAt = Date.now();
        await chrome.storage.local.set({ savedResumes });
        populateAtsResumeSelect();
        showAtsError('');
        const btn = $('btn-update-resume-text');
        const oldText = btn.textContent;
        btn.textContent = 'Сохранено ✓';
        setTimeout(() => { btn.textContent = oldText; }, 1400);
      }
    });
  }

  if ($('btn-save-inline-resume')) {
    $('btn-save-inline-resume').addEventListener('click', async () => {
      const nameInput = $('ats-new-resume-name');
      const textInput = $('ats-new-resume-text');
      const name = (nameInput && nameInput.value.trim()) || 'Новое резюме';
      const text = (textInput && textInput.value.trim()) || '';
      if (!text) {
        showAtsError('Пожалуйста, введи текст резюме.');
        return;
      }
      const { savedResumes } = await JFC.ensureSavedResumes();
      const newResume = { id: JFC.genId(), name, text, updatedAt: Date.now() };
      savedResumes.push(newResume);
      await chrome.storage.local.set({ savedResumes, activeResumeId: newResume.id });
      $('ats-new-resume-box').hidden = true;
      if (nameInput) nameInput.value = '';
      if (textInput) textInput.value = '';
      await populateAtsResumeSelect();
    });
  }

  function populateAtsHistorySelect(items) {
    const select = $('ats-history-select');
    const wrap = $('ats-history-select-wrap');
    const emptyNotice = $('ats-empty-history-notice');
    const manualContainer = $('ats-manual-container');
    const toggleBtn = $('btn-ats-toggle-manual');
    if (!select || !wrap) return;

    select.innerHTML = '';
    const validItems = (Array.isArray(items) ? items : [])
      .filter(i => {
        const desc = i.vacancyText || (i.vacancy && i.vacancy.description);
        return desc && desc.trim().length > 0;
      })
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    if (!validItems.length) {
      wrap.hidden = true;
      if (emptyNotice) emptyNotice.hidden = false;
      if (manualContainer) manualContainer.hidden = false;
      if (toggleBtn) toggleBtn.hidden = true;
      return;
    }

    wrap.hidden = false;
    if (emptyNotice) emptyNotice.hidden = true;
    if (toggleBtn) toggleBtn.hidden = false;

    validItems.forEach((item, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      const d = item.date ? new Date(item.date) : null;
      const dateStr = d ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}` : '';

      let symbol = '✓ ';
      if (item.verdict === 'С ОГОВОРКАМИ') symbol = '! ';
      if (item.verdict === 'ПРОПУСТИТЬ') symbol = '✕ ';

      opt.textContent = `${symbol}${item.title || 'Вакансия'} (${dateStr})`;
      select.appendChild(opt);
    });

    select._items = validItems;

    if (validItems[0]) {
      const desc = validItems[0].vacancyText || (validItems[0].vacancy && validItems[0].vacancy.description) || '';
      if (atsVacancyTextarea) atsVacancyTextarea.value = desc;
      if (validItems[0].vacancy) currentVacancy = { ...validItems[0].vacancy, description: desc };
    }
  }

  if ($('ats-history-select')) {
    $('ats-history-select').addEventListener('change', (e) => {
      const select = e.target;
      const items = select._items || [];
      const selected = items[Number(select.value)];
      if (selected) {
        const desc = selected.vacancyText || (selected.vacancy && selected.vacancy.description) || '';
        if (atsVacancyTextarea) atsVacancyTextarea.value = desc;
        if (selected.vacancy) currentVacancy = { ...selected.vacancy, description: desc };
      }
    });
  }

  if ($('btn-ats-toggle-manual')) {
    $('btn-ats-toggle-manual').addEventListener('click', () => {
      const container = $('ats-manual-container');
      if (container) {
        container.hidden = !container.hidden;
        $('btn-ats-toggle-manual').textContent = container.hidden
          ? 'или вставить текст вакансии вручную ▾'
          : 'скрыть ручной ввод ▴';
      }
    });
  }

  $('btn-ats-reextract').addEventListener('click', async () => {
    clearAtsError();
    await extractFromActiveTab();
    if (currentVacancy.description && atsVacancyTextarea) {
      atsVacancyTextarea.value = currentVacancy.description;
    }
  });

  $('btn-ats-check').addEventListener('click', async () => {
    clearAtsError();
    $('ats-result').hidden = true;

    const description = (atsVacancyTextarea && atsVacancyTextarea.value.trim()) || vacancyTextarea.value.trim();
    if (!description) {
      showAtsError('Нет текста вакансии. Открой страницу вакансии или вставь текст вручную.');
      return;
    }

    const keyCheck = await hasApiKeyForActiveModel();
    if (!keyCheck.ok) { showNoApiKey(keyCheck.modelKey); return; }

    const fullResume = $('ats-inline-resume') ? $('ats-inline-resume').value.trim() : '';
    if (!fullResume) {
      showAtsError('Пожалуйста, выбери или внеси текст резюме выше.');
      return;
    }

    const { savedResumes } = await JFC.ensureSavedResumes();
    const currentResumeObj = savedResumes.find(r => r.id === activeAtsResumeId) || savedResumes[0];

    runAtsMatch(description, fullResume, currentResumeObj);
  });

  // ---------- сравнение версий резюме под одну вакансию ----------
  //
  // Мульти-резюме существует ровно затем, чтобы держать разные варианты
  // позиционирования. Но до сих пор выбор между ними был вслепую: прогнать
  // разбор можно было только по одному. Здесь мы прогоняем вакансию через
  // каждое сохранённое резюме и показываем, какое из них реально закрывает
  // больше обязательных требований.
  //
  // Запросы идут последовательно, а не параллельно: провайдеры (особенно
  // бесплатный тариф NVIDIA NIM) отвечают 429 на веер одновременных вызовов,
  // и sendWithRetry уже умеет ждать — параллель только сломала бы его планы
  // повторов.
  // Отбрасывает непосчитанные резюме и ранжирует остальные по покрытию
  // ОБЯЗАТЕЛЬНЫХ требований, а не по общему баллу: именно обязательные
  // решают, пройдёт ли резюме формальный фильтр. Резюме с общим баллом 80
  // и дырой в обязательном требовании хуже, чем резюме с баллом 70 без дыр.
  // Общий балл — только тай-брейк.
  function rankResumeMatches(scored) {
    return scored
      .filter(s => s && !s.failed)
      .slice()
      .sort((a, b) => (b.hard - a.hard) || (b.overall - a.overall));
  }

  async function runResumeComparison(description) {
    const compareBtn = $('btn-ats-compare-all');
    const { savedResumes } = await JFC.ensureSavedResumes();
    const candidates = savedResumes.filter(r => r.text && r.text.trim());

    if (candidates.length < 2) {
      showAtsError('Нужно минимум два сохранённых резюме. Добавь второй вариант позиционирования в настройках.');
      return;
    }

    clearAtsError();
    $('ats-result').hidden = true;
    $('ats-compare-result').hidden = true;
    compareBtn.disabled = true;
    $('btn-ats-check').disabled = true;
    $('ats-loading').style.display = 'block';
    const loadingLabel = $('ats-loading-label');

    currentVacancy.description = description;
    const scored = [];

    try {
      for (let i = 0; i < candidates.length; i++) {
        const resume = candidates[i];
        const progress = `Резюме ${i + 1} из ${candidates.length}: ${resume.name}`;
        const resp = await sendWithRetry(
          { type: 'MATCH_ATS', vacancy: currentVacancy, fullResume: resume.text },
          loadingLabel,
          progress
        );

        if (!resp || !resp.ok) {
          if (resp && resp.code === 'NO_API_KEY') {
            showError('Не указан API-ключ. Добавь его в настройках.');
            openSettingsBtn.hidden = false;
            return;
          }
          // Одно упавшее резюме не должно ронять всё сравнение — помечаем
          // его как непосчитанное и продолжаем с остальными.
          scored.push({ resume, failed: true, reason: (resp && resp.code) || 'NETWORK' });
          continue;
        }

        const r = resp.result;
        scored.push({
          resume,
          failed: false,
          hard: Math.round(Number(r.hard_requirements_coverage_percent) || 0),
          nice: Math.round(Number(r.nice_to_have_coverage_percent) || 0),
          overall: Math.round(Number(r.overall_match_score) || 0),
          gaps: Array.isArray(r.critical_gaps) ? r.critical_gaps : [],
          result: r
        });
      }

      const ok = rankResumeMatches(scored);
      if (!ok.length) {
        showAtsError('Ни одно резюме не удалось сравнить. Проверь подключение и попробуй ещё раз.');
        return;
      }
      renderResumeComparison(ok, scored.filter(s => s.failed), description);
    } catch (e) {
      showAtsError('Не получилось сравнить резюме. Проверь подключение.');
      console.error(e);
    } finally {
      compareBtn.disabled = false;
      $('btn-ats-check').disabled = false;
      $('ats-loading').style.display = 'none';
    }
  }

  function renderResumeComparison(ranked, failed, description) {
    const wrap = $('ats-compare-list');
    wrap.textContent = '';

    $('ats-compare-count').textContent = ranked.length + ' из ' + (ranked.length + failed.length);
    $('ats-compare-vacancy').textContent = currentVacancy.title
      ? 'Вакансия: ' + currentVacancy.title
      : 'Вакансия из текста длиной ' + description.length.toLocaleString('ru-RU') + ' симв.';

    const best = ranked[0];

    ranked.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'cmp-row' + (idx === 0 ? ' cmp-row--best' : '');

      const head = document.createElement('div');
      head.className = 'cmp-head';

      const name = document.createElement('span');
      name.className = 'cmp-name';
      name.textContent = entry.resume.name;
      head.appendChild(name);

      if (idx === 0) {
        const badge = document.createElement('span');
        badge.className = 'chip chip-mini chip-good';
        badge.textContent = 'отправлять это';
        head.appendChild(badge);
      } else {
        const diff = entry.hard - best.hard;
        const badge = document.createElement('span');
        badge.className = 'chip chip-mini chip-neutral';
        badge.textContent = diff === 0 ? 'столько же' : diff + ' п.п.';
        head.appendChild(badge);
      }
      row.appendChild(head);

      const bar = document.createElement('div');
      bar.className = 'cmp-bar';
      const fill = document.createElement('span');
      fill.className = 'bg-' + scoreKind(entry.hard);
      fill.style.width = Math.max(entry.hard, 2) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);

      const nums = document.createElement('div');
      nums.className = 'cmp-nums';
      nums.textContent = `обязательные ${entry.hard}% · желательные ${entry.nice}% · общий ${entry.overall}`;
      row.appendChild(nums);

      if (entry.gaps.length) {
        const gaps = document.createElement('div');
        gaps.className = 'cmp-gaps';
        gaps.textContent = 'Не закрыто: ' + entry.gaps.slice(0, 3).join('; ');
        row.appendChild(gaps);
      }

      // Кнопка открывает полный разбор именно этой версии — иначе после
      // сравнения пришлось бы прогонять её заново.
      const open = document.createElement('button');
      open.className = 'linkbtn';
      open.type = 'button';
      open.textContent = 'открыть полный разбор';
      open.addEventListener('click', () => {
        renderAtsResult(entry.result, description);
        $('ats-result').hidden = false;
        $('ats-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      row.appendChild(open);

      wrap.appendChild(row);
    });

    const note = $('ats-compare-note');
    const spread = best.hard - ranked[ranked.length - 1].hard;
    let text = ranked.length > 1 && spread === 0
      ? 'Все версии закрывают обязательные требования одинаково — разницы для этой вакансии нет.'
      : `Разброс по обязательным требованиям — ${spread} п.п. Сортировка по ним, а не по общему баллу: именно обязательные решают, пройдёте ли вы формальный фильтр.`;
    if (failed.length) {
      text += ` Не удалось посчитать: ${failed.map(f => f.resume.name).join(', ')}.`;
    }
    note.textContent = text;

    $('ats-compare-result').hidden = false;
  }

  if ($('btn-ats-compare-all')) {
    $('btn-ats-compare-all').addEventListener('click', async () => {
      const description = (atsVacancyTextarea && atsVacancyTextarea.value.trim()) || vacancyTextarea.value.trim();
      if (!description) {
        showAtsError('Нет текста вакансии. Открой страницу вакансии или вставь текст вручную.');
        return;
      }
      const keyCheck = await hasApiKeyForActiveModel();
      if (!keyCheck.ok) { showNoApiKey(keyCheck.modelKey); return; }
      runResumeComparison(description);
    });
  }

  async function runAtsMatch(description, fullResume, resumeObj) {
    $('btn-ats-check').disabled = true;
    $('ats-loading').style.display = 'block';
    const loadingLabel = $('ats-loading-label');

    try {
      currentVacancy.description = description;
      const resp = await sendWithRetry({
        type: 'MATCH_ATS',
        vacancy: currentVacancy,
        fullResume
      }, loadingLabel, 'Сравниваю резюме с вакансией');

      if (!resp) throw new Error('empty response');
      if (!resp.ok) {
        if (resp.code === 'NO_API_KEY') { showError('Не указан API-ключ для модели «' +resp.message + '». Добавь его в настройках.'); openSettingsBtn.hidden = false; return; }
        if (resp.code === 'PARSE_ERROR') { showAtsError('Модель вернула повреждённый ответ. Попробуй ещё раз.'); return; }
        if (resp.code === 'RATE_LIMIT') { showAtsError('Провайдер перегружен. Попробуй позже.'); return; }
        showAtsError('Ошибка API: ' + (resp.message || 'неизвестная'));
        return;
      }

      const id = renderAtsResult(resp.result, description);
      await saveToHistory({
        id,
        title: (currentVacancy.title || 'Вакансия') + ' (ATS)',
        source: currentVacancy.source || '',
        url: currentVacancy.url || '',
        verdict: resp.result.overall_match_score >= 75 ? 'ОТКЛИКАТЬСЯ' : (resp.result.overall_match_score >= 50 ? 'С ОГОВОРКАМИ' : 'ПРОПУСТИТЬ'),
        score: resp.result.overall_match_score || 0,
        date: new Date().toISOString(),
        vacancy: { ...currentVacancy, description },
        vacancyText: description,
        resumeId: resumeObj ? resumeObj.id : null,
        resumeName: resumeObj ? resumeObj.name : 'Резюме',
        result: resp.result,
        type: 'ats_vacancy_match'
      });
    } catch (e) {
      showAtsError('Не получилось сделать ATS-разбор. Проверь подключение.');
      console.error(e);
    } finally {
      $('btn-ats-check').disabled = false;
      $('ats-loading').style.display = 'none';
    }
  }

  function renderAtsResult(parsed, description) {
    const id = makeCheckId();
    $('ats-result-id').textContent = '#' + id;

    const hardPct = Math.round(Number(parsed.hard_requirements_coverage_percent) || 0);
    const nicePct = Math.round(Number(parsed.nice_to_have_coverage_percent) || 0);
    const overallScore = Math.round(Number(parsed.overall_match_score) || 0);

    $('ats-hard-pct').textContent = hardPct + '%';
    $('ats-nice-pct').textContent = nicePct + '%';
    $('ats-score').textContent = overallScore + '%';

    // Кольца рядом с процентами до v0.4.5 не обновлялись ни одной строкой кода —
    // менялся только текст, а дуги оставались в статичном состоянии из разметки.
    setArc($('ats-hard-arc'), hardPct, scoreKind(hardPct));
    setArc($('ats-nice-arc'), nicePct, scoreKind(nicePct));

    renderAtsReqList($('ats-hard-reqs-list'), parsed.hard_requirements);
    renderAtsReqList($('ats-nice-reqs-list'), parsed.nice_to_have);

    const gapsBox = $('ats-critical-gaps-box');
    const gapsList = $('ats-critical-gaps-list');
    const warnEl = $('ats-honest-warning');

    const hasGaps = Array.isArray(parsed.critical_gaps) && parsed.critical_gaps.length > 0;
    const hasWarn = !!parsed.honest_gap_warning;

    if (hasGaps || hasWarn) {
      gapsBox.hidden = false;
      fillList(gapsList, parsed.critical_gaps || []);
      warnEl.textContent = parsed.honest_gap_warning || '';
    } else {
      gapsBox.hidden = true;
    }

    const editsWrap = $('ats-actionable-edits');
    editsWrap.textContent = '';
    const edits = Array.isArray(parsed.actionable_edits) ? parsed.actionable_edits : [];
    if (!edits.length) {
      const empty = document.createElement('div');
      empty.className = 'meta';
      empty.textContent = 'Критичных правок не требуется — резюме покрывает заявленные факты.';
      editsWrap.appendChild(empty);
    } else {
      edits.forEach(edit => {
        const card = document.createElement('div');
        card.className = 'ats-edit-card';

        const sec = document.createElement('div');
        sec.className = 'ats-edit-section';
        sec.textContent = edit.resume_section || 'Раздел резюме';

        const gap = document.createElement('div');
        gap.className = 'ats-edit-gap';
        gap.textContent = 'Не покрыто: ' + (edit.current_gap || '');

        const text = document.createElement('div');
        text.className = 'ats-edit-text';
        text.textContent = edit.suggested_text || '';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'cta ghost';
        copyBtn.style.marginTop = '4px';
        copyBtn.style.padding = '6px 10px';
        copyBtn.style.fontSize = '12px';
        copyBtn.textContent = 'Скопировать формулировку';
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(edit.suggested_text || '');
            flashButton(copyBtn, 'Скопировано ✓');
          } catch (e) {
            flashButton(copyBtn, 'Ошибка копирования');
          }
        });

        card.appendChild(sec);
        card.appendChild(gap);
        card.appendChild(text);
        card.appendChild(copyBtn);
        editsWrap.appendChild(card);
      });
    }

    $('btn-ats-run-fitcheck').onclick = () => {
      vacancyTextarea.value = description;
      activateTab('check');
      checkBtn.click();
    };

    $('ats-result').hidden = false;
    return id;
  }

  function renderAtsReqList(wrap, reqs) {
    wrap.textContent = '';
    const list = Array.isArray(reqs) && reqs.length ? reqs : [];
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'meta';
      empty.textContent = '—';
      wrap.appendChild(empty);
      return;
    }

    list.forEach(item => {
      const row = document.createElement('div');
      row.className = 'ats-req-item';

      const head = document.createElement('div');
      head.className = 'ats-req-head';

      const title = document.createElement('span');
      title.className = 'ats-req-title';
      title.textContent = item.requirement || '';

      const chip = document.createElement('span');
      const st = item.status || 'missing';
      chip.className = 'chip chip-mini ' + (st === 'covered' ? 'chip-good' : (st === 'partially_covered' ? 'chip-mid' : 'chip-bad'));
      const icon = st === 'covered' ? SVG_ICONS.check : (st === 'partially_covered' ? SVG_ICONS.alertTriangle : SVG_ICONS.x);
      const labelText = st === 'covered' ? ' Покрыто' : (st === 'partially_covered' ? ' Частично' : ' Отсутствует');
      chip.innerHTML = icon + labelText;

      head.appendChild(title);
      head.appendChild(chip);
      row.appendChild(head);

      if (item.matched_as) {
        const matched = document.createElement('div');
        matched.className = 'ats-matched-snippet';
        matched.textContent = 'В резюме: ' + item.matched_as + (item.note ? ' (' + item.note + ')' : '');
        row.appendChild(matched);
      } else if (item.note) {
        const note = document.createElement('div');
        note.className = 'meta';
        note.style.marginTop = '4px';
        note.textContent = item.note;
        row.appendChild(note);
      }

      wrap.appendChild(row);
    });
  }

  // ---------- Сборка автономных HTML-отчётов ----------
  //
  // Отчёт открывается вне расширения (blob-вкладка, скачанный файл, печать в
  // PDF), поэтому он обязан быть полностью самодостаточным: только инлайновые
  // стили и SVG, ни одного внешнего запроса. Весь текст модели проходит через
  // esc() — здесь это уже не «на всякий случай», а обязательное требование:
  // CSP расширения на выгруженный файл не распространяется.

  const REPORT_CSS = `
    :root {
      --bg: #F2F2F7; --card: #FFFFFF; --ink: #1C1C1E; --muted: #6C6C70;
      --line: #E5E5EA; --accent: #FF9500; --blue: #4A7FD4;
      --green: #34C759; --amber: #FF9500; --red: #FF3B30;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #000000; --card: #1C1C1E; --ink: #F2F2F7; --muted: #98989F;
        --line: #38383A; --accent: #FF9F0A; --blue: #6C9BEA;
        --green: #30D158; --amber: #FF9F0A; --red: #FF453A;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 32px 20px 64px; background: var(--bg); color: var(--ink);
      font: 15px/1.55 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .wrap { max-width: 860px; margin: 0 auto; }
    header { margin-bottom: 28px; }
    h1 { font-size: 30px; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 6px; font-weight: 800; }
    .sub { color: var(--muted); font-size: 14px; }
    .card {
      background: var(--card); border: 1px solid var(--line); border-radius: 16px;
      padding: 20px; margin-bottom: 16px;
    }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;
         color: var(--muted); margin: 0 0 14px; font-weight: 700; }
    h3 { font-size: 15px; margin: 18px 0 8px; font-weight: 700; }
    .hero { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .hero .verdict { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; }
    .gauge { position: relative; width: 132px; height: 132px; flex: none; }
    .gauge svg { transform: rotate(-90deg); }
    .gauge .num {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-size: 34px; font-weight: 800; font-variant-numeric: tabular-nums;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .tile { background: var(--bg); border-radius: 12px; padding: 14px; }
    .tile .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
    .tile .v { font-size: 24px; font-weight: 800; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .bar-row { margin-bottom: 12px; }
    .bar-head { display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 5px; }
    .bar-head b { font-variant-numeric: tabular-nums; }
    .bar { height: 8px; border-radius: 999px; background: var(--line); overflow: hidden; }
    .bar span { display: block; height: 100%; border-radius: 999px; }
    .good { color: var(--green); } .mid { color: var(--amber); } .bad { color: var(--red); }
    .bg-good { background: var(--green); } .bg-mid { background: var(--amber); } .bg-bad { background: var(--red); }
    .item { border-top: 1px solid var(--line); padding: 12px 0; }
    .item:first-of-type { border-top: none; padding-top: 0; }
    .item .t { font-weight: 600; }
    .item .m { color: var(--muted); font-size: 13.5px; margin-top: 3px; }
    .rewrite { color: var(--green); font-size: 13.5px; margin-top: 5px; }
    .chip {
      display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px;
      font-weight: 600; background: var(--bg); border: 1px solid var(--line);
    }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--line); }
    th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    .empty { color: var(--muted); font-style: italic; }
    footer { margin-top: 28px; color: var(--muted); font-size: 12.5px; text-align: center; }
    footer a { color: var(--blue); }
    @media print {
      body { background: #fff; padding: 0; }
      .card { break-inside: avoid; border-color: #ddd; }
      footer { position: fixed; bottom: 0; left: 0; right: 0; }
    }
  `;

  function reportShell(title, subtitle, bodyHtml) {
    const stamp = new Date().toLocaleString('ru-RU');
    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${esc(title)}</h1>
    <div class="sub">${esc(subtitle)} · сформировано ${esc(stamp)}</div>
  </header>
  ${bodyHtml}
  <footer>
    Job Fit Copilot ${esc(APP_VERSION)} · отчёт сформирован локально в браузере,
    данные никуда не отправлялись ·
    <a href="https://github.com/zhurik77/jobfitcopilot">github.com/zhurik77/jobfitcopilot</a>
  </footer>
</div>
</body>
</html>`;
  }

  // Кольцо-индекс для отчёта: тот же расчёт, что и в панели, но выводом в
  // строку — в автономном файле нет нашего JS, поэтому дуга считается здесь.
  function reportGauge(score, kind) {
    const r = 58;
    const circumference = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(100, Number(score) || 0));
    const offset = circumference * (1 - clamped / 100);
    const stroke = kind === 'good' ? 'var(--green)' : (kind === 'mid' ? 'var(--amber)' : 'var(--red)');
    return `<div class="gauge">
      <svg viewBox="0 0 132 132" width="132" height="132">
        <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>
        <circle cx="66" cy="66" r="${r}" fill="none" stroke="${stroke}" stroke-width="10"
                stroke-linecap="round" stroke-dasharray="${circumference.toFixed(1)}"
                stroke-dashoffset="${offset.toFixed(1)}"/>
      </svg>
      <div class="num ${kind}">${Math.round(clamped)}</div>
    </div>`;
  }

  function reportBar(label, value) {
    const val = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    const kind = scoreKind(val);
    return `<div class="bar-row">
      <div class="bar-head"><span>${esc(label)}</span><b class="${kind}">${val}%</b></div>
      <div class="bar"><span class="bg-${kind}" style="width:${val}%"></span></div>
    </div>`;
  }

  function reportCard(heading, inner) {
    return `<section class="card"><h2>${esc(heading)}</h2>${inner}</section>`;
  }

  function buildAtsAuditReportHtml(parsed, resumeName) {
    const score = Math.round(Number(parsed.overall_ats_score) || 0);
    const kind = scoreKind(score);
    const sb = parsed.score_breakdown || {};

    const summary = reportCard('Итоговая ATS-оценка', `
      <div class="hero">
        ${reportGauge(score, kind)}
        <div style="flex:1; min-width:220px;">
          <div class="verdict ${kind}">${esc(
            kind === 'good' ? 'Резюме проходит ATS-фильтры'
              : (kind === 'mid' ? 'Резюме проходит с оговорками' : 'Резюме требует переработки')
          )}</div>
          <p style="color:var(--muted); margin:8px 0 0;">${esc(parsed.value_proposition || '')}</p>
        </div>
      </div>`);

    const breakdown = reportCard('Разбор по критериям', [
      reportBar('Совпадение ключевых слов (вес 35%)', sb.keyword_match_score),
      reportBar('Структура резюме (вес 20%)', sb.structure_score),
      reportBar('Релевантность опыта (вес 25%)', sb.experience_relevance_score),
      reportBar('Плотность метрик (вес 20%)', sb.metrics_density_score),
      renderReportIssues(sb.issues)
    ].join(''));

    const experience = reportListCard('Построчный разбор опыта', parsed.experience_breakdown, exp => `
      <div class="item">
        <div class="t">${esc(exp.company || 'Опыт работы')}</div>
        <div class="m">${esc(Array.isArray(exp.issues) ? exp.issues.join('; ') : exp.issues)}</div>
        <div class="rewrite">→ ${esc(exp.suggested_rewrite)}</div>
      </div>`);

    const roles = buildRolesSection(parsed.target_roles);
    const keywords = buildKeywordSection(parsed.keyword_matrix);

    const checklist = reportListCard('Чек-лист оптимизации', parsed.optimization_checklist, (item, i) => `
      <div class="item">
        <div class="t">Шаг ${i + 1}: ${esc(item.action)} <span class="chip">${esc(item.target_section || 'Раздел')}</span></div>
        <div class="m">${esc(item.why)}</div>
      </div>`);

    const hh = parsed.hh_ranking_factors || {};
    const ranking = reportCard('Факторы ранжирования hh.ru', `
      <table>
        <tr><th>Обновление резюме</th><td>${esc(hh.last_update || 'не оценено')}</td></tr>
        <tr><th>Статус поиска</th><td>${esc(hh.search_status || 'не оценено')}</td></tr>
        <tr><th>Плотность превью</th><td>${esc(hh.card_preview_density || 'не оценено')}</td></tr>
      </table>
      ${hh.notes ? `<p class="m" style="margin-bottom:0;">${esc(hh.notes)}</p>` : ''}`);

    return reportShell(
      'ATS-аудит резюме',
      'Резюме: ' + (resumeName || 'без названия'),
      summary + breakdown + experience + roles + keywords + checklist + ranking
    );
  }

  function renderReportIssues(issues) {
    const list = Array.isArray(issues) ? issues : [];
    if (!list.length) return '';
    return '<h3>Что снижает проходимость</h3>' + list.map(is => `
      <div class="item">
        <div class="t">${esc(is.area || 'Критерий')}</div>
        <div class="m">${esc(is.issue)}</div>
        <div class="m">Влияние: ${esc(is.impact)}</div>
      </div>`).join('');
  }

  // Общая обёртка для «карточка со списком, либо честная пометка, что пусто».
  function reportListCard(heading, list, itemFn) {
    const items = Array.isArray(list) ? list : [];
    if (!items.length) return reportCard(heading, '<div class="empty">Модель не вернула данные по этому разделу.</div>');
    return reportCard(heading, items.map(itemFn).join(''));
  }

  function buildRolesSection(targetRoles) {
    const roles = targetRoles || {};
    const groups = [
      { key: 'core', title: 'Core — прямое попадание' },
      { key: 'transferable', title: 'Transferable — смежные навыки' },
      { key: 'growth', title: 'Growth — рост и смена вектора' }
    ];
    const body = groups.map(g => {
      const list = Array.isArray(roles[g.key]) ? roles[g.key] : [];
      if (!list.length) return '';
      const rows = list.map(r => `
        <tr>
          <td>${esc(r.title_ru)}</td>
          <td class="m">${esc(r.title_en)}</td>
          <td class="num ${scoreKind(Number(r.match_percent) || 0)}">${Math.round(Number(r.match_percent) || 0)}%</td>
        </tr>
        <tr><td colspan="3" class="m" style="padding-top:0; border-bottom:none;">${esc(r.reasoning)}</td></tr>`).join('');
      return `<h3>${esc(g.title)} — ${list.length}</h3>
        <table><tr><th>Роль</th><th>Title</th><th style="text-align:right;">Совпадение</th></tr>${rows}</table>`;
    }).join('');
    if (!body) return reportCard('Подходящие роли', '<div class="empty">Модель не вернула список ролей.</div>');
    return reportCard('Подходящие роли', body);
  }

  function buildKeywordSection(keywordMatrix) {
    const matrix = keywordMatrix || {};
    const titles = { core: 'Core', transferable: 'Transferable', growth: 'Growth' };
    const chipRow = (label, arr) => {
      const list = Array.isArray(arr) ? arr : [];
      if (!list.length) return '';
      return `<div style="margin-top:8px;"><b style="font-size:13px;">${esc(label)}</b>
        <div class="chips">${list.map(k => `<span class="chip">${esc(k)}</span>`).join('')}</div></div>`;
    };
    const body = ['core', 'transferable', 'growth'].map(key => {
      const cluster = matrix[key];
      if (!cluster) return '';
      return `<h3>Кластер: ${esc(titles[key])}</h3>
        ${chipRow('Hard skills и инструменты', cluster.hard_skills_tools)}
        ${chipRow('Домен и методологии', cluster.domain_methodology)}
        ${chipRow('Активные глаголы', cluster.action_verbs)}`;
    }).join('');
    if (!body) return reportCard('Карта ключевых слов', '<div class="empty">Модель не вернула карту ключевых слов.</div>');
    return reportCard('Карта ключевых слов', body);
  }

  function buildAnalyticsReportHtml(items) {
    const list = Array.isArray(items) ? items : [];
    const total = list.length;

    if (!total) {
      return reportShell('Аналитика откликов', 'История пуста',
        reportCard('Нет данных', '<div class="empty">Ни одной проверки ещё не сохранено — запусти разбор вакансии, и отчёт наполнится.</div>'));
    }

    const scores = list.map(i => Number(i.score) || 0);
    const avg = Math.round(scores.reduce((s, v) => s + v, 0) / total);
    const applied = list.filter(i => i.applied).length;
    const now = Date.now();
    const within = days => list.filter(i => (now - new Date(i.date || 0).getTime()) <= days * 86400 * 1000).length;

    const tiles = reportCard('Сводка', `<div class="grid">
      <div class="tile"><div class="k">Всего проверок</div><div class="v">${total}</div></div>
      <div class="tile"><div class="k">За 7 / 30 дней</div><div class="v">${within(7)} / ${within(30)}</div></div>
      <div class="tile"><div class="k">Средний индекс</div><div class="v ${scoreKind(avg)}">${avg}</div></div>
      <div class="tile"><div class="k">Откликов отправлено</div><div class="v">${applied} <span style="font-size:14px; color:var(--muted);">(${Math.round(applied / total * 100)}%)</span></div></div>
    </div>`);

    const verdictCounts = {};
    list.forEach(i => { const v = i.verdict || '—'; verdictCounts[v] = (verdictCounts[v] || 0) + 1; });
    const verdicts = reportCard('Распределение вердиктов',
      Object.keys(verdictCounts)
        .sort((a, b) => verdictCounts[b] - verdictCounts[a])
        .map(v => reportBar(v + ' — ' + verdictCounts[v] + ' шт', verdictCounts[v] / total * 100))
        .join(''));

    const sourceCounts = {};
    list.forEach(i => { const s = i.source || 'другое'; sourceCounts[s] = (sourceCounts[s] || 0) + 1; });
    const sources = reportCard('Источники вакансий',
      Object.keys(sourceCounts)
        .sort((a, b) => sourceCounts[b] - sourceCounts[a])
        .map(s => reportBar(s + ' — ' + sourceCounts[s] + ' шт', sourceCounts[s] / total * 100))
        .join(''));

    const rows = list.map(i => {
      const score = Math.round(Number(i.score) || 0);
      const when = i.date ? new Date(i.date).toLocaleDateString('ru-RU') : '—';
      return `<tr>
        <td>${esc(when)}</td>
        <td>${esc(i.title || 'Вакансия')}</td>
        <td>${esc(i.source || '—')}</td>
        <td>${esc(i.verdict || '—')}</td>
        <td>${i.applied ? 'да' : '—'}</td>
        <td class="num ${scoreKind(score)}">${score}</td>
      </tr>`;
    }).join('');

    const table = reportCard('Все проверки', `<table>
      <tr><th>Дата</th><th>Вакансия</th><th>Источник</th><th>Вердикт</th><th>Отклик</th><th style="text-align:right;">Индекс</th></tr>
      ${rows}
    </table>`);

    return reportShell('Аналитика откликов', `${total} проверок · средний индекс ${avg}`,
      tiles + verdicts + sources + table);
  }

  // ---------- Экспорт отчётов в отдельную вкладку / файл ----------

  function openReportInNewTab(htmlContent) {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    if (chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  }

  function downloadReport(htmlContent, filename) {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Имя резюме в шапке отчёта — то, что реально выбрано, а не заглушка:
  // при мульти-резюме иначе непонятно, какую версию аудировали.
  function auditedResumeName() {
    const active = resumesCache.find(r => r.id === activeResumeIdCache);
    return (active && active.name) || 'без названия';
  }

  if ($('btn-export-ats-report')) {
    $('btn-export-ats-report').addEventListener('click', () => {
      if (!lastAtsAuditResult) {
        showError('Сначала запусти оценку резюме во вкладке «Профиль».');
        return;
      }
      openReportInNewTab(buildAtsAuditReportHtml(lastAtsAuditResult, auditedResumeName()));
    });
  }

  if ($('btn-download-ats-report')) {
    $('btn-download-ats-report').addEventListener('click', () => {
      if (!lastAtsAuditResult) {
        showError('Сначала запусти оценку резюме во вкладке «Профиль».');
        return;
      }
      const html = buildAtsAuditReportHtml(lastAtsAuditResult, auditedResumeName());
      const filename = `job-fit-copilot-ats-audit-${new Date().toISOString().slice(0, 10)}.html`;
      downloadReport(html, filename);
    });
  }

  if ($('btn-export-analytics-report')) {
    $('btn-export-analytics-report').addEventListener('click', async () => {
      const { history } = await chrome.storage.local.get('history');
      const items = Array.isArray(history) ? history : [];
      const html = buildAnalyticsReportHtml(items);
      openReportInNewTab(html);
    });
  }

  if ($('btn-download-analytics-report')) {
    $('btn-download-analytics-report').addEventListener('click', async () => {
      const { history } = await chrome.storage.local.get('history');
      const items = Array.isArray(history) ? history : [];
      const html = buildAnalyticsReportHtml(items);
      const filename = `job-fit-copilot-analytics-${new Date().toISOString().slice(0, 10)}.html`;
      downloadReport(html, filename);
    });
  }

  // ---------- настройки ----------

  $('btn-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  openSettingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  // ---------- табы (iOS Navigation Bar & Bottom Tab Bar) ----------

  const TAB_TITLES = {
    check: 'Fit-Check',
    ats: 'ATS-разбор',
    profile: 'Профиль кандидата',
    analytics: 'Аналитика',
    history: 'Журнал проверок'
  };

  function activateTab(name) {
    document.querySelectorAll('.ios-tab-item, .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.hidden = panel.dataset.tab !== name;
    });
    const titleEl = $('ios-title');
    if (titleEl && TAB_TITLES[name]) {
      titleEl.textContent = TAB_TITLES[name];
    }
  }

  function initTabs() {
    document.querySelectorAll('.ios-tab-item, .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
  }

  // ---------- авто-обновление при навигации ----------

  // extractFromActiveTab() сама выходит рано на нерелевантных URL — дешёво
  // звать её на каждую навигацию. Флаг просто не даёт двум запускам наложиться,
  // если события придут почти одновременно (например, SPA-переходы на hh.ru).
  let extractInFlight = false;
  async function safeExtractFromActiveTab() {
    if (extractInFlight) return;
    extractInFlight = true;
    try {
      await extractFromActiveTab();
      await checkResumeImportAvailability();
    } finally {
      extractInFlight = false;
    }
  }

  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active) safeExtractFromActiveTab();
    });
  }
  if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(() => safeExtractFromActiveTab());
  }

  const versionEl = $('app-version');
  if (versionEl) versionEl.textContent = APP_VERSION;

  // ---------- init ----------

  initTabs();
  loadProfile();
  loadHistory();
  populateAtsResumeSelect();
  safeExtractFromActiveTab();
})();
