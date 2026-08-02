// Job Fit Copilot — логика side panel (редизайн 2026-07-27: ledger-разбор, вердикты-решения).
(function () {
  const { DEFAULT_PROFILE, MODELS, DEFAULT_MODEL, genId, ensureSavedResumes, ensureProfiles } = globalThis.JFC;
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

  // ---------- SVG/CSS Visual Components (v0.4.0) ----------

  function getRingColors(score) {
    if (score < 50) return ['#FF3B30', '#FF9500'];
    if (score < 75) return ['#FF9500', '#FFCC00'];
    return ['#34C759', '#30B0C7'];
  }

  function setRingScore(el, score) {
    if (!el) return;
    const circle = el.querySelector('.ring-score__fill');
    const grad = el.querySelector('linearGradient');
    const valEl = el.querySelector('.ring-score__value');
    const r = circle ? (Number(circle.getAttribute('r')) || 52) : 52;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);

    if (circle) {
      circle.style.strokeDasharray = circumference;
      circle.style.strokeDashoffset = offset;
    }
    if (grad) {
      const [c1, c2] = getRingColors(score);
      const stops = grad.querySelectorAll('stop');
      if (stops.length >= 2) {
        stops[0].setAttribute('stop-color', c1);
        stops[1].setAttribute('stop-color', c2);
      }
    }
    if (valEl) valEl.textContent = `${Math.round(score)}%`;
  }

  function ledgerColorClass(value) {
    const val = Number(value) || 0;
    if (val >= 80) return 'ledger__value--positive';
    if (val >= 60) return 'ledger__value--warning';
    return 'ledger__value--negative';
  }

  function renderLedgerBreakdown(container, sb) {
    if (!container) return;
    container.innerHTML = '';
    const items = [
      { label: 'Совпадение ключевых слов', val: Math.round(sb.keyword_match_score || 0) },
      { label: 'Структура резюме', val: Math.round(sb.structure_score || 0) },
      { label: 'Релевантность опыта', val: Math.round(sb.experience_relevance_score || 0) },
      { label: 'Плотность метрик', val: Math.round(sb.metrics_density_score || 0) }
    ];
    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'ledger__row';
      row.innerHTML = `
        <span class="ledger__label">${it.label}</span>
        <span class="ledger__value ${ledgerColorClass(it.val)}">${it.val}%</span>
      `;
      container.appendChild(row);
    });
  }

  function renderActionableEditsList(container, edits) {
    if (!container) return;
    container.innerHTML = '';
    const list = Array.isArray(edits) ? edits : [];
    if (!list.length) {
      container.innerHTML = '<div class="meta">Все критичные требования покрыты, дополнительных правок не требуется.</div>';
      return;
    }
    list.forEach(edit => {
      const card = document.createElement('div');
      card.className = 'edit-card';
      const textToCopy = edit.suggested_text || '';
      card.innerHTML = `
        <div class="edit-card__section">Раздел: ${edit.resume_section || 'Общий'}</div>
        <div class="edit-card__gap">Пробел: ${edit.current_gap || ''}</div>
        <div class="edit-card__suggestion"><span class="edit-card__arrow">→</span>${textToCopy}</div>
        <button class="edit-card__copy" type="button">Скопировать формулировку</button>
      `;
      const copyBtn = card.querySelector('.edit-card__copy');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(textToCopy);
        const old = copyBtn.textContent;
        copyBtn.textContent = 'Скопировано ✓';
        setTimeout(() => { copyBtn.textContent = old; }, 1400);
      });
      container.appendChild(card);
    });
  }

  function renderVerdictDonutChart(el, counts) {
    if (!el) return;
    const r = 52, circumference = 2 * Math.PI * r;
    const segments = [
      { value: counts.fit || 0, color: '#34C759' },
      { value: counts.borderline || 0, color: '#FF9500' },
      { value: counts.skip || 0, color: '#FF3B30' },
    ];
    let offsetAccum = 0;
    const circles = el.querySelectorAll('.donut-segment');
    segments.forEach((seg, i) => {
      if (circles[i]) {
        const len = circumference * (seg.value / 100);
        circles[i].setAttribute('stroke', seg.color);
        circles[i].style.strokeDasharray = `${len} ${circumference - len}`;
        circles[i].style.strokeDashoffset = -offsetAccum;
        offsetAccum += len;
      }
    });
  }

  function renderSparklineChart(el, values) {
    if (!el || !values.length) return;
    const w = 280, h = 60, max = Math.max(...values, 1);
    const step = w / Math.max(values.length - 1, 1);
    const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 5) - 3).toFixed(1)}`);
    const linePath = `M${points.join(' L')}`;
    const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
    const area = el.querySelector('.sparkline-area');
    const line = el.querySelector('.sparkline-line');
    if (area) area.setAttribute('d', areaPath);
    if (line) line.setAttribute('d', linePath);
  }

  function renderSourcesList(container, sources) {
    if (!container) return;
    container.innerHTML = '';
    sources.forEach(src => {
      const row = document.createElement('div');
      row.className = 'source-row';
      row.innerHTML = `
        <div class="source-row__icon source-row__icon--${src.key}">${src.key}</div>
        <span class="source-row__name">${src.name}</span>
        <div class="source-row__bar"><div class="source-row__bar-fill" style="width: ${src.pct}%"></div></div>
        <span class="source-row__pct">${src.pct}%</span>
      `;
      container.appendChild(row);
    });
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

  // Дуга-индекс: заполняет число в центре и SVG-дугу вокруг него по kind (good/mid/bad).
  const GAUGE_CIRCUMFERENCE = 188.5; // 2 * π * 30 (r дуги в разметке)
  function setGauge(numId, arcId, score, kind) {
    const numEl = $(numId);
    numEl.textContent = score;
    numEl.className = 'gauge-num ' + kind;

    const arcEl = $(arcId);
    const clamped = Math.max(0, Math.min(100, score));
    arcEl.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - clamped / 100));
    arcEl.setAttribute('class', 'gauge-fill ' + kind);
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

  let profilesCache = [];
  let activeProfileIdCache = null;

  function renderProfileSelect() {
    const select = $('profile-select');
    select.innerHTML = '';
    profilesCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + (p.source === 'hh-import' ? ' (hh.ru)' : '');
      select.appendChild(opt);
    });
    select.value = activeProfileIdCache;
  }

  async function loadProfile() {
    const { profiles, activeProfileId } = await ensureProfiles();
    profilesCache = profiles;
    activeProfileIdCache = activeProfileId;
    renderProfileSelect();
    const active = profilesCache.find(p => p.id === activeProfileIdCache);
    $('profile-text').value = (active && active.text) || DEFAULT_PROFILE;
    renderProfileStructuredView(active);
  }

  $('profile-select').addEventListener('change', async (e) => {
    activeProfileIdCache = e.target.value;
    await chrome.storage.local.set({ activeProfileId: activeProfileIdCache });
    const active = profilesCache.find(p => p.id === activeProfileIdCache);
    $('profile-text').value = (active && active.text) || '';
    $('profile-import-status').textContent = '';
    renderProfileStructuredView(active);
  });

  $('btn-save-profile').addEventListener('click', async () => {
    const active = profilesCache.find(p => p.id === activeProfileIdCache);
    if (active) {
      active.text = $('profile-text').value;
      active.updatedAt = Date.now();
      await chrome.storage.local.set({ profiles: profilesCache });
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

  function renderProfileStructuredView(profile) {
    const el = $('profile-structured');
    let s = profile && profile.structured;
    if (!s && profile && profile.source === 'hh-import') {
      s = parseImportedText(profile.text);
    }
    if (!s) { el.hidden = true; return; }
    el.hidden = false;

    $('rs-title').textContent = s.title || '';
    $('rs-salary').textContent = s.salary || '';

    const expWrap = $('rs-experience');
    expWrap.textContent = '';
    const hasExp = Array.isArray(s.experience) && s.experience.length > 0;
    $('rs-experience-title').hidden = !hasExp;
    if (hasExp) {
      s.experience.forEach(e => {
        const item = document.createElement('div');
        item.className = 'rs-exp-item';
        if (e.company) {
          const co = document.createElement('div');
          co.className = 'rs-exp-company';
          co.textContent = e.company;
          item.appendChild(co);
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
        item.textContent = '— ' + ed;
        eduWrap.appendChild(item);
      });
    }

    $('rs-about-title').hidden = !s.about;
    $('rs-about').textContent = s.about || '';
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
    let target = profilesCache.find(p => p.sourceUrl === resume.url);
    if (!target) {
      target = {
        id: genId(),
        name: (resume.title || 'Резюме с hh.ru').slice(0, 60),
        source: 'hh-import',
        sourceUrl: resume.url
      };
      profilesCache.push(target);
    }
    target.text = resume.text;
    target.structured = {
      title: resume.title, salary: resume.salary, experience: resume.experience,
      education: resume.education, skills: resume.skills, about: resume.about
    };
    target.updatedAt = Date.now();
    activeProfileIdCache = target.id;

    await chrome.storage.local.set({ profiles: profilesCache, activeProfileId: activeProfileIdCache });
    renderProfileSelect();
    $('profile-text').value = target.text;
    renderProfileStructuredView(target);

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
    setGauge('rr-score', 'rr-score-arc', overallScore, overallScore >= 75 ? 'good' : (overallScore >= 50 ? 'mid' : 'bad'));

    // Progress delta tracking with previous audit
    let progressDeltaText = 'Сравнение с прошлым аудитом появится при повторном запуске';
    try {
      const { ats_audit_history } = await chrome.storage.local.get('ats_audit_history');
      const history = Array.isArray(ats_audit_history) ? ats_audit_history : [];
      if (history.length > 0) {
        const last = history[0];
        const lastScore = Math.round(Number(last.overall_ats_score) || 0);
        const diff = overallScore - lastScore;
        const diffStr = diff > 0 ? `+${diff}%` : `${diff}%`;
        progressDeltaText = `Динамика к прошлому аудиту: ${diffStr} (ранее: ${lastScore}%)`;
      }
      history.unshift({ date: new Date().toISOString(), overall_ats_score: overallScore, result: parsed });
      await chrome.storage.local.set({ ats_audit_history: history.slice(0, 20) });
    } catch (e) {
      console.error('Audit history save failed', e);
    }
    if ($('rr-progress-delta')) $('rr-progress-delta').textContent = progressDeltaText;

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
        row.innerHTML = `<div class="ats-req-head"><span class="ats-req-title"><b>${is.area || 'Критерий'}:</b> ${is.issue || ''}</span></div><div class="meta" style="margin-top:2px;">Влияние: ${is.impact || ''}</div>`;
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
          card.innerHTML = `<div class="ats-edit-text">${act}</div>`;
          expWrap.appendChild(card);
        });
      } else {
        expList.forEach(exp => {
          const card = document.createElement('div');
          card.className = 'ats-edit-card';
          card.innerHTML = `
            <div class="ats-edit-section">${exp.company || 'Компания / Опыт'}</div>
            <div class="ats-edit-gap" style="color:var(--red);">Проблема: ${Array.isArray(exp.issues) ? exp.issues.join('; ') : (exp.issues || '')}</div>
            <div class="ats-edit-text" style="color:var(--green-hover);"><b>Переформулировка:</b> ${exp.suggested_rewrite || ''}</div>
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
          <div><b>Обновление:</b> ${hh.last_update || 'не зафиксировано'}</div>
          <div><b>Статус поиска:</b> ${hh.search_status || 'не зафиксировано'}</div>
          <div><b>Плотность превью:</b> ${hh.card_preview_density || 'средняя'}</div>
          ${hh.notes ? `<div class="meta" style="margin-top:4px;">${hh.notes}</div>` : ''}
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
              <span class="ats-req-title"><b>${r.title_ru || ''}</b> / ${r.title_en || ''}</span>
              <span class="chip chip-mini ${cat.color}">${r.match_percent || 0}%</span>
            </div>
            <div class="meta" style="margin-top:2px;">${r.reasoning || ''}</div>
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
          <div style="font-weight:700; font-size:13px; margin-bottom:6px; color:var(--ink);">${clusterTitle}</div>
          <div style="margin-bottom:4px;"><b>Hard Skills & Tools:</b> <span class="meta">${(cluster.hard_skills_tools || []).join(', ')}</span></div>
          <div style="margin-bottom:4px;"><b>Домен & Методологии:</b> <span class="meta">${(cluster.domain_methodology || []).join(', ')}</span></div>
          <div><b>Активные глаголы:</b> <span class="meta">${(cluster.action_verbs || []).join(', ')}</span></div>
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
            <span class="ats-req-title"><b>Шаг ${idx + 1}:</b> ${item.action || ''}</span>
            <span class="chip chip-mini chip-mid">${item.target_section || 'Раздел'}</span>
          </div>
          <div class="meta" style="margin-top:2px;"><b>Зачем:</b> ${item.why || ''}</div>
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

  if ($('btn-export-ats-report')) {
    $('btn-export-ats-report').addEventListener('click', () => {
      if (!lastAtsAuditResult) {
        showError('Сначала запусти оценку резюме во вкладке «Профиль».');
        return;
      }
      const html = buildAtsAuditReportHtml(lastAtsAuditResult, 'Основной профиль');
      openReportInNewTab(html);
    });
  }

  if ($('btn-download-ats-report')) {
    $('btn-download-ats-report').addEventListener('click', () => {
      if (!lastAtsAuditResult) {
        showError('Сначала запусти оценку резюме во вкладке «Профиль».');
        return;
      }
      const html = buildAtsAuditReportHtml(lastAtsAuditResult, 'Основной профиль');
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

  // ---------- init ----------

  initTabs();
  loadProfile();
  loadHistory();
  populateAtsResumeSelect();
  safeExtractFromActiveTab();
})();
