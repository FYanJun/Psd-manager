import type { GeneratorPreset } from "./types";

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

export type GeneratorPresetOptions = GeneratorOptions & {
  preset: GeneratorPreset;
};

export function uniqueChars(value: string) {
  return Array.from(new Set(value.split(""))).join("");
}

export function normalizeGeneratorLength(length: number) {
  return Math.min(24, Math.max(3, Number.isFinite(length) ? Math.round(length) : 8));
}

export function applyGeneratorPresetOptions(preset: GeneratorPreset): GeneratorPresetOptions {
  if (preset === "readable") {
    return {
      preset,
      length: 16,
      useUpper: true,
      useLower: true,
      useNumbers: true,
      useSymbols: false,
      excludeSimilar: true,
      preventRepeats: true,
      minimumNumbers: 2,
      minimumSymbols: 0,
      allowedSymbols: "!@#$%^&*+-_=?.",
      excludedCharacters: "",
    };
  }
  if (preset === "strong") {
    return {
      preset,
      length: 24,
      useUpper: true,
      useLower: true,
      useNumbers: true,
      useSymbols: true,
      excludeSimilar: true,
      preventRepeats: true,
      minimumNumbers: 3,
      minimumSymbols: 3,
      allowedSymbols: "!@#$%^&*+-_=?.",
      excludedCharacters: "",
    };
  }
  if (preset === "pin") {
    return {
      preset,
      length: 12,
      useUpper: false,
      useLower: false,
      useNumbers: true,
      useSymbols: false,
      excludeSimilar: false,
      preventRepeats: false,
      minimumNumbers: 12,
      minimumSymbols: 0,
      allowedSymbols: "!@#$%^&*+-_=?.",
      excludedCharacters: "",
    };
  }
  return {
    preset: "balanced",
    length: 8,
    useUpper: true,
    useLower: true,
    useNumbers: true,
    useSymbols: true,
    excludeSimilar: true,
    preventRepeats: false,
    minimumNumbers: 2,
    minimumSymbols: 2,
    allowedSymbols: "!@#$%^&*+-_=?.",
    excludedCharacters: "",
  };
}

export function getGeneratorGroups(options: GeneratorOptions) {
  const customExcludes = new Set(
    `${options.excludedCharacters}${options.excludeSimilar ? "0O1Il|`'" : ""}`.split("")
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
    { key: "symbols", chars: options.useSymbols ? filter(options.allowedSymbols) : "" },
  ].filter((group) => group.chars.length > 0);
}

export function buildGeneratorPool(options: GeneratorOptions) {
  const groups = getGeneratorGroups(options);
  return uniqueChars(groups.flatMap((group) => group.chars).join(""));
}

function randomIndex(max: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function pickFrom(source: string, previous = "", preventRepeats = false) {
  if (source.length === 0) return "";
  if (!preventRepeats || source.length === 1) return source[randomIndex(source.length)];

  let next = source[randomIndex(source.length)];
  let guard = 0;
  while (next === previous && guard < 8) {
    next = source[randomIndex(source.length)];
    guard += 1;
  }
  return next;
}

function shufflePassword(chars: string[]) {
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars;
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
  const required: string[] = [];

  for (let index = 0; index < requiredNumbers; index += 1) {
    required.push(pickFrom(numbers, required[required.length - 1], options.preventRepeats));
  }

  for (let index = 0; index < requiredSymbols; index += 1) {
    required.push(pickFrom(symbols, required[required.length - 1], options.preventRepeats));
  }

  while (required.length < length) {
    required.push(pickFrom(pool, required[required.length - 1], options.preventRepeats));
  }

  return shufflePassword(required).join("");
}
