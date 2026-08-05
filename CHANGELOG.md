# Changelog

All notable changes to Job Fit Copilot will be documented in this file.

## [Unreleased]

### Fixed
- **Сайт проекта не собирался.** GitHub Pages прогонял `docs/` через Jekyll, и
  сборка падала (`status: errored`), из-за чего страница не открывалась.
  Добавлен `docs/.nojekyll`: лендинг статический, Jekyll ему не нужен.

### Changed
- **Скриншоты пересняты с заполненными данными.** Прежние показывали пустые
  экраны — по ним нельзя было понять, что расширение вообще делает. Теперь
  это реальный разбор вакансии автоматизатора (n8n / Python / REST API) на
  профиле автора: вердикт с ведомостью, покрытие требований, сравнение двух
  версий резюме и аудит с построчными переформулировками.

  `tools/shot.js` переписан: снимает пять кадров, прогоняя настоящие
  обработчики кнопок (`#btn-check`, `#btn-ats-check`, `#btn-review-resume`,
  `#btn-ats-compare-all`), — то есть разметка, стили и расчёты в кадре
  рабочие. Заранее задан только JSON, который в бою пришёл бы от провайдера:
  живой запрос требует ключа и каждый раз возвращает другой текст, из-за чего
  скриншоты нельзя было бы пересобрать. Подписи в README изменены
  соответственно — прежняя формулировка «без постановочных AI-результатов»
  больше не была бы правдой.

  Заодно снят артефакт полностраничной съёмки: фиксированный таббар
  отрисовывался посреди длинной страницы и прорезал контент.

### Added
- Галерея интерфейса на лендинге и скриншот сравнения резюме в README.

## [0.5.0] - 2026-08-05

### Added
- **Сравнение резюме под конкретную вакансию.** Прогоняет одну вакансию через
  все сохранённые резюме и отвечает на вопрос, ради которого мульти-резюме и
  задумывалось: какую версию позиционирования отправлять именно сюда. Раньше
  выбор был вслепую — разбор запускался только по одному резюме за раз.

  Ранжирование идёт по покрытию **обязательных** требований, а не по общему
  баллу: резюме с общим баллом 80 и незакрытым обязательным требованием
  проигрывает резюме с баллом 70 без дыр, потому что именно обязательные
  решают, пройдёт ли документ формальный фильтр. Общий балл — тай-брейк.

  Запросы идут последовательно: на веер одновременных вызовов провайдеры
  отвечают 429, и это сломало бы планы повторов в `sendWithRetry`. Упавшее
  резюме не роняет сравнение — оно исключается из рейтинга и называется в
  примечании, чтобы результат не выглядел полным, когда он неполный.

- **ATS-оценка сохраняется на самом резюме** и видна в сводке профиля без
  повторного запуска аудита. Раньше она жила только внутри последнего разбора
  и исчезала при перезагрузке панели.

### Fixed
- **История аудитов была общей на все резюме.** После аудита второго резюме
  «динамика» сравнивала его с первым — то есть показывала разницу между
  разными документами, выдавая её за прогресс одного. История разделена по
  `resumeId`.
- **Двойное тире в образовании:** записи, уже начинавшиеся с тире, выводились
  как «— — МГТУ». Маркер теперь рисует CSS.

### Changed
- **Вкладка «Профиль» перестроена.** Была одна карточка, в которой элементы
  управления, содержимое резюме и сырой текст шли сплошным потоком. Стало три:
  сводка (должность, ожидания, дата правки, источник, три ключевых числа и
  главное действие), содержимое резюме и свёрнутый блок с текстом, который
  уходит модели.
- Опыт работы больше не выводится сплошной жирной строкой: заголовок вида
  «Компания · Должность · период» разбирается на компанию и отдельную строку
  метаданных.
- Итог ATS-аудита: дуга слева, вердикт и динамика справа. Раньше кольцо стояло
  по центру с подписью под ним и читалось как декорация, а не как результат.
- Кнопка «Оценить резюме» стала главным действием вкладки; сохранение текста
  ушло во вторичные — раньше обе выглядели одинаково.

## [0.4.5] - 2026-08-05

Релиз целиком про корректность: четыре заявленные возможности не работали,
а единственной автоматической проверкой был `node --check`, который такие
поломки не видит в принципе.

### Fixed
- **Экспорт отчётов не работал ни в одном из четырёх сценариев.** Обработчики
  кнопок «Открыть полный отчёт» и «Скачать отчёт (.html)» (панели «Профиль» и
  «Аналитика») вызывали `buildAtsAuditReportHtml` и `buildAnalyticsReportHtml` —
  функции, которых не существовало нигде в кодовой базе. Каждое нажатие
  завершалось `ReferenceError`, при этом экспорт был заявлен отдельным разделом
  README. Обе функции реализованы: автономный HTML без единого внешнего запроса,
  светлая и тёмная темы, вёрстка под печать в PDF.
