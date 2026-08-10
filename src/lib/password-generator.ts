import { sanitizeAsciiSymbols, sanitizePasswordInput } from "./input-validation";

export type GeneratorOptions = {
  length: number;
  useUpper: boolean;
  useLower: boolean;
  useNumbers: boolean;
  useSymbols: boolean;
  excludeSimilar: boolean;
  preventRepeats: boolean;
  minimumNumbers: number;
  minimumSymbols: number;
  allowedSymbols: string;
  excludedCharacters: string;
};

export function uniqueChars(value: string) {
  return Array.from(new Set(value.split(""))).join("");
}

export function normalizeGeneratorLength(length: number) {
  return Math.min(24, Math.max(3, Number.isFinite(length) ? Math.round(length) : 8));
}

export function getGeneratorGroups(options: GeneratorOptions) {
  const customExcludes = new Set(
    `${sanitizePasswordInput(options.excludedCharacters)}${options.excludeSimilar ? "0O1Il|`'" : ""}`.split("")
  );
  const filter = (source: string) =>
    uniqueChars(
      source
        .split("")
        .filter((char) => !customExcludes.has(char))
        .join("")
    );

  return [
    { key: "upper", chars: options.useUpper ? filter("ABCDEFGHIJKLMNOPQRSTUVWXYZ") : "" },
    { key: "lower", chars: options.useLower ? filter("abcdefghijklmnopqrstuvwxyz") : "" },
    { key: "numbers", chars: options.useNumbers ? filter("0123456789") : "" },
    { key: "symbols", chars: options.useSymbols ? filter(sanitizeAsciiSymbols(options.allowedSymbols)) : "" },
  ].filter((group) => group.chars.length > 0);
}

function randomIndex(max: number) {
  if (!Number.isInteger(max) || max <= 0) throw new Error("随机字符池不能为空");
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / max) * max;
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return values[0] % max;
}

function pickFrom(source: string, previous = "", preventRepeats = false) {
  if (source.length === 0) return "";
  if (!preventRepeats || source.length === 1) return source[randomIndex(source.length)];
  const candidates = source.split("").filter((char) => char !== previous);
  return (candidates.length > 0 ? candidates : source.split(""))[randomIndex(candidates.length || source.length)];
}

function shuffleValues<T>(values: T[]) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function buildPasswordWithoutAdjacentRepeats(sources: string[]) {
  const uniqueSources = Array.from(new Set(sources));
  const counts = uniqueSources.map((source) => sources.filter((candidate) => candidate === source).length);
  const failedStates = new Set<string>();
  // Bound the search so an impossible custom pool cannot stall the drawer.
  let exploredStates = 0;
  const maxStates = 20_000;

  function build(remaining: number[], previous: string): string[] | null {
    if (remaining.every((count) => count === 0)) return [];
    exploredStates += 1;
    if (exploredStates > maxStates) return null;
    const stateKey = `${remaining.join(",")}:${previous}`;
    if (failedStates.has(stateKey)) return null;
    const sourceIndexes = shuffleValues(
      uniqueSources.map((_source, index) => index).filter((index) => remaining[index] > 0),
    );

    for (const sourceIndex of sourceIndexes) {
      const source = uniqueSources[sourceIndex];
      const candidates = shuffleValues(source.split("").filter((char) => char !== previous));
      for (const candidate of candidates) {
        const nextRemaining = [...remaining];
        nextRemaining[sourceIndex] -= 1;
        const suffix = build(nextRemaining, candidate);
        if (suffix) return [candidate, ...suffix];
      }
    }
    failedStates.add(stateKey);
    return null;
  }

  return build(counts, "");
}

export function generatePasswordValue(options: GeneratorOptions) {
  const length = normalizeGeneratorLength(options.length);
  const groups = getGeneratorGroups(options);
  const pool = groups.map((group) => group.chars).join("");

  if (!pool) return "";

  const numbers = groups.find((group) => group.key === "numbers")?.chars ?? "";
  const symbols = groups.find((group) => group.key === "symbols")?.chars ?? "";
  const requiredNumbers = numbers ? Math.min(options.minimumNumbers, length) : 0;
  const requiredSymbols = symbols ? Math.min(options.minimumSymbols, length - requiredNumbers) : 0;
  const sources = [
    ...Array.from({ length: requiredNumbers }, () => numbers),
    ...Array.from({ length: requiredSymbols }, () => symbols),
    ...Array.from({ length: length - requiredNumbers - requiredSymbols }, () => pool),
  ];

  if (options.preventRepeats) {
    const constrained = buildPasswordWithoutAdjacentRepeats(sources);
    if (constrained) return constrained.join("");
  }

  return shuffleValues(sources.map((source, index) => pickFrom(source, sources[index - 1], false))).join("");
}
