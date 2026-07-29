// Job Fit Copilot — логика side panel (редизайн 2026-07-27: ledger-разбор, вердикты-решения).
(function () {
  const { DEFAULT_PROFILE, MODELS, DEFAULT_MODEL, genId, ensureProfiles } = globalThis.JFC;
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

  // Отправка сообщения background.js с повтором при RATE_LIMIT (перегружен провайдер
  // выбранной модели) и текстовым статусом хода выполнения в labelEl.
  const RETRY_DELAYS_MS = [3000, 8000, 20000];
  async function sendWithRetry(msg, labelEl, baseLabel) {
    for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
      if (labelEl) {
        labelEl.textContent = attempt === 1 ? baseLabel : baseLabel + ` (попытка ${attempt}/${RETRY_DELAYS_MS.length + 1})`;
      }
      const resp = await chrome.runtime.sendMessage(msg);
      const isLastAttempt = attempt === RETRY_DELAYS_MS.length + 1;
      if (!resp || resp.ok || resp.code !== 'RATE_LIMIT' || isLastAttempt) return resp;

      const waitMs = RETRY_DELAYS_MS[attempt - 1];
      for (let leftMs = waitMs; leftMs > 0; leftMs -= 1000) {
        if (labelEl) {
          labelEl.textContent = `Лимит провайдера занят, повтор через ${Math.ceil(leftMs / 1000)} с… (попытка ${attempt}/${RETRY_DELAYS_MS.length + 1})`;
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
  }

  $('profile-select').addEventListener('change', async (e) => {
    activeProfileIdCache = e.target.value;
    await chrome.storage.local.set({ activeProfileId: activeProfileIdCache });
    const active = profilesCache.find(p => p.id === activeProfileIdCache);
    $('profile-text').value = (active && active.text) || '';
    $('profile-import-status').textContent = '';
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
    target.updatedAt = Date.now();
    activeProfileIdCache = target.id;

    await chrome.storage.local.set({ profiles: profilesCache, activeProfileId: activeProfileIdCache });
    renderProfileSelect();
    $('profile-text').value = target.text;

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
        if (resp.code === 'PARSE_ERROR') { showError('Модель вернула неожиданный формат ответа. Попробуй ещё раз.'); return; }
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

  function renderResumeReview(parsed) {
    const score = computeScore(parsed);
    setGauge('rr-score', 'rr-score-arc', score, score >= 70 ? 'good' : score >= 45 ? 'mid' : 'bad');

    renderLedgerInto($('rr-ledger'), parsed.ledger, score, 'итог');

    $('rr-reasoning').textContent = parsed.reasoning || '';
    fillList($('rr-strengths'), parsed.strengths);
    fillList($('rr-gaps'), parsed.gaps);
    fillList($('rr-actions'), parsed.action_items);

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
        if (resp.code === 'PARSE_ERROR') { showError('Модель вернула неожиданный формат ответа. Попробуй ещё раз.'); return; }
        if (resp.code === 'RATE_LIMIT') { showError('Провайдер перегружен для этой модели даже после повторов. Попробуй позже или переключи модель в настройках.'); openSettingsBtn.hidden = false; return; }
        showError('Ошибка API: ' + (resp.message || 'неизвестная'));
        return;
      }
      const score = computeScore(resp.result);
      renderResult(resp.result, score);
      await saveToHistory({
        title: resp.result.title || currentVacancy.title || 'Вакансия',
        source: currentVacancy.source || '',
        url: currentVacancy.url || '',
        verdict: resp.result.verdict,
        score,
        date: new Date().toISOString()
      });
    } catch (e) {
      showError('Не получилось проанализировать. Проверь подключение и попробуй ещё раз.');
      console.error(e);
    } finally {
      checkBtn.disabled = false;
      loadingEl.style.display = 'none';
    }
  });

  function renderResult(parsed, score) {
    const verdict = VERDICTS.includes(parsed.verdict) ? parsed.verdict : 'С ОГОВОРКАМИ';
    const kind = verdictKind(verdict);

    const id = makeCheckId();
    $('check-id').textContent = '#' + id;
    $('result-id').textContent = '#' + id;

    const chip = $('verdict-chip');
    chip.textContent = verdict;
    chip.className = 'chip chip-verdict chip-' + kind;

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
      .map(li => li.textContent).filter(t => t !== '—').join('; ');

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
        lang
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

      const chip = document.createElement('span');
      chip.className = 'chip chip-mini chip-' + verdictKind(it.verdict);
      chip.textContent = it.verdict || '—';

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

  function renderAnalytics(items) {
    const total = items.length;
    const applied = items.filter(i => i.applied).length;
    const avg = total ? Math.round(items.reduce((s, i) => s + (Number(i.score) || 0), 0) / total) : 0;

    $('an-total').textContent = total || '—';
    $('an-applied').textContent = total ? applied + ' (' + Math.round(applied / total * 100) + '%)' : '—';
    $('an-avg').textContent = total ? avg : '—';

    const verdictCounts = {};
    items.forEach(i => { const v = i.verdict || '—'; verdictCounts[v] = (verdictCounts[v] || 0) + 1; });
    renderVerdictDonut(verdictCounts, total);

    const sourceCounts = {};
    items.forEach(i => { const s = i.source || 'другое'; sourceCounts[s] = (sourceCounts[s] || 0) + 1; });
    const sWrap = $('an-sources');
    sWrap.textContent = '';
    Object.entries(sourceCounts).forEach(([s, c]) => {
      const chip = document.createElement('span');
      chip.className = 'chip chip-mini chip-source';
      chip.textContent = (sourceLabel(s) || s) + ': ' + c;
      sWrap.appendChild(chip);
    });

    renderSparkline(items);
  }

  // Донат вердиктов без внешних библиотек: круг с трекером + один <circle>
  // на вердикт, длина/сдвиг штриха в процентах (окружность r=15.915 ≈ 100).
  const DONUT_KIND_COLOR = { good: 'var(--green)', mid: 'var(--amber)', bad: 'var(--red)', neutral: 'var(--muted)' };
  function renderVerdictDonut(verdictCounts, total) {
    const svg = $('an-donut');
    const legend = $('an-donut-legend');
    const totalEl = $('an-donut-total');
    svg.innerHTML = '';
    legend.innerHTML = '';
    totalEl.innerHTML = '';
    if (!total) return; // пустая история — донат остаётся пустым, без визуального мусора

    const numEl = document.createElement('div');
    numEl.className = 'num';
    numEl.textContent = String(total);
    const lblEl = document.createElement('div');
    lblEl.className = 'lbl';
    lblEl.textContent = 'всего';
    totalEl.appendChild(numEl);
    totalEl.appendChild(lblEl);

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

  // ---------- настройки ----------

  $('btn-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  openSettingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  // ---------- табы ----------

  function activateTab(name) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.hidden = panel.dataset.tab !== name;
    });
  }

  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
  }

  // ---------- init ----------

  initTabs();
  loadProfile();
  loadHistory();
  extractFromActiveTab();
  checkResumeImportAvailability();
})();
