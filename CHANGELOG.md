# Changelog

All notable changes to Job Fit Copilot will be documented in this file.

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
