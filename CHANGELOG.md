# Changelog

## [Unreleased]

## 0.1.2 — 2026-10-01

### Fixed

- Joining a voice room already active on another device now asks before transferring voice to this device. Cancelling leaves the existing connection untouched, and the replaced device stops automatic rejoining.
- Delayed roster departures from a replaced device no longer hide the new connection.

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
