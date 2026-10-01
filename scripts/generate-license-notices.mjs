import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

async function findPackage(name, from) {
  let directory = from;
  while (true) {
    const candidate = path.join(directory, "node_modules", name);
    try {
      await readFile(path.join(candidate, "package.json"));
      return candidate;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`Dependency not installed: ${name}`);
    directory = parent;
  }
}

// Follow the shared frontend's production dependency graph, not every installed
// package. Electron and consumer build tools never enter this notice list.
export async function generateLicenseNotices(root) {
  const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const visited = new Set();
  const notices = [];
  async function visit(name, from, optional = false) {
    let directory;
    try { directory = await findPackage(name, from); }
    catch (error) { if (optional) return; throw error; }
    if (visited.has(directory)) return;
    visited.add(directory);
    const pkg = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    const texts = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!/^(license|licence|copying|notice)(\.|$|-)/i.test(entry.name)) continue;
      if (entry.isFile()) texts.push(`${entry.name}\n${await readFile(path.join(directory, entry.name), "utf8")}`);
      else if (entry.isDirectory()) {
        for (const child of await readdir(path.join(directory, entry.name), { withFileTypes: true })) {
          if (child.isFile()) texts.push(`${entry.name}/${child.name}\n${await readFile(path.join(directory, entry.name, child.name), "utf8")}`);
        }
      }
    }
    notices.push(`${pkg.name} ${pkg.version}\nLicense: ${typeof pkg.license === "string" ? pkg.license : "See package notices"}\n${texts.join("\n\n")}`);
    const optionalNames = new Set(Object.keys(pkg.optionalDependencies ?? {}));
    for (const dep of Object.keys(pkg.dependencies ?? {}).sort()) await visit(dep, directory, optionalNames.has(dep));
    for (const dep of [...optionalNames].sort()) await visit(dep, directory, true);
  }
  for (const dep of Object.keys(metadata.dependencies ?? {}).sort()) await visit(dep, root);
  return "Third-party frontend package notices\nShared frontend production dependencies only; desktop shell notices are supplied separately.\n\n"
    + notices.sort().join(`\n\n${"=".repeat(72)}\n\n`) + "\n";
}
