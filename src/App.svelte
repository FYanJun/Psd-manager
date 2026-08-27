<script lang="ts">
  import { onMount } from "svelte";
import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
  import OverlayLayer from "./components/OverlayLayer.svelte";
  import VaultLockScreen from "./components/VaultLockScreen.svelte";
  import VaultStorageStatus from "./components/VaultStorageStatus.svelte";
  import WorkspaceContent from "./components/WorkspaceContent.svelte";

  import {
    GENERATOR_DEFAULT_RATIO,
    LIST_DEFAULT_RATIO,
    SIDEBAR_DEFAULT_RATIO,
    VAULT_SCHEMA_VERSION,
    initialItems,
  } from "./lib/constants";
  import { createDefaultAppSettings, loadAppSettings, normalizeAppSettings, resetAppSettings, saveAppSettings } from "./lib/app-settings";
  import {
    formatDeviceInfo,
  } from "./lib/device-commands";
  import {
    createAccountPasswordController,
    type AccountPasswordDerivedState,
    type AccountPasswordState,
  } from "./lib/controllers/account-password-controller";
  import { createConfigTransferController, type ConfigTransferState } from "./lib/controllers/config-transfer-controller";
  import { createDeviceController, type DeviceControllerState } from "./lib/controllers/device-controller";
  import { createDeviceTypeController, type DeviceTypeControllerState } from "./lib/controllers/device-type-controller";
  import { createKeyboardController, type KeyboardState } from "./lib/controllers/keyboard-controller";
  import { createNavigationController, type NavigationState } from "./lib/controllers/navigation-controller";
  import { createOverlayController, type OverlayState } from "./lib/controllers/overlay-controller";
  import { createPasswordGeneratorController, type PasswordGeneratorState } from "./lib/controllers/password-generator-controller";
  import { createSnapshotController } from "./lib/controllers/snapshot-controller";
  import { createStatusController } from "./lib/controllers/status-controller";
  import { createVaultStorageController, type VaultStorageState } from "./lib/controllers/vault-storage-controller";
  import { createWorkspaceLayoutController } from "./lib/controllers/workspace-layout-controller";
  import { createWindowSettingsController } from "./lib/controllers/window-settings-controller";
  import { ensureDeviceTypeMetadata } from "./lib/device-type-meta";
  import type {
    AccountForm,
    AppSettings,
    ActiveDialog,
    ActivePopover,
    BulkPasswordForm,
    BulkPasswordMatch,
    BulkUsernameSuggestion,
    ConfigData,
    ConfigFormat,
    ConfigImportMode,
    ConfirmationAction,
    DeviceForm,
    DeviceType,
    DeviceTypeMeta,
    DeviceTypeSortMode,
    GeneratorTarget,
    PendingConfirmation,
    PasswordHistory,
    PersistedVaultState,
    PopoverPosition,
    ResizePane,
    SortMode,
    TypeForm,
    TypePickerScope,
    VaultItem,
    VaultSnapshot,
    ViewState,
    VaultPasswordDialogMode,
  } from "./lib/types";
  import { filterDeviceTypeChoices } from "./lib/utils";
  import {
    normalizeDeviceTypeMetaList,
    normalizeVaultIdentityData,
  } from "./lib/config";
  import {
    createBlankItem,
    createEmptyAccountForm,
    createEmptyDeviceForm,
    iconClassForType as resolveIconClassForType,
    normalizeVaultItems,
  } from "./lib/vault";
  import { sortPasswordHistory } from "./lib/selectors/account-selectors";
  import { getDeviceTypeRows, getFilteredVaultItems, getVisibleDeviceTypeOptions } from "./lib/selectors/device-selectors";

  let items: VaultItem[] = initialItems;
  let customDeviceTypes: DeviceTypeMeta[] = [];
  let vaultSnapshots: VaultSnapshot[] = [];
  let vaultStorageState: VaultStorageState = "loading";
  let vaultStorageError = "";
  let vaultBackupRecoveryRequired = false;
  let hydrated = false;
  let searchQuery = "";
  let searchDraft = "";
  let searchApplyTimer: ReturnType<typeof window.setTimeout> | null = null;
  let selectedDeviceType: "全部设备" | DeviceType = "全部设备";
  let selectedId = 0;
  let sortMode: SortMode = "updatedDesc";
  let deviceTypeSortMode: DeviceTypeSortMode = "default";
  let historySortDesc = true;
  let activeDialog: ActiveDialog = null;
  let activePopover: ActivePopover = null;
  let pendingConfirmation: PendingConfirmation | null = null;
  let pendingImportedConfig: ConfigData | null = null;
  let pendingConfigFormat: ConfigFormat = "json";
  let importConfigMode: ConfigImportMode = "add-missing";
  let exportConfigFormat: ConfigFormat = "json";
  let contextDeviceType: "全部设备" | DeviceType = "全部设备";
  let popoverPosition: PopoverPosition = { top: 72, left: 22 };
  let deviceForm: DeviceForm = createEmptyDeviceForm();
  let accountForm: AccountForm = createEmptyAccountForm();
  let typeForm: TypeForm = { originalUuid: null, originalLabel: null, label: "", iconText: "", color: "blue" };
  let passwordForm = { password: "", reason: "" };
  let bulkPasswordForm: BulkPasswordForm = { deviceType: "全部设备", username: "", password: "", reason: "" };
  let bulkUsernameSearch = "";
  let bulkUsernameSuggestionsOpen = false;
  let bulkPasswordDeselectedKeys: string[] = [];
  let openTypePicker: TypePickerScope | null = null;
  let deviceTypeSearch = "";
  let bulkTypeSearch = "";
  let selectedAccountId = 0;
  let selectedAccountIds: number[] = [];
  let passwordVisible = false;
  let historyOpen = false;
  let historyContextKey = "";
  let visibleHistoryIds: number[] = [];
  let generatorPanelOpen = false;
  let generatorTarget: GeneratorTarget = null;
  let generatedPassword = "";
  let generatorLength = 8;
  let generatorLengthInput = "8";
  let useUpper = true;
  let useLower = true;
  let useNumbers = true;
  let useSymbols = true;
  let excludeSimilar = true;
  let preventRepeats = false;
  let minimumNumbers = 2;
  let minimumSymbols = 2;
  let allowedSymbols = "!@#$%^&*+-_=?.";
  let excludedCharacters = "";
  let copyStatus = "";
  let statusActionLabel = "";
  let revealResetToken = 0;
  let backStack: ViewState[] = [];
  let forwardStack: ViewState[] = [];
  let restoringView = false;
  let searchInput: HTMLInputElement | null = null;
  let sidebarRatio = SIDEBAR_DEFAULT_RATIO;
  let listRatio = LIST_DEFAULT_RATIO;
  let generatorRatio = GENERATOR_DEFAULT_RATIO;
  let resizingPane: ResizePane | null = null;
  let layoutStyle = "";
  let selectedDeviceFormTypeMeta: DeviceTypeMeta;
  let accountPasswordDerived: AccountPasswordDerivedState;
  let selectedTypeDeviceCount = 0;
  let passwordStrength = "";
  let passwordStrengthRequestId = 0;
  let passwordStrengthTimer: ReturnType<typeof window.setTimeout> | null = null;
  let passwordStrengthCacheKey = "";
  let passwordStrengthCacheValue = "";
  let canUseGeneratorForCurrentAccount = true;
  let canUseGeneratorForBulkUpdate = true;
  let appSettings: AppSettings = createDefaultAppSettings();
  let settingsActiveSection: "interface" | "workspace" | "generator" | "data" | "security" | "about" | "environment" = "interface";
  let settingsLoaded = false;
  let settingsSaveTimer: ReturnType<typeof window.setTimeout> | null = null;
  let settingsSaveQueue = Promise.resolve();
  let systemThemeMediaQuery: MediaQueryList | null = null;
  let tooltipEnabled = true;
  let autostartAvailable = false;
  let autostartUpdating = false;
  let appVersion = "0.1.17";
  let dataDialogReturnToSettings = false;
  let installationPath = "";
  let dataPath = "";
  let vaultLockEnabled = false;
  let vaultLocked = false;
  let vaultUnlockBusy = false;
  let vaultUnlockError = "";
  let vaultUnlockPassword = "";
  let vaultPasswordDialogMode: VaultPasswordDialogMode = "set";
  let vaultPasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };
  let vaultPasswordError = "";
  let vaultPasswordBusy = false;
  let autoLockTimer: ReturnType<typeof window.setTimeout> | null = null;
  let lastActivityAt = 0;
  let removeTrayLockListener: (() => void) | null = null;
  let trayLockListenerPromise: Promise<() => void> | null = null;
  let recoveryKey = "";
  let recoveryAcknowledged = false;
  let recoveryBusy = false;
  let recoveryError = "";
  let recoveryFileContent = "";
  let recoveryFileName = "";
  let recoveryFileSaved = false;
  let recoveryFileBusy = false;
  let recoveryFileError = "";

  const recoveryFileNameDefault = "PsdManager-Recovery.psdm-recovery";

  const windowSettingsController = createWindowSettingsController({
    read: () => appSettings,
    writeBounds: (windowBounds) => {
      if (!settingsLoaded || !appSettings.workspace.rememberWindowBounds) return;
      appSettings = {
        ...appSettings,
        workspace: { ...appSettings.workspace, windowBounds },
      };
      scheduleAppSettingsSave();
    },
  });

  function applyGeneratorSettings(generator: AppSettings["passwordGenerator"]) {
    generatorLength = generator.length;
    generatorLengthInput = String(generator.length);
    useUpper = generator.useUpper;
    useLower = generator.useLower;
    useNumbers = generator.useNumbers;
    useSymbols = generator.useSymbols;
    excludeSimilar = generator.excludeSimilar;
    preventRepeats = generator.preventRepeats;
    minimumNumbers = generator.minimumNumbers;
    minimumSymbols = generator.minimumSymbols;
    allowedSymbols = generator.allowedSymbols;
    excludedCharacters = generator.excludedCharacters;
  }

  function applyAppSettings(settings: AppSettings, restoreLastView = false) {
    tooltipEnabled = settings.interface.tooltipEnabled;
    applyInterfaceSettings(settings);
    sortMode = settings.workspace.deviceSortMode;
    deviceTypeSortMode = settings.workspace.deviceTypeSortMode;
    if (settings.workspace.rememberLayout) layoutController.restore(settings.workspace.paneLayout);
    applyGeneratorSettings(settings.passwordGenerator);
    if (restoreLastView && settings.workspace.rememberLastView) {
      selectedDeviceType = settings.workspace.lastView.deviceType;
      searchQuery = settings.workspace.lastView.searchQuery;
      searchDraft = searchQuery;
      sortMode = settings.workspace.lastView.sortMode;
    }
  }

  function scheduleAppSettingsSave() {
    if (!settingsLoaded) return;
    if (settingsSaveTimer) window.clearTimeout(settingsSaveTimer);
    settingsSaveTimer = window.setTimeout(() => {
      settingsSaveTimer = null;
      void persistAppSettings().catch((error) => {
        showStatus(
          `设置保存失败：${error instanceof Error ? error.message : String(error)}`,
          6000,
          "重试保存",
          () => {
            void persistAppSettings().then(() => showStatus("应用设置已保存")).catch((retryError) => {
              showStatus(`设置保存失败：${retryError instanceof Error ? retryError.message : String(retryError)}`, 6000);
            });
          },
        );
      });
    }, 220);
  }

  function persistAppSettings() {
    if (settingsSaveTimer) window.clearTimeout(settingsSaveTimer);
    settingsSaveTimer = null;
    const snapshot = appSettings;
    const save = settingsSaveQueue.then(() => saveAppSettings(snapshot));
    settingsSaveQueue = save.catch(() => undefined);
    return save;
  }

  function updateAppSettings(next: AppSettings) {
    appSettings = normalizeAppSettings(next);
    applyAppSettings(appSettings);
    scheduleAppSettingsSave();
  }

  const layoutController = createWorkspaceLayoutController({
    read: () => ({ sidebarRatio, listRatio, generatorRatio }),
    write: (layout) => {
      sidebarRatio = layout.sidebarRatio;
      listRatio = layout.listRatio;
      generatorRatio = layout.generatorRatio;
      if (settingsLoaded && appSettings.workspace.rememberLayout && !resizingPane) {
        appSettings = {
          ...appSettings,
          workspace: {
            ...appSettings.workspace,
            paneLayout: { ...layout },
          },
        };
        scheduleAppSettingsSave();
      }
    },
    setResizingPane: (pane) => (resizingPane = pane),
    onResizeEnd: () => {
      if (!settingsLoaded || !appSettings.workspace.rememberLayout) return;
      appSettings = {
        ...appSettings,
        workspace: {
          ...appSettings.workspace,
          paneLayout: { sidebarRatio, listRatio, generatorRatio },
        },
      };
      scheduleAppSettingsSave();
    },
    beforeResize: () => {
      activePopover = null;
      openTypePicker = null;
      bulkUsernameSuggestionsOpen = false;
    },
  });

  const statusController = createStatusController({
    write: (state) => {
      copyStatus = state.message;
      statusActionLabel = state.actionLabel;
    },
  });

  const passwordGeneratorController = createPasswordGeneratorController({
    read: (): PasswordGeneratorState => ({
      panelOpen: generatorPanelOpen,
      target: generatorTarget,
      generatedPassword,
      length: generatorLength,
      lengthInput: generatorLengthInput,
      useUpper,
      useLower,
      useNumbers,
      useSymbols,
      excludeSimilar,
      preventRepeats,
      minimumNumbers,
      minimumSymbols,
      allowedSymbols,
      excludedCharacters,
    }),
    write: (state) => {
      generatorPanelOpen = state.panelOpen;
      generatorTarget = state.target;
      generatedPassword = state.generatedPassword;
      generatorLength = state.length;
      generatorLengthInput = state.lengthInput;
      useUpper = state.useUpper;
      useLower = state.useLower;
      useNumbers = state.useNumbers;
      useSymbols = state.useSymbols;
      excludeSimilar = state.excludeSimilar;
      preventRepeats = state.preventRepeats;
      minimumNumbers = state.minimumNumbers;
      minimumSymbols = state.minimumSymbols;
      allowedSymbols = state.allowedSymbols;
      excludedCharacters = state.excludedCharacters;
    },
    openDialog: (dialog) => (activeDialog = dialog),
  });

  const navigationController = createNavigationController({
    read: (): NavigationState => ({
      items,
      selectedDeviceType,
      selectedId,
      selectedAccountId,
      selectedAccountIds,
      searchQuery,
      sortMode,
      backStack,
      forwardStack,
      restoringView,
      activePopover,
      passwordVisible,
      visibleHistoryIds,
    }),
    write: (patch) => {
      if (patch.items) items = patch.items;
      if (patch.selectedDeviceType) selectedDeviceType = patch.selectedDeviceType;
      if (patch.selectedId !== undefined) selectedId = patch.selectedId;
      if (patch.selectedAccountId !== undefined) selectedAccountId = patch.selectedAccountId;
      if (patch.selectedAccountIds) selectedAccountIds = patch.selectedAccountIds;
      if (patch.searchQuery !== undefined) searchQuery = patch.searchQuery;
      if (patch.sortMode) sortMode = patch.sortMode;
      if (patch.backStack) backStack = patch.backStack;
      if (patch.forwardStack) forwardStack = patch.forwardStack;
      if (patch.restoringView !== undefined) restoringView = patch.restoringView;
      if ("activePopover" in patch) activePopover = patch.activePopover ?? null;
      if (patch.passwordVisible !== undefined) passwordVisible = patch.passwordVisible;
      if (patch.visibleHistoryIds) visibleHistoryIds = patch.visibleHistoryIds;
    },
    focusSearch: () => {
      searchInput?.focus();
      searchInput?.select();
    },
    isDeviceTypeAvailable: (deviceType) => deviceType === "全部设备"
      || getVisibleDeviceTypeOptions(customDeviceTypes).some((type) => type.label === deviceType),
  });

  const deviceTypeController = createDeviceTypeController({
    read: (): DeviceTypeControllerState => ({
      items,
      customDeviceTypes,
      selectedDeviceType,
      selectedId,
      selectedAccountIds,
      typeForm,
    }),
    write: (patch) => {
      if (patch.items) items = patch.items;
      if (patch.customDeviceTypes) customDeviceTypes = patch.customDeviceTypes;
      if (patch.selectedDeviceType) selectedDeviceType = patch.selectedDeviceType;
      if (patch.selectedId !== undefined) selectedId = patch.selectedId;
      if (patch.selectedAccountIds) selectedAccountIds = patch.selectedAccountIds;
      if (patch.typeForm) typeForm = patch.typeForm;
    },
    setActiveDialog: (dialog) => (activeDialog = dialog),
    setActivePopover: (popover) => (activePopover = popover),
    setPendingConfirmation: (confirmation) => (pendingConfirmation = confirmation),
    showStatus,
    createSafetySnapshot,
    offerSnapshotUndo,
    pushNavigationState,
  });

  const deviceController = createDeviceController({
    read: (): DeviceControllerState => ({
      items,
      selectedItem,
      selectedAccounts,
      selectedDeviceType,
      selectedId,
      selectedAccountId,
      selectedAccountIds,
      searchQuery,
      hasSelectedDevice,
      deviceTypeOptions,
      deviceForm,
      activeDialog,
      activePopover,
      openTypePicker,
      deviceTypeSearch,
    }),
    write: (patch) => {
      if (patch.items) items = patch.items;
      if (patch.selectedDeviceType) selectedDeviceType = patch.selectedDeviceType;
      if (patch.selectedId !== undefined) selectedId = patch.selectedId;
      if (patch.selectedAccountId !== undefined) selectedAccountId = patch.selectedAccountId;
      if (patch.selectedAccountIds) selectedAccountIds = patch.selectedAccountIds;
      if (patch.searchQuery !== undefined) searchQuery = patch.searchQuery;
      if (patch.deviceForm) deviceForm = patch.deviceForm;
      if ("activeDialog" in patch) activeDialog = patch.activeDialog ?? null;
      if ("activePopover" in patch) activePopover = patch.activePopover ?? null;
      if ("openTypePicker" in patch) openTypePicker = patch.openTypePicker ?? null;
      if (patch.deviceTypeSearch !== undefined) deviceTypeSearch = patch.deviceTypeSearch;
    },
    getTypeMeta,
    iconClassForType,
    openAddTypeDialog,
    showStatus,
    pushNavigationState,
    createSafetySnapshot,
    offerSnapshotUndo,
    setPendingConfirmation: (confirmation) => (pendingConfirmation = confirmation),
  });

  const accountPasswordController = createAccountPasswordController({
    read: (): AccountPasswordState => ({
      items,
      selectedItem,
      hasSelectedDevice,
      selectedDeviceType,
      selectedId,
      selectedAccountId,
      selectedAccountIds,
      accountForm,
      passwordForm,
      bulkPasswordForm,
      bulkUsernameSearch,
      bulkUsernameSuggestionsOpen,
      bulkPasswordDeselectedKeys,
      bulkTypeSearch,
      passwordVisible,
      visibleHistoryIds,
    }),
    write: (patch) => {
      if (patch.items !== undefined) items = patch.items;
      if (patch.selectedId !== undefined) selectedId = patch.selectedId;
      if (patch.selectedAccountId !== undefined) selectedAccountId = patch.selectedAccountId;
      if (patch.selectedAccountIds !== undefined) selectedAccountIds = patch.selectedAccountIds;
      if (patch.accountForm !== undefined) accountForm = patch.accountForm;
      if (patch.passwordForm !== undefined) passwordForm = patch.passwordForm;
      if (patch.bulkPasswordForm !== undefined) bulkPasswordForm = patch.bulkPasswordForm;
      if (patch.bulkUsernameSearch !== undefined) bulkUsernameSearch = patch.bulkUsernameSearch;
      if (patch.bulkUsernameSuggestionsOpen !== undefined) bulkUsernameSuggestionsOpen = patch.bulkUsernameSuggestionsOpen;
      if (patch.bulkPasswordDeselectedKeys !== undefined) bulkPasswordDeselectedKeys = patch.bulkPasswordDeselectedKeys;
      if (patch.bulkTypeSearch !== undefined) bulkTypeSearch = patch.bulkTypeSearch;
      if (patch.passwordVisible !== undefined) passwordVisible = patch.passwordVisible;
      if (patch.visibleHistoryIds !== undefined) visibleHistoryIds = patch.visibleHistoryIds;
    },
    showStatus,
    copyText,
    createSafetySnapshot,
    offerSnapshotUndo,
    setActiveDialog: (dialog) => (activeDialog = dialog),
    getActiveDialog: () => activeDialog,
    setActivePopover: (popover) => (activePopover = popover),
    setPendingConfirmation: (confirmation) => (pendingConfirmation = confirmation),
    setOpenTypePicker: (scope) => (openTypePicker = scope),
    getGeneratorState: () => ({ target: generatorTarget, generatedPassword }),
    generatePassword,
    closeGeneratorPanel,
  });

  const overlayController = createOverlayController({
    read: (): OverlayState => ({
      activeDialog,
      activePopover,
      pendingConfirmation,
      pendingImportedConfig,
      popoverPosition,
      contextDeviceType,
      selectedDeviceType,
      selectedAccountId,
      selectedAccountIds,
      passwordVisible,
      visibleHistoryIds,
      openTypePicker,
      bulkUsernameSuggestionsOpen,
    }),
    write: (patch) => {
      if ("activeDialog" in patch) activeDialog = patch.activeDialog ?? null;
      if ("activePopover" in patch) activePopover = patch.activePopover ?? null;
      if ("pendingConfirmation" in patch) pendingConfirmation = patch.pendingConfirmation ?? null;
      if ("pendingImportedConfig" in patch) pendingImportedConfig = patch.pendingImportedConfig ?? null;
      if (patch.popoverPosition) popoverPosition = patch.popoverPosition;
      if (patch.contextDeviceType) contextDeviceType = patch.contextDeviceType;
      if (patch.selectedDeviceType) selectedDeviceType = patch.selectedDeviceType;
      if (patch.selectedAccountId !== undefined) selectedAccountId = patch.selectedAccountId;
      if (patch.selectedAccountIds) selectedAccountIds = patch.selectedAccountIds;
      if (patch.passwordVisible !== undefined) passwordVisible = patch.passwordVisible;
      if (patch.visibleHistoryIds) visibleHistoryIds = patch.visibleHistoryIds;
      if ("openTypePicker" in patch) openTypePicker = patch.openTypePicker ?? null;
      if (patch.bulkUsernameSuggestionsOpen !== undefined) bulkUsernameSuggestionsOpen = patch.bulkUsernameSuggestionsOpen;
    },
    hasSelectedDevice: () => hasSelectedDevice,
    hasAccount: (id) => selectedAccounts.some((account) => account.id === id),
    selectDevice,
    selectAccount,
  });

  const keyboardController = createKeyboardController({
    read: (): KeyboardState => ({
      vaultStorageState,
      openTypePicker,
      bulkUsernameSuggestionsOpen,
      pendingConfirmation,
      activeDialog,
      generatorPanelOpen,
      activePopover,
      searchQuery,
      filteredItems,
      selectedItemId: selectedItem.id,
      selectedAccountId: selectedAccount.id,
      hasSelectedDevice,
      backCount: backStack.length,
      forwardCount: forwardStack.length,
    }),
    write: (patch) => {
      if ("openTypePicker" in patch) openTypePicker = patch.openTypePicker ?? null;
      if (patch.bulkUsernameSuggestionsOpen !== undefined) bulkUsernameSuggestionsOpen = patch.bulkUsernameSuggestionsOpen;
      if ("pendingConfirmation" in patch) pendingConfirmation = patch.pendingConfirmation ?? null;
      if ("activeDialog" in patch) activeDialog = patch.activeDialog ?? null;
      if ("activePopover" in patch) activePopover = patch.activePopover ?? null;
    },
    actions: {
      closeGenerator: () => closeGeneratorPanel(),
      closeOverlays,
      cancelPendingConfirmation,
      clearSearch,
      confirmPendingAction,
      saveActiveDialog,
      selectDevice,
      focusSearch: focusSearchInput,
      goBack,
      goForward,
      openAddAccount: openAddAccountDialog,
      openAddDevice: () => openAddDeviceDialog(),
      openGenerator: () => openGeneratorPanel(),
      openBulkPassword: () => openBulkPasswordDialog(),
      openPassword: openPasswordDialog,
      openEditDevice: openEditDeviceDialog,
    },
  });

  const vaultStorageController = createVaultStorageController({
    capture: (revision) => createPersistedVaultState(revision),
    applyLoaded: applyPersistedVaultState,
    clampLayout: () => layoutController.clamp(),
    showStatus,
    persistAppSettings,
    captureWindowBounds: () => windowSettingsController.capture(),
    isLockEnabled: () => vaultLockEnabled,
    isLocked: () => vaultLocked,
    hasPendingRecoveryFile: () => Boolean(recoveryKey && !recoveryFileSaved),
    lock: lockVaultSession,
    writeViewState: (state) => {
      vaultStorageState = state.state;
      vaultStorageError = state.error;
      vaultBackupRecoveryRequired = state.canRecoverBackup;
      hydrated = state.hydrated;
    },
  });

  const snapshotController = createSnapshotController({
    read: () => ({ items, customDeviceTypes, snapshots: vaultSnapshots }),
    writeSnapshots: (snapshots) => (vaultSnapshots = snapshots),
    applySnapshot: applySnapshotData,
    setActiveDialog: (dialog) => (activeDialog = dialog),
    setPendingConfirmation: (confirmation) => (pendingConfirmation = confirmation),
    showStatus,
    persistImmediately: () => vaultStorageController.persistImmediately(),
    refreshDirtyState: () => vaultStorageController.refreshDirtyState(),
  });

  const configTransferController = createConfigTransferController({
    read: (): ConfigTransferState => ({
      items,
      customDeviceTypes,
      pendingImportedConfig,
      pendingConfigFormat,
      importConfigMode,
      exportConfigFormat,
    }),
    write: (patch) => {
      if (patch.items) items = patch.items;
      if (patch.customDeviceTypes) customDeviceTypes = patch.customDeviceTypes;
      if ("pendingImportedConfig" in patch) pendingImportedConfig = patch.pendingImportedConfig ?? null;
      if (patch.pendingConfigFormat) pendingConfigFormat = patch.pendingConfigFormat;
      if (patch.importConfigMode) importConfigMode = patch.importConfigMode;
      if (patch.exportConfigFormat) exportConfigFormat = patch.exportConfigFormat;
    },
    setActiveDialog: (dialog) => (activeDialog = dialog),
    setActivePopover: (popover) => (activePopover = popover),
    setPendingConfirmation: (confirmation) => (pendingConfirmation = confirmation),
    showStatus,
    createSafetySnapshot,
    offerSnapshotUndo,
    resetWorkspaceAfterReplace: (nextItems) => {
      resetWorkspaceForDataset(nextItems);
    },
  });

  function applyPersistedVaultState(parsed: PersistedVaultState) {
    items = parsed.items;
    customDeviceTypes = parsed.customDeviceTypes;
    ensureDeviceTypeMetaForItems(items);
    vaultSnapshots = Array.isArray(parsed.snapshots) ? parsed.snapshots.slice(0, 10) : [];
    if (appSettings.workspace.rememberLastView) {
      const rememberedType = appSettings.workspace.lastView.deviceType;
      selectedDeviceType = rememberedType === "全部设备" || customDeviceTypes.some((type) => type.label === rememberedType)
        ? rememberedType
        : "全部设备";
      searchQuery = appSettings.workspace.lastView.searchQuery;
      sortMode = appSettings.workspace.lastView.sortMode;
    }
    if (appSettings.workspace.rememberLastView) {
      selectedId = items.find((item) => item.uuid === appSettings.workspace.lastView.selectedDeviceUuid)?.id ?? items[0]?.id ?? 0;
    }
  }

  function createPersistedVaultState(revision: number): PersistedVaultState {
    return {
      schemaVersion: VAULT_SCHEMA_VERSION,
      revision,
      items,
      customDeviceTypes,
      snapshots: vaultSnapshots,
    };
  }

  async function createSafetySnapshot(reason: string) {
    return snapshotController.createSafetySnapshot(reason);
  }

  function applySnapshotData(snapshot: VaultSnapshot) {
    items = normalizeVaultItems(snapshot.items);
    customDeviceTypes = normalizeDeviceTypeMetaList(snapshot.customDeviceTypes);
    ensureDeviceTypeMetaForItems(items);
    resetWorkspaceForDataset(items);
  }

  function resetWorkspaceForDataset(nextItems: VaultItem[]) {
    if (searchApplyTimer) window.clearTimeout(searchApplyTimer);
    searchApplyTimer = null;
    navigationController.resetWorkspace(nextItems);
    searchDraft = "";
    historyOpen = false;
    historyContextKey = "";
  }

  async function initializeAppSettings() {
    try {
      const loaded = await loadAppSettings();
      appSettings = loaded;
      applyAppSettings(appSettings, true);
      settingsLoaded = true;
      await windowSettingsController.restore();
      await windowSettingsController.mount();
    } catch (error) {
      appSettings = createDefaultAppSettings();
      applyAppSettings(appSettings, true);
      settingsLoaded = true;
      await windowSettingsController.mount();
      showStatus(`应用设置读取失败，已使用默认设置：${error instanceof Error ? error.message : String(error)}`, 6000);
    }
    if (isTauri()) {
      try {
        const enabled = await isAutostartEnabled();
        autostartAvailable = true;
        if (appSettings.interface.startOnBoot !== enabled) {
          appSettings = normalizeAppSettings({
            ...appSettings,
            interface: { ...appSettings.interface, startOnBoot: enabled },
          });
          await persistAppSettings();
        }
      } catch (error) {
        showStatus(`开机自启状态读取失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      }
      try {
        appVersion = await getVersion();
      } catch {
        // Keep the package version fallback in browser preview or older runtimes.
      }
      try {
        const storageInfo = await invoke<{ installationPath: string; dataPath: string }>("get_storage_info");
        installationPath = storageInfo.installationPath;
        dataPath = storageInfo.dataPath;
      } catch (error) {
        showStatus(`存储路径读取失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      }
    }
  }

  async function openStoragePath(kind: "installation" | "data") {
    if (!isTauri()) {
      showStatus("浏览器预览模式不支持打开本地目录");
      return;
    }
    try {
      await invoke("open_storage_path", { kind });
    } catch (error) {
      showStatus(`打开目录失败：${error instanceof Error ? error.message : String(error)}`, 6000);
    }
  }

  function applyInterfaceSettings(settings: AppSettings) {
    const resolvedTheme = settings.interface.theme === "system"
      ? systemThemeMediaQuery?.matches ? "dark" : "light"
      : settings.interface.theme;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = settings.interface.theme;
    document.documentElement.dataset.density = settings.interface.density;
    document.documentElement.dataset.fontSize = settings.interface.fontSize;
    void windowSettingsController.applyTheme(settings.interface.theme);
  }

  function handleSystemThemeChange() {
    if (appSettings.interface.theme === "system") applyInterfaceSettings(appSettings);
  }

  async function restoreSnapshot(snapshotId: string, createCurrentBackup: boolean) {
    const returnToSettings = dataDialogReturnToSettings;
    dataDialogReturnToSettings = false;
    await snapshotController.restoreSnapshot(snapshotId, createCurrentBackup);
    if (returnToSettings && activeDialog === null) {
      settingsActiveSection = "data";
      activeDialog = "settings";
    }
  }

  function offerSnapshotUndo(snapshotId: string, message: string) {
    // Importing from settings closes the data dialog before the toast is shown.
    // Keep that context with the undo action so restoring from the toast does
    // not unexpectedly drop the user back into the workspace.
    const returnToSettings = dataDialogReturnToSettings || activeDialog === "settings";
    snapshotController.offerUndo(snapshotId, message, () => {
      if (returnToSettings && activeDialog === null) {
        settingsActiveSection = "data";
        activeDialog = "settings";
      }
    });
  }

  function requestRestoreSnapshot(snapshot: VaultSnapshot) {
    snapshotController.requestRestore(snapshot);
  }

  async function recoverVaultBackup() {
    await vaultStorageController.recoverBackup();
    if (vaultStorageState === "ready" && !vaultLocked) scheduleAutoLock();
  }

  async function retryVaultStorage() {
    await vaultStorageController.retry();
    if (vaultStorageState === "ready" && !vaultLocked) scheduleAutoLock();
  }

  onMount(() => {
    systemThemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    systemThemeMediaQuery.addEventListener("change", handleSystemThemeChange);
    // Register native close/exit and tray listeners before startup work. This
    // prevents an early close or tray action from being lost while the vault is
    // still loading.
    void (async () => {
      await vaultStorageController.mountCloseProtection();
      if (isTauri()) {
        const listenerPromise = listen("tray-lock-requested", () => {
          void lockVaultNow();
        });
        trayLockListenerPromise = listenerPromise;
        try {
          const removeListener = await listenerPromise;
          if (trayLockListenerPromise === listenerPromise) removeTrayLockListener = removeListener;
          else removeListener();
        } catch (error) {
          if (trayLockListenerPromise === listenerPromise) trayLockListenerPromise = null;
          showStatus(`托盘锁定监听初始化失败：${error instanceof Error ? error.message : String(error ?? "未知错误")}`, 6000);
        }
      }
      await initializeAppSettings();
      await initializeVaultLock();
    })();
    overlayController.mount();
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("keydown", handleUserActivity);
    window.addEventListener("pointerdown", handleUserActivity);
    window.addEventListener("pointermove", handleUserActivity);
    window.addEventListener("resize", clampPaneLayout);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      overlayController.destroy();
      window.removeEventListener("keydown", handleGlobalKeydown);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("pointerdown", handleUserActivity);
      window.removeEventListener("pointermove", handleUserActivity);
      window.removeEventListener("resize", clampPaneLayout);
      window.removeEventListener("blur", handleWindowBlur);
      vaultStorageController.destroy();
      windowSettingsController.destroy();
      systemThemeMediaQuery?.removeEventListener("change", handleSystemThemeChange);
      systemThemeMediaQuery = null;
      statusController.destroy();
      stopPaneResize();
      if (searchApplyTimer) window.clearTimeout(searchApplyTimer);
      searchApplyTimer = null;
      if (passwordStrengthTimer) window.clearTimeout(passwordStrengthTimer);
      passwordStrengthTimer = null;
      passwordStrengthCacheKey = "";
      passwordStrengthCacheValue = "";
      clearAutoLockTimer();
      if (removeTrayLockListener) {
        removeTrayLockListener();
        removeTrayLockListener = null;
        trayLockListenerPromise = null;
      } else if (trayLockListenerPromise) {
        trayLockListenerPromise = null;
      }
      if (settingsSaveTimer) window.clearTimeout(settingsSaveTimer);
    };
  });

  $: if (hydrated) {
    items;
    customDeviceTypes;
    vaultSnapshots;
    vaultStorageController.schedule();
  }

  $: {
    sidebarRatio;
    listRatio;
    generatorRatio;
    layoutStyle = layoutController.style();
  }

  $: filteredItems = getFilteredVaultItems(items, searchQuery, selectedDeviceType, sortMode);

  $: selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? createBlankItem();
  $: hasDevices = items.length > 0;
  $: hasSelectedDevice = selectedItem.id > 0 && filteredItems.some((item) => item.id === selectedItem.id);

  $: if (filteredItems.length > 0 && !filteredItems.some((item) => item.id === selectedId)) {
    selectedId = filteredItems[0].id;
    selectedAccountId = 0;
    selectedAccountIds = [];
  }

  $: deviceTypeOptions = getVisibleDeviceTypeOptions(customDeviceTypes);
  $: deviceTypeRows = getDeviceTypeRows(deviceTypeOptions, deviceTypeSortMode, items);
  $: filteredDeviceTypeOptions = filterDeviceTypeChoices(deviceTypeOptions, deviceTypeSearch);
  $: filteredBulkTypeRows = filterDeviceTypeChoices(deviceTypeRows, bulkTypeSearch);
  $: {
    deviceTypeOptions;
    selectedDeviceFormTypeMeta = getTypeMeta(deviceForm.deviceType);
  }
  $: selectedBulkTypeMeta = deviceTypeRows.find((type) => type.label === bulkPasswordForm.deviceType) ?? deviceTypeRows[0];

  $: {
    items;
    selectedItem;
    hasSelectedDevice;
    selectedDeviceType;
    selectedId;
    selectedAccountId;
    selectedAccountIds;
    accountForm;
    passwordForm;
    bulkPasswordForm;
    bulkUsernameSearch;
    bulkPasswordDeselectedKeys;
    bulkTypeSearch;
    passwordVisible;
    visibleHistoryIds;
    accountPasswordDerived = accountPasswordController.derive();
  }
  $: selectedAccounts = accountPasswordDerived.selectedAccounts;
  $: selectedAccount = accountPasswordDerived.selectedAccount;
  $: {
    const nextHistoryContextKey = selectedItem.uuid && selectedAccount.uuid
      ? `${selectedItem.uuid}:${selectedAccount.uuid}`
      : "";
    if (nextHistoryContextKey !== historyContextKey) {
      historyContextKey = nextHistoryContextKey;
      historyOpen = false;
    }
  }
  $: selectedAccountTargets = accountPasswordDerived.selectedAccountTargets;
  $: selectedAccountTargetCount = selectedAccountTargets.length;
  $: copyableAccountTargetCount = selectedAccountTargets.filter((account) => Boolean(account.password)).length;
  $: canDeleteSelectedAccountTargets = selectedAccountTargetCount > 0;
  $: {
    selectedItem;
    selectedAccountId;
    selectedAccountIds;
    accountPasswordController.reconcileSelection();
  }
  $: void refreshPasswordStrength(selectedAccount.password, [
    selectedAccount.username,
    selectedAccount.tag,
    selectedItem.deviceName,
    selectedItem.deviceType,
    selectedItem.ipAddress,
  ]);
  $: {
    items;
    selectedTypeDeviceCount = getDeviceTypeCount(selectedDeviceType);
  }
  $: canDeleteSelectedDeviceType = selectedDeviceType !== "全部设备" && selectedTypeDeviceCount === 0;
  $: listContextLabel = selectedDeviceType;
  $: searchPlaceholder = selectedDeviceType === "全部设备"
    ? "搜索设备名、连接地址、资产编号或位置"
    : `在${selectedDeviceType}中搜索设备名、连接地址、资产编号或位置`;
  $: sortedHistory = sortPasswordHistory(selectedAccount, historySortDesc);
  $: bulkUsernameSuggestions = accountPasswordDerived.bulkUsernameSuggestions;
  $: bulkPasswordMatches = accountPasswordDerived.bulkPasswordMatches;
  $: bulkPasswordSelectedMatches = accountPasswordDerived.bulkPasswordSelectedMatches;
  $: {
    generatorTarget;
    canUseGeneratorForCurrentAccount = accountPasswordController.canUseGeneratorForCurrentAccount();
    canUseGeneratorForBulkUpdate = accountPasswordController.canUseGeneratorForBulkUpdate();
  }
  function pushNavigationState() {
    navigationController.push();
  }

  function goBack() {
    if (searchApplyTimer) window.clearTimeout(searchApplyTimer);
    searchApplyTimer = null;
    navigationController.back();
    searchDraft = searchQuery;
  }

  function goForward() {
    if (searchApplyTimer) window.clearTimeout(searchApplyTimer);
    searchApplyTimer = null;
    navigationController.forward();
    searchDraft = searchQuery;
  }

  function updateSearchValue(value: string) {
    searchDraft = value;
    if (searchApplyTimer) window.clearTimeout(searchApplyTimer);
    if (!value.trim()) {
      searchApplyTimer = null;
      navigationController.updateSearch(value);
      persistLastView();
      return;
    }
    searchApplyTimer = window.setTimeout(() => {
      searchApplyTimer = null;
      navigationController.updateSearch(searchDraft);
      persistLastView();
    }, 140);
  }

  function clearSearch() {
    if (searchApplyTimer) window.clearTimeout(searchApplyTimer);
    searchApplyTimer = null;
    searchDraft = "";
    navigationController.clearSearch();
    persistLastView();
  }

  function focusSearchInput() {
    navigationController.focusSearch();
  }

  function selectDeviceType(deviceType: "全部设备" | DeviceType) {
    if (searchApplyTimer) window.clearTimeout(searchApplyTimer);
    searchApplyTimer = null;
    navigationController.selectDeviceType(deviceType, searchDraft);
    persistLastView();
  }

  function persistLastView(selectedDeviceUuid = selectedItem?.uuid ?? "") {
    if (!settingsLoaded || !appSettings.workspace.rememberLastView) return;
    appSettings = {
      ...appSettings,
      workspace: {
        ...appSettings.workspace,
        lastView: {
          ...appSettings.workspace.lastView,
          deviceType: selectedDeviceType,
          searchQuery,
          sortMode,
          selectedDeviceUuid,
        },
      },
    };
    scheduleAppSettingsSave();
  }

  function selectDevice(id: number) {
    navigationController.selectDevice(id);
    persistLastView(items.find((item) => item.id === id)?.uuid ?? "");
  }

  async function copyText(text: string, label: string) {
    if (!text) {
      showStatus(`${label}没有可复制的内容`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showStatus(`${label}已复制`);
    } catch {
      showStatus("复制失败");
    }
  }

  function refreshPasswordStrength(password: string, userInputs: string[]) {
    const requestId = ++passwordStrengthRequestId;
    if (passwordStrengthTimer) window.clearTimeout(passwordStrengthTimer);
    passwordStrengthTimer = null;
    if (!password) {
      passwordStrength = "";
      return;
    }
    const cacheKey = `${password}\u0000${userInputs.join("\u0000")}`;
    if (cacheKey === passwordStrengthCacheKey) {
      passwordStrength = passwordStrengthCacheValue;
      return;
    }
    passwordStrength = "计算中";
    passwordStrengthTimer = window.setTimeout(() => {
      passwordStrengthTimer = null;
      void (async () => {
        try {
          const { getPasswordStrengthLabel } = await import("./lib/password-strength");
          if (requestId !== passwordStrengthRequestId) return;
          const label = getPasswordStrengthLabel(password, userInputs);
          passwordStrengthCacheKey = cacheKey;
          passwordStrengthCacheValue = label;
          passwordStrength = label;
        } catch {
          if (requestId === passwordStrengthRequestId) passwordStrength = "暂不可用";
        }
      })();
    }, 180);
  }

  function handleWindowBlur() {
    if (passwordStrengthTimer) window.clearTimeout(passwordStrengthTimer);
    passwordStrengthTimer = null;
    passwordStrengthCacheKey = "";
    passwordStrengthCacheValue = "";
    passwordVisible = false;
    passwordStrength = "";
    passwordStrengthRequestId += 1;
    visibleHistoryIds = [];
    revealResetToken += 1;
    if (generatorPanelOpen) {
      generatedPassword = "";
      generatorPanelOpen = false;
      generatorTarget = null;
    }
  }

  function clearAutoLockTimer() {
    if (autoLockTimer) window.clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }

  function scheduleAutoLock() {
    clearAutoLockTimer();
    const minutes = appSettings.interface.autoLockMinutes;
    if (!settingsLoaded || vaultStorageState !== "ready" || !vaultLockEnabled || vaultLocked || recoveryKey || minutes <= 0) return;
    autoLockTimer = window.setTimeout(() => {
      autoLockTimer = null;
      void lockVaultNow();
    }, minutes * 60 * 1000);
  }

  function handleUserActivity() {
    if (vaultLocked) return;
    const now = Date.now();
    // Pointer movement can fire many times per frame; one reset per second is
    // enough to represent activity without continuously rebuilding the timer.
    if (now - lastActivityAt < 1000) return;
    lastActivityAt = now;
    scheduleAutoLock();
  }

  function openSnapshotsDialog() {
    dataDialogReturnToSettings = activeDialog === "settings";
    activePopover = null;
    activeDialog = "snapshots";
  }

  function openSettings() {
    dataDialogReturnToSettings = false;
    activePopover = null;
    settingsActiveSection = "interface";
    activeDialog = "settings";
  }

  function setSettingsSection(section: "interface" | "workspace" | "generator" | "data" | "security" | "about" | "environment") {
    settingsActiveSection = section;
  }

  function clearSensitiveVaultState() {
    if (passwordStrengthTimer) window.clearTimeout(passwordStrengthTimer);
    passwordStrengthTimer = null;
    passwordStrengthCacheKey = "";
    passwordStrengthCacheValue = "";
    items = initialItems;
    customDeviceTypes = [];
    vaultSnapshots = [];
    selectedDeviceType = "全部设备";
    searchQuery = "";
    searchDraft = "";
    selectedId = 0;
    selectedAccountId = 0;
    selectedAccountIds = [];
    historyOpen = false;
    historyContextKey = "";
    visibleHistoryIds = [];
    generatedPassword = "";
    generatorPanelOpen = false;
    generatorTarget = null;
    activeDialog = null;
    activePopover = null;
    pendingConfirmation = null;
    pendingImportedConfig = null;
    dataDialogReturnToSettings = false;
    passwordVisible = false;
    accountForm = createEmptyAccountForm();
    passwordForm = { password: "", reason: "" };
    bulkPasswordForm = { deviceType: "全部设备", username: "", password: "", reason: "" };
    bulkUsernameSearch = "";
    bulkUsernameSuggestionsOpen = false;
    bulkPasswordDeselectedKeys = [];
    bulkTypeSearch = "";
    deviceTypeSearch = "";
    openTypePicker = null;
    typeForm = { originalUuid: null, originalLabel: null, label: "", iconText: "", color: "blue" };
    deviceForm = createEmptyDeviceForm();
    vaultPasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };
    vaultPasswordError = "";
    recoveryKey = "";
    recoveryAcknowledged = false;
    recoveryError = "";
    recoveryFileContent = "";
    recoveryFileName = "";
    recoveryFileSaved = false;
    recoveryFileError = "";
    revealResetToken += 1;
  }

  async function lockVaultSession() {
    clearAutoLockTimer();
    if (!vaultLockEnabled || vaultLocked) return;
    await invoke("lock_vault");
    clearSensitiveVaultState();
    vaultStorageController.suspend();
    vaultLocked = true;
    vaultUnlockPassword = "";
    vaultUnlockError = "";
  }

  async function lockVaultNow() {
    if (!vaultLockEnabled) {
      showStatus("请先开启启动密码");
      return;
    }
    if (vaultLocked) return;
    if (recoveryKey && !recoveryFileSaved) {
      showStatus("请先保存启动密码恢复文件", 6000);
      return;
    }
    try {
      if (vaultStorageState === "save-error") {
        throw new Error("资产库尚未安全保存，请先重试保存");
      }
      if (vaultStorageState === "ready" && vaultStorageController.hasUnsavedChanges()) {
        await vaultStorageController.persistImmediately();
      }
      await lockVaultSession();
    } catch (error) {
      showStatus(`锁定资产库失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      scheduleAutoLock();
    }
  }

  async function unlockVault() {
    if (!vaultLocked || vaultUnlockBusy || !vaultUnlockPassword) return;
    vaultUnlockBusy = true;
    vaultUnlockError = "";
    let unlocked = false;
    try {
      if (!isTauri()) throw new Error("浏览器预览模式不支持启动密码");
      await invoke("unlock_vault", { password: vaultUnlockPassword });
      unlocked = true;
      vaultUnlockPassword = "";
      await vaultStorageController.initialize();
      if (vaultStorageState !== "ready") {
        throw new Error(vaultStorageError || "资产库读取失败");
      }
      vaultLocked = false;
      scheduleAutoLock();
    } catch (error) {
      if (unlocked) {
        // The password is valid, but the storage overlay must remain available
        // so the user can retry or explicitly recover a valid backup.
        vaultLocked = false;
        vaultUnlockError = "";
      } else {
        vaultUnlockError = error instanceof Error ? error.message : String(error ?? "解锁失败");
        await invoke("lock_vault").catch(() => undefined);
      }
      vaultUnlockPassword = "";
    } finally {
      vaultUnlockBusy = false;
    }
  }

  async function initializeVaultLock() {
    if (!isTauri()) {
      vaultLockEnabled = false;
      await vaultStorageController.initialize();
      return;
    }
    try {
      vaultLockEnabled = await invoke<boolean>("get_vault_lock_status");
      if (appSettings.interface.startupLock !== vaultLockEnabled) {
        appSettings = normalizeAppSettings({
          ...appSettings,
          interface: { ...appSettings.interface, startupLock: vaultLockEnabled },
        });
        await persistAppSettings();
      }
      if (vaultLockEnabled) {
        vaultLocked = true;
        vaultStorageController.suspend();
      } else {
        await vaultStorageController.initialize();
        scheduleAutoLock();
      }
    } catch (error) {
      vaultLockEnabled = true;
      vaultLocked = true;
      vaultUnlockError = `无法读取启动密码状态：${error instanceof Error ? error.message : String(error)}`;
      vaultStorageController.suspend();
    }
  }

  function openVaultPasswordDialog(mode: VaultPasswordDialogMode) {
    vaultPasswordDialogMode = mode;
    vaultPasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };
    vaultPasswordError = "";
    activeDialog = "security-password";
  }

  async function saveVaultPassword() {
    if (vaultPasswordBusy) return;
    if (vaultPasswordDialogMode !== "disable" && vaultPasswordForm.newPassword !== vaultPasswordForm.confirmPassword) {
      vaultPasswordError = "两次输入的新主密码不一致";
      return;
    }
    vaultPasswordBusy = true;
    vaultPasswordError = "";
    try {
      if (!isTauri()) throw new Error("浏览器预览模式不支持启动密码");
      if (vaultPasswordDialogMode === "set") {
        recoveryKey = await invoke<string>("setup_vault_password", { password: vaultPasswordForm.newPassword });
        vaultLockEnabled = true;
      } else if (vaultPasswordDialogMode === "change") {
        recoveryKey = await invoke<string>("change_vault_password", {
          currentPassword: vaultPasswordForm.currentPassword,
          newPassword: vaultPasswordForm.newPassword,
        });
      } else {
        await invoke("disable_vault_password", { password: vaultPasswordForm.currentPassword });
        vaultLockEnabled = false;
      }
      appSettings = normalizeAppSettings({
        ...appSettings,
        interface: {
          ...appSettings.interface,
          startupLock: vaultLockEnabled,
          autoLockMinutes: vaultLockEnabled ? appSettings.interface.autoLockMinutes : 0,
        },
      });
      await persistAppSettings();
      scheduleAutoLock();
      vaultPasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };
      if (recoveryKey) {
        recoveryAcknowledged = false;
        recoveryFileSaved = false;
        recoveryFileName = "";
        recoveryFileError = "";
        return;
      }
      activeDialog = "settings";
      settingsActiveSection = "security";
      showStatus("启动密码已关闭");
    } catch (error) {
      vaultPasswordError = error instanceof Error ? error.message : String(error ?? "启动密码操作失败");
    } finally {
      vaultPasswordBusy = false;
    }
  }

  function fileNameFromPath(path: string) {
    return path.split(/[\\/]/).filter(Boolean).pop() || recoveryFileNameDefault;
  }

  async function saveRecoveryFile() {
    if (!recoveryKey || recoveryFileBusy) return;
    recoveryFileBusy = true;
    recoveryFileError = "";
    try {
      const content = recoveryKey;
      if (isTauri()) {
        const path = await saveFileDialog({
          title: "保存恢复文件",
          defaultPath: recoveryFileNameDefault,
          filters: [{ name: "Psd Manager 恢复文件", extensions: ["psdm-recovery"] }],
        });
        if (!path) {
          recoveryFileError = "已取消保存恢复文件";
          return;
        }
        await writeTextFile(path, content);
        recoveryFileName = fileNameFromPath(path);
      } else {
        const blob = new Blob([content], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = recoveryFileNameDefault;
        anchor.click();
        URL.revokeObjectURL(url);
        recoveryFileName = recoveryFileNameDefault;
      }
      recoveryFileSaved = true;
      recoveryAcknowledged = false;
      showStatus("恢复文件已保存");
    } catch (error) {
      recoveryFileSaved = false;
      recoveryFileError = error instanceof Error ? error.message : String(error ?? "恢复文件保存失败");
    } finally {
      recoveryFileBusy = false;
    }
  }

  async function chooseRecoveryFile() {
    recoveryError = "";
    try {
      if (isTauri()) {
        const path = await openFileDialog({
          title: "选择恢复文件",
          multiple: false,
          filters: [{ name: "Psd Manager 恢复文件", extensions: ["psdm-recovery"] }],
        });
        if (!path || Array.isArray(path)) return;
        recoveryFileContent = await readTextFile(path);
        if (!recoveryFileContent.trim()) throw new Error("恢复文件为空");
        recoveryFileName = fileNameFromPath(path);
        recoveryFileSaved = false;
      } else {
        const content = await new Promise<{ content: string; name: string } | null>((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".psdm-recovery,application/json";
          input.onchange = async () => {
            const file = input.files?.[0];
            resolve(file ? { content: await file.text(), name: file.name } : null);
          };
          input.click();
        });
        if (!content) return;
        if (!content.content.trim()) throw new Error("恢复文件为空");
        recoveryFileContent = content.content;
        recoveryFileName = content.name;
        recoveryFileSaved = false;
      }
      showStatus(`已选择恢复文件：${recoveryFileName}`);
    } catch (error) {
      recoveryFileContent = "";
      recoveryFileName = "";
      recoveryError = error instanceof Error ? error.message : String(error ?? "恢复文件读取失败");
    }
  }

  function finishRecoveryKeyDisplay() {
    if (!recoveryKey || !recoveryFileSaved || !recoveryAcknowledged) return;
    const wasLocked = vaultLocked;
    const passwordMode = vaultPasswordDialogMode;
    recoveryKey = "";
    recoveryAcknowledged = false;
    recoveryError = "";
    recoveryFileContent = "";
    recoveryFileName = "";
    recoveryFileSaved = false;
    recoveryFileError = "";
    if (wasLocked) {
      vaultLocked = false;
      vaultUnlockError = "";
      vaultUnlockPassword = "";
      scheduleAutoLock();
      showStatus(vaultStorageState === "ready" ? "资产库已恢复" : "恢复文件已保存，请处理资产库读取问题");
      return;
    }
    activeDialog = "settings";
    settingsActiveSection = "security";
    scheduleAutoLock();
    showStatus(passwordMode === "set" ? "启动密码已开启" : "启动密码已修改");
  }

  async function recoverVaultPassword(newPassword: string, manualRecoveryKey = "") {
    const recoveryInput = manualRecoveryKey || recoveryFileContent;
    if (recoveryBusy || !recoveryInput) return;
    recoveryBusy = true;
    recoveryError = "";
    let passwordRecovered = false;
    try {
      if (!isTauri()) throw new Error("浏览器预览模式不支持恢复文件");
      recoveryKey = await invoke<string>("recover_vault_password", {
        recoveryFile: recoveryInput,
        newPassword,
      });
      passwordRecovered = true;
      await vaultStorageController.initialize();
      if (vaultStorageState !== "ready") {
        throw new Error(vaultStorageError || "资产库读取失败");
      }
      recoveryFileContent = "";
      recoveryFileName = "";
      recoveryFileSaved = false;
      recoveryFileError = "";
      recoveryAcknowledged = false;
    } catch (error) {
      if (passwordRecovered) {
        // Keep the newly generated recovery file visible until the user saves
        // it, even when the vault still needs an explicit backup recovery or a
        // retry before the workspace can open.
        vaultLocked = true;
        recoveryError = "";
        recoveryFileSaved = false;
        recoveryAcknowledged = false;
        recoveryFileError = error instanceof Error
          ? `主密码已恢复，但资产库暂时无法读取：${error.message}`
          : "主密码已恢复，但资产库暂时无法读取，请先保存恢复文件";
      } else {
        recoveryKey = "";
        recoveryFileSaved = false;
        recoveryError = error instanceof Error ? error.message : String(error ?? "恢复失败");
        await invoke("lock_vault").catch(() => undefined);
      }
    } finally {
      recoveryBusy = false;
    }
  }

  function setStartupLock(value: boolean) {
    openVaultPasswordDialog(value ? "set" : "disable");
  }

  function setAutoLockEnabled(value: boolean) {
    if (!vaultLockEnabled) {
      showStatus("请先开启启动密码");
      return;
    }
    updateAppSettings({
      ...appSettings,
      interface: {
        ...appSettings.interface,
        autoLockMinutes: value
          ? appSettings.interface.autoLockMinutes > 0 ? appSettings.interface.autoLockMinutes : 15
          : 0,
      },
    });
    scheduleAutoLock();
  }

  function setAutoLockMinutes(value: number) {
    if (!vaultLockEnabled || !Number.isFinite(value)) return;
    updateAppSettings({
      ...appSettings,
      interface: {
        ...appSettings.interface,
        autoLockMinutes: Math.min(10080, Math.max(1, Math.round(value))),
      },
    });
    scheduleAutoLock();
  }

  function setTooltipSetting(value: boolean) {
    updateAppSettings({
      ...appSettings,
      interface: { ...appSettings.interface, tooltipEnabled: value },
    });
  }

  async function setStartOnBootSetting(value: boolean) {
    if (!isTauri()) {
      showStatus("浏览器预览模式不支持开机自启");
      return;
    }
    if (autostartUpdating) return;
    autostartUpdating = true;
    const previousSettings = appSettings;
    let previousAutostart: boolean | null = null;
    try {
      previousAutostart = await isAutostartEnabled();
      if (value) await enableAutostart();
      else await disableAutostart();
      const enabled = await isAutostartEnabled();
      appSettings = normalizeAppSettings({
        ...appSettings,
        interface: { ...appSettings.interface, startOnBoot: enabled },
      });
      applyAppSettings(appSettings);
      await persistAppSettings();
      autostartAvailable = true;
      showStatus(enabled ? "已开启开机自启" : "已关闭开机自启");
    } catch (error) {
      appSettings = previousSettings;
      applyAppSettings(appSettings);
      try {
        await persistAppSettings();
      } catch {
        // Keep the original failure visible; the next startup will re-read the file.
      }
      if (previousAutostart !== null) {
        try {
          if (previousAutostart) await enableAutostart();
          else await disableAutostart();
        } catch {
          // Keep the original failure visible if the platform refuses rollback.
        }
      }
      showStatus(`开机自启设置失败：${error instanceof Error ? error.message : String(error)}`, 6000);
    } finally {
      autostartUpdating = false;
    }
  }

  function setThemeSetting(value: AppSettings["interface"]["theme"]) {
    updateAppSettings({
      ...appSettings,
      interface: { ...appSettings.interface, theme: value },
    });
  }

  function setDensitySetting(value: AppSettings["interface"]["density"]) {
    updateAppSettings({
      ...appSettings,
      interface: { ...appSettings.interface, density: value },
    });
  }

  function setFontSizeSetting(value: AppSettings["interface"]["fontSize"]) {
    updateAppSettings({
      ...appSettings,
      interface: { ...appSettings.interface, fontSize: value },
    });
  }

  function setRememberLayout(value: boolean) {
    updateAppSettings({
      ...appSettings,
      workspace: {
        ...appSettings.workspace,
        rememberLayout: value,
        paneLayout: { sidebarRatio, listRatio, generatorRatio },
      },
    });
  }

  function setRememberLastView(value: boolean) {
    updateAppSettings({
      ...appSettings,
      workspace: {
        ...appSettings.workspace,
        rememberLastView: value,
        lastView: value
          ? {
              deviceType: selectedDeviceType,
              searchQuery,
              sortMode,
              selectedDeviceUuid: selectedItem?.uuid ?? "",
            }
          : {
              deviceType: "全部设备",
              searchQuery: "",
              sortMode: appSettings.workspace.deviceSortMode,
              selectedDeviceUuid: "",
            },
      },
    });
  }

  function setRememberWindowBounds(value: boolean) {
    updateAppSettings({
      ...appSettings,
      workspace: { ...appSettings.workspace, rememberWindowBounds: value, windowBounds: value ? appSettings.workspace.windowBounds : null },
    });
  }

  function setDeviceSortSetting(value: SortMode) {
    updateAppSettings({
      ...appSettings,
      workspace: { ...appSettings.workspace, deviceSortMode: value },
    });
  }

  function setDeviceTypeSortSetting(value: DeviceTypeSortMode) {
    updateAppSettings({
      ...appSettings,
      workspace: { ...appSettings.workspace, deviceTypeSortMode: value },
    });
  }

  function setGeneratorSetting<K extends keyof AppSettings["passwordGenerator"]>(key: K, value: AppSettings["passwordGenerator"][K]) {
    const next = normalizeAppSettings({
      ...appSettings,
      passwordGenerator: { ...appSettings.passwordGenerator, [key]: value },
    });
    updateAppSettings(next);
  }

  async function resetSettings() {
    const previousSettings = appSettings;
    let previousAutostart = false;
    let defaultsApplied = false;
    try {
      if (settingsSaveTimer) window.clearTimeout(settingsSaveTimer);
      settingsSaveTimer = null;
      await settingsSaveQueue;
      if (isTauri() && autostartAvailable) {
        previousAutostart = await isAutostartEnabled();
        if (previousAutostart) await disableAutostart();
      }
      await resetAppSettings();
      const defaults = createDefaultAppSettings();
      appSettings = normalizeAppSettings({
        ...defaults,
        interface: { ...defaults.interface, startupLock: vaultLockEnabled },
      });
      applyAppSettings(appSettings);
      await persistAppSettings();
      defaultsApplied = true;
      scheduleAutoLock();
      showStatus("应用设置已恢复默认值");
    } catch (error) {
      if (!defaultsApplied) {
        appSettings = previousSettings;
        applyAppSettings(appSettings);
        try {
          await persistAppSettings();
        } catch {
          // Keep the original failure visible; the next startup will re-read the file.
        }
        if (isTauri() && autostartAvailable && previousAutostart) {
          try {
            await enableAutostart();
          } catch {
            // The original setting is best-effort when the platform refuses rollback.
          }
        }
      }
      showStatus(`恢复设置失败：${error instanceof Error ? error.message : String(error)}`, 6000);
    }
  }

  function showStatus(message: string, duration = 2200, actionLabel = "", action: (() => void) | null = null) {
    statusController.show(message, duration, actionLabel, action);
  }

  function dismissStatus() {
    statusController.dismiss();
  }

  function runStatusAction() {
    statusController.runAction();
  }

  function pauseStatusDismiss() {
    statusController.pause();
  }

  function resumeStatusDismiss() {
    statusController.resume();
  }

  function generatePassword() {
    passwordGeneratorController.generate();
  }

  function openGeneratorPanel(target: GeneratorTarget = null) {
    applyGeneratorSettings(appSettings.passwordGenerator);
    passwordGeneratorController.open(target);
  }

  function closeGeneratorPanel(restoreDialog = false) {
    passwordGeneratorController.close(restoreDialog);
  }

  function setGeneratorLength(length: number, syncInput = true) {
    passwordGeneratorController.setLength(length, syncInput);
  }

  function setGeneratorMinimumNumbers(value: number | string) {
    passwordGeneratorController.setMinimumNumbers(value);
  }

  function setGeneratorMinimumSymbols(value: number | string) {
    passwordGeneratorController.setMinimumSymbols(value);
  }

  function setAllowedSymbols(value: string) {
    passwordGeneratorController.setAllowedSymbols(value);
  }

  function setExcludedCharacters(value: string) {
    passwordGeneratorController.setExcludedCharacters(value);
  }

  function updateGeneratorLengthFromSlider(event: Event) {
    passwordGeneratorController.handleLengthSlider(event);
  }

  function handleGeneratorLengthInput(value: string) {
    passwordGeneratorController.handleLengthInput(value);
  }

  function commitGeneratorLengthInput() {
    passwordGeneratorController.commitLengthInput();
  }

  function handleGeneratorLengthKeydown(event: KeyboardEvent) {
    passwordGeneratorController.handleLengthKeydown(event);
  }

  function setSortMode(mode: SortMode) {
    navigationController.setSortMode(mode);
    if (settingsLoaded && mode !== appSettings.workspace.deviceSortMode) {
      appSettings = { ...appSettings, workspace: { ...appSettings.workspace, deviceSortMode: mode } };
      scheduleAppSettingsSave();
    }
    persistLastView();
  }

  function setDeviceTypeSortMode(mode: DeviceTypeSortMode) {
    if (mode === deviceTypeSortMode) return;
    deviceTypeSortMode = mode;
    if (settingsLoaded) {
      appSettings = { ...appSettings, workspace: { ...appSettings.workspace, deviceTypeSortMode: mode } };
      scheduleAppSettingsSave();
    }
  }

  function clampPaneLayout() {
    layoutController.clamp();
  }

  function startPaneResize(pane: ResizePane, event: PointerEvent) {
    layoutController.startResize(pane, event);
  }

  function stopPaneResize() {
    layoutController.stopResize();
  }

  function maskPassword(password: string) {
    return accountPasswordController.maskPassword(password);
  }

  function toggleHistoryPassword(id: number) {
    accountPasswordController.toggleHistoryPassword(id);
  }

  function useGeneratedPasswordForCurrentDevice() {
    accountPasswordController.useGeneratedPasswordForCurrentDevice();
  }

  function useGeneratedPasswordForBulkUpdate() {
    accountPasswordController.useGeneratedPasswordForBulkUpdate();
  }

  function copySelectedDeviceInfo() {
    activePopover = null;
    if (!hasSelectedDevice) {
      showStatus("请先选择设备");
      return;
    }
    copyText(formatDeviceInfo(selectedItem), "设备信息");
  }

  function copySelectedAccountInfo() {
    accountPasswordController.copySelectedAccountInfo();
  }

  function selectAccount(id: number) {
    accountPasswordController.selectAccount(id);
  }

  function isAccountSelectedForBatch(id: number) {
    return accountPasswordController.isAccountSelectedForBatch(id);
  }

  function toggleAccountBatchSelection(id: number) {
    accountPasswordController.toggleAccountBatchSelection(id);
  }

  function selectAllCurrentAccounts() {
    accountPasswordController.selectAllCurrentAccounts();
  }

  function clearAccountBatchSelection() {
    accountPasswordController.clearAccountBatchSelection();
  }

  function getTypeMeta(deviceType: string) {
    return deviceTypeController.getTypeMeta(deviceType);
  }

  function iconClassForType(deviceType: string) {
    return resolveIconClassForType(deviceType, deviceTypeOptions);
  }

  function getDeviceTypeCount(deviceType: "全部设备" | DeviceType) {
    return deviceTypeController.getDeviceTypeCount(deviceType);
  }

  function canDeleteDeviceType(deviceType: "全部设备" | DeviceType) {
    return deviceTypeController.canDeleteDeviceType(deviceType);
  }

  function openPopover(popover: ActivePopover, event: MouseEvent) {
    overlayController.openPopover(popover, event);
  }

  function openTypeContextMenu(deviceType: "全部设备" | DeviceType, event: MouseEvent) {
    overlayController.openTypeContextMenu(deviceType, event);
  }

  function openDeviceContextMenu(id: number, event: MouseEvent) {
    overlayController.openDeviceContextMenu(id, event);
  }

  function openAccountContextMenu(id: number, event: MouseEvent) {
    overlayController.openAccountContextMenu(id, event);
  }

  function openTypeBlankContextMenu(event: MouseEvent) {
    overlayController.openTypeBlankContextMenu(event);
  }

  function openDeviceListBlankContextMenu(event: MouseEvent) {
    overlayController.openDeviceListBlankContextMenu(event);
  }

  function openDetailBlankContextMenu(event: MouseEvent) {
    overlayController.openDetailBlankContextMenu(event);
  }

  function closeOverlays() {
    const returnToSettings = dataDialogReturnToSettings
      && (activeDialog === "export-config" || activeDialog === "snapshots");
    const returnToSecuritySettings = activeDialog === "security-password";
    if (returnToSecuritySettings && recoveryKey && (!recoveryFileSaved || !recoveryAcknowledged)) {
      showStatus("请先保存恢复文件");
      return;
    }
    if (returnToSecuritySettings) {
      vaultPasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };
      vaultPasswordError = "";
      recoveryKey = "";
      recoveryAcknowledged = false;
      recoveryFileContent = "";
      recoveryFileName = "";
      recoveryFileSaved = false;
      recoveryFileError = "";
    }
    overlayController.closeOverlays();
    dataDialogReturnToSettings = false;
    if (returnToSettings) {
      settingsActiveSection = "data";
      activeDialog = "settings";
    } else if (returnToSecuritySettings) {
      settingsActiveSection = "security";
      activeDialog = "settings";
    }
  }

  function cancelPendingConfirmation() {
    const returnToSettings = dataDialogReturnToSettings && activeDialog === null;
    overlayController.cancelPendingConfirmation();
    dataDialogReturnToSettings = false;
    if (returnToSettings) {
      settingsActiveSection = "data";
      activeDialog = "settings";
    }
  }

  function saveActiveDialog() {
    if (activeDialog === "type") return saveDeviceType();
    if (activeDialog === "password") return savePasswordUpdate();
    if (activeDialog === "bulk-password") return saveBulkPasswordUpdate();
    if (activeDialog === "account") return saveAccount();
    if (activeDialog === "device") return saveDevice();
    if (activeDialog === "export-config") return exportConfig();
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    keyboardController.handle(event);
  }

  function openAddTypeDialog() {
    deviceTypeController.openAddTypeDialog();
  }

  function openEditTypeDialog(deviceType: "全部设备" | DeviceType = selectedDeviceType) {
    deviceTypeController.openEditTypeDialog(deviceType);
  }

  function requestDeleteDeviceType(deviceType: "全部设备" | DeviceType = selectedDeviceType) {
    deviceTypeController.requestDeleteDeviceType(deviceType);
  }

  async function deleteDeviceType(confirmation?: PendingConfirmation) {
    await deviceTypeController.deleteDeviceType(confirmation ?? { deviceType: selectedDeviceType });
  }

  function saveDeviceType() {
    deviceTypeController.saveDeviceType();
  }

  function executeSaveDeviceType(confirmation?: PendingConfirmation) {
    deviceTypeController.executeSaveDeviceType(confirmation);
  }

  function openAddDeviceDialog(deviceType = selectedDeviceType) {
    deviceController.openAddDialog(deviceType);
  }

  function openEditDeviceDialog() {
    deviceController.openEditDialog();
  }

  function saveDevice() {
    deviceController.save();
  }

  function executeSaveDevice(confirmation?: PendingConfirmation) {
    deviceController.executeSaveDevice(confirmation);
  }

  function openAddAccountDialog() {
    accountPasswordController.openAddAccountDialog();
  }

  function openEditAccountDialog() {
    accountPasswordController.openEditAccountDialog();
  }

  function saveAccount() {
    accountPasswordController.saveAccount();
  }

  function requestDeleteSelectedAccount() {
    accountPasswordController.requestDeleteSelectedAccount();
  }

  function openPasswordDialog() {
    accountPasswordController.openPasswordDialog();
  }

  function requestRestoreHistoryPassword(history: PasswordHistory) {
    accountPasswordController.requestRestoreHistoryPassword(history);
  }

  function openBulkPasswordDialog(useGenerated = false) {
    accountPasswordController.openBulkPasswordDialog(useGenerated);
  }

  function setBulkPasswordDeviceType(deviceType: "全部设备" | DeviceType) {
    accountPasswordController.setBulkPasswordDeviceType(deviceType);
  }

  function updateBulkUsernameSearch(username: string) {
    accountPasswordController.updateBulkUsernameSearch(username);
  }

  function selectBulkUsername(suggestion: BulkUsernameSuggestion) {
    accountPasswordController.selectBulkUsername(suggestion);
  }

  function setDeviceFormType(deviceType: DeviceType) {
    deviceController.setFormType(deviceType);
  }

  function toggleTypePicker(scope: TypePickerScope) {
    openTypePicker = openTypePicker === scope ? null : scope;
  }

  function isBulkPasswordMatchSelected(match: BulkPasswordMatch) {
    return accountPasswordController.isBulkPasswordMatchSelected(match);
  }

  function toggleBulkPasswordMatch(match: BulkPasswordMatch) {
    accountPasswordController.toggleBulkPasswordMatch(match);
  }

  function selectAllBulkPasswordMatches() {
    accountPasswordController.selectAllBulkPasswordMatches();
  }

  function clearBulkPasswordMatches() {
    accountPasswordController.clearBulkPasswordMatches();
  }

  function savePasswordUpdate() {
    accountPasswordController.savePasswordUpdate();
  }

  function saveBulkPasswordUpdate() {
    accountPasswordController.saveBulkPasswordUpdate();
  }

  async function deleteSelectedDevice(confirmation: PendingConfirmation) {
    await deviceController.deleteSelected(confirmation);
  }

  function requestDeleteSelectedDevice() {
    deviceController.requestDeleteSelected();
  }

  type ConfirmationContext = {
    confirmation: PendingConfirmation;
    importedConfig: ConfigData | null;
    configFormat: ConfigFormat;
    importMode: ConfigImportMode;
  };

  const confirmationHandlers: Partial<Record<ConfirmationAction, (context: ConfirmationContext) => void | boolean | Promise<void | boolean>>> = {
    "delete-device-type": async ({ confirmation }) => {
      await deleteDeviceType(confirmation);
    },
    "delete-device": async ({ confirmation }) => {
      await deleteSelectedDevice(confirmation);
    },
    "import-config": async ({ importedConfig, configFormat, importMode }) => {
      if (!importedConfig) throw new Error("待导入配置已失效，请重新选择文件");
      return applyImportedConfig(importedConfig, configFormat, importMode);
    },
    "save-device": ({ confirmation }) => executeSaveDevice(confirmation),
    "save-device-type": ({ confirmation }) => executeSaveDeviceType(confirmation),
    "restore-snapshot": async ({ confirmation }) => {
      if (!confirmation.snapshotId) throw new Error("数据快照目标信息不完整，请重新选择快照");
      await restoreSnapshot(confirmation.snapshotId, true);
    },
  };

  async function confirmPendingAction() {
    const confirmation = pendingConfirmation;
    if (!confirmation) return;
    if (confirmation.action === "import-config" && confirmation.importModeErrors?.[importConfigMode]) {
      showStatus(`无法按“${importConfigMode === "add-missing" ? "仅新增" : "全部覆盖"}”导入：${confirmation.importModeErrors[importConfigMode]}`, 7000);
      return;
    }
    const context: ConfirmationContext = {
      confirmation,
      importedConfig: pendingImportedConfig,
      configFormat: pendingConfigFormat,
      importMode: importConfigMode,
    };
    pendingConfirmation = null;
    try {
      if (await accountPasswordController.executeConfirmation(confirmation)) {
        pendingImportedConfig = null;
        return;
      }
      const handler = confirmationHandlers[confirmation.action];
      if (!handler) {
        pendingImportedConfig = null;
        showStatus("这个操作暂时无法执行", 5000);
        return;
      }
      const result = await handler(context);
      if (confirmation.action === "import-config" && result === false) {
        pendingImportedConfig = context.importedConfig;
        pendingConfirmation = confirmation;
        return;
      }
      pendingImportedConfig = null;
      if (confirmation.action === "import-config" && dataDialogReturnToSettings) {
        dataDialogReturnToSettings = false;
        settingsActiveSection = "data";
        activeDialog = "settings";
      }
    } catch (error) {
      if (confirmation.action === "import-config") {
        pendingImportedConfig = context.importedConfig;
        pendingConfirmation = confirmation;
      } else {
        pendingImportedConfig = null;
      }
      const reason = error instanceof Error ? error.message : String(error ?? "");
      showStatus(reason ? `操作失败：${reason}` : "操作失败：发生未知错误", 7000);
    }
  }

  function openExportConfigDialog() {
    dataDialogReturnToSettings = activeDialog === "settings";
    configTransferController.openExportConfigDialog();
  }

  async function exportConfig(format: ConfigFormat = exportConfigFormat) {
    const returnToSettings = dataDialogReturnToSettings;
    await configTransferController.exportConfig(format);
    if (returnToSettings && activeDialog === null) {
      dataDialogReturnToSettings = false;
      settingsActiveSection = "data";
      activeDialog = "settings";
    }
  }

  async function chooseConfigFile() {
    if (activeDialog === "settings") dataDialogReturnToSettings = true;
    await configTransferController.chooseConfigFile();
  }

  function ensureDeviceTypeMetaForItems(targetItems: VaultItem[]) {
    const normalized = ensureDeviceTypeMetadata(targetItems, customDeviceTypes);
    items = normalized.items;
    customDeviceTypes = normalized.customDeviceTypes;
  }

  async function applyImportedConfig(config: ConfigData, format: ConfigFormat, mode: ConfigImportMode) {
    const returnToSettings = dataDialogReturnToSettings;
    const applied = await configTransferController.applyImportedConfig(config, format, mode);
    if (!applied) return false;
    dataDialogReturnToSettings = false;
    if (returnToSettings && activeDialog === null) {
      settingsActiveSection = "data";
      activeDialog = "settings";
    }
    return true;
  }

  async function selectConfigFileFromBrowser(event: Event) {
    await configTransferController.selectConfigFileFromBrowser(event);
  }

  const appDialogActions = {
    closeOverlays,
    saveDeviceType,
    openGeneratorPanel,
    setActiveDialog: (dialog: ActiveDialog) => (activeDialog = dialog),
    toggleTypePicker,
    setBulkPasswordDeviceType,
    updateBulkUsernameSearch,
    selectBulkUsername,
    selectAllBulkPasswordMatches,
    clearBulkPasswordMatches,
    isBulkPasswordMatchSelected,
    toggleBulkPasswordMatch,
    saveBulkPasswordUpdate,
    savePasswordUpdate,
    saveAccount,
    setDeviceFormType,
    saveDevice,
    exportConfig,
  };

  const settingsActions = {
    setSection: setSettingsSection,
    setTooltipEnabled: setTooltipSetting,
    setStartOnBoot: setStartOnBootSetting,
    setStartupLock,
    setAutoLockEnabled,
    setAutoLockMinutes,
    openVaultPasswordDialog,
    lockNow: lockVaultNow,
    setTheme: setThemeSetting,
    setDensity: setDensitySetting,
    setFontSize: setFontSizeSetting,
    setRememberLayout,
    setRememberLastView,
    setRememberWindowBounds,
    setDeviceSortMode: setDeviceSortSetting,
    setDeviceTypeSortMode: setDeviceTypeSortSetting,
    setGeneratorValue: setGeneratorSetting,
    openStoragePath,
    openSnapshotsDialog,
    openExportConfigDialog,
    chooseConfigFile,
    reset: resetSettings,
  };

  const actionPopoverActions = {
    setDeviceTypeSortMode,
    setSortMode,
    selectDeviceType,
    openEditTypeDialog,
    requestDeleteDeviceType,
    canDeleteDeviceType,
    getDeviceTypeCount,
    openAddTypeDialog,
    clearSearch,
    openAddDeviceDialog,
    openEditDeviceDialog,
    requestDeleteSelectedDevice,
    copySelectedDeviceInfo,
    openPasswordDialog,
    copySelectedAccountInfo,
    openEditAccountDialog,
    requestDeleteSelectedAccount,
    setActivePopover: (popover: ActivePopover | null) => (activePopover = popover),
  };

  const deviceDetailActions = {
    openDetailBlankContextMenu,
    openAccountContextMenu,
    openAddAccountDialog,
    openPasswordDialog,
    copySelectedAccountInfo,
    openEditAccountDialog,
    requestDeleteSelectedAccount,
    copyText,
    selectAccount,
    toggleAccountBatchSelection,
    selectAllCurrentAccounts,
    clearAccountBatchSelection,
    maskPassword,
    toggleHistoryPassword,
    requestRestoreHistoryPassword,
    toggleHistorySort: () => (historySortDesc = !historySortDesc),
    clearSearch,
    openAddDeviceDialog: () => openAddDeviceDialog(),
  };

  const workspaceActions = {
    sidebar: {
      openTypeBlankContextMenu,
      openAddTypeDialog,
      openEditTypeDialog,
      requestDeleteSelectedType: () => requestDeleteDeviceType(selectedDeviceType),
      openTypeSortPopover: (event: MouseEvent) => openPopover("type-sort", event),
      selectDeviceType,
      openTypeContextMenu,
    },
    topbar: {
      goBack,
      goForward,
      updateSearchValue,
      openBulkPasswordDialog: () => openBulkPasswordDialog(),
      openGeneratorPanel: () => openGeneratorPanel(),
      openSettings,
    },
    deviceList: {
      openAddDeviceDialog: () => openAddDeviceDialog(),
      openEditDeviceDialog,
      requestDeleteSelectedDevice,
      openDeviceSortPopover: (event: MouseEvent) => openPopover("device-sort", event),
      openDeviceActionsPopover: (event: MouseEvent) => openPopover("device-actions", event),
      openDeviceContextMenu,
      openDeviceListBlankContextMenu,
      selectDevice,
    },
    startPaneResize: (pane: ResizePane, event: PointerEvent) => startPaneResize(pane, event),
    deviceDetail: deviceDetailActions,
  };

  const passwordGeneratorActions = {
    closeGeneratorPanel,
    startGeneratorResize: (event: PointerEvent) => startPaneResize("generator", event),
    generatePassword,
    copyGeneratedPassword: () => copyText(generatedPassword, "生成密码"),
    setGeneratorLength,
    setGeneratorMinimumNumbers,
    setGeneratorMinimumSymbols,
    setAllowedSymbols,
    setExcludedCharacters,
    updateGeneratorLengthFromSlider,
    handleGeneratorLengthInput,
    commitGeneratorLengthInput,
    handleGeneratorLengthKeydown,
    useGeneratedPasswordForCurrentDevice,
    useGeneratedPasswordForBulkUpdate,
  };

  $: appDialogView = {
    selectedItem,
    selectedAccount,
    selectedAccountTargets,
    selectedBulkTypeMeta,
    selectedDeviceFormTypeMeta,
    bulkUsernameSuggestionsOpen,
    filteredBulkTypeRows,
    filteredDeviceTypeOptions,
    deviceTypeOptionsLength: deviceTypeOptions.length,
    revealResetToken,
    bulkUsernameSuggestions,
    bulkPasswordMatches,
    bulkPasswordSelectedMatches,
  };

  $: settingsView = {
    activeSection: settingsActiveSection,
    tooltipEnabled,
    startOnBoot: appSettings.interface.startOnBoot,
    startupLock: vaultLockEnabled,
    autoLockMinutes: appSettings.interface.autoLockMinutes,
    autostartAvailable,
    autostartUpdating,
    theme: appSettings.interface.theme,
    density: appSettings.interface.density,
    fontSize: appSettings.interface.fontSize,
    rememberLayout: appSettings.workspace.rememberLayout,
    rememberLastView: appSettings.workspace.rememberLastView,
    rememberWindowBounds: appSettings.workspace.rememberWindowBounds,
    deviceSortMode: appSettings.workspace.deviceSortMode,
    deviceTypeSortMode: appSettings.workspace.deviceTypeSortMode,
    generator: appSettings.passwordGenerator,
    installationPath: installationPath || "当前环境不可用",
    dataPath: dataPath || "当前环境不可用",
    version: appVersion,
  };

  $: actionPopoverModel = {
    activePopover,
    popoverPosition,
    deviceTypeSortMode,
    sortMode,
    contextDeviceType,
    selectedDeviceType,
    searchQuery,
    listContextLabel,
    selectedDeviceName: selectedItem.deviceName,
    selectedAccountLabel: selectedAccount.username || selectedAccount.title || "未填写用户名",
    selectedAccountHasPassword: Boolean(selectedAccount.password),
    deviceTypeOptionsLength: deviceTypeOptions.length,
    hasSelectedDevice,
  };

  $: deviceDetailModel = {
    hasSelectedDevice,
    hasDevices,
    searchQuery,
    selectedItem,
    selectedAccounts,
    selectedAccount,
    selectedAccountIds,
    selectedAccountTargetCount,
    copyableAccountTargetCount,
    canDeleteSelectedAccountTargets,
    sortedHistory,
    historySortDesc,
    visibleHistoryIds,
    passwordStrength,
  };

  $: workspaceView = {
    sidebar: {
      deviceTypeRows,
      selectedDeviceType,
      selectedTypeDeviceCount,
      canDeleteSelectedDeviceType,
    },
    topbar: {
      backDisabled: backStack.length === 0,
      forwardDisabled: forwardStack.length === 0,
      searchQuery: searchDraft,
      searchPlaceholder,
    },
    deviceList: {
      filteredItems,
      selectedId: selectedItem.id,
      searchQuery,
      hasDevices,
      hasSelectedDevice,
      deviceTypeOptionsLength: deviceTypeOptions.length,
      listContextLabel,
    },
    resizingPane,
    deviceDetail: deviceDetailModel,
  };

  $: passwordGeneratorView = {
    canUseGeneratorForCurrentAccount,
    canUseGeneratorForBulkUpdate,
    selectedItem,
    selectedAccount,
    itemCount: items.length,
  };
</script>

{#if vaultStorageState !== "ready"}
  <VaultStorageStatus
    state={vaultStorageState === "loading" ? "loading" : vaultStorageState === "save-error" ? "save-error" : "load-error"}
    error={vaultStorageError}
    retry={retryVaultStorage}
    canRecoverBackup={vaultBackupRecoveryRequired}
    recoverBackup={recoverVaultBackup}
  />
{/if}

<main class="app-shell" class:storage-blocked={vaultStorageState !== "ready"} style={layoutStyle} aria-hidden={vaultStorageState !== "ready"} inert={vaultStorageState !== "ready"}>
  <input id="import-file" class="hidden-file-input" type="file" accept=".json,.csv,.yaml,.yml,application/json,text/csv,application/yaml,text/yaml" on:change={selectConfigFileFromBrowser} />
  <WorkspaceContent
    view={workspaceView}
    actions={workspaceActions}
    bind:searchInput
    bind:passwordVisible
    bind:historyOpen
  />

  <OverlayLayer
    actionPopoverModel={actionPopoverModel}
    actionPopoverActions={actionPopoverActions}
    {activeDialog}
    bind:typeForm
    bind:passwordForm
    bind:bulkPasswordForm
    bind:accountForm
    bind:deviceForm
    bind:exportConfigFormat
    bind:openTypePicker
    bind:bulkTypeSearch
    bind:bulkUsernameSearch
    bind:deviceTypeSearch
    appDialogView={appDialogView}
    appDialogActions={appDialogActions}
    {vaultSnapshots}
    {closeOverlays}
    {cancelPendingConfirmation}
    {requestRestoreSnapshot}
    {pendingConfirmation}
    {importConfigMode}
    {confirmPendingAction}
    setImportConfigMode={(mode) => (importConfigMode = mode)}
    {generatorPanelOpen}
    bind:generatedPassword
    bind:generatorLength
    bind:generatorLengthInput
    bind:useUpper
    bind:useLower
    bind:useNumbers
    bind:useSymbols
    bind:excludeSimilar
    bind:preventRepeats
    bind:minimumNumbers
    bind:minimumSymbols
    bind:allowedSymbols
    bind:excludedCharacters
    passwordGeneratorView={passwordGeneratorView}
    passwordGeneratorActions={passwordGeneratorActions}
    {copyStatus}
    {pauseStatusDismiss}
    {resumeStatusDismiss}
    {dismissStatus}
    {statusActionLabel}
    {runStatusAction}
    settingsView={settingsView}
    settingsActions={settingsActions}
    {vaultPasswordDialogMode}
    {vaultPasswordForm}
    {vaultPasswordError}
    {vaultPasswordBusy}
    bind:recoveryAcknowledged
    {recoveryKey}
    {recoveryFileName}
    {recoveryFileSaved}
    {recoveryFileBusy}
    {recoveryFileError}
    {saveRecoveryFile}
    finishRecoverySetup={finishRecoveryKeyDisplay}
    saveVaultPassword={saveVaultPassword}
    tooltipEnabled={vaultStorageState === "ready" && tooltipEnabled}
  />
</main>

{#if vaultLocked}
  <VaultLockScreen
    bind:password={vaultUnlockPassword}
    error={vaultUnlockError}
    busy={vaultUnlockBusy}
    unlock={unlockVault}
    recover={recoverVaultPassword}
    chooseRecoveryFile={chooseRecoveryFile}
    recoveryBusy={recoveryBusy}
    recoveryError={recoveryError}
    recoveryResultFile={recoveryKey}
    bind:recoveryResultAcknowledged={recoveryAcknowledged}
    recoveryFileContent={recoveryFileContent}
    {recoveryFileName}
    {recoveryFileSaved}
    {recoveryFileBusy}
    {recoveryFileError}
    {saveRecoveryFile}
    finishRecovery={finishRecoveryKeyDisplay}
  />
{/if}
