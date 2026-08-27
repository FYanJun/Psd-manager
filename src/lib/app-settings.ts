import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  APP_SETTINGS_SCHEMA_VERSION,
  DEFAULT_APP_SETTINGS,
} from "./constants";
import { clampPaneRatio } from "./layout";
import { INPUT_LIMITS, sanitizeGeneratorSymbols, sanitizePasswordInput } from "./input-validation";
import { isUuid } from "./uuid";
import type {
  AppSettings,
  DensityPreference,
  DeviceType,
  DeviceTypeSortMode,
  FontSizePreference,
  SortMode,
  ThemePreference,
} from "./types";

let browserSettingsContent: string | null = null;

function cloneDefaults(): AppSettings {
  return JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS)) as AppSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function rejectUnknownFields(value: Record<string, unknown>, path: string, allowed: readonly string[]) {
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) throw new Error(`${path}包含不支持的字段：${unsupported.join("、")}`);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path}必须是对象`);
  return value;
}

function requireBoolean(value: unknown, path: string) {
  if (typeof value !== "boolean") throw new Error(`${path}必须是布尔值`);
}

function requireString(value: unknown, path: string, maximum?: number) {
  if (typeof value !== "string") throw new Error(`${path}必须是文本`);
  if (maximum !== undefined && Array.from(value).length > maximum) throw new Error(`${path}超出长度限制`);
}

function requireNumber(value: unknown, path: string, minimum?: number, maximum?: number, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path}必须是数字`);
  if (integer && !Number.isSafeInteger(value)) throw new Error(`${path}必须是整数`);
  if (minimum !== undefined && value < minimum || maximum !== undefined && value > maximum) {
    throw new Error(`${path}超出范围`);
  }
}

