// Job Fit Copilot — service worker: вызовы LLM-провайдеров (NVIDIA NIM / OpenAI / Anthropic) и поведение side panel.
importScripts('shared/constants.js');

const JFC = globalThis.JFC;

// Клик по иконке расширения открывает side panel.
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ANALYZE_FIT') {
    handle(analyzeFit(msg.vacancy, msg.profile), sendResponse);
    return true; // канал остаётся открытым для асинхронного ответа
  }
  if (msg.type === 'WRITE_LETTER') {
    handle(writeLetter(msg.vacancy, msg.profile, msg.sellingPoints, msg.lang, msg.tone, msg.flags), sendResponse);
    return true;
  }
  if (msg.type === 'REVIEW_RESUME') {
    handle(reviewResume(msg.profile), sendResponse);
    return true;
  }
  if (msg.type === 'MATCH_ATS') {
    handle(matchAts(msg.vacancy, msg.fullResume), sendResponse);
    return true;
  }
});

// Единый формат ответа панели: { ok: true, result } | { ok: false, code, message }.
function handle(promise, sendResponse) {
  promise
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, code: 'NETWORK', message: String((err && err.message) || err) }));
}

async function getApiKey(modelKey) {
  const { apiKeys } = await chrome.storage.local.get('apiKeys');
  return apiKeys && apiKeys[modelKey];
}

async function getModelKey() {
  const { model } = await chrome.storage.local.get('model');
  return (model && JFC.MODELS[model]) ? model : JFC.DEFAULT_MODEL;
}

// Модель-специфичные параметры запроса, как в референсных сниппетах NVIDIA NIM.
// Для openai/anthropic лишние параметры не нужны — вернётся {} по умолчанию.
function extraParamsFor(modelKey) {
  if (modelKey === 'deepseek') {
    return {
      temperature: 1,
      top_p: 0.95,
      chat_template_kwargs: { thinking: true, reasoning_effort: 'high' }
    };
  }
  if (modelKey === 'glm') {
    return { temperature: 1, top_p: 1, seed: 42 };
  }
  return {};
}

// Собирает тело/заголовки запроса под конкретную схему авторизации провайдера.
function buildRequest(provider, apiKey, model, modelKey, system, user, maxTokens) {
  if (provider.authStyle === 'anthropic') {
    return {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Запрос идёт из браузерного контекста расширения — без этого заголовка API отклоняет вызов.
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }
    };
  }
  // authStyle === 'bearer' (NVIDIA NIM, OpenAI) — единый OpenAI-совместимый формат.
  return {
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: {
      model,
      max_tokens: maxTokens,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      ...extraParamsFor(modelKey)
    }
  };
}

async function callProvider(system, user, maxTokens) {
  const modelKey = await getModelKey();
  const apiKey = await getApiKey(modelKey);
  if (!apiKey) return { ok: false, code: 'NO_API_KEY', message: JFC.MODELS[modelKey].label };

  const modelInfo = JFC.MODELS[modelKey];
  const provider = JFC.PROVIDERS[modelInfo.provider];
  const { headers, body } = buildRequest(provider, apiKey, modelInfo.id, modelKey, system, user, maxTokens);

  const res = await fetch(provider.endpoint, { method: 'POST', headers, body: JSON.stringify(body) });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data && data.error && (data.error.message || data.error)) || ('HTTP ' + res.status);
    // 429/502/503/504/529 или текст вида "ResourceExhausted"/"rate limit"/
    // "overloaded" — временная перегрузка провайдера или шлюза перед ним
    // (502/503/504 — Bad Gateway/Unavailable/Gateway Timeout, 529 — код
    // Anthropic для overloaded_error), а не ошибка ключа/запроса. Отдаём
    // отдельный код, чтобы панель могла сама повторить запрос.
    const isRateLimit = [429, 502, 503, 504, 529].includes(res.status) ||
      /resourceexhausted|rate.?limit|overloaded/i.test(String(message));
    return { ok: false, code: isRateLimit ? 'RATE_LIMIT' : 'API', message };
  }
  return { ok: true, data, responseStyle: provider.responseStyle };
}

