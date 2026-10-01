import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, transform } from "esbuild";
import { generateLicenseNotices } from "./generate-license-notices.mjs";

const target = process.argv[2];
if (target !== "web" && target !== "desktop" && target !== "mobile") {
  console.error("Usage: node scripts/build.mjs <web|desktop|mobile>");
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".build", target);
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const entries = ["auth", "register", "unlock", "main", "new", "settings", "server-settings", "voice-audio-worklet"];
if (target === "desktop") entries.push("desktop");
const styles = ["base", "navigation", "conversation", "composer", "profile-editor", "pages", "responsive", "controls", "space-settings"];
if (target === "desktop") styles.push("desktop");
// The mobile app bundles the shared pages and adds phone-sized composer sheets.
if (target === "mobile") styles.push("mobile");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: entries.map((entry) => `src/${entry}.ts`),
  outdir: output,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  alias: { "#platform": path.join(root, "src", "platform", `${target}.ts`) },
  define: { __FRONTEND_VERSION__: JSON.stringify(pkg.version) },
  entryNames: "[name]",
  chunkNames: "chunks/[name]-[hash]",
  assetNames: "assets/[name]-[hash]",
  publicPath: "/",
  minify: true,
  legalComments: "linked",
  metafile: true,
});
if (target === "web" && Object.keys(result.metafile.inputs).some((name) => name === "src/platform/desktop.ts" || name === "src/desktop.ts")) {
  throw new Error("Desktop renderer leaked into web build.");
}
if (target !== "mobile" && Object.keys(result.metafile.inputs).some((name) => name === "src/platform/mobile.ts")) {
  throw new Error("Mobile platform adapter leaked into a non-mobile build.");
}
if (target !== "mobile") {
  // Mobile-only modules must exist as separate chunks that nothing loads eagerly.
  const mobileChunks = new Set(Object.entries(result.metafile.outputs)
    .filter(([, output]) => Object.keys(output.inputs ?? {}).some((name) => /^src\/mobile-[a-z-]+\.ts$/.test(name)))
    .map(([file]) => file));
  if (mobileChunks.size === 0) throw new Error("Expected lazily loaded mobile shell chunks.");
  for (const [file, output] of Object.entries(result.metafile.outputs)) {
    for (const imported of output.imports ?? []) {
      if (mobileChunks.has(imported.path) && imported.kind !== "dynamic-import") {
        throw new Error(`Mobile shell code is eagerly loaded by ${file}.`);
      }
    }
  }
}

for (const page of await readdir(path.join(root, "pages"))) {
  let html = await readFile(path.join(root, "pages", page), "utf8");
  if (target === "desktop") html = html.replace("</body>", '<script type="module" src="/desktop.js"></script>\n  </body>');
  await writeFile(path.join(output, page), html);
}
const css = (await Promise.all(styles.map((name) => readFile(path.join(root, "styles", `${name}.css`), "utf8")))).join("\n");
const compiledCss = await transform(css, { loader: "css", minify: true, legalComments: "inline" });
await writeFile(path.join(output, "app.css"), compiledCss.code);
await cp(path.join(root, "public"), output, { recursive: true });
await cp(path.join(root, "LICENSE"), path.join(output, "LICENSE"));
await cp(path.join(root, "node_modules", "@matrix-org", "matrix-sdk-crypto-wasm", "pkg", "matrix_sdk_crypto_wasm_bg.wasm"),
  path.join(output, "assets", "matrix_sdk_crypto_wasm_bg.wasm"));
await cp(path.join(root, "node_modules", "livekit-client", "dist", "livekit-client.e2ee.worker.mjs"),
  path.join(output, "livekit-e2ee-worker.mjs"));
await writeFile(path.join(output, "version.json"), JSON.stringify({ name: "naigi-frontend", version: pkg.version, target }, null, 2) + "\n");
await writeFile(path.join(output, "third-party-licenses.txt"), await generateLicenseNotices(root));
console.log(`Built Naigi frontend ${pkg.version} (${target}) in .build/${target}/`);
