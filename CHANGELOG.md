# Changelog

All notable changes to Job Fit Copilot will be documented in this file.

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
