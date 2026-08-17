import type {
  ActiveDialog,
  ActivePopover,
  BulkPasswordMatch,
  BulkUsernameSuggestion,
  ConfigFormat,
  DensityPreference,
  DeviceAccount,
  DeviceType,
  DeviceTypeMeta,
  DeviceTypeSortMode,
  FontSizePreference,
  PasswordHistory,
  PopoverPosition,
  ResizePane,
  SortMode,
  ThemePreference,
  TypePickerScope,
  VaultItem,
} from "./types";

export type WorkspaceSidebarView = {
  deviceTypeRows: Array<DeviceTypeMeta & { count: number }>;
  selectedDeviceType: "全部设备" | DeviceType;
  selectedTypeDeviceCount: number;
  canDeleteSelectedDeviceType: boolean;
};

export type WorkspaceTopbarView = {
  backDisabled: boolean;
  forwardDisabled: boolean;
  searchQuery: string;
  searchPlaceholder: string;
};

export type WorkspaceDeviceListView = {
  filteredItems: VaultItem[];
  selectedId: number;
  searchQuery: string;
  hasDevices: boolean;
  hasSelectedDevice: boolean;
  deviceTypeOptionsLength: number;
  listContextLabel: string;
};

export type WorkspaceView = {
  sidebar: WorkspaceSidebarView;
  topbar: WorkspaceTopbarView;
  deviceList: WorkspaceDeviceListView;
  resizingPane: ResizePane | null;
  deviceDetail: DeviceDetailModel;
};

export type WorkspaceSidebarActions = {
  openTypeBlankContextMenu(event: MouseEvent): void;
  openAddTypeDialog(): void;
  openEditTypeDialog(deviceType?: DeviceType): void;
  requestDeleteSelectedType(): void;
  openTypeSortPopover(event: MouseEvent): void;
  selectDeviceType(deviceType: "全部设备" | DeviceType): void;
  openTypeContextMenu(deviceType: "全部设备" | DeviceType, event: MouseEvent): void;
};

export type WorkspaceTopbarActions = {
  goBack(): void;
  goForward(): void;
  updateSearchValue(value: string): void;
  openBulkPasswordDialog(): void;
  openGeneratorPanel(): void;
  openSettings(): void;
};