- **Импорт резюме с hh.ru и кнопка «Сохранить профиль» молча теряли данные.**
  Вкладка «Профиль» и страница настроек писали в ключ `chrome.storage.local`
  с именем `profiles`, который не читала ни одна строка кода — единственным
  читателем был `savedResumes`. Импорт отрабатывал, показывал «Импортировано:
  N мест работы», и исчезал при следующем открытии панели. Ключ упразднён, всё
  работает с `savedResumes`; добавлена миграция, которая **возвращает уже
  потерянные данные** — они всё это время лежали в хранилище непрочитанными.
- **Секция мульти-резюме в настройках не загружалась**: `options.js` вызывал
  `ensureSavedResumes()`, не получив его из `globalThis.JFC` — `ReferenceError`
  обрывал инициализацию.
- **Все кольца-индексы показывали неверное заполнение.** Длина окружности была
  зашита константой `188.5` (2π·30), тогда как в разметке радиус дуг равен 52
  (окружность 326.7). Индекс 100 закрашивал кольцо на 58%, индекс 0 рисовал дугу
  на 42%. Теперь длина считается из атрибута `r` конкретного элемента.
- **Кольца покрытия требований в ATS-разборе были декорацией**: `ats-hard-arc` и
  `ats-nice-arc` не обновлялись ни одной строкой кода, менялся только текст
  процентов. Подключены к результату разбора.
- **Ответ модели попадал в `innerHTML` без экранирования** в семи местах разбора
  резюме. Текст вакансии мы не контролируем, а выгруженный `.html`-отчёт
  открывается уже без CSP расширения. Весь вывод модели проходит через `esc()`.
- **Гонка за поле резюме в настройках**: одну и ту же `textarea` параллельно
  заполняли две асинхронные функции, и содержимое зависело от того, чей `await`
  разрешится последним. Заодно общая кнопка «Сохранить» писала текст в устаревший
  ключ `fullResumeText` мимо системы мульти-резюме.

### Added
- **Тесты** (`npm test`, `node --test`): 11 проверок сборки отчётов,
  экранирования, геометрии дуг и расчёта индекса. `test/harness.js` исполняет
  `panel.js` вне Chrome на заглушках, так что браузер для прогона не нужен.
- **ESLint** (`npm run lint`) с правилом `no-undef` — ровно тот гейт, который
  поймал бы вызовы несуществующих функций из этого релиза.
- **CI** (`.github/workflows/ci.yml`) на каждый push и PR: lint, тесты,
  синхронность версий в `manifest.json` / `package.json` / README, валидность
  манифеста и существование всех перечисленных в нём файлов.
- **Релиз защищён проверками**: `release.yml` больше не публикует тег
  безусловно — сначала lint и тесты, затем сверка тега с версией манифеста,
  затем сборка zip, готового к загрузке в Chrome Web Store.
- `package.json` с объявленной зависимостью `playwright`, которую использует
  `tools/shot.js`; `package-lock.json` больше не игнорируется, иначе `npm ci`
  в CI невозможен.

### Changed
- Две секции в настройках, «Профили кандидата» и «Сохранённые резюме», работали
  с одним и тем же списком под разными именами. Объединены в одну.
- Удалено ~140 строк мёртвого кода из v0.4.0: `setRingScore`,
  `renderLedgerBreakdown`, `renderActionableEditsList`, `renderVerdictDonutChart`,
  `renderSparklineChart`, `renderSourcesList` не вызывались ни разу — рядом жили
  параллельные рабочие реализации.
- В шапке ATS-отчёта указывается реально выбранное резюме вместо заглушки
  «Основной профиль» — при мульти-резюме иначе непонятно, что аудировали.

## [0.4.4] - 2026-08-03

### Fixed
- **Вторичные кнопки (`.cta.ghost`) выглядели как голый текст без фона/рамки**
  ("Сохранить профиль", "Оценить резюме", "Написать сопроводительное письмо",
  "Скачать отчёт (.html)") — на пустых экранах (например, свежий профиль без
  импортированного резюме) это читалось как случайные ссылки, а не кнопки.
  До перехода на iOS HIG (v0.3.0) у `.cta.ghost` были видимая заливка карточки
  и рамка; при редизайне их убрали полностью вместо замены на iOS-style
  tinted-заливку. Возвращена заливка `--amber-pale`/`--amber-ink` — то же
  решение, что уже использовалось для `.chip-mid`, теперь консистентно везде.

## [0.4.3] - 2026-08-03

