import type { DeviceType, DeviceTypeMeta } from "./types";

export const APP_TITLE = "密码管理器";
export const DEFAULT_ACCOUNT_TAG = "";

export const SIDEBAR_DEFAULT_RATIO = 0.15;
export const SIDEBAR_WIDTH = 224;
export const SIDEBAR_COLLAPSED_WIDTH = 64;
export const SIDEBAR_DIVIDER_WIDTH = 1;
export const SIDEBAR_MIN_RATIO = 0.10;
export const SIDEBAR_MAX_RATIO = 0.2;
export const LIST_DEFAULT_RATIO = 0.25;
export const DEVICE_LIST_WIDTH = 280;
export const DETAIL_MIN_WIDTH = 400;
export const LEGACY_WINDOW_MIN_WIDTH = 786;
export const WINDOW_MIN_WIDTH = SIDEBAR_WIDTH + SIDEBAR_DIVIDER_WIDTH + DEVICE_LIST_WIDTH + 1 + DETAIL_MIN_WIDTH;
export const WINDOW_MIN_HEIGHT = 720;
export const LIST_MIN_RATIO = 0.20;
export const LIST_MAX_RATIO = 0.38;
export const GENERATOR_DEFAULT_RATIO = 0.32;
export const GENERATOR_MIN_RATIO = 0.24;
export const GENERATOR_MAX_RATIO = 0.48;

export const initialItems = [];

export const DEFAULT_APP_SETTINGS = {
  interface: {
    tooltipEnabled: true,
    theme: "system" as const,
    startOnBoot: false,
    startupLock: false,
    autoLockMinutes: 0,
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
