# Naigi frontend agent notes

- Use Node.js 22.12+ and npm, not Bun. Run `npm ci`, `npm run check`, `npm test`,
  `npm run build:web`, and `npm run build:desktop` when validating frontend work.
- Shared user-facing TypeScript lives in `src/`, HTML in `pages/`, CSS in
  `styles/`, and static files in `public/`. Existing utility tests are colocated;
  integration-oriented tests live in `tests/`. Never edit generated `.build/`.
- `#platform` selects `src/platform/web.ts` or `desktop.ts` at build time.
  Shared code must use the small `PlatformAdapter`, not direct IPC or Electron.
- Keep Electron windows, native policy, preload security, cookies/proxying,
  certificate trust, and packaging in `naigi-ui`. No Node/Electron imports in
  browser bundles, arbitrary IPC/proxy methods, TLS bypasses, or persisted
  plaintext messages/encryption passphrases.
- The instance-admin console remains in the server repository. Do not remove
  either consumer's old frontend until integration and live validation pass.
- Keep project and Twemoji licenses/attribution. Shared dependency notices must
  not include Electron-specific dependency inventories.
- Preserve current web recovery behavior; consult `docs/reconciliation-inventory.md`
  and `docs/source-provenance.md` before applying differences from old consumers.