function extractText(res) {
  if (res.responseStyle === 'anthropic') {
    return (res.data.content || []).map(b => b.text || '').join('').trim();
  }
  const choice = res.data.choices && res.data.choices[0];
  const content = choice && choice.message && choice.message.content;
  return (content || '').trim();
}

// Модель иногда добавляет вступление/пояснение вокруг JSON несмотря на прямой
// запрет в промпте (особенно reasoning-модели) — прежде чем сдаваться,
// пробуем вытащить первый {...}-блок из текста и распарсить уже его.
function parseModelJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) { /* тоже не JSON — сдаёмся, вернём null ниже */ }
    }
    return null;
  }
}

function formatVacancy(v) {
  const head = [];
  if (v.title) head.push('Название: ' + v.title);
  if (v.company) head.push('Компания: ' + v.company);
  if (v.salary) head.push('Зарплата: ' + v.salary);
  return head.join('\n') + '\n\n' + (v.description || '');
}

// 2500/1200 вместо прежних 1000/600: у deepseek/glm включён режим рассуждений
// (chat_template_kwargs.thinking, reasoning_effort — см. extraParamsFor), и
// reasoning-токены расходуются из того же бюджета max_tokens, что и финальный
// ответ. При старом лимите модель нередко успевала "подумать", но не
// дописывала JSON/письмо до конца — это и давало PARSE_ERROR.
async function analyzeFit(vacancy, profile) {
  const user = 'Профиль кандидата:\n' + profile + '\n\nВакансия:\n' + formatVacancy(vacancy);
  const res = await callProvider(JFC.FIT_CHECK_SYSTEM_PROMPT, user, 2500);
  if (!res.ok) return res;

  const raw = extractText(res).replace(/```json|```/g, '').trim();
  const parsed = parseModelJson(raw);
  if (parsed) return { ok: true, result: parsed };
  return { ok: false, code: 'PARSE_ERROR', message: raw.slice(0, 300) };
}

async function writeLetter(vacancy, profile, sellingPoints, lang, tone, flags) {
  const system = JFC.letterPrompt(lang === 'en' ? 'en' : 'ru', tone || 'neutral');
  const pointsStr = Array.isArray(sellingPoints) ? sellingPoints.join('; ') : (sellingPoints || '—');
  const flagsStr = Array.isArray(flags) ? flags.join('; ') : (flags || '—');
  const user = 'Профиль кандидата:\n' + profile +
    '\n\nСильные стороны для этой вакансии: ' + pointsStr +
    '\n\nФакторы риска / Red Flags для этой вакансии: ' + flagsStr +
    '\n\nВакансия:\n' + formatVacancy(vacancy);
  const res = await callProvider(system, user, 1200);
  if (!res.ok) return res;
  return { ok: true, result: extractText(res) };
}

async function reviewResume(profile) {
  const user = 'Резюме кандидата:\n' + profile;
  const res = await callProvider(JFC.RESUME_REVIEW_SYSTEM_PROMPT, user, 3800);
  if (!res.ok) return res;

  const raw = extractText(res).replace(/```json|```/g, '').trim();
  const parsed = parseModelJson(raw);
  if (parsed) return { ok: true, result: parsed };
  return { ok: false, code: 'PARSE_ERROR', message: raw.slice(0, 300) };
}

async function matchAts(vacancy, fullResume) {
  const user = 'Полный текст резюме кандидата:\n' + fullResume + '\n\nВакансия:\n' + formatVacancy(vacancy);
  const res = await callProvider(JFC.ATS_MATCH_SYSTEM_PROMPT, user, 3000);
  if (!res.ok) return res;

  const raw = extractText(res).replace(/```json|```/g, '').trim();
  const parsed = parseModelJson(raw);
  if (parsed) return { ok: true, result: parsed };
  return { ok: false, code: 'PARSE_ERROR', message: raw.slice(0, 300) };
}
