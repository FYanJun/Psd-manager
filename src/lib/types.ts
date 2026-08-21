export type DeviceType = string;
export type ConfigImportMode = "replace" | "add-missing";
export type ConfirmationSummaryItem = { label: string; value: string };
export type ConfirmationChange = { label: string; from: string; to: string };
export type ConfirmationAccountTarget = { itemUuid: string; accountUuid: string };
export type SortMode = "updatedDesc" | "nameAsc" | "typeAsc";
export type DeviceTypeSortMode = "default" | "nameAsc" | "countDesc";
export type ThemePreference = "system" | "light" | "dark";
export type DensityPreference = "standard" | "compact";
export type FontSizePreference = "small" | "standard" | "large";
export type ActiveDialog = "device" | "type" | "password" | "account" | "bulk-password" | "export-config" | "snapshots" | "settings" | null;
export type ActivePopover =
  | "type-sort"
  | "device-sort"
  | "device-actions"
  | "account-context"
  | "type-context"
  | "type-blank-context"
  | "list-blank-context"
  | "detail-blank-context"
  | null;
export type ConfirmationAction =
  | "delete-device"
  | "delete-account"
  | "delete-device-type"
  | "import-config"
  | "update-password"
  | "bulk-update-password"
  | "restore-history"
  | "restore-snapshot"
  | "save-device"
  | "save-device-type"
  | "save-account"
  | "save-account-password";

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
  summaryItems?: ConfirmationSummaryItem[];
  changes?: ConfirmationChange[];
  importModeSummaries?: Record<ConfigImportMode, ConfirmationSummaryItem[]>;
  importModeDetails?: Record<ConfigImportMode, string>;
  importModeErrors?: Partial<Record<ConfigImportMode, string>>;
  deviceType?: "全部设备" | DeviceType;
  deviceTypeUuid?: string;
  snapshotId?: string;
  itemUuid?: string;
  accountUuid?: string;
  accountUuids?: string[];
  accountTargets?: ConfirmationAccountTarget[];
  historyUuid?: string;
  passwordValue?: string;
  reasonValue?: string;
  accountDraft?: AccountForm;
  deviceDraft?: DeviceForm;
  typeDraft?: TypeForm;
};

export type DeviceTypeMeta = {
  uuid: string;
  label: string;
  iconText: string;
  color: string;
};

export type ViewState = {
  selectedDeviceType: "全部设备" | DeviceType;
  selectedId: number;
  searchQuery: string;
  sortMode: SortMode;
};

export type PasswordHistory = {
  uuid: string;
  id: number;
  password: string;
  newPassword: string;
  changedAt: string;
  reason: string;
};

export type DeviceAccount = {
  uuid: string;
  id: number;
  title: string;
  username: string;
  password: string;
  tag: string;
  notes: string;
  updatedAt: string;
  passwordChangedAt: string;
  history: PasswordHistory[];
};

export type VaultItem = {
  uuid: string;
  id: number;
  title: string;
  deviceName: string;
  deviceType: DeviceType;
  deviceTypeUuid: string;
  assetCode: string;
  location: string;
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
  assetCode: string;
  location: string;
  ipAddress: string;
  notes: string;
};

export type TypeForm = {
  originalUuid: string | null;
  originalLabel: string | null;
  label: string;
  iconText: string;
  color: string;
};

export type AccountForm = {
  id: number | null;
  username: string;
  password: string;
  tag: string;
  notes: string;
};

export type BulkPasswordForm = {
  deviceType: "全部设备" | DeviceType;
  username: string;
  password: string;
  reason: string;
};

export type VaultSnapshot = {
  id: string;
  createdAt: string;
  reason: string;
  items: VaultItem[];
  customDeviceTypes: DeviceTypeMeta[];
};

export type PersistedVaultState = {
  schemaVersion: number;
  revision: number;
  items: VaultItem[];
  customDeviceTypes: DeviceTypeMeta[];
  paneLayout?: {
    sidebarRatio?: number;
    listRatio?: number;
    generatorRatio?: number;
  };
  snapshots: VaultSnapshot[];
};

export type BulkPasswordMatch = {
  itemUuid: string;
  accountUuid: string;
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
export type ConfigFormat = "json" | "csv" | "yaml";

export type AppSettings = {
  schemaVersion: 2;
  interface: {
    tooltipEnabled: boolean;
    theme: ThemePreference;
    density: DensityPreference;
    fontSize: FontSizePreference;
  };
  workspace: {
    rememberLayout: boolean;
    paneLayout: {
      sidebarRatio: number;
      listRatio: number;
      generatorRatio: number;
    };
    deviceSortMode: SortMode;
    deviceTypeSortMode: DeviceTypeSortMode;
    rememberLastView: boolean;
    rememberWindowBounds: boolean;
    windowBounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    lastView: {
      deviceType: "全部设备" | DeviceType;
      searchQuery: string;
      sortMode: SortMode;
      selectedDeviceUuid: string;
    };
  };
  passwordGenerator: {
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
};

export type ConfigData = {
  items: VaultItem[];
  customDeviceTypes: DeviceTypeMeta[];
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
  formatVersion: number;
};

export type ConfigDiffSummary = {
  devicesAdded: number;
  devicesRemoved: number;
  devicesChanged: number;
  accountsAdded: number;
  accountsRemoved: number;
  accountsChanged: number;
  typesAdded: number;
  typesRemoved: number;
  typesChanged: number;
};
