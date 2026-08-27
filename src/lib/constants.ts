import type { DeviceType, DeviceTypeMeta } from "./types";

export const APP_TITLE = "密码管理器";
export const CONFIG_FORMAT_VERSION = 3;
export const VAULT_SCHEMA_VERSION = 2;
export const APP_SETTINGS_SCHEMA_VERSION = 2;
export const DEFAULT_ACCOUNT_TAG = "";

export const SIDEBAR_DEFAULT_RATIO = 0.14;
export const SIDEBAR_MIN_RATIO = 0.12;
export const SIDEBAR_MAX_RATIO = 0.2;
export const LIST_DEFAULT_RATIO = 0.21;
export const LIST_MIN_RATIO = 0.18;
export const LIST_MAX_RATIO = 0.34;
export const GENERATOR_DEFAULT_RATIO = 0.32;
export const GENERATOR_MIN_RATIO = 0.24;
export const GENERATOR_MAX_RATIO = 0.48;
export const RESIZER_RATIO = 0.005;

export const initialItems = [];

export const DEFAULT_APP_SETTINGS = {
  schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
  interface: {
    tooltipEnabled: true,
    theme: "system" as const,
    density: "standard" as const,
    fontSize: "standard" as const,
    startOnBoot: false,
    startupLock: false,
    autoLockMinutes: 0,
    lowMemoryBackground: true,
  },
  workspace: {
    rememberLayout: true,
    paneLayout: {
      sidebarRatio: SIDEBAR_DEFAULT_RATIO,
      listRatio: LIST_DEFAULT_RATIO,
      generatorRatio: GENERATOR_DEFAULT_RATIO,
    },
    deviceSortMode: "updatedDesc" as const,
    deviceTypeSortMode: "default" as const,
    rememberLastView: false,
    rememberWindowBounds: true,
    windowBounds: null,
    lastView: {
      deviceType: "全部设备" as const,
      searchQuery: "",
      sortMode: "updatedDesc" as const,
      selectedDeviceUuid: "",
    },
  },
  passwordGenerator: {
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
  },
};

export const defaultDeviceTypeMeta: Array<DeviceTypeMeta & { label: "全部设备" | DeviceType }> = [
  { uuid: "", label: "全部设备", iconText: "全", color: "blue" },
];

export const fallbackDeviceTypeMeta: DeviceTypeMeta = { uuid: "", label: "", iconText: "设", color: "blue" };

export const typeColorOptions = [
  { value: "blue", label: "蓝色" },
  { value: "cyan", label: "绿色" },
  { value: "rose", label: "红色" },
  { value: "indigo", label: "紫色" },
  { value: "sand", label: "橙色" },
  { value: "gold", label: "黄色" },
  { value: "dark", label: "灰色" },
];