function validateAppSettingsShape(value: unknown) {
  const root = requireRecord(value, "应用设置");
  rejectUnknownFields(root, "应用设置", ["schemaVersion", "interface", "workspace", "passwordGenerator"]);
  if (root.schemaVersion !== APP_SETTINGS_SCHEMA_VERSION) {
    throw new Error(`不支持的应用设置版本，当前仅支持 ${APP_SETTINGS_SCHEMA_VERSION}`);
  }

  const interfaceValue = requireRecord(root.interface, "应用设置.interface");
  rejectUnknownFields(interfaceValue, "应用设置.interface", [
    "tooltipEnabled", "theme", "density", "fontSize", "startOnBoot", "startupLock", "autoLockMinutes", "lowMemoryBackground",
  ]);
  requireBoolean(interfaceValue.tooltipEnabled, "应用设置.interface.tooltipEnabled");
  if (interfaceValue.theme !== "system" && interfaceValue.theme !== "light" && interfaceValue.theme !== "dark") {
    throw new Error("应用设置.interface.theme的值不受支持");
  }
  if (interfaceValue.density !== "standard" && interfaceValue.density !== "compact") {
    throw new Error("应用设置.interface.density的值不受支持");
  }
  if (interfaceValue.fontSize !== "small" && interfaceValue.fontSize !== "standard" && interfaceValue.fontSize !== "large") {
    throw new Error("应用设置.interface.fontSize的值不受支持");
  }
  requireBoolean(interfaceValue.startOnBoot, "应用设置.interface.startOnBoot");
  requireBoolean(interfaceValue.startupLock, "应用设置.interface.startupLock");
  requireNumber(interfaceValue.autoLockMinutes, "应用设置.interface.autoLockMinutes", 0, 10080, true);
  if ("lowMemoryBackground" in interfaceValue) {
    requireBoolean(interfaceValue.lowMemoryBackground, "应用设置.interface.lowMemoryBackground");
  }

  const workspace = requireRecord(root.workspace, "应用设置.workspace");
  rejectUnknownFields(workspace, "应用设置.workspace", [
    "rememberLayout", "paneLayout", "deviceSortMode", "deviceTypeSortMode", "rememberLastView",
    "rememberWindowBounds", "windowBounds", "lastView",
  ]);
  requireBoolean(workspace.rememberLayout, "应用设置.workspace.rememberLayout");
  requireBoolean(workspace.rememberLastView, "应用设置.workspace.rememberLastView");
  requireBoolean(workspace.rememberWindowBounds, "应用设置.workspace.rememberWindowBounds");
  if (workspace.deviceSortMode !== "updatedDesc" && workspace.deviceSortMode !== "nameAsc" && workspace.deviceSortMode !== "typeAsc") {
    throw new Error("应用设置.workspace.deviceSortMode的值不受支持");
  }
  if (workspace.deviceTypeSortMode !== "default" && workspace.deviceTypeSortMode !== "nameAsc" && workspace.deviceTypeSortMode !== "countDesc") {
    throw new Error("应用设置.workspace.deviceTypeSortMode的值不受支持");
  }
  const layout = requireRecord(workspace.paneLayout, "应用设置.workspace.paneLayout");
  rejectUnknownFields(layout, "应用设置.workspace.paneLayout", ["sidebarRatio", "listRatio", "generatorRatio"]);
  requireNumber(layout.sidebarRatio, "应用设置.workspace.paneLayout.sidebarRatio", 0.12, 0.2);
  requireNumber(layout.listRatio, "应用设置.workspace.paneLayout.listRatio", 0.18, 0.34);
  requireNumber(layout.generatorRatio, "应用设置.workspace.paneLayout.generatorRatio", 0.24, 0.48);
  if (workspace.windowBounds !== null) {
    const bounds = requireRecord(workspace.windowBounds, "应用设置.workspace.windowBounds");
    rejectUnknownFields(bounds, "应用设置.workspace.windowBounds", ["x", "y", "width", "height"]);
    requireNumber(bounds.x, "应用设置.workspace.windowBounds.x", -100000, 100000, true);
    requireNumber(bounds.y, "应用设置.workspace.windowBounds.y", -100000, 100000, true);
    requireNumber(bounds.width, "应用设置.workspace.windowBounds.width", 1024, 10000, true);
    requireNumber(bounds.height, "应用设置.workspace.windowBounds.height", 720, 10000, true);
  }
  const lastView = requireRecord(workspace.lastView, "应用设置.workspace.lastView");
  rejectUnknownFields(lastView, "应用设置.workspace.lastView", ["deviceType", "searchQuery", "sortMode", "selectedDeviceUuid"]);
  requireString(lastView.deviceType, "应用设置.workspace.lastView.deviceType", INPUT_LIMITS.deviceTypeName);
  requireString(lastView.searchQuery, "应用设置.workspace.lastView.searchQuery", INPUT_LIMITS.connectionAddress);
  if (lastView.sortMode !== "updatedDesc" && lastView.sortMode !== "nameAsc" && lastView.sortMode !== "typeAsc") {
    throw new Error("应用设置.workspace.lastView.sortMode的值不受支持");
  }
  requireString(lastView.selectedDeviceUuid, "应用设置.workspace.lastView.selectedDeviceUuid", 64);
  if (lastView.selectedDeviceUuid && !isUuid(lastView.selectedDeviceUuid)) {
    throw new Error("应用设置.workspace.lastView.selectedDeviceUuid不是有效 UUID");
  }

  const generator = requireRecord(root.passwordGenerator, "应用设置.passwordGenerator");
  rejectUnknownFields(generator, "应用设置.passwordGenerator", [
    "length", "useUpper", "useLower", "useNumbers", "useSymbols", "excludeSimilar", "preventRepeats",
    "minimumNumbers", "minimumSymbols", "allowedSymbols", "excludedCharacters",
  ]);
  requireNumber(generator.length, "应用设置.passwordGenerator.length", 3, 24, true);
  requireBoolean(generator.useUpper, "应用设置.passwordGenerator.useUpper");
  requireBoolean(generator.useLower, "应用设置.passwordGenerator.useLower");
  requireBoolean(generator.useNumbers, "应用设置.passwordGenerator.useNumbers");
  requireBoolean(generator.useSymbols, "应用设置.passwordGenerator.useSymbols");
  requireBoolean(generator.excludeSimilar, "应用设置.passwordGenerator.excludeSimilar");
  requireBoolean(generator.preventRepeats, "应用设置.passwordGenerator.preventRepeats");
  requireNumber(generator.minimumNumbers, "应用设置.passwordGenerator.minimumNumbers", 0, generator.length as number, true);
  requireNumber(generator.minimumSymbols, "应用设置.passwordGenerator.minimumSymbols", 0, generator.length as number, true);
  if ((generator.minimumNumbers as number) + (generator.minimumSymbols as number) > (generator.length as number)) {
    throw new Error("应用设置.passwordGenerator的最小字符数量超过密码长度");
  }
  requireString(generator.allowedSymbols, "应用设置.passwordGenerator.allowedSymbols", INPUT_LIMITS.generatorCharacters);
  requireString(generator.excludedCharacters, "应用设置.passwordGenerator.excludedCharacters", INPUT_LIMITS.generatorCharacters);
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function text(value: unknown, fallback: string, limit: number = INPUT_LIMITS.generatorCharacters) {
  return typeof value === "string"
    ? Array.from(value).slice(0, limit).join("")
    : fallback;
}

function sortMode(value: unknown, fallback: SortMode): SortMode {
  return value === "updatedDesc" || value === "nameAsc" || value === "typeAsc" ? value : fallback;
}

function typeSortMode(value: unknown, fallback: DeviceTypeSortMode): DeviceTypeSortMode {
  return value === "default" || value === "nameAsc" || value === "countDesc" ? value : fallback;
}

function numberValue(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : fallback;
}

function theme(value: unknown, fallback: ThemePreference): ThemePreference {
  return value === "system" || value === "light" || value === "dark" ? value : fallback;
}

function density(value: unknown, fallback: DensityPreference): DensityPreference {
  return value === "standard" || value === "compact" ? value : fallback;
}

function fontSize(value: unknown, fallback: FontSizePreference): FontSizePreference {
  return value === "small" || value === "standard" || value === "large" ? value : fallback;
}

function windowBounds(value: unknown): AppSettings["workspace"]["windowBounds"] {
  if (!isRecord(value)) return null;
  if (!["x", "y", "width", "height"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]))) return null;
  const x = numberValue(value.x, 0, -100000, 100000);
  const y = numberValue(value.y, 0, -100000, 100000);
  const width = numberValue(value.width, 0, 1024, 10000);
  const height = numberValue(value.height, 0, 720, 10000);
  if (width < 1024 || height < 720) return null;
  return { x, y, width, height };
}

