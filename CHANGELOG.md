# Changelog

## [Unreleased]

## 0.1.1 — 2026-10-01

### Fixed

- Replaced font-based UI symbols with SVG icons in theme previews, close buttons, attachments, media playback, external-link dialogs, and space-management controls.
- Render dynamically created Lucide icons immediately, without waiting for a page-wide icon conversion.
- Removed font-dependent symbols from role expand/collapse and submenu indicators.
- Added regression tests for dynamic SVG icons and static icon rendering.

## 0.1.0 — 2026-10-01

### Added

- Shared web and desktop frontend with platform adapters, npm validation, and separate build targets.
- Reconciled web recovery behavior and desktop UI improvements; see `docs/source-provenance.md`.
