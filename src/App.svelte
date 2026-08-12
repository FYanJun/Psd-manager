<script lang="ts">
  import { onMount } from "svelte";
  import OverlayLayer from "./components/OverlayLayer.svelte";
  import VaultStorageStatus from "./components/VaultStorageStatus.svelte";
  import WorkspaceContent from "./components/WorkspaceContent.svelte";

  import {
    GENERATOR_DEFAULT_RATIO,
    LIST_DEFAULT_RATIO,
    SIDEBAR_DEFAULT_RATIO,
    VAULT_SCHEMA_VERSION,
    initialItems,
  } from "./lib/constants";
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
  import { ensureDeviceTypeMetadata } from "./lib/device-type-meta";
  import type {
    AccountForm,
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
  let legacyVaultKeyMigrationRequired = false;
  let vaultBackupRecoveryRequired = false;
  let hydrated = false;
  let searchQuery = "";
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
  let canUseGeneratorForCurrentAccount = true;
  let canUseGeneratorForBulkUpdate = true;

  const layoutController = createWorkspaceLayoutController({
    read: () => ({ sidebarRatio, listRatio, generatorRatio }),
    write: (layout) => {
      sidebarRatio = layout.sidebarRatio;
      listRatio = layout.listRatio;
      generatorRatio = layout.generatorRatio;
    },
    setResizingPane: (pane) => (resizingPane = pane),
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
    writeViewState: (state) => {
      vaultStorageState = state.state;
      vaultStorageError = state.error;
      legacyVaultKeyMigrationRequired = state.canMigrateLegacyKey;
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
    const normalized = normalizeVaultIdentityData(parsed.items, parsed.customDeviceTypes);
    items = normalized.items;
    customDeviceTypes = normalized.customDeviceTypes;
    ensureDeviceTypeMetaForItems(items);
    vaultSnapshots = Array.isArray(parsed.snapshots) ? parsed.snapshots.slice(0, 10) : [];
    layoutController.restore(parsed.paneLayout);
  }

  function createPersistedVaultState(revision: number): PersistedVaultState {
    return {
      schemaVersion: VAULT_SCHEMA_VERSION,
      revision,
      items,
      customDeviceTypes,
      snapshots: vaultSnapshots,
      paneLayout: { sidebarRatio, listRatio, generatorRatio },
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
    navigationController.resetWorkspace(nextItems);
    historyOpen = false;
    historyContextKey = "";
  }

  async function restoreSnapshot(snapshotId: string, createCurrentBackup: boolean) {
    await snapshotController.restoreSnapshot(snapshotId, createCurrentBackup);
  }

  function offerSnapshotUndo(snapshotId: string, message: string) {
    snapshotController.offerUndo(snapshotId, message);
  }

  function requestRestoreSnapshot(snapshot: VaultSnapshot) {
    snapshotController.requestRestore(snapshot);
  }

  async function migrateLegacyVaultKey() {
    await vaultStorageController.migrateLegacyKey();
  }

  async function recoverVaultBackup() {
    await vaultStorageController.recoverBackup();
  }

  async function retryVaultStorage() {
    await vaultStorageController.retry();
  }

  onMount(() => {
    void vaultStorageController.initialize();
    vaultStorageController.mountCloseProtection();
    overlayController.mount();
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("resize", clampPaneLayout);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      overlayController.destroy();
      window.removeEventListener("keydown", handleGlobalKeydown);
      window.removeEventListener("resize", clampPaneLayout);
      window.removeEventListener("blur", handleWindowBlur);
      vaultStorageController.destroy();
      statusController.destroy();
      stopPaneResize();
    };
  });

  $: if (hydrated) {
    items;
    customDeviceTypes;
    vaultSnapshots;
    sidebarRatio;
    listRatio;
    generatorRatio;
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
    ? "搜索设备名、连接地址或资产编号"
    : `在${selectedDeviceType}中搜索设备名、连接地址或资产编号`;
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
    navigationController.back();
  }

  function goForward() {
    navigationController.forward();
  }

  function updateSearchValue(value: string) {
    navigationController.updateSearch(value);
  }

  function clearSearch() {
    navigationController.clearSearch();
  }

  function focusSearchInput() {
    navigationController.focusSearch();
  }

  function selectDeviceType(deviceType: "全部设备" | DeviceType) {
    navigationController.selectDeviceType(deviceType);
  }

  function selectDevice(id: number) {
    navigationController.selectDevice(id);
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

  async function refreshPasswordStrength(password: string, userInputs: string[]) {
    const requestId = ++passwordStrengthRequestId;
    if (!password) {
      passwordStrength = "";
      return;
    }
    passwordStrength = "计算中";
    try {
      const { getPasswordStrengthLabel } = await import("./lib/password-strength");
      if (requestId !== passwordStrengthRequestId) return;
      passwordStrength = getPasswordStrengthLabel(password, userInputs);
    } catch {
      if (requestId === passwordStrengthRequestId) passwordStrength = "暂不可用";
    }
  }

  function handleWindowBlur() {
    passwordVisible = false;
    visibleHistoryIds = [];
    revealResetToken += 1;
    if (generatorPanelOpen) {
      generatedPassword = "";
      generatorPanelOpen = false;
      generatorTarget = null;
    }
  }

  function openSnapshotsDialog() {
    activePopover = null;
    activeDialog = "snapshots";
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
  }

  function setDeviceTypeSortMode(mode: DeviceTypeSortMode) {
    if (mode === deviceTypeSortMode) return;
    deviceTypeSortMode = mode;
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
    overlayController.closeOverlays();
  }

  function cancelPendingConfirmation() {
    overlayController.cancelPendingConfirmation();
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

  const confirmationHandlers: Partial<Record<ConfirmationAction, (context: ConfirmationContext) => void | Promise<void>>> = {
    "delete-device-type": async ({ confirmation }) => {
      await deleteDeviceType(confirmation);
    },
    "delete-device": async ({ confirmation }) => {
      await deleteSelectedDevice(confirmation);
    },
    "import-config": async ({ importedConfig, configFormat, importMode }) => {
      if (!importedConfig) throw new Error("待导入配置已失效，请重新选择文件");
      await applyImportedConfig(importedConfig, configFormat, importMode);
    },
    "rename-device-type": ({ confirmation }) => executeSaveDeviceType(confirmation),
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
    pendingImportedConfig = null;
    try {
      if (await accountPasswordController.executeConfirmation(confirmation)) return;
      const handler = confirmationHandlers[confirmation.action];
      if (!handler) {
        showStatus("这个操作暂时无法执行", 5000);
        return;
      }
      await handler(context);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error ?? "");
      showStatus(reason ? `操作失败：${reason}` : "操作失败：发生未知错误", 7000);
    }
  }

  function openExportConfigDialog() {
    configTransferController.openExportConfigDialog();
  }

  async function exportConfig(format: ConfigFormat = exportConfigFormat) {
    await configTransferController.exportConfig(format);
  }

  async function chooseConfigFile() {
    await configTransferController.chooseConfigFile();
  }

  function ensureDeviceTypeMetaForItems(targetItems: VaultItem[]) {
    const normalized = ensureDeviceTypeMetadata(targetItems, customDeviceTypes);
    items = normalized.items;
    customDeviceTypes = normalized.customDeviceTypes;
  }

  async function applyImportedConfig(config: ConfigData, format: ConfigFormat, mode: ConfigImportMode) {
    await configTransferController.applyImportedConfig(config, format, mode);
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
    chooseConfigFile,
    openExportConfigDialog,
    openSnapshotsDialog,
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
      openConfigPopover: (event: MouseEvent) => openPopover("config", event),
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
      searchQuery,
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
    canMigrateLegacyKey={legacyVaultKeyMigrationRequired}
    migrateLegacyKey={migrateLegacyVaultKey}
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
    tooltipEnabled={vaultStorageState === "ready"}
  />
</main>
