import type { DeviceType, DeviceTypeMeta } from "./types";

export const APP_TITLE = "设备资产凭据管理工具";
export const CONFIG_FORMAT_VERSION = 1;
export const STORAGE_KEY = "device-password-manager-state-v1";
export const DEFAULT_ACCOUNT_TAG = "登录账号";

export const SIDEBAR_DEFAULT_WIDTH = 252;
export const SIDEBAR_MIN_WIDTH = 208;
export const SIDEBAR_MAX_WIDTH = 360;
export const LIST_DEFAULT_WIDTH = 368;
export const LIST_MIN_WIDTH = 300;
export const LIST_MAX_WIDTH = 540;
export const GENERATOR_DEFAULT_WIDTH = 460;
export const GENERATOR_MIN_WIDTH = 360;
export const GENERATOR_MAX_WIDTH = 680;
export const DETAIL_MIN_WIDTH = 420;
export const RESIZER_WIDTH = 8;

export const initialItems = [];

export const defaultDeviceTypeMeta: Array<DeviceTypeMeta & { label: "全部设备" | DeviceType }> = [
  { label: "全部设备", iconText: "全", color: "blue" },
];

export const fallbackDeviceTypeMeta: DeviceTypeMeta = { label: "", iconText: "设", color: "blue" };

export const typeColorOptions = [
  { value: "blue", label: "蓝色" },
  { value: "cyan", label: "青色" },
  { value: "rose", label: "红色" },
  { value: "indigo", label: "靛蓝" },
  { value: "sand", label: "沙色" },
  { value: "gold", label: "金色" },
  { value: "dark", label: "深色" },
];