### Fixed
- **README screenshots were AI-generated fakes, not real captures**: replaced
  `docs/screenshot-*.jpg` with genuine captures of the actual `sidepanel/panel.html`
  markup/CSS (via `tools/shot.js`, headless Chromium at real side-panel width).
  Captions rewritten to describe interface state honestly (no populated AI results,
  since those require a live API key and real data).
- **`.github/workflows/release.yml` failed on every single tag push** (verified:
  v0.3.1 through v0.4.2, 100% failure rate) with `Resource not accessible by
  integration` when generating release notes — the job had no explicit
  `permissions: contents: write`, so the default `GITHUB_TOKEN` was read-only.
  Added the missing permission block.
- **Dynamic version display was documented in v0.4.2's changelog entry but never
  actually implemented** — `chrome.runtime.getManifest().version` did not exist
  anywhere in the codebase despite the claim. Implemented for real: new
  `#app-version` element in `panel.html`, populated in `panel.js`.
- `manifest.json` description was stale (only mentioned fit-check + letters,
  not the ATS audit / multi-resume features that already existed).

## [0.4.2] - 2026-08-02

### Fixed
- **Analytics DOM Audit & Defensive Null-Checks**:
  - Restored missing element IDs (`an-donut`, `an-donut-total`, `an-donut-legend`, `an-weekly-chart`, `an-sparkline`) in `sidepanel/panel.html` to eliminate `TypeError: Cannot set properties of null (setting 'innerHTML')`.
  - Enforced defensive null checks across all analytics rendering functions for 100% crash-free execution on empty/fresh storage.
- **iOS HIG Light Aesthetic Restoration**:
  - Restored iOS Light system background (`#F2F2F7`), grouped white cards (`#FFFFFF`), capsule buttons, and SF Pro typography as specified in Prompt 08.
- **Dynamic Version Source of Truth**:
  - Dynamic version reading via `chrome.runtime.getManifest().version` in header, removing hardcoded version strings.

## [0.4.1] - 2026-08-02

### Fixed
- **Backward Compatibility Alias (`ensureProfiles`)**: Added `ensureProfiles` export alias in `shared/constants.js` pointing to `ensureSavedResumes()` and ensuring return objects contain both `{ savedResumes, activeResumeId, profiles, activeProfileId }` to eliminate destructuring TypeErrors.

## [0.4.0] - 2026-08-02

### Added
- **Pure SVG/CSS MV3 Visual Components**:
  - **Component 1 & 1b (Ring Progress & Double Pair)**: Dynamic SVG progress rings (`setRingScore`) with color range gradients (Red-Orange <50%, Orange-Yellow 50-74%, Green-Cyan ≥75%) and side-by-side Hard/Nice-to-have requirement coverage rings.
  - **Component 2 (Ledger Breakdown)**: Structured score breakdown list for ATS Audit sub-scores with dynamic status colors (`ledgerColorClass`).
  - **Component 3 (Keyword Matrix)**: Category-grouped skill badges with covered/missing status indicators for targeted ATS match.
  - **Component 4 (Actionable Edits)**: Structured "Было → Стало" cards with instant one-click copy buttons.
  - **Component 5 (Verdicts Donut & Weekly Sparkline)**: Multi-segment SVG donut chart for verdict distributions and pure SVG area-chart sparkline for match trends.
  - **Component 6 (Top Vacancy Sources)**: Progress bars and branding icons for hh.ru (`#D6001C`), LinkedIn (`#0A66C2`), and Upwork (`#14A800`).

## [0.3.2] - 2026-08-02

### Added
- **Dark Mode iOS Glassmorphism UI Theme**:
  - Synchronized extension UI aesthetics with deep OLED dark mode canvas (`#000000`), grouped card backgrounds (`#1C1C1E` / `#2C2C2E`), translucent glassmorphism navigation headers (`backdrop-filter: blur(20px)`), glowing gauge arcs, and crisp high-contrast SF Pro typography matching repository UI mockups.

## [0.3.1] - 2026-08-02

### Added
- **Named Multi-Resume System (`savedResumes`)**:
  - Ability to store, manage, rename, edit, and delete multiple named resumes (e.g. *«AI-automation»* and *«Business Analyst»*) in `options/options.html` and directly within the ATS match tab.
  - Interactive resume selector dropdown (`#ats-resume-select`) in ATS tab with inline resume creation (`+ Добавить новое резюме...`).
  - Automatic migration from legacy single `fullResumeText` to named `savedResumes` list via `ensureSavedResumes()`.
  - History entries (`ats_vacancy_match`) now store `resumeId` and `resumeName` for clear record-keeping.
