# Changelog

All notable changes to Job Fit Copilot will be documented in this file.

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
