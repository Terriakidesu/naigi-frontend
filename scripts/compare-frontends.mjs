import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const [webRoot, desktopRoot] = process.argv.slice(2);
if (!webRoot || !desktopRoot) {
  console.error("Usage: node scripts/compare-frontends.mjs <web-client> <desktop-client>");
  process.exit(1);
}

async function inventory(root, desktop = false, prefix = "", files = new Map()) {
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      await inventory(root, desktop, `${relative}/`, files);
    } else if (entry.isFile()) {
      const logical = desktop ? relative.replace(/^(src|pages|public)\//, "") : relative;
      if (files.has(logical)) throw new Error(`Duplicate logical path: ${logical}`);
      files.set(logical, path.join(root, relative));
    }
  }
  return files;
}

const [web, desktop] = await Promise.all([
  inventory(path.resolve(webRoot)),
  inventory(path.resolve(desktopRoot), true),
]);
const identical = [];
const lineEndingsOnly = [];
const changed = [];
const decoder = new TextDecoder("utf-8", { fatal: true });
for (const logical of [...web.keys()].sort()) {
  if (!desktop.has(logical)) continue;
  const [left, right] = await Promise.all([
    readFile(web.get(logical)),
    readFile(desktop.get(logical)),
  ]);
  if (left.equals(right)) {
    identical.push(logical);
    continue;
  }
  try {
    if (decoder.decode(left).replace(/\r\n/g, "\n") === decoder.decode(right).replace(/\r\n/g, "\n")) {
      lineEndingsOnly.push(logical);
      continue;
    }
  } catch {
    // Non-UTF-8 assets are compared byte-for-byte, never normalized.
  }
  changed.push(logical);
}
const webOnly = [...web.keys()].filter((name) => !desktop.has(name)).sort();
const desktopOnly = [...desktop.keys()].filter((name) => !web.has(name)).sort();
console.log(JSON.stringify({
  roots: { web: path.resolve(webRoot), desktop: path.resolve(desktopRoot) },
  counts: {
    web: web.size,
    desktop: desktop.size,
    identical: identical.length,
    lineEndingsOnly: lineEndingsOnly.length,
    changed: changed.length,
    webOnly: webOnly.length,
    desktopOnly: desktopOnly.length,
  },
  changed,
  webOnly,
  desktopOnly,
  lineEndingsOnly,
  identical,
}, null, 2));