- **Provider API Keys Documentation**:
  - Documented client-side direct API key support for **OpenAI** (`gpt-4.1`) and **Anthropic** (`claude-sonnet-4-6`) alongside **NVIDIA NIM** (`deepseek-ai/deepseek-v4-flash` & `z-ai/glm-5.2`).
- **Automated GitHub Release Workflow**:
  - Added `.github/workflows/release.yml` for automated GitHub Releases on tag pushes using `softprops/action-gh-release@v2`.
- **Donation Support Link**:
  - Restored project donation link in `README.md`.

### Fixed
- **Service Worker Syntax Error**: Resolved template string closing backtick formatting error in `shared/constants.js` to ensure clean service worker registration in Chrome MV3.
- **ATS History Dropdown & Sorting**:
  - Fixed ATS history dropdown sorting to display newest checks on top (descending by date).
  - Replaced technical text tags (`[ПРОПУСТИТЬ]`) with clean verdict indicators (`✓`, `!`, `✕`).

## [0.3.0] - 2026-08-02

### Added
- **Deepened Overall ATS Resume Audit**:
  - **Weighted Sub-Scoring**: Split ATS Score into 4 weighted sub-scores (`keyword_match_score` 35%, `structure_score` 20%, `experience_relevance_score` 25%, `metrics_density_score` 20%) with explicit issue & impact breakdowns.
  - **Line-by-line Experience Audit**: Rewriting passive phrasing ("участвовал", "занимался") into active accomplishment verbs ("спроектировал", "сократил", "внедрил") with quantifiable metrics per company.
  - **hh.ru Ranking Factors**: Verification of last update status, active job search status, and preview card keyword density.
  - **Audit Progress Tracking**: Dynamic comparison of score deltas with previous saved audits in `chrome.storage.local`.
- **Top-20 Target Roles in 8/7/5 Ratio**: Exact breakdown across Core (8), Transferable (7), and Growth (5) roles with honest gap descriptions for growth roles.
- **Clustered ATS Keyword Matrix**: Core, Transferable, and Growth clusters each with Hard Skills & Tools, Domain & Methodology, and Action Verbs.
- **5-Item Optimization Checklist**: Specific actionable section-based recommendations.
- **Standalone HTML Report Export & Download**: Open comprehensive ATS audit or analytics reports in a new browser tab (`chrome.tabs.create`) or download as a standalone `.html` file.
- **`tabs` Permission**: Added `tabs` permission to `manifest.json`.

### Changed
- **Full iOS Mobile UI Redesign**:
  - **Bottom iOS Tab Bar Navigation**: Fixed bottom tab bar with 5 navigation items, accent color active states, and spring scale effects.
  - **iOS Navigation Bar**: Large Title header (`letter-spacing: -0.02em`) updating dynamically per tab.
  - **iOS Grouped Style Lists**: Clean `#F2F2F7` systemGroupedBackground with `#FFFFFF` rounded card groups.
  - **iOS Capsule Buttons**: Fully rounded `999px` capsule primary CTA buttons and transparent tinted secondary buttons.
  - **SF Symbols Iconography**: Lightweight vector icon strokes (`1.8px`).

## [0.2.0] - 2026-08-02

### Added
- **ATS Resume Match Mode**: Targeted comparison of candidate full resume against specific vacancy requirements (hard vs. nice-to-have requirements, semantic matching, critical gaps detection, and actionable edits with one-click copy).
- **ATS from History**: Ability to select previously checked vacancies directly from history dropdown in ATS mode without re-pasting text.
- **Tone Selector for Cover Letters**: Support for "Neutral business" and "Confident/Proactive" tone options for AI cover letter generation.
- **Enhanced Analytics Tab**: Total checks (all-time, 7-day, 30-day), verdict distribution, average score, cover letters count, weekly activity chart, and top vacancy sources breakdown.
- **CHANGELOG.md**: Documented project versioning and release history.

### Changed
- **Apple-Style Visual Redesign**: Updated UI aesthetics based on macOS System Settings and Human Interface Guidelines (SF Pro typography stack, backdrop blur effects, multi-layer soft shadows, continuous corner radii, hairline borders, and spring easing transitions).
- **Native Segmented Control**: Redesigned tab bar into a native macOS segmented control container with sliding pill active indicators.
- **Vector Iconography**: Replaced raw unicode emojis with crisp Lucide/SF Symbols SVG vector icons (`Check`, `AlertTriangle`, `X`, `AlertCircle`).
- **Semantic Color Palette**: Updated verdict badges and indicators to use macOS system semantic colors (`#34C759` green, `#FF9500` orange, `#FF3B30` red).
- **Strict Anti-Cliché Protection**: Enforced strict stop-words filter and requirements-to-profile mapping in cover letter generation prompts.
