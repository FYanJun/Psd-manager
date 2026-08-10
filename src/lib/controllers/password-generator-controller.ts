import {
  generatePasswordValue,
  normalizeGeneratorLength,
  type GeneratorOptions,
} from "../password-generator";
import { sanitizeAsciiSymbols, sanitizePasswordInput } from "../input-validation";
import type { ActiveDialog, GeneratorTarget } from "../types";

export type PasswordGeneratorState = GeneratorOptions & {
  panelOpen: boolean;
  target: GeneratorTarget;
  generatedPassword: string;
  lengthInput: string;
};

type PasswordGeneratorPort = {
  read(): PasswordGeneratorState;
  write(state: PasswordGeneratorState): void;
  openDialog(dialog: ActiveDialog): void;
};

export function createPasswordGeneratorController(port: PasswordGeneratorPort) {
  function update(patch: Partial<PasswordGeneratorState>) {
    port.write({ ...port.read(), ...patch });
  }

  function options(state = port.read()): GeneratorOptions {
    const { length, useUpper, useLower, useNumbers, useSymbols, excludeSimilar, preventRepeats,
      minimumNumbers, minimumSymbols, allowedSymbols, excludedCharacters } = state;
    return { length, useUpper, useLower, useNumbers, useSymbols, excludeSimilar, preventRepeats,
      minimumNumbers, minimumSymbols, allowedSymbols, excludedCharacters };
  }

  function generate() {
    update({ generatedPassword: generatePasswordValue(options()) });
  }

  function clampMinimums(state: PasswordGeneratorState, changedField: "numbers" | "symbols" = "symbols") {
    let minimumNumbers = Math.min(state.length, Math.max(0, state.minimumNumbers));
    let minimumSymbols = Math.min(state.length, Math.max(0, state.minimumSymbols));
    const overflow = minimumNumbers + minimumSymbols - state.length;
    if (overflow > 0) {
      if (changedField === "numbers") minimumSymbols = Math.max(0, minimumSymbols - overflow);
      else minimumNumbers = Math.max(0, minimumNumbers - overflow);
    }
    return { minimumNumbers, minimumSymbols };
  }

  function setLength(length: number, syncInput = true) {
    const state = port.read();
    const nextLength = normalizeGeneratorLength(length);
    const next = {
      ...state,
      length: nextLength,
      lengthInput: syncInput ? String(nextLength) : state.lengthInput,
    };
    port.write({ ...next, ...clampMinimums(next) });
    generate();
  }

  function setMinimum(field: "numbers" | "symbols", value: number | string) {
    const state = port.read();
    const parsed = Number(value);
    const normalized = Math.min(state.length, Math.max(0, Number.isFinite(parsed) ? Math.round(parsed) : 0));
    const next = {
      ...state,
      [field === "numbers" ? "minimumNumbers" : "minimumSymbols"]: normalized,
    };
    port.write({ ...next, ...clampMinimums(next, field) });
    generate();
  }

  function setCharacters(field: "allowedSymbols" | "excludedCharacters", value: string) {
    update({
      [field]: field === "allowedSymbols" ? sanitizeAsciiSymbols(value) : sanitizePasswordInput(value),
    });
    generate();
  }

  function open(target: GeneratorTarget = null) {
    update({ target, panelOpen: true });
    generate();
  }

  function close(restoreDialog = false) {
    const target = port.read().target;
    update({ target: null, panelOpen: false });
    if (!restoreDialog) return;
    if (target === "bulk-password") port.openDialog("bulk-password");
    if (target === "current-account") port.openDialog("password");
  }

  function handleLengthInput(value: string) {
    const state = port.read();
    const nextValue = value.replace(/[^\d]/g, "");
    if (!nextValue) {
      update({ lengthInput: String(state.length) });
      return;
    }
    update({ lengthInput: nextValue });
    const parsedLength = Number(nextValue);
    if (parsedLength >= 3 && parsedLength <= 24) setLength(parsedLength, false);
  }

  function commitLengthInput() {
    setLength(Number(port.read().lengthInput));
  }

  function handleLengthKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    commitLengthInput();
    (event.currentTarget as HTMLInputElement).blur();
  }

  function handleLengthSlider(event: Event) {
    setLength(Number((event.currentTarget as HTMLInputElement).value));
  }

  return {
    generate,
    open,
    close,
    setLength,
    setMinimumNumbers: (value: number | string) => setMinimum("numbers", value),
    setMinimumSymbols: (value: number | string) => setMinimum("symbols", value),
    setAllowedSymbols: (value: string) => setCharacters("allowedSymbols", value),
    setExcludedCharacters: (value: string) => setCharacters("excludedCharacters", value),
    handleLengthInput,
    commitLengthInput,
    handleLengthKeydown,
    handleLengthSlider,
  };
}
