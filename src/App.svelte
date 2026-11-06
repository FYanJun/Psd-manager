<script lang="ts">
  import { onMount } from "svelte";
  import type { FormValidationFeedback, ReportFormValidationError } from "./lib/form-validation";
  import { version as packageVersion } from "../package.json";
  import type { SettingsView, StorageInfo } from "./lib/view-models";
import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
  import OverlayLayer from "./components/OverlayLayer.svelte";
  import VaultLockScreen from "./components/VaultLockScreen.svelte";
  import VaultStorageStatus from "./components/VaultStorageStatus.svelte";
  import WorkspaceContent from "./components/WorkspaceContent.svelte";

  import {
    GENERATOR_DEFAULT_RATIO,
    LIST_DEFAULT_RATIO,
    SIDEBAR_DEFAULT_RATIO,
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
  import { createEditableContextController } from "./lib/controllers/editable-context-controller";
  import { createRecoveryFileController } from "./lib/controllers/recovery-file-controller";
  import { createKeyboardController, type KeyboardState } from "./lib/controllers/keyboard-controller";
  import { createNavigationController, type NavigationState } from "./lib/controllers/navigation-controller";
  import { createOverlayController, type OverlayState } from "./lib/controllers/overlay-controller";
import { captureEditableSelection, type EditableSelection, type EditableTarget } from "./lib/editable-context";
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
    ConfigTransferFormat,
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
  import { createPasswordStrengthSession } from "./lib/password-strength-session";
  import { createWindowEvents } from "./lib/window-events";
  import { platformOperation } from "./lib/platform-operation";
  import { createVaultSecurityApi } from "./lib/vault-security-api";
  import { createSettingsSaveSession } from "./lib/settings-save-session";
  import { createSearchSession } from "./lib/search-session";
  import { createStartupSession } from "./lib/startup-session";
  import { createAutoLockSession } from "./lib/auto-lock-session";
import { hasClipboardText, readClipboardText, writeClipboardText } from "./lib/clipboard";

  const vaultSecurity = createVaultSecurityApi(invoke);
  let items: VaultItem[] = initialItems;
  let customDeviceTypes: DeviceTypeMeta[] = [];
  let vaultSnapshots: VaultSnapshot[] = [];
  let vaultStorageState: VaultStorageState = "loading";
  let vaultStorageError = "";
  let vaultBackupRecoveryRequired = false;
  let vaultCanExit = false;
  let vaultExitError = "";
  let vaultExiting = false;
  let hydrated = false;
  let searchQuery = "";
  let searchDraft = "";
  const searchSession = createSearchSession((value) => {
    navigationController.updateSearch(value);
    persistLastView();
  }, { setTimeout: (callback, delay) => window.setTimeout(callback, delay), clearTimeout: timer => window.clearTimeout(timer) });
  let selectedDeviceType: "全部设备" | DeviceType = "全部设备";
  let selectedId = 0;
  let sortMode: SortMode = "updatedDesc";
  let deviceTypeSortMode: DeviceTypeSortMode = "default";
  let historySortDesc = true;
  let activeDialog: ActiveDialog = null;
  let activePopover: ActivePopover = null;
  let editableContextTarget: EditableTarget | null = null;
  let editableSelection: EditableSelection = { start: 0, end: 0 };
  let editableContext: OverlayState["editableContext"] = null;
  let pendingConfirmation: PendingConfirmation | null = null;
  let confirmationBusy = false;
  let confirmationError = "";
  let confirmationReportedStatus = "";
  let formValidationFeedback: FormValidationFeedback | null = null;
  let formValidationRevision = 0;
  const reportValidationError: ReportFormValidationError = (form, field, message) => {
    if (confirmationBusy || activeDialog !== form) {
      showStatus(message);
      return;
    }
    formValidationFeedback = { form, field, message, revision: ++formValidationRevision };
  };
  $: if (formValidationFeedback && activeDialog !== formValidationFeedback.form) formValidationFeedback = null;
  $: if (!pendingConfirmation) confirmationError = "";
  let pendingImportedConfig: ConfigData | null = null;
  let pendingConfigFormat: ConfigTransferFormat = "json";
  let importConfigMode: ConfigImportMode = "add-missing";
  let exportConfigFormat: ConfigTransferFormat = "json";
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
  let sidebarCollapsed = false;
  let listRatio = LIST_DEFAULT_RATIO;
  let generatorRatio = GENERATOR_DEFAULT_RATIO;
  let resizingPane: ResizePane | null = null;
  let layoutStyle = "";
  let selectedDeviceFormTypeMeta: DeviceTypeMeta;
  let accountPasswordDerived: AccountPasswordDerivedState;
  let selectedTypeDeviceCount = 0;
  let passwordStrength = "";
  const passwordStrengthSession = createPasswordStrengthSession({
    setLabel: (label) => (passwordStrength = label),
  });
  let canUseGeneratorForCurrentAccount = true;
  let canUseGeneratorForBulkUpdate = true;
  let bulkPasswordDisabled = true;
  let appSettings: AppSettings = createDefaultAppSettings();
  let settingsActiveSection: SettingsView["activeSection"] = "interface";
  let settingsLoaded = false;
  let settingsReadFailed = false;
  const settingsSaveSession = createSettingsSaveSession({
    read: () => appSettings,
    ready: () => settingsLoaded && !settingsReadFailed,
    save: saveAppSettings,
    onError: reportSettingsSaveError,
  }, { setTimeout: (callback, delay) => window.setTimeout(callback, delay), clearTimeout: timer => window.clearTimeout(timer) });
  let systemThemeMediaQuery: MediaQueryList | null = null;
  let tooltipEnabled = true;
  let autostartAvailable = false;
  let autostartUpdating = false;
  let appVersion = packageVersion;
  let dataDialogReturnToSettings = false;
  let installationPath = "";
  let appDataPath = "";
  let storageMode: StorageInfo["storageMode"] | null = null;
  let environmentStatus: SettingsView["environmentStatus"] = isTauri() ? "loading" : "preview";
  let operatingSystem = "";
  let applicationArch = "";
  let vaultLockEnabled = false;
  let vaultLocked = false;
  let vaultUnlockBusy = false;
  let vaultUnlockError = "";
  let vaultUnlockPassword = "";
  let vaultPasswordDialogMode: VaultPasswordDialogMode = "set";
  let vaultPasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };
  let vaultPasswordError = "";
  let vaultPasswordBusy = false;
  let recoveryKey = "";
  let recoveryAcknowledged = false;
  let recoveryBusy = false;
  let recoveryError = "";
  let recoveryFileContent = "";
  let recoveryFileName = "";
  let recoveryFileSaved = false;
  let recoveryFileBusy = false;
  let recoveryFileError = "";

  const autoLockSession = createAutoLockSession({
    read: () => ({
      enabled: vaultLockEnabled,
      locked: vaultLocked,
      hasRecoveryKey: Boolean(recoveryKey),
      minutes: appSettings.interface.autoLockMinutes,
      storageReady: vaultStorageState === "ready",
      settingsLoaded,
    }),
    lock: lockVaultNow,
  });

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

  function reportSettingsSaveError(error: unknown) {
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
  }

  function scheduleAppSettingsSave() {
    settingsSaveSession.schedule();
  }

  function persistAppSettings() {
    if (settingsReadFailed) return Promise.reject(new Error("原应用设置尚未恢复，已阻止覆盖设置文件"));
    return settingsSaveSession.persist();
  }

  function updateAppSettings(next: AppSettings) {
    appSettings = normalizeAppSettings(next);
    applyAppSettings(appSettings);
    scheduleAppSettingsSave();
  }

  function updateInterfaceSettings(patch: Partial<AppSettings["interface"]>) {
    updateAppSettings({ ...appSettings, interface: { ...appSettings.interface, ...patch } });
  }

  const layoutController = createWorkspaceLayoutController({
    isSidebarCollapsed: () => sidebarCollapsed,
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
    reportValidationError,
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
    reportValidationError,
    pushNavigationState,
    createSafetySnapshot,
    offerSnapshotUndo,
    setPendingConfirmation: (confirmation) => (pendingConfirmation = confirmation),
  });

  const accountPasswordController = createAccountPasswordController({
    read: (): AccountPasswordState => ({
      items,
      deviceTypeOptionsLength: deviceTypeOptions.length,
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
      editableContext,
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
      if ("editableContext" in patch) editableContext = patch.editableContext ?? null;
      if (patch.bulkPasswordDeselectedKeys !== undefined) bulkPasswordDeselectedKeys = patch.bulkPasswordDeselectedKeys;
      if (patch.bulkTypeSearch !== undefined) bulkTypeSearch = patch.bulkTypeSearch;
      if (patch.passwordVisible !== undefined) passwordVisible = patch.passwordVisible;
      if (patch.visibleHistoryIds !== undefined) visibleHistoryIds = patch.visibleHistoryIds;
    },
    showStatus,
    reportValidationError,
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
      editableContext,
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
      if ("editableContext" in patch) editableContext = patch.editableContext ?? null;
    },
    hasSelectedDevice: () => hasSelectedDevice,
    hasAccount: (id) => selectedAccounts.some((account) => account.id === id),
    selectDevice,
    selectAccount,
    setEditableContextTarget: (target) => {
      editableContextTarget = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : null;
      if (editableContextTarget) editableSelection = captureEditableSelection(editableContextTarget);
    },
    hasClipboardText,
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
      cancelPaneResize: () => layoutController.cancelResize(),
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
    hasPendingRecoveryFile: () => Boolean(recoveryKey && (!recoveryFileSaved || !recoveryAcknowledged)),
    isSecurityOperationBusy: () => vaultPasswordBusy || recoveryBusy || recoveryFileBusy || confirmationBusy,
    lock: lockVaultSession,
    clearSensitiveState: clearSensitiveVaultState,
    writeViewState: (state) => {
      vaultStorageState = state.state;
      vaultStorageError = state.error;
      vaultBackupRecoveryRequired = state.canRecoverBackup;
      vaultCanExit = state.canExit;
      vaultExitError = state.exitError;
      vaultExiting = state.exiting;
      hydrated = state.hydrated;
    },
  });

  const snapshotController = createSnapshotController({
    read: () => ({ items, customDeviceTypes, snapshots: vaultSnapshots }),
    writeSnapshots: (snapshots) => (vaultSnapshots = snapshots),
    applySnapshot: applySnapshotData,
    setActiveDialog: (dialog) => (activeDialog = dialog),
    setPendingConfirmation: (confirmation) => {
      if (!confirmationBusy || confirmation !== null) pendingConfirmation = confirmation;
    },
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
    isExportPasswordConfigured: () => vaultLockEnabled,
    verifyExportPassword: (password) => vaultSecurity.verify(password),
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
    searchSession.cancel();
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
      settingsReadFailed = true;
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
        if (enabled) {
          // Refresh existing registrations so installations created before the
          // tray-only launch marker was added receive the new startup argument.
          try {
            await enableAutostart();
          } catch (error) {
            showStatus(`开机自启配置更新失败：${error instanceof Error ? error.message : String(error)}`, 6000);
          }
        }
        if (!settingsReadFailed && appSettings.interface.startOnBoot !== enabled) {
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
        const storageInfo = await platformOperation("system", () => invoke<StorageInfo>("get_storage_info"));
        installationPath = storageInfo.installationPath;
        appDataPath = storageInfo.appDataPath;
        storageMode = storageInfo.storageMode;
        operatingSystem = storageInfo.operatingSystem;
        applicationArch = storageInfo.applicationArch;
        environmentStatus = "ready";
      } catch (error) {
        environmentStatus = "failed";
        showStatus(`运行环境读取失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      }
    }
  }

  async function openStoragePath(kind: "installation" | "app-data") {
    if (!isTauri()) {
      showStatus("浏览器预览模式不支持打开本地目录");
      return;
    }
    if (environmentStatus !== "ready") return;
    try {
      await platformOperation("system", () => invoke("open_storage_path", { kind }));
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
    void windowSettingsController.applyTheme(settings.interface.theme);
  }

  function handleSystemThemeChange() {
    if (appSettings.interface.theme === "system") applyInterfaceSettings(appSettings);
  }

  async function restoreSnapshot(snapshotId: string, createCurrentBackup: boolean) {
    const returnToSettings = dataDialogReturnToSettings;
    const applied = await snapshotController.restoreSnapshot(snapshotId, createCurrentBackup);
    if (!applied) return false;
    dataDialogReturnToSettings = false;
    if (returnToSettings && activeDialog === null) {
      settingsActiveSection = "data";
      activeDialog = "settings";
    }
    return true;
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
    if (vaultStorageState === "ready" && !vaultLocked) autoLockSession.schedule();
  }

  async function retryVaultStorage() {
    await vaultStorageController.retry();
    if (vaultStorageState === "ready" && !vaultLocked) autoLockSession.schedule();
  }

  onMount(() => {
    systemThemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    systemThemeMediaQuery.addEventListener("change", handleSystemThemeChange);
    const startup = createStartupSession({
      protectClose: () => vaultStorageController.mountCloseProtection(),
      registerTrayLock: () => isTauri()
        ? listen("tray-lock-requested", () => { void lockVaultNow(); })
        : Promise.resolve(() => undefined),
      initializeSettings: initializeAppSettings,
      initializeVault: initializeVaultLock,
      onTrayError: (error) => showStatus(
        "托盘锁定监听初始化失败：" + (error instanceof Error ? error.message : String(error ?? "未知错误")), 6000,
      ),
      onStartupError: (error) => showStatus(
        "启动初始化失败：" + (error instanceof Error ? error.message : String(error ?? "未知错误")), 6000,
      ),
    });
    void startup.start();
    overlayController.mount();
    const windowEvents = createWindowEvents(window, {
      keydown: handleGlobalKeydown,
      activity: handleUserActivity,
      resize: clampPaneLayout,
      blur: handleWindowBlur,
    });
    windowEvents.mount();
    return () => {
      startup.destroy();
      overlayController.destroy();
      windowEvents.destroy();
      vaultStorageController.destroy();
      windowSettingsController.destroy();
      systemThemeMediaQuery?.removeEventListener("change", handleSystemThemeChange);
      systemThemeMediaQuery = null;
      statusController.destroy();
      layoutController.destroy();
      searchSession.cancel();
      passwordStrengthSession.reset();
      autoLockSession.clear();
      settingsSaveSession.cancel();
    };
  });

  $: if (hydrated) {
    items;
    customDeviceTypes;
    vaultSnapshots;
    vaultStorageController.schedule();
  }

  $: {
    sidebarCollapsed;
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
    deviceTypeOptions;
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
  $: {
    items;
    deviceTypeOptions;
    bulkPasswordDisabled = !accountPasswordController.canOpenBulkPasswordDialog();
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
  $: passwordStrengthSession.refresh(selectedAccount.password, [
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
    searchSession.cancel();
    navigationController.back();
    searchDraft = searchQuery;
  }

  function goForward() {
    searchSession.cancel();
    navigationController.forward();
    searchDraft = searchQuery;
  }

  function updateSearchValue(value: string) {
    searchDraft = value;
    searchSession.update(value);
  }

  function clearSearch() {
    searchSession.cancel();
    searchDraft = "";
    navigationController.clearSearch();
    persistLastView();
  }

  function focusSearchInput() {
    navigationController.focusSearch();
  }

  function selectDeviceType(deviceType: "全部设备" | DeviceType) {
    searchSession.cancel();
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
      return false;
    }
    try {
      await writeClipboardText(text);
      showStatus(`${label}已复制`);
      return true;
    } catch {
      showStatus("复制失败");
      return false;
    }
  }

  const { editCopy, editCut, editPaste, editSelectAll, editClearSearch } = createEditableContextController({
    read: () => ({ activePopover, editableContext, editableContextTarget, editableSelection }),
    write: (patch) => {
      if (patch.editableSelection) editableSelection = patch.editableSelection;
      if ("activePopover" in patch) activePopover = patch.activePopover ?? null;
      if ("editableContext" in patch) editableContext = patch.editableContext ?? null;
    },
    copyText,
    readClipboardText,
    showStatus,
    clearSearch,
  });

  function handleWindowBlur() {
    passwordStrengthSession.reset();
    passwordVisible = false;
    visibleHistoryIds = [];
    revealResetToken += 1;
    if (generatorPanelOpen) {
      generatedPassword = "";
      generatorPanelOpen = false;
      generatorTarget = null;
    }
  }

  function handleUserActivity() {
    autoLockSession.activity();
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

  function setSettingsSection(section: SettingsView["activeSection"]) {
    settingsActiveSection = section;
  }

  function clearSensitiveVaultState() {
    searchSession.cancel();
    passwordStrengthSession.reset();
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
    autoLockSession.clear();
    if (!vaultLockEnabled || vaultLocked) return;
    await vaultSecurity.lock();
    clearSensitiveVaultState();
    vaultStorageController.suspend();
    vaultLocked = true;
    vaultUnlockPassword = "";
    vaultUnlockError = "";
  }

  async function lockVaultNow() {
    if (confirmationBusy) {
      autoLockSession.schedule();
      return;
    }
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
      if (confirmationBusy) {
        autoLockSession.schedule();
        return;
      }
      await lockVaultSession();
    } catch (error) {
      showStatus(`锁定资产库失败：${error instanceof Error ? error.message : String(error)}`, 6000);
      autoLockSession.schedule();
    }
  }

  async function unlockVault() {
    if (!vaultLocked || vaultUnlockBusy || !vaultUnlockPassword) return;
    vaultUnlockBusy = true;
    vaultUnlockError = "";
    let unlocked = false;
    try {
      if (!isTauri()) throw new Error("浏览器预览模式不支持启动密码");
      await vaultSecurity.unlock(vaultUnlockPassword);
      unlocked = true;
      vaultUnlockPassword = "";
      await vaultStorageController.initialize();
      if (vaultStorageState !== "ready") {
        throw new Error(vaultStorageError || "资产库读取失败");
      }
      vaultLocked = false;
      autoLockSession.schedule();
    } catch (error) {
      if (unlocked) {
        // The password is valid, but the storage overlay must remain available
        // so the user can retry or explicitly recover a valid backup.
        vaultLocked = false;
        vaultUnlockError = "";
      } else {
        vaultUnlockError = error instanceof Error ? error.message : String(error ?? "解锁失败");
        await vaultSecurity.lock().catch(() => undefined);
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
      vaultLockEnabled = await vaultSecurity.status();
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
        autoLockSession.schedule();
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
        recoveryKey = await vaultSecurity.setup(vaultPasswordForm.newPassword);
        vaultLockEnabled = true;
      } else if (vaultPasswordDialogMode === "change") {
        recoveryKey = await vaultSecurity.change(vaultPasswordForm.currentPassword, vaultPasswordForm.newPassword);
      } else {
        await vaultSecurity.disable(vaultPasswordForm.currentPassword);
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
      autoLockSession.schedule();
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

  const { saveRecoveryFile, chooseRecoveryFile } = createRecoveryFileController({
    read: () => ({ recoveryKey, recoveryFileBusy }),
    write: (patch) => {
      if (patch.recoveryAcknowledged !== undefined) recoveryAcknowledged = patch.recoveryAcknowledged;
      if (patch.recoveryFileBusy !== undefined) recoveryFileBusy = patch.recoveryFileBusy;
      if (patch.recoveryFileError !== undefined) recoveryFileError = patch.recoveryFileError;
      if (patch.recoveryFileName !== undefined) recoveryFileName = patch.recoveryFileName;
      if (patch.recoveryFileSaved !== undefined) recoveryFileSaved = patch.recoveryFileSaved;
      if (patch.recoveryFileContent !== undefined) recoveryFileContent = patch.recoveryFileContent;
      if (patch.recoveryError !== undefined) recoveryError = patch.recoveryError;
    },
    showStatus,
  });

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
      autoLockSession.schedule();
      showStatus(vaultStorageState === "ready" ? "资产库已恢复" : "恢复文件已保存，请处理资产库读取问题");
      return;
    }
    activeDialog = "settings";
    settingsActiveSection = "security";
    autoLockSession.schedule();
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
      recoveryKey = await vaultSecurity.recover(recoveryInput, newPassword);
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
        await vaultSecurity.lock().catch(() => undefined);
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
    autoLockSession.schedule();
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
    autoLockSession.schedule();
  }

  function setTooltipSetting(value: boolean) {
    updateInterfaceSettings({ tooltipEnabled: value });
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
    updateInterfaceSettings({ theme: value });
  }

  function requestResetSettings() {
    pendingConfirmation = {
      action: "reset-settings",
      title: "恢复默认设置",
      message: "确定要恢复默认设置吗？",
      detail: "这只会重置界面、工作区和密码生成器偏好，不会删除设备、账号、密码或数据快照。",
      confirmLabel: "恢复默认",
    };
  }

  async function resetSettings() {
    const previousSettings = appSettings;
    let previousAutostart = false;
    let defaultsApplied = false;
    try {
      settingsSaveSession.cancel();
      await settingsSaveSession.settled();
      if (isTauri() && autostartAvailable) {
        previousAutostart = await isAutostartEnabled();
        if (previousAutostart) await disableAutostart();
      }
      await resetAppSettings();
      settingsReadFailed = false;
      const defaults = createDefaultAppSettings();
      appSettings = normalizeAppSettings({
        ...defaults,
        interface: { ...defaults.interface, startupLock: vaultLockEnabled },
      });
      applyAppSettings(appSettings);
      await persistAppSettings();
      defaultsApplied = true;
      autoLockSession.schedule();
      showStatus("应用设置已恢复默认值");
      return true;
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
      return false;
    }
  }

  function showStatus(message: string, duration = 2200, actionLabel = "", action: (() => void) | null = null) {
    if (confirmationBusy) confirmationReportedStatus = message;
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
    if (confirmationBusy) return;
    const returnToSettings = dataDialogReturnToSettings
      && (activeDialog === "export-config" || activeDialog === "snapshots");
    const returnToSecuritySettings = activeDialog === "security-password";
    if (returnToSecuritySettings && (vaultPasswordBusy || recoveryFileBusy)) return;
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
    if (confirmationBusy) return;
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
    if (activeDialog === "export-config") {
      (document.getElementById("export-config-form") as HTMLFormElement | null)?.requestSubmit();
    }
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
    return deviceTypeController.deleteDeviceType(confirmation ?? { deviceType: selectedDeviceType });
  }

  function saveDeviceType() {
    deviceTypeController.saveDeviceType();
  }

  function executeSaveDeviceType(confirmation?: PendingConfirmation) {
    return deviceTypeController.executeSaveDeviceType(confirmation);
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
    return deviceController.executeSaveDevice(confirmation);
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
    return deviceController.deleteSelected(confirmation);
  }

  function requestDeleteSelectedDevice() {
    deviceController.requestDeleteSelected();
  }

  type ConfirmationContext = {
    confirmation: PendingConfirmation;
    importedConfig: ConfigData | null;
    configFormat: ConfigTransferFormat;
    importMode: ConfigImportMode;
    xlsxOverwriteDeviceKeys: string[];
  };

  const confirmationHandlers: Partial<Record<ConfirmationAction, (context: ConfirmationContext) => boolean | Promise<boolean>>> = {
    "delete-account": ({ confirmation }) => accountPasswordController.executeAccountConfirmation(confirmation),
    "save-account": ({ confirmation }) => accountPasswordController.executeAccountConfirmation(confirmation),
    "save-account-password": ({ confirmation }) => accountPasswordController.executeAccountConfirmation(confirmation),
    "update-password": ({ confirmation }) => accountPasswordController.executePasswordConfirmation(confirmation),
    "bulk-update-password": ({ confirmation }) => accountPasswordController.executePasswordConfirmation(confirmation),
    "restore-history": ({ confirmation }) => accountPasswordController.executePasswordConfirmation(confirmation),
    "delete-device-type": ({ confirmation }) => deleteDeviceType(confirmation),
    "delete-device": ({ confirmation }) => deleteSelectedDevice(confirmation),
    "import-config": ({ importedConfig, configFormat, importMode, xlsxOverwriteDeviceKeys }) => {
      if (!importedConfig) throw new Error("待导入配置已失效，请重新选择文件");
      return applyImportedConfig(importedConfig, configFormat, importMode, xlsxOverwriteDeviceKeys);
    },
    "save-device": ({ confirmation }) => executeSaveDevice(confirmation),
    "save-device-type": ({ confirmation }) => executeSaveDeviceType(confirmation),
    "restore-snapshot": ({ confirmation }) => {
      if (!confirmation.snapshotId) throw new Error("数据快照目标信息不完整，请重新选择快照");
      return restoreSnapshot(confirmation.snapshotId, true);
    },
    "reset-settings": () => resetSettings(),
  };

  async function confirmPendingAction() {
    const confirmation = pendingConfirmation;
    if (!confirmation || confirmationBusy) return;
    if (confirmation.action === "import-config" && confirmation.importModeErrors?.[importConfigMode]) {
      confirmationError = `无法按“${importConfigMode === "add-missing" ? "仅新增" : "全部覆盖"}”导入：${confirmation.importModeErrors[importConfigMode]}`;
      return;
    }
    const context: ConfirmationContext = {
      confirmation,
      importedConfig: pendingImportedConfig,
      configFormat: pendingConfigFormat,
      importMode: importConfigMode,
      xlsxOverwriteDeviceKeys: confirmation.xlsxOverwriteDeviceKeys ?? [],
    };
    confirmationError = "";
    confirmationReportedStatus = "";
    confirmationBusy = true;
    try {
      const handler = confirmationHandlers[confirmation.action];
      if (!handler) throw new Error("这个操作暂时无法执行");
      const applied = await handler(context);
      // Security cleanup or a newer confirmation owns the surface once identity changes.
      if (pendingConfirmation !== confirmation) return;
      if (!applied) {
        confirmationError = confirmationReportedStatus || "操作未完成，请检查后重试。";
        return;
      }
      pendingConfirmation = null;
      pendingImportedConfig = null;
      if (confirmation.action === "import-config" && dataDialogReturnToSettings) {
        dataDialogReturnToSettings = false;
        settingsActiveSection = "data";
        activeDialog = "settings";
      }
    } catch (error) {
      if (pendingConfirmation !== confirmation) return;
      const reason = error instanceof Error ? error.message : String(error ?? "");
      confirmationError = reason ? `操作失败：${reason}` : "操作失败：发生未知错误";
    } finally {
      confirmationBusy = false;
      confirmationReportedStatus = "";
    }
  }

  function openExportConfigDialog() {
    dataDialogReturnToSettings = activeDialog === "settings";
    configTransferController.openExportConfigDialog();
  }

  async function exportConfig(format: ConfigTransferFormat = exportConfigFormat, password = ""): Promise<string | null> {
    const returnToSettings = dataDialogReturnToSettings;
    const error = await configTransferController.exportConfig(format, password);
    if (error) return error;
    if (returnToSettings && activeDialog === null) {
      dataDialogReturnToSettings = false;
      settingsActiveSection = "data";
      activeDialog = "settings";
    }
    return null;
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

  async function applyImportedConfig(config: ConfigData, format: ConfigTransferFormat, mode: ConfigImportMode, overwriteDeviceKeys: string[] = []) {
    const returnToSettings = dataDialogReturnToSettings;
    const applied = await configTransferController.applyImportedConfig(config, format, mode, overwriteDeviceKeys);
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
    openStoragePath,
    copyStoragePath: (kind: "installation" | "app-data") => {
      if (!isTauri() || environmentStatus !== "ready") return;
      void copyText(kind === "installation" ? installationPath : appDataPath, kind === "installation" ? "程序位置" : "数据目录");
    },
    openSnapshotsDialog,
    openExportConfigDialog,
    chooseConfigFile,
    reset: requestResetSettings,
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
    setActivePopover: (popover: ActivePopover | null) => {
      activePopover = popover;
      if (popover !== "editable-context") editableContext = null;
    },
    editCopy,
    editCut,
    editPaste,
    editSelectAll,
    editClearSearch,
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
      toggleCollapsed: () => {
        layoutController.stopResize();
        closeOverlays();
        sidebarCollapsed = !sidebarCollapsed;
      },
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
      openDeviceContextMenu,
      openDeviceListBlankContextMenu,
      selectDevice,
    },
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
    installationPath,
    appDataPath,
    storageMode,
    environmentStatus,
    operatingSystem,
    applicationArch,
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
    editableContext,
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
      collapsed: sidebarCollapsed,
      deviceTypeRows,
      selectedDeviceType,
      selectedTypeDeviceCount,
      canDeleteSelectedDeviceType,
    },
    topbar: {
      backDisabled: backStack.length === 0,
      forwardDisabled: forwardStack.length === 0,
      bulkPasswordDisabled,
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
    canExit={vaultCanExit}
    exitError={vaultExitError}
    exiting={vaultExiting}
    exitApplication={() => vaultStorageController.exitApplication()}
  />
{/if}

<main class="app-shell" class:storage-blocked={vaultStorageState !== "ready"} style={layoutStyle} aria-hidden={vaultStorageState !== "ready"} inert={vaultStorageState !== "ready"}>
  <input id="import-file" class="hidden-file-input" type="file" accept=".json,.yaml,.yml,.xlsx,application/json,application/yaml,text/yaml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" on:change={selectConfigFileFromBrowser} />
  <WorkspaceContent
    view={workspaceView}
    actions={workspaceActions}
    bind:searchInput
    bind:passwordVisible
    bind:historyOpen
  />

  <OverlayLayer
    popover={{ model: actionPopoverModel, actions: actionPopoverActions }}
    {activeDialog}
    bind:typeForm
    bind:passwordForm
    bind:bulkPasswordForm
    bind:accountForm
    bind:deviceForm
    bind:exportConfigFormat
    exportPasswordConfigured={vaultLockEnabled}
    bind:openTypePicker
    bind:bulkTypeSearch
    bind:bulkUsernameSearch
    bind:deviceTypeSearch
    validationFeedback={formValidationFeedback}
    appDialogView={appDialogView}
    appDialogActions={appDialogActions}
    snapshots={{ items: vaultSnapshots, close: closeOverlays, restore: requestRestoreSnapshot }}
    confirmation={{
      pending: pendingConfirmation,
      busy: confirmationBusy,
      error: confirmationError,
      progressLabel: "正在执行，请稍候…",
      importMode: importConfigMode,
      cancel: cancelPendingConfirmation,
      confirm: confirmPendingAction,
      setImportMode: (mode) => { if (!confirmationBusy) { importConfigMode = mode; confirmationError = ""; } },
      setXlsxOverwriteDeviceKeys: (keys) => {
        if (!confirmationBusy && pendingConfirmation?.xlsxImport) {
          pendingConfirmation = { ...pendingConfirmation, xlsxOverwriteDeviceKeys: keys };
          confirmationError = "";
        }
      },
    }}
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
    status={{
      message: copyStatus,
      pause: pauseStatusDismiss,
      resume: resumeStatusDismiss,
      dismiss: dismissStatus,
      actionLabel: statusActionLabel,
      runAction: runStatusAction,
    }}
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
    {revealResetToken}
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
