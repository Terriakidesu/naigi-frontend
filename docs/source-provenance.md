# Imported source provenance

Imported on 2026-10-01 from the **working trees**, including uncommitted changes.
The reconciliation inventory records the initial comparisons and consumer HEADs.
Neither consumer was edited, and their old frontend source remains intact.

## Web baseline

Source: `Z:\dev\bun\priv-chat\client\` (server version 0.24.0).

- TypeScript and colocated tests moved to `src/`, HTML to `pages/`, static files
  and all 4,011 assets to `public/`, CSS to `styles/`.
- Excluded the 17 `instance-*` admin files. Admin CSS still present in the shared
  stylesheet and unused admin helpers/types in the original `api.ts` are retained
  for now rather than deleting unrelated shared definitions blindly. No admin
  page or console entrypoint is built here.
- Kept web recovery events, machine refresh and WASM result disposal, precise
  recovery feedback, diagnostic controls, approval wording, and cleanup logic.
- Copied the original MIT license and Twemoji attribution/license files.
- Migrated all 29 existing test imports from `bun:test` to Vitest.

## Selective desktop changes

Source: `D:\Dev\naigi\naigi-ui\frontend\client\` (shell version 0.2.2).

- Recovery unlock form, visible states, Enter submission, and in-flight attempt
  deduplication, extracted into a testable controller with reset support.
- Search placed in right-hand chat actions, with an accessible input label and
  non-shrinking action group. Existing narrow-screen search overlay is retained.
- About/version/license disclosure UI, generalized to both platforms and a
  separately versioned frontend; optional desktop version only on desktop.
- Manual file-backup `</details>` moved to its correct location (the web baseline
  closed it after the local-data content).
- Public-server origin handling for room links, recovery diagnostics/pairing,
  and internal links; guarded async realtime acquisition through the adapter.
- Custom title-bar renderer/styles, included only in the desktop build. The
  shell still decides whether native policy enables that renderer.

## New shared-repository work

- npm lockfile, TypeScript check, Node-compatible Vitest runner, explicit build
  targets, generated version metadata, and production-graph license notices.
- `PlatformAdapter` has only platform kind, versions, server origin, and realtime
  URL. Electron and native capabilities were not imported.
- Frontend version starts at **0.1.0**; this is not a backend or shell version.
- A patched Vitest version is used. The inherited Firebase dependency graph's
  gRPC package is overridden to a patched compatible 1.x version; no TLS trust
  behavior is loosened and the browser uses Firebase messaging, not Firestore.

Consumer integration, live encrypted messaging checks, CI, release tags, and old
source removal remain subsequent work.
