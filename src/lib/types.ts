export type DeviceType = string;
export type SortMode = "updatedDesc" | "nameAsc" | "typeAsc";
export type DeviceTypeSortMode = "default" | "nameAsc" | "countDesc";
export type ActiveDialog = "device" | "type" | "password" | "account" | "bulk-password" | "export-config" | null;
export type ActivePopover =
  | "type-sort"
  | "device-sort"
  | "type-context"
  | "device-context"
  | "type-blank-context"
  | "list-blank-context"
  | "detail-blank-context"
  | "more"
  | null;
export type ConfirmationAction = "delete-device" | "delete-account" | "delete-device-type" | "import-config";

export type PopoverPosition = {
  top: number;
  left: number;
};

export type PendingConfirmation = {
  action: ConfirmationAction;
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
  summaryItems?: Array<{ label: string; value: string }>;
  deviceType?: "全部设备" | DeviceType;
};

export type DeviceTypeMeta = {
  label: string;
  iconText: string;
  color: string;
};

export type GeneratorPreset = "balanced" | "readable" | "strong" | "pin";

export type ViewState = {
  selectedDeviceType: "全部设备" | DeviceType;
  selectedId: number;
  searchQuery: string;
  sortMode: SortMode;
};

export type PasswordHistory = {
  id: number;
  password: string;
  newPassword: string;
  changedAt: string;
  reason: string;
};

export type DeviceAccount = {
  id: number;
  title: string;
  username: string;
  password: string;
  tag: string;
  notes: string;
  updatedAt: string;
  history: PasswordHistory[];
};

export type VaultItem = {
  id: number;
  title: string;
  deviceName: string;
  deviceType: DeviceType;
  username: string;
  password: string;
  ipAddress: string;
  tag: string;
  iconText: string;
  iconClass: string;
  updatedAt: string;
  notes: string;
  history: PasswordHistory[];
  accounts?: DeviceAccount[];
};

export type DeviceForm = {
  id: number | null;
  deviceName: string;
  deviceType: string;
  username: string;
  password: string;
  ipAddress: string;
  notes: string;
};

export type TypeForm = {
  originalLabel: string | null;
  label: string;
  iconText: string;
  color: string;
};

export type AccountForm = {
  id: number | null;
  username: string;
  password: string;
  notes: string;
};

export type BulkPasswordForm = {
  deviceType: "全部设备" | DeviceType;
  username: string;
  password: string;
  reason: string;
};

export type BulkPasswordMatch = {
  itemId: number;
  accountId: number;
  deviceName: string;
  deviceType: string;
  deviceTag: string;
  ipAddress: string;
  username: string;
  tag: string;
  updatedAt: string;
};

export type BulkUsernameSuggestion = {
  username: string;
};

export type GeneratorTarget = "current-account" | "bulk-password" | null;
export type TypePickerScope = "device" | "bulk";
export type ResizePane = "sidebar" | "list" | "generator";
export type ConfigFormat = "json" | "csv" | "ini";

export type ConfigData = {
  items: VaultItem[];
  customDeviceTypes: DeviceTypeMeta[];
  hiddenDeviceTypes: string[];
  meta: {
    appName: string;
    formatVersion: number;
    exportedAt: string;
  };
};

export type ConfigSummary = {
  itemCount: number;
  accountCount: number;
  historyCount: number;
  typeCount: number;
  exportedAtText: string;
  formatVersion: number;
};
