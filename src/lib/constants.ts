import type { DeviceType, DeviceTypeMeta } from "./types";

export const APP_TITLE = "密码管理器";
export const CONFIG_FORMAT_VERSION = 3;
export const VAULT_SCHEMA_VERSION = 2;
export const STORAGE_KEY = "psd-manager-state-v1";
export const LEGACY_STORAGE_KEY = ["device", "password-manager", "state-v1"].join("-");
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

export const defaultDeviceTypeMeta: Array<DeviceTypeMeta & { label: "全部设备" | DeviceType }> = [
  { uuid: "", label: "全部设备", iconText: "全", color: "blue" },
];

export const fallbackDeviceTypeMeta: DeviceTypeMeta = { uuid: "", label: "", iconText: "设", color: "blue" };

export const typeColorOptions = [
  { value: "blue", label: "蓝色" },
  { value: "cyan", label: "青色" },
  { value: "rose", label: "红色" },
  { value: "indigo", label: "靛蓝" },
  { value: "sand", label: "沙色" },
  { value: "gold", label: "金色" },
  { value: "dark", label: "深色" },
];
