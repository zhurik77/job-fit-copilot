// Job Fit Copilot — страница настроек.
(function () {
  const { DEFAULT_PROFILE, DEFAULT_MODEL, genId, ensureProfiles } = globalThis.JFC;
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

  async function load() {
    const { apiKeys, model, letterLang, fullResumeText } = await chrome.storage.local.get(['apiKeys', 'model', 'letterLang', 'fullResumeText']);
    for (const key of Object.keys(apiKeyInputs)) {
      apiKeyInputs[key].value = (apiKeys && apiKeys[key]) || '';
    }
    modelSelect.value = model || DEFAULT_MODEL;
    langSelect.value = letterLang || 'auto';
    if ($('opt-full-resume')) $('opt-full-resume').value = fullResumeText || '';
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
      const fullResumeText = $('opt-full-resume') ? $('opt-full-resume').value.trim() : '';
      await chrome.storage.local.set({
        apiKeys,
        model: modelSelect.value,
        letterLang: langSelect.value,
        fullResumeText
      });
      flashButton(saveBtn, 'Сохранено ✓');
    } catch (err) {
      $('opt-error').textContent = 'Не удалось сохранить: ' + err;
    }
  });

  // ---------- профили кандидата (несколько именованных резюме) ----------

  const profileSelect = $('opt-profile-select');
  const profileNameInput = $('opt-profile-name');
  const profileTextarea = $('opt-profile');
  const profileMeta = $('opt-profile-meta');

  let profilesCache = [];
  let activeProfileIdCache = null;

  function renderProfileSelect() {
    profileSelect.innerHTML = '';
    profilesCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + (p.source === 'hh-import' ? ' (hh.ru)' : '');
      profileSelect.appendChild(opt);
    });
    profileSelect.value = activeProfileIdCache;
  }

  function renderSelectedProfile() {
    const p = profilesCache.find(x => x.id === activeProfileIdCache);
    profileNameInput.value = p ? p.name : '';
    profileTextarea.value = p ? p.text : '';
    profileMeta.textContent = p
      ? 'Источник: ' + (p.source === 'hh-import' ? 'импортировано с hh.ru' : 'вручную') +
        (p.updatedAt ? ' · обновлено ' + new Date(p.updatedAt).toLocaleString('ru-RU') : '')
      : '';
  }

  async function persistProfiles() {
    await chrome.storage.local.set({ profiles: profilesCache, activeProfileId: activeProfileIdCache });
  }

  async function loadProfiles() {
    const result = await ensureProfiles();
    profilesCache = result.profiles;
    activeProfileIdCache = result.activeProfileId;
    renderProfileSelect();
    renderSelectedProfile();
  }

  profileSelect.addEventListener('change', async () => {
    activeProfileIdCache = profileSelect.value;
    await persistProfiles();
    renderSelectedProfile();
  });

  $('opt-profile-add').addEventListener('click', async () => {
    const p = { id: genId(), name: 'Новый профиль', text: DEFAULT_PROFILE, source: 'manual', updatedAt: Date.now() };
    profilesCache.push(p);
    activeProfileIdCache = p.id;
    await persistProfiles();
    renderProfileSelect();
    renderSelectedProfile();
    profileNameInput.focus();
  });

  $('opt-profile-rename').addEventListener('click', async () => {
    const p = profilesCache.find(x => x.id === activeProfileIdCache);
    const name = profileNameInput.value.trim();
    if (!p || !name) return;
    p.name = name;
    await persistProfiles();
    renderProfileSelect();
    flashButton($('opt-profile-rename'), 'Готово ✓');
  });

  $('opt-profile-save-text').addEventListener('click', async () => {
    const p = profilesCache.find(x => x.id === activeProfileIdCache);
    if (!p) return;
    p.text = profileTextarea.value;
    p.updatedAt = Date.now();
    await persistProfiles();
    renderSelectedProfile();
    flashButton($('opt-profile-save-text'), 'Сохранено ✓');
  });

  $('opt-profile-delete').addEventListener('click', async () => {
    if (profilesCache.length <= 1) {
      profileMeta.textContent = 'Нельзя удалить единственный профиль.';
      return;
    }
    const idx = profilesCache.findIndex(x => x.id === activeProfileIdCache);
    if (idx === -1) return;
    if (!confirm('Удалить профиль «' + profilesCache[idx].name + '»?')) return;
    profilesCache.splice(idx, 1);
    activeProfileIdCache = profilesCache[0].id;
    await persistProfiles();
    renderProfileSelect();
    renderSelectedProfile();
  });

  // ---------- сохранённые резюме кандидата (мульти-резюме для ATS) ----------

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
      opt.textContent = r.name;
      resumeSelect.appendChild(opt);
    });
    if (activeResumeIdCache) resumeSelect.value = activeResumeIdCache;
  }

  function renderSelectedResume() {
    const r = savedResumesCache.find(x => x.id === activeResumeIdCache);
    resumeNameInput.value = r ? r.name : '';
    resumeTextarea.value = r ? r.text : '';
    resumeMeta.textContent = r
      ? 'Обновлено: ' + (r.updatedAt ? new Date(r.updatedAt).toLocaleString('ru-RU') : 'недавно')
      : '';
  }

  async function persistSavedResumes() {
    await chrome.storage.local.set({ savedResumes: savedResumesCache, activeResumeId: activeResumeIdCache });
  }

  async function loadSavedResumes() {
    const result = await ensureSavedResumes();
    savedResumesCache = result.savedResumes;
    activeResumeIdCache = result.activeResumeId;
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
  loadProfiles();
  loadSavedResumes();
})();