export function normalizeAppSettings(value: unknown): AppSettings {
  const defaults = cloneDefaults();
  if (!isRecord(value) || value.schemaVersion !== APP_SETTINGS_SCHEMA_VERSION) return defaults;
  const interfaceValue = isRecord(value.interface) ? value.interface : {};
  const workspaceValue = isRecord(value.workspace) ? value.workspace : {};
  const layoutValue = isRecord(workspaceValue.paneLayout) ? workspaceValue.paneLayout : {};
  const lastViewValue = isRecord(workspaceValue.lastView) ? workspaceValue.lastView : {};
  const generatorValue = isRecord(value.passwordGenerator) ? value.passwordGenerator : {};
  const generatorLength = numberValue(generatorValue.length, defaults.passwordGenerator.length, 3, 24);
  let minimumNumbers = Math.min(
    generatorLength,
    numberValue(generatorValue.minimumNumbers, defaults.passwordGenerator.minimumNumbers, 0, 24),
  );
  let minimumSymbols = Math.min(
    generatorLength,
    numberValue(generatorValue.minimumSymbols, defaults.passwordGenerator.minimumSymbols, 0, 24),
  );
  const minimumOverflow = minimumNumbers + minimumSymbols - generatorLength;
  if (minimumOverflow > 0) {
    const reducedSymbols = Math.min(minimumSymbols, minimumOverflow);
    minimumSymbols -= reducedSymbols;
    minimumNumbers = Math.max(0, minimumNumbers - (minimumOverflow - reducedSymbols));
  }
  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    interface: {
      tooltipEnabled: bool(interfaceValue.tooltipEnabled, defaults.interface.tooltipEnabled),
      theme: theme(interfaceValue.theme, defaults.interface.theme),
      density: density(interfaceValue.density, defaults.interface.density),
      fontSize: fontSize(interfaceValue.fontSize, defaults.interface.fontSize),
      startOnBoot: bool(interfaceValue.startOnBoot, defaults.interface.startOnBoot),
      startupLock: bool(interfaceValue.startupLock, defaults.interface.startupLock),
      autoLockMinutes: numberValue(interfaceValue.autoLockMinutes, defaults.interface.autoLockMinutes, 0, 10080),
      lowMemoryBackground: bool(interfaceValue.lowMemoryBackground, defaults.interface.lowMemoryBackground),
    },
    workspace: {
      rememberLayout: bool(workspaceValue.rememberLayout, defaults.workspace.rememberLayout),
      paneLayout: {
        sidebarRatio: clampPaneRatio(Number(layoutValue.sidebarRatio), "sidebar"),
        listRatio: clampPaneRatio(Number(layoutValue.listRatio), "list"),
        generatorRatio: clampPaneRatio(Number(layoutValue.generatorRatio), "generator"),
      },
      deviceSortMode: sortMode(workspaceValue.deviceSortMode, defaults.workspace.deviceSortMode),
      deviceTypeSortMode: typeSortMode(workspaceValue.deviceTypeSortMode, defaults.workspace.deviceTypeSortMode),
      rememberLastView: bool(workspaceValue.rememberLastView, defaults.workspace.rememberLastView),
      rememberWindowBounds: bool(workspaceValue.rememberWindowBounds, defaults.workspace.rememberWindowBounds),
      windowBounds: windowBounds(workspaceValue.windowBounds),
      lastView: {
        deviceType: typeof lastViewValue.deviceType === "string" && lastViewValue.deviceType.trim()
          ? lastViewValue.deviceType.trim() as "全部设备" | DeviceType
          : "全部设备",
        searchQuery: text(lastViewValue.searchQuery, "", INPUT_LIMITS.connectionAddress),
        sortMode: sortMode(lastViewValue.sortMode, defaults.workspace.lastView.sortMode),
        selectedDeviceUuid: isUuid(lastViewValue.selectedDeviceUuid) ? lastViewValue.selectedDeviceUuid.trim().toLowerCase() : "",
      },
    },
    passwordGenerator: {
      length: generatorLength,
      useUpper: bool(generatorValue.useUpper, defaults.passwordGenerator.useUpper),
      useLower: bool(generatorValue.useLower, defaults.passwordGenerator.useLower),
      useNumbers: bool(generatorValue.useNumbers, defaults.passwordGenerator.useNumbers),
      useSymbols: bool(generatorValue.useSymbols, defaults.passwordGenerator.useSymbols),
      excludeSimilar: bool(generatorValue.excludeSimilar, defaults.passwordGenerator.excludeSimilar),
      preventRepeats: bool(generatorValue.preventRepeats, defaults.passwordGenerator.preventRepeats),
      minimumNumbers,
      minimumSymbols,
      allowedSymbols: sanitizeGeneratorSymbols(text(generatorValue.allowedSymbols, defaults.passwordGenerator.allowedSymbols)),
      excludedCharacters: sanitizePasswordInput(text(generatorValue.excludedCharacters, "")),
    },
  };
}

export function createDefaultAppSettings() {
  return cloneDefaults();
}

export async function loadAppSettings() {
  const content = isTauri() ? await invoke<string | null>("load_app_settings") : browserSettingsContent;
  if (!content) return createDefaultAppSettings();
  try {
    const parsed = JSON.parse(content) as unknown;
    validateAppSettingsShape(parsed);
    return normalizeAppSettings(parsed);
  } catch (error) {
    throw error instanceof Error ? error : new Error(`应用设置不是合法 JSON：${String(error)}`);
  }
}

export async function saveAppSettings(settings: AppSettings) {
  const content = JSON.stringify(normalizeAppSettings(settings));
  if (isTauri()) {
    await invoke<string>("save_app_settings", { content });
  } else {
    browserSettingsContent = content;
  }
}

export async function resetAppSettings() {
  if (isTauri()) {
    await invoke("reset_app_settings");
  } else {
    browserSettingsContent = null;
  }
  return createDefaultAppSettings();
}
