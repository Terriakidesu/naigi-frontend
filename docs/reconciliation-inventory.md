# Frontend reconciliation inventory

Snapshot: 2026-10-01, taken before source import. This document records the original
comparison. Source has since been imported here; see `source-provenance.md` for
applied changes. Neither consumer has been modified or had source removed.

## Sources and provenance

| Source | Working tree | HEAD | Application version |
| --- | --- | --- | --- |
| Web (baseline) | `Z:\dev\bun\priv-chat\client\` | `888d4f141f65d9ce2d5b1a9ff2d42fc62d7376c5` | `0.24.0` |
| Desktop (selective UX donor) | `D:\Dev\naigi\naigi-ui\frontend\client\` | `770d23b717e54210ddd994fa950af517b89d4d7b` | `0.2.2` |

These are **working-tree comparisons, not just comparisons of committed HEADs**.
Both consumers contain uncommitted work. In particular, the web recovery changes
and desktop About/title-bar changes must not be lost by exporting HEAD alone.
Recheck this inventory before importing source; consumer HEADs do not uniquely
identify this snapshot. No frontend release version has been assigned yet.

## Comparison method and totals

Desktop `src/`, `pages/`, and `public/` prefixes are stripped for logical path
matching; `styles/` is kept. All assets are included. Text comparisons normalize
CRLF to LF but otherwise preserve whitespace; binary assets compare byte-for-byte.

| Category | Files |
| --- | ---: |
| Web tree | 4,142 |
| Desktop tree | 4,126 |
| Common files | 4,124 |
| Common files matching after line-ending normalization | 4,112 |
| Common files with other differences | 12 (11 source files + 1 license whitespace difference) |
| Web-only files | 18 |
| Desktop-only files | 2 |

Each tree includes 4,011 assets. Of these, 4,007 are byte-identical; the remaining
three differ only in line endings: `assets/twemoji/1f34b-200d-1f7e9.svg`,
`assets/twemoji/1f921.svg`, and `assets/twemoji/NOTICE.txt`. The fourth,
`assets/twemoji/LICENSE-GRAPHICS`, also has one trailing space removed in the
desktop copy (line 52). There are no asset additions/removals or substantive
artwork/license-text differences between the current trees. Keep the web assets.

Reproduce the full file-level inventory using Node.js (no installed dependencies):

```powershell
node scripts/compare-frontends.mjs "Z:\dev\bun\priv-chat\client" "D:\Dev\naigi\naigi-ui\frontend\client"
```

The JSON includes every identical, changed, unique, and line-ending-only path.
For a content diff, use `git diff --no-index --ignore-space-at-eol` with the
corresponding physical paths. Exit code 1 from that command means differences.

## Per-file merge decisions

Paths below are logical web-baseline paths, before relocation into the shared layout.

| File | Difference | Reconciliation decision |
| --- | --- | --- |
| `chat.html` | Desktop moves search into the right-hand actions, adds its input's accessible name, and loads `/desktop.js`. | Port the search markup/accessibility improvement. Select the desktop renderer only for the desktop build; do not insert its script into web output. Ignore incidental indentation. |
| `crypto.ts` | Web adds recovery-change subscriptions, machine reloads, the `notify` import argument, WASM result disposal, and loads recovery even when initial to-device synchronization is disabled. | Keep web in full. None of the desktop deletions are required for its UI improvements. |
| `external-link.ts` | Desktop recognizes the connected server's public origin and routes its links back into the local app. | Preserve external-link confirmation; adapt connected-origin lookup through the platform interface. Keep local-app navigation distinct from external navigation. |
| `history-recovery-settings.ts` | Web gives precise imported-key feedback; desktop resolves pairing links against the connected server rather than the local app origin. | Keep web feedback and key-availability guidance; use adapter origin for pairing-link creation and validation. |
| `local-data.ts` | Web removes the `naigi.history-keys.<userId>` notification during cleanup. | Keep web cleanup alongside web recovery events. |
| `main.ts` | Desktop adds connected-origin room links/message-link resolution and asynchronous bridge-based realtime setup with a connection-attempt guard. Web additionally refreshes open history on `naigi:history-keys-ready`. | Keep web history refresh. Port origin handling and guarded asynchronous realtime through the adapter, not direct bridge access. |
| `settings.html` | Desktop adds explicit recovery unlock, a hidden desktop-only About section, license disclosures, and the missing manual-backup `</details>`. It also weakens the device-approval checkbox wording. | Port unlock form/status and closing-tag fix. Make About shared, with frontend/server versions and an optional desktop version. Preserve web's requirement that the approving device can read the desired messages. |
| `settings.ts` | Desktop wraps recovery unlock with form submission, visible pending/success/failure states, and a shared in-flight promise. | Port the UI/promise behavior onto web's initialization path; cover lifecycle reset after clearing local data as well as concurrent attempts. |
| `styles/conversation.css` | Desktop makes `.chat-actions` non-shrinking. | Port with search markup; verify overflow at narrow and intermediate widths. |
| `styles/navigation.css` | Desktop adds version-panel and custom title-bar styling. | Move shared About styling into shared styles. Keep title-bar activation desktop-only. |
| `styles/pages.css` | Desktop adds recovery form layout, a 600px stacked-controls breakpoint, and license disclosure styling. | Port shared styles; retain existing web styles until admin-specific CSS has been classified. |

## Web-only files

- **Keep and migrate:** `history-recovery-events.ts`. It sends only user/source/change
  identifiers through local storage and same-page events, not messages, room keys,
  exports, or passphrases. It supports same-page/cross-tab recovery refresh.
- **Leave in the server repository initially:** `instance-admin-dashboard.ts`,
  `instance-admin-login.html`, `instance-admin-login.ts`,
  `instance-admin-theme-init.js`, `instance-admin-theme.ts`, `instance-admin.html`,
  `instance-admin.ts`, `instance-maintenance.html`, `instance-maintenance.ts`,
  `instance-operations.html`, `instance-operations.ts`, `instance-operators.html`,
  `instance-operators.ts`, `instance-spaces.html`, `instance-spaces.ts`,
  `instance-users.html`, and `instance-users.ts`.

The server build currently bundles both user pages and admin pages. Consumer
integration must continue building/serving the admin console independently.
`styles/pages.css` also contains admin rules; excluding admin entrypoints does not
by itself disentangle that stylesheet.

## Desktop-only files and security boundary

- `desktop-context.ts`: current bridge types and cached `getInfo()` result. Replace
  shared consumers with `src/platform/types.ts`, `web.ts`, and `desktop.ts`.
- `desktop.ts`: combines custom title-bar rendering with About/version/license UI.
  Split shared About from the optional desktop renderer.

The current chat preload exposes only `getInfo()` and `getRealtimeUrl()`.
`getInfo()` returns `appVersion`, nullable `serverVersion`, `serverOrigin`, and
optional `customTitleBar`. Map the first two to the new adapter's desktop/server
versions; obtain `clientVersion` from the shared frontend build metadata.

The small shared adapter must not grow a general IPC, fetch/proxy, cookie,
certificate, or window-management API. Electron imports, IPC sender/URL validation,
cookie forwarding, realtime proxying, protocol serving, native title-bar policy,
certificate trust, and packaging remain in `naigi-ui`. The renderer may use the
existing narrow bridge only in the desktop target. Do not silently fall back to
the local desktop page origin when required bridge data is unavailable.

The shell currently injects `/desktop.js` into served HTML if absent. Coordinate
this with the explicit desktop build so it neither loads twice nor becomes the
mechanism selecting platform behavior in shared code.

## Tooling, versions, licenses, and test migration

- Web `scripts/build-client.ts` uses `Bun.build`/`Bun.write` and combines admin/user
  entrypoints. Desktop `scripts/build-frontend.mjs` already uses Node/esbuild and
  the desired source separation, but targets Chrome 140 and has no shared
  frontend metadata. Choose browser support explicitly rather than blindly
  inheriting an Electron-only target.
- Both builds copy Matrix crypto WASM and the LiveKit E2EE worker and bundle the
  voice audio worklet. Preserve their existing URL contracts, including
  `/assets/matrix_sdk_crypto_wasm_bg.wasm` and `/livekit-e2ee-worker.mjs`.
- The public server API is `/v1/version`; desktop already probes it and handles
  older servers without version metadata. About must show unavailable server
  information gracefully and distinguish frontend, server, and shell versions.
- Web/desktop use the same declared versions of Matrix crypto, Firebase, GIF
  tooling, LiveKit client, and QRCode. Lucide differs (`^1.48.0` vs `^1.49.0`);
  review before pinning the shared lockfile. Server-only Elysia/LiveKit server SDK
  and desktop-only Electron/packaging dependencies do not belong in shared UI.
- All 29 existing frontend `*.test.ts` files match between the trees and import
  `bun:test`; the desktop's `node --test test/*.test.cjs` command does not execute
  them. Migrate imports/assertions and run them in a Node-compatible runner.
- The desktop notice collector walks all installed top-level dependencies,
  including Electron/build tooling. Do not copy that scope unchanged: generate
  shared frontend notices separately from shell-specific notices. Include the
  existing Twemoji attribution and graphics license as well as the project license.
- Preserve shared utility, crypto, media, settings, messaging, and voice modules
  that already match. Do not replace directories wholesale.

## Required validation before removing duplicate source

1. Recovery unlock: success, wrong passphrase, empty input, Enter submission,
   concurrent unlock/restore/export attempts, retry, and reset after local-data clear.
2. Recovery import: new/earlier keys, zero new keys, WASM result cleanup, same-tab
   and cross-tab refresh, and initialization with `syncToDevice: false`.
3. Device approval: public-server origin matching, expired/mismatched transfers,
   verification wording, and no secret retention in URLs.
4. Search: right alignment, accessible input, open/close behavior, and no overflow
   at 320/375/600/760px and intermediate desktop widths. Existing shared responsive
   CSS places search absolutely below 760px; the desktop addition alone is not
   proof that layout works.
5. About: hash navigation on both targets, distinct version labels, unavailable
   metadata, lazy license loading/retry, and desktop title-bar isolation.
6. Both build targets: correct adapter, no Node/Electron imports in browser
   bundles, pages/assets/notices/metadata, WASM and both voice-worker loads.
7. With a running backend: sign-in/out, local unlock/store initialization,
   realtime/reconnect, conversation loading, encrypted messaging, backup/recovery,
   and device approval. Mocked browser checks do not establish live compatibility.

## Planned implementation boundary at inventory time

Import the **current web working tree** into shared `src/`, `pages/`, `styles/`,
and `public/`, excluding the admin files above; then selectively apply the desktop
changes listed here. Establish npm checks/tests before consumer integration.
Preserve both consumers' old source until live validation passes. Submodule pins,
consumer scripts, source removal, CI, and releases are subsequent phases, not
outcomes of this inventory. Source import and standalone npm tooling have since
been completed here; see `source-provenance.md` for the applied reconciliation.
