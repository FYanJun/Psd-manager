import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { transformWithEsbuild } from "vite";

const moduleCache = new Map();
const compiledLibDir = fileURLToPath(new URL("../../node_modules/.cache/psd-manager-smoke-lib/", import.meta.url));
const sourceLibDir = fileURLToPath(new URL("../../src/lib/", import.meta.url));
let compilePromise = null;

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
  if (compilePromise) return compilePromise;

  compilePromise = (async () => {
    rmSync(compiledLibDir, { force: true, recursive: true });
    mkdirSync(compiledLibDir, { recursive: true });
    const files = collectTypeScriptFiles(sourceLibDir);

    await Promise.all(files.map(async (file) => {
      const sourcePath = join(sourceLibDir, file);
      const outputPath = join(compiledLibDir, file.replace(/\.ts$/, ".mjs"));
      const transformed = await transformWithEsbuild(readFileSync(sourcePath, "utf8"), sourcePath, {
        format: "esm",
        loader: "ts",
        sourcemap: false,
      });
      const code = rewriteRelativeImports(transformed.code);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, code);
    }));

    moduleCache.set("__compiled_lib__", true);
  })();

  try {
    await compilePromise;
  } finally {
    compilePromise = null;
  }
}

function collectTypeScriptFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(prefix, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(join(directory, entry.name), relativePath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [relativePath] : [];
  });
}

function rewriteRelativeImports(code) {
  return code.replace(/(from\s+["']|import\(\s*["'])(\.[^"']+)(["'])/g, (_match, prefix, specifier, suffix) => {
    if (/\.(?:mjs|js|json)$/.test(specifier)) return `${prefix}${specifier}${suffix}`;
    return `${prefix}${specifier}.mjs${suffix}`;
  });
}