export type SettingsView = {
  activeSection: "interface" | "workspace" | "generator" | "data" | "about";
  tooltipEnabled: boolean;
  theme: ThemePreference;
  density: DensityPreference;
  fontSize: FontSizePreference;
  reduceMotion: boolean;
  rememberLayout: boolean;
  rememberLastView: boolean;
  rememberWindowBounds: boolean;
  deviceSortMode: SortMode;
  deviceTypeSortMode: DeviceTypeSortMode;
  generator: {
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
  version: string;
};

export type SettingsActions = {
  setSection(section: SettingsView["activeSection"]): void;
  setTooltipEnabled(value: boolean): void;
  setTheme(value: ThemePreference): void;
  setDensity(value: DensityPreference): void;
  setFontSize(value: FontSizePreference): void;
  setReduceMotion(value: boolean): void;
  setRememberLayout(value: boolean): void;
  setRememberLastView(value: boolean): void;
  setRememberWindowBounds(value: boolean): void;
  setDeviceSortMode(value: SortMode): void;
  setDeviceTypeSortMode(value: DeviceTypeSortMode): void;
  setGeneratorValue<K extends keyof SettingsView["generator"]>(key: K, value: SettingsView["generator"][K]): void;
  openSnapshotsDialog(): void;
  openExportConfigDialog(): void;
  chooseConfigFile(): void;
  reset(): void;
};

export type WorkspaceDeviceListActions = {
  openAddDeviceDialog(): void;
  openEditDeviceDialog(): void;
  requestDeleteSelectedDevice(): void;
  openDeviceSortPopover(event: MouseEvent): void;
  openDeviceActionsPopover(event: MouseEvent): void;
  openDeviceContextMenu(id: number, event: MouseEvent): void;
  openDeviceListBlankContextMenu(event: MouseEvent): void;
  selectDevice(id: number): void;
};

export type WorkspaceActions = {
  sidebar: WorkspaceSidebarActions;
  topbar: WorkspaceTopbarActions;
  deviceList: WorkspaceDeviceListActions;
  startPaneResize(pane: ResizePane, event: PointerEvent): void;
  deviceDetail: DeviceDetailActions;
};

export type AppDialogView = {
  selectedItem: VaultItem;
  selectedAccount: DeviceAccount;
  selectedAccountTargets: DeviceAccount[];
  selectedBulkTypeMeta: (DeviceTypeMeta & { count: number }) | undefined;
  selectedDeviceFormTypeMeta: DeviceTypeMeta;
  bulkUsernameSuggestionsOpen: boolean;
  filteredBulkTypeRows: Array<DeviceTypeMeta & { count: number }>;
  filteredDeviceTypeOptions: DeviceTypeMeta[];
  deviceTypeOptionsLength: number;
  revealResetToken: number;
  bulkUsernameSuggestions: BulkUsernameSuggestion[];
  bulkPasswordMatches: BulkPasswordMatch[];
  bulkPasswordSelectedMatches: BulkPasswordMatch[];
};

export type AppDialogActions = {
  closeOverlays(): void;
  saveDeviceType(): void;
  openGeneratorPanel(target?: "current-account" | "bulk-password" | null): void;
  setActiveDialog(dialog: ActiveDialog): void;
  toggleTypePicker(scope: TypePickerScope): void;
  setBulkPasswordDeviceType(deviceType: "全部设备" | DeviceType): void;
  updateBulkUsernameSearch(username: string): void;
  selectBulkUsername(suggestion: BulkUsernameSuggestion): void;
  selectAllBulkPasswordMatches(): void;
  clearBulkPasswordMatches(): void;
  isBulkPasswordMatchSelected(match: BulkPasswordMatch): boolean;
  toggleBulkPasswordMatch(match: BulkPasswordMatch): void;
  saveBulkPasswordUpdate(): void;
  savePasswordUpdate(): void;
  saveAccount(): void;
  setDeviceFormType(deviceType: DeviceType): void;
  saveDevice(): void;
  exportConfig(format?: ConfigFormat): void;
};

export type BulkPasswordDialogView = {
  selectedBulkTypeMeta: (DeviceTypeMeta & { count: number }) | undefined;
  bulkUsernameSuggestionsOpen: boolean;
  filteredBulkTypeRows: Array<DeviceTypeMeta & { count: number }>;
  revealResetToken: number;
  bulkUsernameSuggestions: BulkUsernameSuggestion[];
  bulkPasswordMatches: BulkPasswordMatch[];
  bulkPasswordSelectedMatches: BulkPasswordMatch[];
};

export type BulkPasswordDialogActions = {
  closeOverlays(): void;
  openGeneratorPanel(target?: "current-account" | "bulk-password" | null): void;
  setActiveDialog(dialog: ActiveDialog): void;
  toggleTypePicker(scope: TypePickerScope): void;
  setBulkPasswordDeviceType(deviceType: "全部设备" | DeviceType): void;
  updateBulkUsernameSearch(username: string): void;
  selectBulkUsername(suggestion: BulkUsernameSuggestion): void;
  selectAllBulkPasswordMatches(): void;
  clearBulkPasswordMatches(): void;
  isBulkPasswordMatchSelected(match: BulkPasswordMatch): boolean;
  toggleBulkPasswordMatch(match: BulkPasswordMatch): void;
  saveBulkPasswordUpdate(): void;
};

export type ActionPopoverModel = {
  activePopover: ActivePopover;
  popoverPosition: PopoverPosition;
  deviceTypeSortMode: DeviceTypeSortMode;
  sortMode: SortMode;
  contextDeviceType: "全部设备" | DeviceType;
  selectedDeviceType: "全部设备" | DeviceType;
  searchQuery: string;
  listContextLabel: string;
  selectedDeviceName: string;
  selectedAccountLabel: string;
  selectedAccountHasPassword: boolean;
  deviceTypeOptionsLength: number;
  hasSelectedDevice: boolean;
};

export type ActionPopoverActions = {
  setDeviceTypeSortMode(mode: DeviceTypeSortMode): void;
  setSortMode(mode: SortMode): void;
  selectDeviceType(deviceType: "全部设备" | DeviceType): void;
  openEditTypeDialog(deviceType?: "全部设备" | DeviceType): void;
  requestDeleteDeviceType(deviceType?: "全部设备" | DeviceType): void;
  canDeleteDeviceType(deviceType: "全部设备" | DeviceType): boolean;
  getDeviceTypeCount(deviceType: "全部设备" | DeviceType): number;
  openAddTypeDialog(): void;
  clearSearch(): void;
  openAddDeviceDialog(deviceType?: "全部设备" | DeviceType): void;
  openEditDeviceDialog(): void;
  requestDeleteSelectedDevice(): void;
  copySelectedDeviceInfo(): void;
  openPasswordDialog(): void;
  copySelectedAccountInfo(): void;
  openEditAccountDialog(): void;
  requestDeleteSelectedAccount(): void;
  setActivePopover(popover: ActivePopover | null): void;
};

export type DeviceDetailModel = {
  hasSelectedDevice: boolean;
  hasDevices: boolean;
  searchQuery: string;
  selectedItem: VaultItem;
  selectedAccounts: DeviceAccount[];
  selectedAccount: DeviceAccount;
  selectedAccountIds: number[];
  selectedAccountTargetCount: number;
  copyableAccountTargetCount: number;
  canDeleteSelectedAccountTargets: boolean;
  sortedHistory: PasswordHistory[];
  historySortDesc: boolean;
  visibleHistoryIds: number[];
  passwordStrength: string;
};

export type DeviceDetailActions = {
  openDetailBlankContextMenu(event: MouseEvent): void;
  openAccountContextMenu(id: number, event: MouseEvent): void;
  openAddAccountDialog(): void;
  openPasswordDialog(): void;
  copySelectedAccountInfo(): void;
  openEditAccountDialog(): void;
  requestDeleteSelectedAccount(): void;
  copyText(text: string, label: string): void;
  selectAccount(id: number): void;
  toggleAccountBatchSelection(id: number): void;
  selectAllCurrentAccounts(): void;
  clearAccountBatchSelection(): void;
  maskPassword(password: string): string;
  toggleHistoryPassword(id: number): void;
  requestRestoreHistoryPassword(history: PasswordHistory): void;
  toggleHistorySort(): void;
  clearSearch(): void;
  openAddDeviceDialog(): void;
};

export type PasswordGeneratorView = {
  canUseGeneratorForCurrentAccount: boolean;
  canUseGeneratorForBulkUpdate: boolean;
  selectedItem: VaultItem;
  selectedAccount: DeviceAccount;
  itemCount: number;
};

export type PasswordGeneratorActions = {
  closeGeneratorPanel(restoreDialog?: boolean): void;
  startGeneratorResize(event: PointerEvent): void;
  generatePassword(): void;
  copyGeneratedPassword(): void;
  setGeneratorLength(length: number, syncInput?: boolean): void;
  persistGeneratorDefaults(): void;
  setGeneratorMinimumNumbers(value: number | string): void;
  setGeneratorMinimumSymbols(value: number | string): void;
  setAllowedSymbols(value: string): void;
  setExcludedCharacters(value: string): void;
  updateGeneratorLengthFromSlider(event: Event): void;
  handleGeneratorLengthInput(value: string): void;
  commitGeneratorLengthInput(): void;
  handleGeneratorLengthKeydown(event: KeyboardEvent): void;
  useGeneratedPasswordForCurrentDevice(): void;
  useGeneratedPasswordForBulkUpdate(): void;
};
