# Naigi frontend

Shared user-facing frontend for the Naigi web server and Electron desktop app.
The source is based on the current web client with selectively reconciled desktop
UX improvements. The instance-admin console stays in the server repository.

## Setup and verification

Requires Node.js 22.12+ and npm. Bun is not required.

```sh
npm ci
npm run check
npm test
npm run build:web
npm run build:desktop
```

Both builds use the same UI source and produce ignored `.build/web/` and
`.build/desktop/` directories. Each contains bundled JavaScript/CSS, HTML pages,
static assets, Matrix crypto WASM, the LiveKit worker and voice worklet, frontend
version metadata, and license notices. `package.json` defines the frontend's own
version, independent of the backend and desktop shell.

## Layout

- `src/`: chat, authentication, settings, crypto/recovery, media, and voice code.
- `src/platform/`: the small platform interface and explicit target adapters.
- `pages/`, `styles/`, `public/`: shared templates, CSS, and static assets.
- `scripts/`: Node builds, production dependency notices, and source comparison.
- `tests/`: shared UI and platform tests; original utility tests also live in `src/`.
- `docs/`: reconciliation inventory and source provenance.

## Platforms and security

The web target uses the browser origin, `/v1/realtime`, and `/v1/version`.
The desktop target requires the shell's narrow `window.naigiDesktop` bridge
(`getInfo()` and `getRealtimeUrl()`). Desktop output cannot be used as an ordinary
web deployment without that bridge. Only the desktop build loads the optional
title-bar renderer; native window policy remains in the shell.

Electron imports, arbitrary IPC, API/cookie proxying, certificate trust, and
packaging do not belong here. Messages remain encrypted in persistent caches,
and this migration does not add storage of plaintext messages or passphrases.

## Consumer integration status

Source import and standalone builds are established here. Consumer submodules
and build scripts have **not** been changed, and old consumer sources remain.
The server must preserve its existing page/API/asset paths and build its admin
console separately. The desktop shell should consume the desktop output into
its existing `.build/frontend/` directory and provide its additional licenses.

Before removing duplicates, validate both applications against a running backend:
sign-in/out, local unlock, encrypted store initialization, realtime, conversations,
encrypted messaging, backups/recovery/device approval, and voice/WASM loading.
Unit tests do not substitute for those live integration checks.

When pinned submodule integration is added, clone consumers using
`git clone --recurse-submodules <application-repository>`; initialize existing
checkouts using `git submodule update --init --recursive`.

## Licenses

Project code: MIT (`LICENSE`). Twemoji artwork and attribution notices are in
`public/assets/twemoji/`. Build output includes production frontend dependency
notices; desktop shell dependencies must be acknowledged separately.
