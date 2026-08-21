import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  APP_SETTINGS_SCHEMA_VERSION,
  DEFAULT_APP_SETTINGS,
} from "./constants";
import { clampPaneRatio } from "./layout";
import { INPUT_LIMITS, sanitizeAsciiSymbols, sanitizePasswordInput } from "./input-validation";
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
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== APP_SETTINGS_SCHEMA_VERSION)) return defaults;
  const interfaceValue = isRecord(value.interface) ? value.interface : {};
  const workspaceValue = isRecord(value.workspace) ? value.workspace : {};
  const layoutValue = isRecord(workspaceValue.paneLayout) ? workspaceValue.paneLayout : {};
  const lastViewValue = isRecord(workspaceValue.lastView) ? workspaceValue.lastView : {};
  const generatorValue = isRecord(value.passwordGenerator) ? value.passwordGenerator : {};
  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    interface: {
      tooltipEnabled: bool(interfaceValue.tooltipEnabled, defaults.interface.tooltipEnabled),
      theme: theme(interfaceValue.theme, defaults.interface.theme),
      density: density(interfaceValue.density, defaults.interface.density),
      fontSize: fontSize(interfaceValue.fontSize, defaults.interface.fontSize),
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
      length: numberValue(generatorValue.length, defaults.passwordGenerator.length, 3, 24),
      useUpper: bool(generatorValue.useUpper, defaults.passwordGenerator.useUpper),
      useLower: bool(generatorValue.useLower, defaults.passwordGenerator.useLower),
      useNumbers: bool(generatorValue.useNumbers, defaults.passwordGenerator.useNumbers),
      useSymbols: bool(generatorValue.useSymbols, defaults.passwordGenerator.useSymbols),
      excludeSimilar: bool(generatorValue.excludeSimilar, defaults.passwordGenerator.excludeSimilar),
      preventRepeats: bool(generatorValue.preventRepeats, defaults.passwordGenerator.preventRepeats),
      minimumNumbers: numberValue(generatorValue.minimumNumbers, defaults.passwordGenerator.minimumNumbers, 0, 24),
      minimumSymbols: numberValue(generatorValue.minimumSymbols, defaults.passwordGenerator.minimumSymbols, 0, 24),
      allowedSymbols: sanitizeAsciiSymbols(text(generatorValue.allowedSymbols, defaults.passwordGenerator.allowedSymbols)),
      excludedCharacters: sanitizePasswordInput(text(generatorValue.excludedCharacters, "")),
    },
  };
}

export function createDefaultAppSettings() {
  return cloneDefaults();
}

export async function loadAppSettings() {
  const content = isTauri() ? await invoke<string | null>("load_app_settings") : browserSettingsContent;
  if (!content) return { settings: createDefaultAppSettings(), hasStoredSettings: false, needsMigration: false };
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed) || (parsed.schemaVersion !== 1 && parsed.schemaVersion !== APP_SETTINGS_SCHEMA_VERSION)) {
      throw new Error("不支持的应用设置版本，当前支持 1 和 2");
    }
    return {
      settings: normalizeAppSettings(parsed),
      hasStoredSettings: true,
      needsMigration: isRecord(parsed)
        && (parsed.schemaVersion !== APP_SETTINGS_SCHEMA_VERSION
          || (isRecord(parsed.interface) && "reduceMotion" in parsed.interface)),
    };
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

export function mergeLegacyPaneLayout(settings: AppSettings, paneLayout: AppSettings["workspace"]["paneLayout"] | undefined) {
  if (!paneLayout) return settings;
  return {
    ...settings,
    workspace: {
      ...settings.workspace,
      paneLayout: {
        sidebarRatio: clampPaneRatio(Number(paneLayout.sidebarRatio), "sidebar"),
        listRatio: clampPaneRatio(Number(paneLayout.listRatio), "list"),
        generatorRatio: clampPaneRatio(Number(paneLayout.generatorRatio), "generator"),
      },
    },
  };
}
