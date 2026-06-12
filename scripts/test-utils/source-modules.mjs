import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transformWithEsbuild } from "vite";

const moduleCache = new Map();
const compiledLibDir = join(tmpdir(), "device-password-manager-smoke-lib");

export async function importSourceModule(relativePath) {
  const cacheKey = relativePath;
  if (moduleCache.has(cacheKey)) return moduleCache.get(cacheKey);

  await compileLibModules();
  const moduleFile = relativePath.replace(/^lib\//, "").replace(/\.ts$/, ".mjs");
  const moduleUrl = new URL(moduleFile, `file://${compiledLibDir}/`).href;
  const importedModule = await import(moduleUrl);
  moduleCache.set(cacheKey, importedModule);
  return importedModule;
}

async function compileLibModules() {
  if (moduleCache.has("__compiled_lib__")) return;

  rmSync(compiledLibDir, { force: true, recursive: true });
  mkdirSync(compiledLibDir, { recursive: true });
  const libDir = new URL("../../src/lib/", import.meta.url);
  const files = readdirSync(libDir).filter((file) => file.endsWith(".ts"));

  await Promise.all(files.map(async (file) => {
    const sourceUrl = new URL(file, libDir);
    const transformed = await transformWithEsbuild(readFileSync(sourceUrl, "utf8"), sourceUrl.pathname, {
      format: "esm",
      loader: "ts",
      sourcemap: false,
    });
    const code = transformed.code.replace(/from "(\.[^"]+)"/g, (match, specifier) => {
      if (specifier.endsWith(".mjs")) return match;
      return `from "${specifier}.mjs"`;
    });
    writeFileSync(join(compiledLibDir, file.replace(/\.ts$/, ".mjs")), code);
  }));

  moduleCache.set("__compiled_lib__", true);
}
