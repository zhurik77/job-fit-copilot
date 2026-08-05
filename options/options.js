// Job Fit Copilot — страница настроек.
(function () {
  const { DEFAULT_PROFILE, DEFAULT_MODEL, genId, ensureSavedResumes } = globalThis.JFC;
  const $ = id => document.getElementById(id);

  // Одно поле на каждую запись в JFC.MODELS — ключ хранится под тем же именем.
  const apiKeyInputs = {
    deepseek: $('opt-apikey-deepseek'),
    glm: $('opt-apikey-glm'),
    openai: $('opt-apikey-openai'),
    anthropic: $('opt-apikey-anthropic')
  };
  const modelSelect = $('opt-model');
  const langSelect = $('opt-lang');
  const saveBtn = $('opt-save');

  function flashButton(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = old; }, 1400);
  }

  // Текст резюме сюда намеренно не подставляется: тем же полем #opt-full-resume
  // владеет секция резюме ниже (renderSelectedResume). Раньше обе функции
  // писали в него параллельно, и содержимое textarea зависело от того, чей
  // await разрешится последним.
  async function load() {
    const { apiKeys, model, letterLang } = await chrome.storage.local.get(['apiKeys', 'model', 'letterLang']);
    for (const key of Object.keys(apiKeyInputs)) {
      apiKeyInputs[key].value = (apiKeys && apiKeys[key]) || '';
    }
    modelSelect.value = model || DEFAULT_MODEL;
    langSelect.value = letterLang || 'auto';
  }

  $('opt-toggle-key').addEventListener('click', (e) => {
    e.preventDefault();
    const show = apiKeyInputs.deepseek.type === 'password';
    const type = show ? 'text' : 'password';
    for (const key of Object.keys(apiKeyInputs)) apiKeyInputs[key].type = type;
    e.target.textContent = show ? 'скрыть' : 'показать';
  });

  saveBtn.addEventListener('click', async () => {
    $('opt-error').textContent = '';
    try {
      const apiKeys = {};
      for (const key of Object.keys(apiKeyInputs)) apiKeys[key] = apiKeyInputs[key].value.trim();
      // Резюме сохраняется своей кнопкой «Сохранить текст» в savedResumes —
      // общая кнопка отвечает только за ключи, модель и язык писем.
      await chrome.storage.local.set({
        apiKeys,
        model: modelSelect.value,
        letterLang: langSelect.value
      });
      flashButton(saveBtn, 'Сохранено ✓');
    } catch (err) {
      $('opt-error').textContent = 'Не удалось сохранить: ' + err;
    }
  });

  // ---------- резюме кандидата (мульти-резюме: вкладка «Профиль» + ATS) ----------
  // До v0.4.5 здесь была вторая, отдельная секция «Профили кандидата» — она
  // работала с тем же списком, но писала его в ключ `profiles`, который никто
  // не читал. Секции объединены, ключ упразднён (см. constants.js).

  const resumeSelect = $('opt-resume-select');
  const resumeNameInput = $('opt-resume-name');
  const resumeTextarea = $('opt-full-resume');
  const resumeMeta = $('opt-resume-meta');

  let savedResumesCache = [];
  let activeResumeIdCache = null;

  function renderResumeSelect() {
    resumeSelect.innerHTML = '';
    savedResumesCache.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name + (r.source === 'hh-import' ? ' (hh.ru)' : '');
      resumeSelect.appendChild(opt);
    });
    if (activeResumeIdCache) resumeSelect.value = activeResumeIdCache;
  }

  function renderSelectedResume() {
    const r = savedResumesCache.find(x => x.id === activeResumeIdCache);
    resumeNameInput.value = r ? r.name : '';
    resumeTextarea.value = r ? r.text : '';
    if (!r) {
      resumeMeta.textContent = '';
      return;
    }
    const origin = r.source === 'hh-import' ? 'импортировано с hh.ru' : 'введено вручную';
    const when = r.updatedAt ? ' · обновлено ' + new Date(r.updatedAt).toLocaleString('ru-RU') : '';
    resumeMeta.textContent = 'Источник: ' + origin + when;
  }

  async function persistSavedResumes() {
    await chrome.storage.local.set({ savedResumes: savedResumesCache, activeResumeId: activeResumeIdCache });
  }

  async function loadSavedResumes() {
    const { savedResumes, activeResumeId } = await ensureSavedResumes();
    savedResumesCache = savedResumes;
    activeResumeIdCache = activeResumeId;
    renderResumeSelect();
    renderSelectedResume();
  }

  resumeSelect.addEventListener('change', async () => {
    activeResumeIdCache = resumeSelect.value;
    await persistSavedResumes();
    renderSelectedResume();
  });

  $('opt-resume-add').addEventListener('click', async () => {
    const r = { id: genId(), name: 'Новое резюме', text: DEFAULT_PROFILE, updatedAt: Date.now() };
    savedResumesCache.push(r);
    activeResumeIdCache = r.id;
    await persistSavedResumes();
    renderResumeSelect();
    renderSelectedResume();
    resumeNameInput.focus();
  });

  $('opt-resume-rename').addEventListener('click', async () => {
    const r = savedResumesCache.find(x => x.id === activeResumeIdCache);
    const name = resumeNameInput.value.trim();
    if (!r || !name) return;
    r.name = name;
    await persistSavedResumes();
    renderResumeSelect();
    flashButton($('opt-resume-rename'), 'Готово ✓');
  });

  $('opt-resume-save-text').addEventListener('click', async () => {
    const r = savedResumesCache.find(x => x.id === activeResumeIdCache);
    if (!r) return;
    r.text = resumeTextarea.value;
    r.updatedAt = Date.now();
    await persistSavedResumes();
    renderSelectedResume();
    flashButton($('opt-resume-save-text'), 'Сохранено ✓');
  });

  $('opt-resume-delete').addEventListener('click', async () => {
    if (savedResumesCache.length <= 1) {
      resumeMeta.textContent = 'Нельзя удалить единственное резюме.';
      return;
    }
    const idx = savedResumesCache.findIndex(x => x.id === activeResumeIdCache);
    if (idx === -1) return;
    if (!confirm('Удалить резюме «' + savedResumesCache[idx].name + '»?')) return;
    savedResumesCache.splice(idx, 1);
    activeResumeIdCache = savedResumesCache[0].id;
    await persistSavedResumes();
    renderResumeSelect();
    renderSelectedResume();
  });

  load();
  loadSavedResumes();
})();
