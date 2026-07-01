<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
  import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
  import { onMount } from "svelte";
  import ActionPopover from "./components/ActionPopover.svelte";
  import AppDialog from "./components/AppDialog.svelte";
  import ConfirmationDialog from "./components/ConfirmationDialog.svelte";
  import DeviceDetailPane from "./components/DeviceDetailPane.svelte";
  import DeviceListPane from "./components/DeviceListPane.svelte";
  import PasswordGeneratorDrawer from "./components/PasswordGeneratorDrawer.svelte";
  import SidebarPane from "./components/SidebarPane.svelte";
  import StatusToast from "./components/StatusToast.svelte";
  import Topbar from "./components/Topbar.svelte";

  import {
    APP_TITLE,
    DEFAULT_ACCOUNT_TAG,
    GENERATOR_DEFAULT_RATIO,
    GENERATOR_MAX_RATIO,
    GENERATOR_MIN_RATIO,
    LIST_DEFAULT_RATIO,
    LIST_MAX_RATIO,
    LIST_MIN_RATIO,
    RESIZER_RATIO,
    SIDEBAR_DEFAULT_RATIO,
    SIDEBAR_MAX_RATIO,
    SIDEBAR_MIN_RATIO,
    STORAGE_KEY,
    defaultDeviceTypeMeta,
    fallbackDeviceTypeMeta,
    initialItems,
  } from "./lib/constants";
  import {
    createAccountFromForm as createAccountFromFormData,
    formatDeviceAccountInfo,
    formatDeviceInfo,
    getBulkPasswordMatches as getBulkPasswordMatchesData,
    getBulkPasswordMatchKey,
    getBulkUsernameSuggestions,
    updateAccountPassword,
  } from "./lib/device-commands";
  import {
    clampPaneRatio,
    sortDeviceTypeOptions,
  } from "./lib/layout";
  import {
    buildGeneratorPool,
    generatePasswordValue,
    normalizeGeneratorLength,
    type GeneratorOptions,
  } from "./lib/password-generator";
  import type {
    AccountForm,
    ActiveDialog,
    ActivePopover,
    BulkPasswordForm,
    BulkPasswordMatch,
    BulkUsernameSuggestion,
    ConfigFormat,
    DeviceAccount,
    DeviceForm,
    DeviceType,
    DeviceTypeMeta,
    DeviceTypeSortMode,
    GeneratorTarget,
    PendingConfirmation,
    PopoverPosition,
    ResizePane,
    SortMode,
    TypeForm,
    TypePickerScope,
    VaultItem,
    ViewState,
  } from "./lib/types";
  import {
    filterDeviceTypeChoices,
    formatDateTime,
    readNumber,
  } from "./lib/utils";
  import {
    createConfigFilename,
    createConfigPayload,
    formatConfigSummary,
    getConfigSummary,
    getConfigMimeType,
    inferConfigFormat,
    normalizeDeviceTypeMetaList,
    normalizeHiddenDeviceTypes,
    parseConfigContent,
    parseConfigContentWithFallback,
  } from "./lib/config";
  import {
    createBlankAccount,
    createBlankItem,
    createEmptyAccountForm,
    createEmptyDeviceForm,
    getAccounts,
    getVaultItemUpdatedTimestamp,
    iconClassForColor,
    iconClassForType as resolveIconClassForType,
    matchesVaultItemSearch,
    normalizeVaultItems,
    syncItemWithAccounts,
    isBlankPlaceholderAccount,
  } from "./lib/vault";

  let items: VaultItem[] = initialItems;
  let customDeviceTypes: DeviceTypeMeta[] = [];
  let hiddenDeviceTypes: string[] = [];
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
  let pendingConfigContent = "";
  let pendingConfigFormat: ConfigFormat = "json";
  let exportConfigFormat: ConfigFormat = "json";
  let contextDeviceType: "全部设备" | DeviceType = "全部设备";
  let popoverPosition: PopoverPosition = { top: 72, left: 22 };
  let deviceForm: DeviceForm = createEmptyDeviceForm();
  let accountForm: AccountForm = createEmptyAccountForm();
  let typeForm: TypeForm = { originalLabel: null, label: "", iconText: "", color: "blue" };
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
  let historyOpen = true;
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
  let generatorPool = "";
  let copyStatus = "";
  let statusHovered = false;
  let statusTimer: ReturnType<typeof window.setTimeout> | null = null;
  let backStack: ViewState[] = [];
  let forwardStack: ViewState[] = [];
  let restoringView = false;
  let searchInput: HTMLInputElement | null = null;
  let sidebarRatio = SIDEBAR_DEFAULT_RATIO;
  let listRatio = LIST_DEFAULT_RATIO;
  let generatorRatio = GENERATOR_DEFAULT_RATIO;
  let resizingPane: ResizePane | null = null;
  let resizeStartX = 0;
  let resizeStartSidebarRatio = SIDEBAR_DEFAULT_RATIO;
  let resizeStartListRatio = LIST_DEFAULT_RATIO;
  let resizeStartGeneratorRatio = GENERATOR_DEFAULT_RATIO;

  onMount(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.items)) items = normalizeVaultItems(parsed.items);
        if (Array.isArray(parsed.customDeviceTypes)) customDeviceTypes = normalizeDeviceTypeMetaList(parsed.customDeviceTypes);
        ensureDeviceTypeMetaForItems(items);
        hiddenDeviceTypes = normalizeHiddenDeviceTypes(parsed.hiddenDeviceTypes, items);
        if (parsed.paneLayout) {
          sidebarRatio = readPaneLayoutRatio(parsed.paneLayout, "sidebar");
          listRatio = readPaneLayoutRatio(parsed.paneLayout, "list");
          generatorRatio = readPaneLayoutRatio(parsed.paneLayout, "generator");
        }
      } catch {
        showStatus("本地数据读取失败，已使用默认数据");
      }
    }
    clampPaneLayout();
    hydrated = true;
    window.addEventListener("pointerdown", handleGlobalPointerDown, true);
    window.addEventListener("contextmenu", handleGlobalContextMenu, true);
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("resize", clampPaneLayout);
    return () => {
      window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
      window.removeEventListener("contextmenu", handleGlobalContextMenu, true);
      window.removeEventListener("keydown", handleGlobalKeydown);
      window.removeEventListener("resize", clampPaneLayout);
      if (statusTimer) window.clearTimeout(statusTimer);
      stopPaneResize();
    };
  });

  $: if (hydrated) {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items, customDeviceTypes, hiddenDeviceTypes, paneLayout: { sidebarRatio, listRatio, generatorRatio } })
    );
  }

  $: layoutStyle = [
    `--sidebar-share: ${formatPanePercent(sidebarRatio)}`,
    `--sidebar-min-share: ${formatPanePercent(SIDEBAR_MIN_RATIO)}`,
    `--sidebar-max-share: ${formatPanePercent(SIDEBAR_MAX_RATIO)}`,
    `--list-share: ${formatPanePercent(listRatio)}`,
    `--list-min-share: ${formatPanePercent(LIST_MIN_RATIO)}`,
    `--list-max-share: ${formatPanePercent(LIST_MAX_RATIO)}`,
    `--generator-share: ${formatPanePercent(generatorRatio)}`,
    `--generator-min-share: ${formatPanePercent(GENERATOR_MIN_RATIO)}`,
    `--generator-max-share: ${formatPanePercent(GENERATOR_MAX_RATIO)}`,
    `--resizer-share: ${formatPanePercent(RESIZER_RATIO)}`,
  ].join("; ");

  $: filteredItems = items.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery = !query || matchesVaultItemSearch(item, query);

    const isSearching = query.length > 0;
    const matchesType = isSearching || selectedDeviceType === "全部设备" || item.deviceType === selectedDeviceType;
    return matchesQuery && matchesType;
  }).sort((left, right) => {
    if (sortMode === "nameAsc") return left.deviceName.localeCompare(right.deviceName, "zh-Hans-CN");
    if (sortMode === "typeAsc") return left.deviceType.localeCompare(right.deviceType, "zh-Hans-CN");
    return getVaultItemUpdatedTimestamp(right) - getVaultItemUpdatedTimestamp(left) || right.id - left.id;
  });

  $: selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? createBlankItem();
  $: hasDevices = items.length > 0;
  $: hasSelectedDevice = selectedItem.id > 0 && filteredItems.some((item) => item.id === selectedItem.id);

  $: if (filteredItems.length > 0 && !filteredItems.some((item) => item.id === selectedId)) {
    selectedId = filteredItems[0].id;
    selectedAccountId = 0;
    selectedAccountIds = [];
  }

  $: deviceTypeOptions = [
    ...defaultDeviceTypeMeta
      .filter((type) => type.label !== "全部设备" && !hiddenDeviceTypes.includes(type.label))
      .map((type) => customDeviceTypes.find((custom) => custom.label === type.label) ?? type),
    ...customDeviceTypes.filter((custom) =>
      !defaultDeviceTypeMeta.some((type) => type.label === custom.label) || hiddenDeviceTypes.includes(custom.label)
    ),
  ];

  $: sortedDeviceTypeOptions = sortDeviceTypeOptions(deviceTypeOptions, deviceTypeSortMode, items);
  $: deviceTypeRows = [
    defaultDeviceTypeMeta[0],
    ...sortedDeviceTypeOptions.map((type) => ({
      ...type,
      count: items.filter((item) => item.deviceType === type.label).length,
    })),
  ].map((type) => ({
    ...type,
    count: type.label === "全部设备" ? items.length : type.count,
  }));
  $: filteredDeviceTypeOptions = filterDeviceTypeChoices(deviceTypeOptions, deviceTypeSearch);
  $: filteredBulkTypeRows = filterDeviceTypeChoices(deviceTypeRows, bulkTypeSearch);
  $: selectedDeviceFormTypeMeta = getTypeMeta(deviceForm.deviceType);
  $: selectedBulkTypeMeta = deviceTypeRows.find((type) => type.label === bulkPasswordForm.deviceType) ?? deviceTypeRows[0];

  $: selectedAccounts = getAccounts(selectedItem);
  $: selectedAccount = selectedAccounts.find((account) => account.id === selectedAccountId) ?? selectedAccounts[0] ?? createBlankAccount();
  $: selectedAccountBatch = selectedAccounts.filter((account) => selectedAccountIds.includes(account.id));
  $: selectedAccountTargets = selectedAccountBatch.length > 0 ? selectedAccountBatch : selectedAccount.id ? [selectedAccount] : [];
  $: selectedAccountTargetCount = selectedAccountTargets.length;
  $: canDeleteSelectedAccountTargets = selectedAccountTargetCount > 0;
  $: if (selectedAccounts.length > 0 && !selectedAccounts.some((account) => account.id === selectedAccountId)) {
    selectedAccountId = selectedAccounts[0].id;
  }
  $: {
    const validSelectedAccountIds = selectedAccountIds.filter((id) => selectedAccounts.some((account) => account.id === id));
    if (validSelectedAccountIds.length !== selectedAccountIds.length) {
      selectedAccountIds = validSelectedAccountIds;
    }
  }
  $: passwordStrength = selectedAccount.password.length >= 14 ? "较强" : selectedAccount.password.length >= 10 ? "一般" : "较弱";
  $: selectedTypeDeviceCount = getDeviceTypeCount(selectedDeviceType);
  $: listContextLabel = searchQuery.trim() ? "搜索结果" : selectedDeviceType;
  $: listContextMeta = deviceTypeRows.find((type) => type.label === listContextLabel) ?? defaultDeviceTypeMeta[0];
  $: searchPlaceholder =
    searchQuery.trim() || selectedDeviceType === "全部设备"
      ? "搜索设备名、IP 或资产编号"
      : `在${selectedDeviceType}中搜索设备名、IP 或资产编号`;
  $: sortedHistory = [...selectedAccount.history].sort((left, right) =>
    historySortDesc ? right.id - left.id : left.id - right.id
  );
  $: bulkUsernameSuggestions = bulkUsernameSearch.trim() && !bulkPasswordForm.username.trim()
    ? getBulkUsernameSuggestions(items, bulkPasswordForm, bulkUsernameSearch)
    : [];
  $: bulkPasswordMatches = bulkPasswordForm.username.trim() ? getBulkPasswordMatchesData(items, bulkPasswordForm) : [];
  $: bulkPasswordSelectedMatches = bulkPasswordMatches.filter((match) =>
    !bulkPasswordDeselectedKeys.includes(getBulkPasswordMatchKey(match))
  );
  $: canUseGeneratorForCurrentAccount = generatorTarget !== "bulk-password";
  $: canUseGeneratorForBulkUpdate = generatorTarget !== "current-account";
  $: {
    useUpper;
    useLower;
    useNumbers;
    useSymbols;
    excludeSimilar;
    allowedSymbols;
    excludedCharacters;
    generatorPool = buildGeneratorPool(getGeneratorOptions());
  }
  function snapshotView(): ViewState {
    return {
      selectedDeviceType,
      selectedId,
      searchQuery,
      sortMode,
    };
  }

  function statesMatch(left: ViewState, right: ViewState) {
    return (
      left.selectedDeviceType === right.selectedDeviceType &&
      left.selectedId === right.selectedId &&
      left.searchQuery === right.searchQuery &&
      left.sortMode === right.sortMode
    );
  }

  function pushNavigationState() {
    if (restoringView) return;
    const current = snapshotView();
    const previous = backStack[backStack.length - 1];
    if (!previous || !statesMatch(previous, current)) {
      backStack = [...backStack.slice(-79), current];
    }
    forwardStack = [];
  }

  function applyViewState(state: ViewState) {
    restoringView = true;
    selectedDeviceType = state.selectedDeviceType;
    selectedId = state.selectedId;
    selectedAccountIds = [];
    searchQuery = state.searchQuery;
    sortMode = state.sortMode;
    queueMicrotask(() => {
      restoringView = false;
    });
  }

  function goBack() {
    const previous = backStack[backStack.length - 1];
    if (!previous) return;
    backStack = backStack.slice(0, -1);
    forwardStack = [snapshotView(), ...forwardStack.slice(0, 79)];
    applyViewState(previous);
  }

  function goForward() {
    const next = forwardStack[0];
    if (!next) return;
    forwardStack = forwardStack.slice(1);
    backStack = [...backStack.slice(-79), snapshotView()];
    applyViewState(next);
  }

  function updateSearchValue(value: string) {
    if (value === searchQuery) return;
    if (!searchQuery.trim() || !value.trim()) pushNavigationState();
    searchQuery = value;
  }

  function clearSearch() {
    if (!searchQuery.trim()) return;
    pushNavigationState();
    searchQuery = "";
  }

  function focusSearchInput() {
    searchInput?.focus();
    searchInput?.select();
  }

  function selectDeviceType(deviceType: "全部设备" | DeviceType) {
    if (deviceType === selectedDeviceType && !searchQuery) return;
    pushNavigationState();
    selectedDeviceType = deviceType;
    searchQuery = "";
    const firstMatch = items.find((item) => deviceType === "全部设备" || item.deviceType === deviceType);
    selectedId = firstMatch?.id ?? 0;
    selectedAccountIds = [];
    activePopover = null;
    visibleHistoryIds = [];
  }

  function selectDevice(id: number) {
    if (id === selectedId) return;
    pushNavigationState();
    selectedId = id;
    selectedAccountId = 0;
    selectedAccountIds = [];
    passwordVisible = false;
    visibleHistoryIds = [];
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showStatus(`${label}已复制`);
    } catch {
      showStatus("复制失败");
    }
  }

  function clearStatusTimer() {
    if (statusTimer) window.clearTimeout(statusTimer);
    statusTimer = null;
  }

  function scheduleStatusDismiss(duration = 2200) {
    clearStatusTimer();
    if (!copyStatus || statusHovered) return;
    statusTimer = window.setTimeout(() => {
      copyStatus = "";
      statusTimer = null;
    }, duration);
  }

  function showStatus(message: string, duration = 2200) {
    copyStatus = message;
    statusHovered = false;
    scheduleStatusDismiss(duration);
  }

  function dismissStatus() {
    clearStatusTimer();
    statusHovered = false;
    copyStatus = "";
  }

  function pauseStatusDismiss() {
    statusHovered = true;
    clearStatusTimer();
  }

  function resumeStatusDismiss() {
    statusHovered = false;
    scheduleStatusDismiss(3000);
  }

  function getGeneratorOptions(): GeneratorOptions {
    return {
      length: generatorLength,
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
    };
  }

  function generatePassword() {
    generatedPassword = generatePasswordValue(getGeneratorOptions());
  }

  function clampGeneratorMinimums(changedField: "numbers" | "symbols" = "symbols") {
    minimumNumbers = Math.min(generatorLength, Math.max(0, minimumNumbers));
    minimumSymbols = Math.min(generatorLength, Math.max(0, minimumSymbols));
    const overflow = minimumNumbers + minimumSymbols - generatorLength;
    if (overflow <= 0) return;
    if (changedField === "numbers") minimumSymbols = Math.max(0, minimumSymbols - overflow);
    else minimumNumbers = Math.max(0, minimumNumbers - overflow);
  }

  function openGeneratorPanel(target: GeneratorTarget = null) {
    generatorTarget = target;
    generatorPanelOpen = true;
    generatePassword();
  }

  function closeGeneratorPanel(restoreDialog = false) {
    const target = generatorTarget;
    generatorPanelOpen = false;
    generatorTarget = null;
    if (!restoreDialog) return;
    if (target === "bulk-password") activeDialog = "bulk-password";
    if (target === "current-account") activeDialog = "password";
  }

  function setGeneratorLength(length: number, syncInput = true) {
    generatorLength = normalizeGeneratorLength(length);
    if (syncInput) generatorLengthInput = String(generatorLength);
    clampGeneratorMinimums();
    generatePassword();
  }

  function setGeneratorMinimumNumbers(value: number | string) {
    const nextValue = Number(value);
    minimumNumbers = Math.min(generatorLength, Math.max(0, Number.isFinite(nextValue) ? Math.round(nextValue) : 0));
    clampGeneratorMinimums("numbers");
    generatePassword();
  }

  function setGeneratorMinimumSymbols(value: number | string) {
    const nextValue = Number(value);
    minimumSymbols = Math.min(generatorLength, Math.max(0, Number.isFinite(nextValue) ? Math.round(nextValue) : 0));
    clampGeneratorMinimums("symbols");
    generatePassword();
  }

  function setAllowedSymbols(value: string) {
    allowedSymbols = value;
    generatePassword();
  }

  function setExcludedCharacters(value: string) {
    excludedCharacters = value;
    generatePassword();
  }

  function updateGeneratorLengthFromSlider(event: Event) {
    setGeneratorLength(Number((event.currentTarget as HTMLInputElement).value));
  }

  function handleGeneratorLengthInput(value: string) {
    const nextValue = value.replace(/[^\d]/g, "");
    if (!nextValue) {
      generatorLengthInput = String(generatorLength);
      return;
    }

    generatorLengthInput = nextValue;

    const parsedLength = Number(nextValue);
    if (parsedLength >= 3 && parsedLength <= 24) {
      setGeneratorLength(parsedLength, false);
    }
  }

  function commitGeneratorLengthInput() {
    setGeneratorLength(Number(generatorLengthInput));
  }

  function handleGeneratorLengthKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    commitGeneratorLengthInput();
    (event.currentTarget as HTMLInputElement).blur();
  }

  function setSortMode(mode: SortMode) {
    if (mode === sortMode) return;
    pushNavigationState();
    sortMode = mode;
  }

  function setDeviceTypeSortMode(mode: DeviceTypeSortMode) {
    if (mode === deviceTypeSortMode) return;
    deviceTypeSortMode = mode;
  }

  function getViewportWidth() {
    return typeof window === "undefined" ? 1440 : Math.max(1, window.innerWidth);
  }

  function getWorkspaceWidth() {
    const viewportWidth = getViewportWidth();
    return Math.max(1, viewportWidth * (1 - sidebarRatio - RESIZER_RATIO));
  }

  function formatPanePercent(ratio: number) {
    return `${Number((ratio * 100).toFixed(2))}%`;
  }

  function readPaneLayoutRatio(layout: Record<string, unknown>, pane: ResizePane) {
    const ratioKey = pane === "sidebar" ? "sidebarRatio" : pane === "list" ? "listRatio" : "generatorRatio";
    const ratio = readNumber(layout[ratioKey], Number.NaN);
    if (Number.isFinite(ratio)) return clampPaneRatio(ratio, pane);
    return clampPaneRatio(Number.NaN, pane);
  }

  function clampPaneLayout() {
    sidebarRatio = clampPaneRatio(sidebarRatio, "sidebar");
    listRatio = clampPaneRatio(listRatio, "list");
    generatorRatio = clampPaneRatio(generatorRatio, "generator");
  }

  function startPaneResize(pane: ResizePane, event: PointerEvent) {
    event.preventDefault();
    activePopover = null;
    openTypePicker = null;
    bulkUsernameSuggestionsOpen = false;
    resizingPane = pane;
    resizeStartX = event.clientX;
    resizeStartSidebarRatio = sidebarRatio;
    resizeStartListRatio = listRatio;
    resizeStartGeneratorRatio = generatorRatio;
    document.body.classList.add("is-resizing-pane");
    window.addEventListener("pointermove", handlePaneResize);
    window.addEventListener("pointerup", stopPaneResize);
    window.addEventListener("pointercancel", stopPaneResize);
  }

  function handlePaneResize(event: PointerEvent) {
    if (!resizingPane) return;
    const deltaX = event.clientX - resizeStartX;
    if (resizingPane === "sidebar") {
      sidebarRatio = clampPaneRatio(resizeStartSidebarRatio + deltaX / getViewportWidth(), "sidebar");
    } else if (resizingPane === "list") {
      listRatio = clampPaneRatio(resizeStartListRatio + deltaX / getWorkspaceWidth(), "list");
    } else {
      generatorRatio = clampPaneRatio(resizeStartGeneratorRatio - deltaX / getViewportWidth(), "generator");
    }
  }

  function stopPaneResize() {
    if (!resizingPane) return;
    resizingPane = null;
    document.body.classList.remove("is-resizing-pane");
    window.removeEventListener("pointermove", handlePaneResize);
    window.removeEventListener("pointerup", stopPaneResize);
    window.removeEventListener("pointercancel", stopPaneResize);
  }

  function maskPassword(password: string) {
    return "•".repeat(Math.min(Math.max(password.length, 8), 14));
  }

  function toggleHistoryPassword(id: number) {
    visibleHistoryIds = visibleHistoryIds.includes(id)
      ? visibleHistoryIds.filter((visibleId) => visibleId !== id)
      : [...visibleHistoryIds, id];
  }

  function useGeneratedPasswordForCurrentDevice() {
    if (!canUseGeneratorForCurrentAccount) return;
    if (!generatedPassword) generatePassword();
    if (!generatedPassword) return;
    passwordForm = { password: generatedPassword, reason: "" };
    closeGeneratorPanel();
    activeDialog = "password";
  }

  function useGeneratedPasswordForBulkUpdate() {
    if (!canUseGeneratorForBulkUpdate) return;
    if (!generatedPassword) generatePassword();
    if (!generatedPassword) return;
    const target = generatorTarget;
    closeGeneratorPanel();
    if (target === "bulk-password" || activeDialog === "bulk-password") {
      bulkPasswordForm = {
        ...bulkPasswordForm,
        password: generatedPassword,
        reason: bulkPasswordForm.reason,
      };
      activeDialog = "bulk-password";
    } else {
      openBulkPasswordDialog(true);
    }
  }

  function copyDeviceAccountInfo(account = selectedAccount) {
    return formatDeviceAccountInfo(account);
  }

  function copyDeviceInfo(item = selectedItem) {
    return formatDeviceInfo(item);
  }

  function copySelectedDeviceInfo() {
    activePopover = null;
    if (!hasSelectedDevice) {
      showStatus("请先选择设备");
      return;
    }
    copyText(copyDeviceInfo(), "设备信息");
  }

  function copySelectedAccountInfo() {
    activePopover = null;
    const targets = selectedAccountTargets;
    if (!hasSelectedDevice || targets.length === 0) {
      showStatus("请先选择账号");
      return;
    }
    const accountsWithPassword = targets.filter((account) => account.password);
    if (accountsWithPassword.length === 0) {
      showStatus(targets.length > 1 ? "选中的账号都没有密码" : "当前账号没有密码");
      return;
    }
    copyText(accountsWithPassword.map((account) => copyDeviceAccountInfo(account)).join("\n\n"), "账号密码");
  }

  function selectAccount(id: number) {
    if (id === selectedAccountId) return;
    selectedAccountId = id;
    passwordVisible = false;
    visibleHistoryIds = [];
  }

  function isAccountSelectedForBatch(id: number) {
    return selectedAccountIds.includes(id);
  }

  function toggleAccountBatchSelection(id: number) {
    selectedAccountIds = selectedAccountIds.includes(id)
      ? selectedAccountIds.filter((accountId) => accountId !== id)
      : [...selectedAccountIds, id];
  }

  function selectAllCurrentAccounts() {
    selectedAccountIds = selectedAccounts.map((account) => account.id);
  }

  function clearAccountBatchSelection() {
    selectedAccountIds = [];
  }

  function getTypeMeta(deviceType: string) {
    return deviceTypeOptions.find((type) => type.label === deviceType) ?? fallbackDeviceTypeMeta;
  }

  function iconClassForType(deviceType: string) {
    return resolveIconClassForType(deviceType, deviceTypeOptions);
  }

  function getDeviceTypeCount(deviceType: "全部设备" | DeviceType) {
    return deviceType === "全部设备" ? items.length : items.filter((item) => item.deviceType === deviceType).length;
  }

  function canDeleteDeviceType(deviceType: "全部设备" | DeviceType) {
    return deviceType !== "全部设备" && getDeviceTypeCount(deviceType) === 0;
  }

  function getPopoverPosition(trigger: HTMLElement): PopoverPosition {
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 236;
    const viewportPadding = 12;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
    const left = Math.min(Math.max(rect.right - menuWidth, viewportPadding), maxLeft);
    const top = Math.min(Math.max(rect.bottom + 8, viewportPadding), window.innerHeight - viewportPadding);
    return { top, left };
  }

  function getPointerPopoverPosition(event: MouseEvent): PopoverPosition {
    const menuWidth = 236;
    const menuHeight = 330;
    const viewportPadding = 12;
    const left = Math.min(Math.max(event.clientX, viewportPadding), window.innerWidth - menuWidth - viewportPadding);
    const top = Math.min(Math.max(event.clientY, viewportPadding), window.innerHeight - menuHeight - viewportPadding);
    return { top, left };
  }

  function openPopover(popover: ActivePopover, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (activePopover === popover) {
      activePopover = null;
      return;
    }

    popoverPosition = getPopoverPosition(event.currentTarget as HTMLElement);
    activePopover = popover;
  }

  function openTypeContextMenu(deviceType: "全部设备" | DeviceType, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    contextDeviceType = deviceType;
    activeDialog = null;
    popoverPosition = getPointerPopoverPosition(event);
    activePopover = "type-context";
  }

  function openDeviceContextMenu(item: VaultItem, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (item.id && selectedId !== item.id) selectDevice(item.id);
    contextDeviceType = item.deviceType;
    activeDialog = null;
    popoverPosition = getPointerPopoverPosition(event);
    activePopover = "device-context";
  }

  function isContextMenuControlTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, a, input, textarea, select, [role='button']"));
  }

  function openTypeBlankContextMenu(event: MouseEvent) {
    if (isContextMenuControlTarget(event.target)) return;
    event.preventDefault();
    contextDeviceType = selectedDeviceType;
    activeDialog = null;
    popoverPosition = getPointerPopoverPosition(event);
    activePopover = "type-blank-context";
  }

  function openDeviceListBlankContextMenu(event: MouseEvent) {
    if (isContextMenuControlTarget(event.target)) return;
    event.preventDefault();
    contextDeviceType = selectedDeviceType;
    activeDialog = null;
    popoverPosition = getPointerPopoverPosition(event);
    activePopover = "list-blank-context";
  }

  function openDetailBlankContextMenu(event: MouseEvent) {
    if (hasSelectedDevice || isContextMenuControlTarget(event.target)) return;
    event.preventDefault();
    contextDeviceType = selectedDeviceType;
    activeDialog = null;
    popoverPosition = getPointerPopoverPosition(event);
    activePopover = "detail-blank-context";
  }

  function openSelectedDeviceContextMenu(event: MouseEvent) {
    if (!selectedItem.id) return;
    if ((event.target as HTMLElement).closest("button, a, input, textarea, select, [role='button']")) return;
    openDeviceContextMenu(selectedItem, event);
  }

  function closePopoverWhenPointerLeavesMenu(event: Event) {
    if (!activePopover) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".action-popover")) return;
    activePopover = null;
  }

  function closeOverlays() {
    activePopover = null;
    activeDialog = null;
    pendingConfirmation = null;
    pendingConfigContent = "";
    openTypePicker = null;
    bulkUsernameSuggestionsOpen = false;
  }

  function handleGlobalPointerDown(event: PointerEvent) {
    closePopoverWhenPointerLeavesMenu(event);
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (openTypePicker && !target.closest(".type-combo")) openTypePicker = null;
    if (bulkUsernameSuggestionsOpen && !target.closest(".bulk-username-field")) bulkUsernameSuggestionsOpen = false;
  }

  function handleGlobalContextMenu(event: MouseEvent) {
    if (!activePopover) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".action-popover")) return;
    const hasContextMenuOwner = target instanceof HTMLElement && target.closest(".sidebar, .list-scroll, .detail-pane");
    if (!hasContextMenuOwner) activePopover = null;
  }

  function closeKeyboardSurface() {
    if (openTypePicker) {
      openTypePicker = null;
      return true;
    }
    if (bulkUsernameSuggestionsOpen) {
      bulkUsernameSuggestionsOpen = false;
      return true;
    }
    if (pendingConfirmation) {
      pendingConfirmation = null;
      pendingConfigContent = "";
      return true;
    }
    if (activeDialog) {
      activeDialog = null;
      return true;
    }
    if (generatorPanelOpen) {
      closeGeneratorPanel();
      return true;
    }
    if (activePopover) {
      activePopover = null;
      return true;
    }
    if (searchQuery.trim()) {
      clearSearch();
      return true;
    }
    return false;
  }

  function isEditableShortcutTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
  }

  function saveActiveDialog() {
    if (activeDialog === "type") return saveDeviceType();
    if (activeDialog === "password") return savePasswordUpdate();
    if (activeDialog === "bulk-password") return saveBulkPasswordUpdate();
    if (activeDialog === "account") return saveAccount();
    if (activeDialog === "device") return saveDevice();
    if (activeDialog === "export-config") return exportConfig();
  }

  function selectRelativeDevice(direction: 1 | -1) {
    if (filteredItems.length === 0) return;
    const currentIndex = filteredItems.findIndex((item) => item.id === selectedItem.id);
    const nextIndex =
      currentIndex === -1
        ? direction === 1 ? 0 : filteredItems.length - 1
        : (currentIndex + direction + filteredItems.length) % filteredItems.length;
    selectDevice(filteredItems[nextIndex].id);
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    const shortcutModifier = event.metaKey || event.ctrlKey;
    const editableTarget = isEditableShortcutTarget(event.target);

    if (event.key === "Escape") {
      if (closeKeyboardSurface()) event.preventDefault();
      else if (editableTarget) (event.target as HTMLElement).blur();
      return;
    }

    if (shortcutModifier && event.key === "Enter" && (activeDialog || pendingConfirmation)) {
      event.preventDefault();
      if (pendingConfirmation) confirmPendingAction();
      else saveActiveDialog();
      return;
    }

    if (!shortcutModifier && !editableTarget && !activeDialog && !activePopover && !generatorPanelOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectRelativeDevice(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        selectRelativeDevice(-1);
        return;
      }
    }

    if (!shortcutModifier) return;

    const key = event.key.toLowerCase();
    if (key === "f" || key === "k") {
      event.preventDefault();
      focusSearchInput();
      return;
    }
    if (editableTarget) return;

    if (event.key === "ArrowLeft" && backStack.length > 0) {
      event.preventDefault();
      goBack();
      return;
    }
    if (event.key === "ArrowRight" && forwardStack.length > 0) {
      event.preventDefault();
      goForward();
      return;
    }
    if (key === "n") {
      event.preventDefault();
      if (event.shiftKey && hasSelectedDevice) openAddAccountDialog();
      else openAddDeviceDialog();
      return;
    }
    if (key === "g") {
      event.preventDefault();
      openGeneratorPanel();
      return;
    }
    if (key === "b") {
      event.preventDefault();
      openBulkPasswordDialog();
      return;
    }
    if (key === "u" && hasSelectedDevice && selectedAccount.id) {
      event.preventDefault();
      openPasswordDialog();
      return;
    }
    if (key === "e" && hasSelectedDevice) {
      event.preventDefault();
      openEditDeviceDialog();
    }
  }

  function openAddTypeDialog() {
    activePopover = null;
    typeForm = { originalLabel: null, label: "", iconText: "", color: "blue" };
    activeDialog = "type";
  }

  function openEditTypeDialog(deviceType: "全部设备" | DeviceType = selectedDeviceType) {
    if (deviceType === "全部设备") {
      showStatus("请先选择一个具体设备类型");
      return;
    }
    activePopover = null;
    const typeMeta = getTypeMeta(deviceType);
    typeForm = {
      originalLabel: deviceType,
      label: typeMeta.label,
      iconText: typeMeta.iconText,
      color: typeMeta.color,
    };
    activeDialog = "type";
  }

  function requestDeleteDeviceType(deviceType: "全部设备" | DeviceType = selectedDeviceType) {
    if (deviceType === "全部设备") return;
    const deviceCount = getDeviceTypeCount(deviceType);
    if (deviceCount > 0) {
      showStatus(`该类型下还有 ${deviceCount} 个设备，请先移动或删除设备`);
      activePopover = null;
      return;
    }
    activePopover = null;
    activeDialog = null;
    pendingConfirmation = {
      action: "delete-device-type",
      deviceType,
      title: "删除设备类型",
      message: `确认删除“${deviceType}”？`,
      detail: "这个类型会从侧边栏移除，之后仍可重新新增。",
      confirmLabel: "删除类型",
    };
  }

  function deleteDeviceType(deviceType: "全部设备" | DeviceType = selectedDeviceType) {
    if (deviceType === "全部设备") return;
    const deviceCount = getDeviceTypeCount(deviceType);
    if (deviceCount > 0) {
      showStatus(`该类型下还有 ${deviceCount} 个设备，请先移动或删除设备`);
      activePopover = null;
      return;
    }

    pushNavigationState();
    if (defaultDeviceTypeMeta.some((type) => type.label === deviceType) && !hiddenDeviceTypes.includes(deviceType)) {
      hiddenDeviceTypes = [...hiddenDeviceTypes, deviceType];
    }
    customDeviceTypes = customDeviceTypes.filter((type) => type.label !== deviceType);
    selectedDeviceType = "全部设备";
    selectedId = items[0]?.id ?? 0;
    selectedAccountIds = [];
    activePopover = null;
    activeDialog = null;
    showStatus("设备类型已删除");
  }

  function saveDeviceType() {
    const label = typeForm.label.trim();
    const originalLabel = typeForm.originalLabel;
    if (!label) {
      showStatus("请输入设备类型名称");
      return;
    }
    if (deviceTypeRows.some((type) => type.label === label && type.label !== originalLabel)) {
      showStatus("设备类型已存在");
      return;
    }
    const affectedDeviceCount = originalLabel && originalLabel !== label ? getDeviceTypeCount(originalLabel) : 0;
    if (affectedDeviceCount > 0) {
      activePopover = null;
      pendingConfirmation = {
        action: "rename-device-type",
        title: "重命名设备类型",
        message: `确认将“${originalLabel}”改为“${label}”？`,
        detail: "该类型下的设备会一起改到新类型名，设备本身和账号密码不会删除。",
        confirmLabel: "确认重命名",
        summaryItems: [
          { label: "影响设备", value: `${affectedDeviceCount} 台` },
          { label: "新类型", value: label },
        ],
      };
      return;
    }

    executeSaveDeviceType();
  }

  function executeSaveDeviceType() {
    const label = typeForm.label.trim();
    const originalLabel = typeForm.originalLabel;
    if (!label) {
      showStatus("请输入设备类型名称");
      return;
    }
    if (deviceTypeRows.some((type) => type.label === label && type.label !== originalLabel)) {
      showStatus("设备类型已存在");
      return;
    }
    const nextMeta: DeviceTypeMeta = {
      label,
      iconText: typeForm.iconText.trim() || label.slice(0, 1),
      color: typeForm.color,
    };
    if (defaultDeviceTypeMeta.some((type) => type.label === label) && hiddenDeviceTypes.includes(label)) {
      hiddenDeviceTypes = hiddenDeviceTypes.filter((type) => type !== label);
    }

    if (originalLabel) {
      const renamedDefault = originalLabel !== label && defaultDeviceTypeMeta.some((type) => type.label === originalLabel);
      if (renamedDefault && !hiddenDeviceTypes.includes(originalLabel)) {
        hiddenDeviceTypes = [...hiddenDeviceTypes, originalLabel];
      }
      customDeviceTypes = [
        ...customDeviceTypes.filter((type) => type.label !== originalLabel && type.label !== label),
        nextMeta,
      ];
      items = items.map((item) =>
        item.deviceType === originalLabel
          ? {
              ...item,
              deviceType: label,
              tag: item.tag === originalLabel ? label : item.tag,
              iconText: nextMeta.iconText,
              iconClass: iconClassForColor(nextMeta.color),
              accounts: getAccounts(item),
            }
          : item
      );
    } else if (!deviceTypeRows.some((type) => type.label === label)) {
      customDeviceTypes = [...customDeviceTypes, nextMeta];
    }

    pushNavigationState();
    selectedDeviceType = label;
    activeDialog = null;
  }

  function openAddDeviceDialog(deviceType = selectedDeviceType) {
    activePopover = null;
    openTypePicker = null;
    deviceTypeSearch = "";
    if (deviceTypeOptions.length === 0) {
      openAddTypeDialog();
      showStatus("请先新增设备类型");
      return;
    }
    deviceForm = createEmptyDeviceForm();
    if (deviceType !== "全部设备") deviceForm.deviceType = deviceType;
    else deviceForm.deviceType = deviceTypeOptions[0]?.label ?? "";
    activeDialog = "device";
  }

  function openEditDeviceDialog() {
    activePopover = null;
    if (!hasSelectedDevice) {
      showStatus("请先选择设备");
      return;
    }
    openTypePicker = null;
    deviceTypeSearch = "";
    deviceForm = {
      id: selectedItem.id,
      deviceName: selectedItem.deviceName,
      deviceType: selectedItem.deviceType,
      assetCode: selectedItem.assetCode,
      location: selectedItem.location,
      ipAddress: selectedItem.ipAddress,
      notes: selectedItem.notes,
    };
    activeDialog = "device";
  }

  function hasDuplicateDeviceName(name: string, deviceType: string, currentId: number | null) {
    const normalizedName = name.trim();
    const normalizedType = deviceType.trim();
    return items.some((item) =>
      item.id !== currentId &&
      item.deviceName.trim() === normalizedName &&
      item.deviceType.trim() === normalizedType
    );
  }

  function saveDevice() {
    const name = deviceForm.deviceName.trim();
    if (!name) {
      showStatus("请输入设备名称");
      return;
    }
    if (!deviceForm.deviceType.trim()) {
      showStatus("请先新增设备类型");
      return;
    }
    if (hasDuplicateDeviceName(name, deviceForm.deviceType, deviceForm.id)) {
      showStatus("同一设备类型下已存在同名设备");
      return;
    }
    const now = new Date();
    const typeMeta = getTypeMeta(deviceForm.deviceType);
    const updatedAt = formatDateTime(now);

    if (deviceForm.id) {
      items = items.map((item) => {
        if (item.id !== deviceForm.id) return item;
        return syncItemWithAccounts(
          {
            ...item,
            deviceName: name,
            deviceType: deviceForm.deviceType,
            assetCode: deviceForm.assetCode.trim(),
            location: deviceForm.location.trim(),
            ipAddress: deviceForm.ipAddress.trim(),
            iconText: typeMeta.iconText,
            iconClass: iconClassForType(deviceForm.deviceType),
            notes: deviceForm.notes.trim(),
          },
          getAccounts(item)
        );
      });
      pushNavigationState();
      selectedId = deviceForm.id;
      selectedDeviceType = deviceForm.deviceType;
      selectedAccountIds = [];
      activeDialog = null;
      return;
    }

    const nextItem: VaultItem = {
      id: Math.max(0, ...items.map((item) => item.id)) + 1,
      title: name,
      deviceName: name,
      deviceType: deviceForm.deviceType,
      assetCode: deviceForm.assetCode.trim(),
      location: deviceForm.location.trim(),
      username: "",
      password: "",
      ipAddress: deviceForm.ipAddress.trim(),
      tag: deviceForm.deviceType,
      iconText: typeMeta.iconText,
      iconClass: iconClassForType(deviceForm.deviceType),
      updatedAt,
      notes: deviceForm.notes.trim(),
      history: [],
      accounts: [],
    };

    items = [nextItem, ...items];
    pushNavigationState();
    selectedId = nextItem.id;
    selectedDeviceType = nextItem.deviceType;
    selectedAccountId = 0;
    selectedAccountIds = [];
    activeDialog = null;
  }

  function openAddAccountDialog() {
    activePopover = null;
    if (!hasSelectedDevice) {
      showStatus("请先选择设备");
      return;
    }
    accountForm = createEmptyAccountForm();
    activeDialog = "account";
  }

  function openEditAccountDialog() {
    activePopover = null;
    if (selectedAccountIds.length > 1) {
      showStatus("编辑账号前请只选择一个账号");
      return;
    }
    if (!hasSelectedDevice || !selectedAccount.id) {
      showStatus("请先选择账号");
      return;
    }
    accountForm = {
      id: selectedAccount.id,
      username: selectedAccount.username,
      password: selectedAccount.password,
      tag: selectedAccount.tag,
      notes: selectedAccount.notes,
    };
    activeDialog = "account";
  }

  function saveAccount() {
    if (!hasSelectedDevice) {
      showStatus("请先选择设备");
      return;
    }
    const username = accountForm.username.trim();
    if (!username) {
      showStatus("请输入用户名");
      return;
    }
    if (hasDuplicateAccountUsername(username, accountForm.id)) {
      showStatus("当前设备下已存在同名账号");
      return;
    }
    const currentAccount = accountForm.id ? selectedAccounts.find((account) => account.id === accountForm.id) : null;
    if (currentAccount && currentAccount.password !== accountForm.password) {
      activePopover = null;
      pendingConfirmation = {
        action: "save-account-password",
        title: "保存账号密码变更",
        message: `确认直接修改“${currentAccount.username || currentAccount.title || "当前账号"}”的密码？`,
        detail: "这会覆盖账号当前密码，不会生成密码历史。需要保留旧密码记录时，请使用“更新密码”。",
        confirmLabel: "仍然保存",
        summaryItems: [
          { label: "所属设备", value: selectedItem.deviceName },
          { label: "账号", value: currentAccount.username || currentAccount.title || "未填写用户名" },
        ],
      };
      return;
    }

    executeSaveAccount();
  }

  function executeSaveAccount() {
    if (!hasSelectedDevice) {
      showStatus("请先选择设备");
      return;
    }
    const username = accountForm.username.trim();
    if (!username) {
      showStatus("请输入用户名");
      return;
    }
    if (hasDuplicateAccountUsername(username, accountForm.id)) {
      showStatus("当前设备下已存在同名账号");
      return;
    }
    const now = formatDateTime(new Date());
    const nextId = accountForm.id ?? Math.max(0, ...selectedAccounts.map((account) => account.id)) + 1;
    const nextAccount = createAccountFromFormData(accountForm, nextId, now);
    const nextAccounts = accountForm.id
      ? selectedAccounts.map((account) =>
          account.id === accountForm.id ? { ...nextAccount, history: account.history, updatedAt: now } : account
        )
      : [...selectedAccounts.filter((account) => !isBlankPlaceholderAccount(account)), nextAccount];

    items = items.map((item) =>
      item.id === selectedItem.id ? syncItemWithAccounts(item, nextAccounts) : item
    );
    pushNavigationState();
    selectedAccountId = nextId;
    selectedAccountIds = [];
    activeDialog = null;
  }

  function hasDuplicateAccountUsername(username: string, currentId: number | null) {
    const normalizedUsername = username.trim();
    return selectedAccounts.some((account) =>
      account.id !== currentId &&
      account.username.trim() === normalizedUsername
    );
  }

  function deleteSelectedAccount() {
    const targetIds = selectedAccountTargets.map((account) => account.id);
    if (!selectedItem.id || targetIds.length === 0) return;

    const nextAccounts = selectedAccounts.filter((account) => !targetIds.includes(account.id));
    items = items.map((item) =>
      item.id === selectedItem.id
        ? syncItemWithAccounts({ ...item, updatedAt: formatDateTime(new Date()) }, nextAccounts)
        : item
    );
    pushNavigationState();
    selectedAccountId = nextAccounts.some((account) => account.id === selectedAccountId)
      ? selectedAccountId
      : nextAccounts[0]?.id ?? 0;
    selectedAccountIds = selectedAccountIds.filter((id) => nextAccounts.some((account) => account.id === id));
    passwordVisible = false;
    visibleHistoryIds = [];
    activePopover = null;
    showStatus(targetIds.length > 1 ? `${targetIds.length} 个账号已删除` : "账号已删除");
  }

  function requestDeleteSelectedAccount() {
    const targets = selectedAccountTargets;
    if (!hasSelectedDevice || targets.length === 0) {
      showStatus("请先选择账号");
      activePopover = null;
      return;
    }
    activePopover = null;
    activeDialog = null;
    const targetLabel = targets.length > 1
      ? `${targets.length} 个账号`
      : `“${targets[0].username || targets[0].title || "当前账号"}”`;
    pendingConfirmation = {
      action: "delete-account",
      title: "删除账号",
      message: `确认删除${targetLabel}？`,
      detail: targets.length >= selectedAccounts.length
        ? "选中账号的当前密码和历史密码记录都会移除，设备将显示为暂无账号。"
        : targets.length > 1 ? "选中账号的当前密码和历史密码记录都会从当前设备中移除。" : "该账号的当前密码和历史密码记录都会从当前设备中移除。",
      confirmLabel: "删除账号",
    };
  }

  function openPasswordDialog() {
    activePopover = null;
    if (!hasSelectedDevice || selectedAccountTargets.length === 0) {
      showStatus("请先选择账号");
      return;
    }
    passwordForm = { password: "", reason: "" };
    activeDialog = "password";
  }

  function openBulkPasswordDialog(useGenerated = false) {
    activePopover = null;
    openTypePicker = null;
    bulkTypeSearch = "";
    bulkUsernameSearch = "";
    bulkUsernameSuggestionsOpen = false;
    resetBulkPasswordSelection();
    bulkPasswordForm = {
      deviceType: selectedDeviceType,
      username: "",
      password: useGenerated ? generatedPassword : "",
      reason: "",
    };
    activeDialog = "bulk-password";
  }

  function setBulkPasswordDeviceType(deviceType: "全部设备" | DeviceType) {
    bulkPasswordForm = { ...bulkPasswordForm, deviceType, username: "" };
    bulkUsernameSearch = "";
    bulkUsernameSuggestionsOpen = false;
    resetBulkPasswordSelection();
    bulkTypeSearch = "";
    openTypePicker = null;
  }

  function updateBulkUsernameSearch(username: string) {
    bulkUsernameSearch = username;
    bulkUsernameSuggestionsOpen = Boolean(username.trim());
    if (!bulkPasswordForm.username) return;
    bulkPasswordForm = { ...bulkPasswordForm, username: "" };
    resetBulkPasswordSelection();
  }

  function selectBulkUsername(suggestion: BulkUsernameSuggestion) {
    const username = suggestion.username;
    bulkUsernameSearch = username;
    bulkUsernameSuggestionsOpen = false;
    bulkPasswordForm = { ...bulkPasswordForm, username };
    resetBulkPasswordSelection();
  }

  function setDeviceFormType(deviceType: DeviceType) {
    deviceForm = { ...deviceForm, deviceType };
    deviceTypeSearch = "";
    openTypePicker = null;
  }

  function toggleTypePicker(scope: TypePickerScope) {
    openTypePicker = openTypePicker === scope ? null : scope;
  }

  function isBulkPasswordMatchSelected(match: BulkPasswordMatch) {
    return !bulkPasswordDeselectedKeys.includes(getBulkPasswordMatchKey(match));
  }

  function toggleBulkPasswordMatch(match: BulkPasswordMatch) {
    const key = getBulkPasswordMatchKey(match);
    bulkPasswordDeselectedKeys = bulkPasswordDeselectedKeys.includes(key)
      ? bulkPasswordDeselectedKeys.filter((deselectedKey) => deselectedKey !== key)
      : [...bulkPasswordDeselectedKeys, key];
  }

  function selectAllBulkPasswordMatches() {
    const candidateKeySet = new Set(bulkPasswordMatches.map(getBulkPasswordMatchKey));
    bulkPasswordDeselectedKeys = bulkPasswordDeselectedKeys.filter((key) => !candidateKeySet.has(key));
  }

  function clearBulkPasswordMatches() {
    bulkPasswordDeselectedKeys = Array.from(new Set([...bulkPasswordDeselectedKeys, ...bulkPasswordMatches.map(getBulkPasswordMatchKey)]));
  }

  function resetBulkPasswordSelection() {
    bulkPasswordDeselectedKeys = [];
  }

  function savePasswordUpdate() {
    const targetIds = selectedAccountTargets.map((account) => account.id);
    if (!hasSelectedDevice || targetIds.length === 0) {
      showStatus("请先选择账号");
      activeDialog = null;
      return;
    }
    if (!passwordForm.password.trim()) {
      showStatus("请输入新密码");
      return;
    }
    pendingConfirmation = {
      action: "update-password",
      title: targetIds.length > 1 ? "批量更新所选账号密码" : "更新账号密码",
      message: targetIds.length > 1
        ? `确认更新 ${targetIds.length} 个账号的密码？`
        : `确认更新“${selectedAccount.username || selectedAccount.title || "当前账号"}”的密码？`,
      detail: "确认后会替换当前密码，并把旧密码写入密码历史。",
      confirmLabel: "确认更新",
      summaryItems: [
        { label: "所属设备", value: selectedItem.deviceName },
        { label: "影响账号", value: `${targetIds.length} 个` },
      ],
    };
  }

  function executePasswordUpdate() {
    const targetIds = selectedAccountTargets.map((account) => account.id);
    if (!hasSelectedDevice || targetIds.length === 0) {
      showStatus("请先选择账号");
      activeDialog = null;
      return;
    }
    if (!passwordForm.password.trim()) {
      showStatus("请输入新密码");
      return;
    }
    const changedAt = formatDateTime(new Date());
    const reason = passwordForm.reason.trim();
    const nextAccounts = selectedAccounts.map((account) =>
      targetIds.includes(account.id)
        ? updateAccountPassword(account, passwordForm.password, changedAt, reason)
        : account
    );
    items = items.map((item) =>
      item.id === selectedItem.id ? syncItemWithAccounts(item, nextAccounts) : item
    );
    pushNavigationState();
    activeDialog = null;
    passwordVisible = true;
    visibleHistoryIds = [];
    showStatus(targetIds.length > 1 ? `${targetIds.length} 个账号密码已更新` : `${selectedAccount.username || selectedAccount.title || "当前账号"}密码已更新`);
  }

  function saveBulkPasswordUpdate() {
    const password = bulkPasswordForm.password;
    if (!password.trim()) {
      showStatus("请输入新密码");
      return;
    }
    const matches = bulkPasswordSelectedMatches;
    if (bulkPasswordMatches.length === 0) {
      showStatus("没有匹配账号");
      return;
    }
    if (matches.length === 0) {
      showStatus("请选择需要改密的账号");
      return;
    }
    pendingConfirmation = {
      action: "bulk-update-password",
      title: "批量更新密码",
      message: `确认更新 ${matches.length} 个账号的密码？`,
      detail: "确认后会批量替换当前密码，并为每个账号写入旧密码历史。",
      confirmLabel: "确认批量更新",
      summaryItems: [
        { label: "设备范围", value: bulkPasswordForm.deviceType },
        { label: "匹配用户名", value: bulkPasswordForm.username },
        { label: "影响账号", value: `${matches.length} 个` },
      ],
    };
  }

  function executeBulkPasswordUpdate() {
    const password = bulkPasswordForm.password;
    if (!password.trim()) {
      showStatus("请输入新密码");
      return;
    }
    const matches = bulkPasswordSelectedMatches;
    if (bulkPasswordMatches.length === 0) {
      showStatus("没有匹配账号");
      return;
    }
    if (matches.length === 0) {
      showStatus("请选择需要改密的账号");
      return;
    }
    const reason = bulkPasswordForm.reason.trim();
    const changedAt = formatDateTime(new Date());
    const targetAccountIdsByItem = new Map<number, Set<number>>();
    matches.forEach((match) => {
      const accountIds = targetAccountIdsByItem.get(match.itemId) ?? new Set<number>();
      accountIds.add(match.accountId);
      targetAccountIdsByItem.set(match.itemId, accountIds);
    });

    items = items.map((item) => {
      const accountIds = targetAccountIdsByItem.get(item.id);
      if (!accountIds) return item;
      const nextAccounts = getAccounts(item).map((account) =>
        accountIds.has(account.id) ? updateAccountPassword(account, password, changedAt, reason) : account
      );
      return syncItemWithAccounts(item, nextAccounts);
    });
    pushNavigationState();
    activeDialog = null;
    passwordVisible = false;
    visibleHistoryIds = [];
    showStatus(`已更新 ${matches.length} 个账号`);
  }

  function deleteSelectedDevice() {
    if (!selectedItem.id) return;
    const remainingItems = items.filter((item) => item.id !== selectedItem.id);
    const nextDeviceType =
      selectedDeviceType === "全部设备" || remainingItems.some((item) => item.deviceType === selectedDeviceType)
        ? selectedDeviceType
        : "全部设备";
    pushNavigationState();
    items = remainingItems;
    selectedDeviceType = nextDeviceType;
    selectedId = 0;
    selectedAccountId = 0;
    selectedAccountIds = [];
    activePopover = null;
    showStatus("设备已删除");
  }

  function requestDeleteSelectedDevice() {
    if (!selectedItem.id) return;
    activePopover = null;
    activeDialog = null;
    pendingConfirmation = {
      action: "delete-device",
      title: "删除设备",
      message: `确认删除“${selectedItem.deviceName}”？`,
      detail: `将删除这台设备下的 ${selectedAccounts.length} 个账号、当前密码和历史密码记录。`,
      confirmLabel: "删除设备",
    };
  }

  function confirmPendingAction() {
    const confirmation = pendingConfirmation;
    if (!confirmation) return;
    const configContent = pendingConfigContent;
    const configFormat = pendingConfigFormat;
    pendingConfirmation = null;
    pendingConfigContent = "";
    if (confirmation.action === "delete-device-type") {
      deleteDeviceType(confirmation.deviceType ?? selectedDeviceType);
    } else if (confirmation.action === "delete-account") {
      deleteSelectedAccount();
    } else if (confirmation.action === "delete-device") {
      deleteSelectedDevice();
    } else if (confirmation.action === "import-config" && configContent) {
      applyImportedConfig(configContent, configFormat);
    } else if (confirmation.action === "update-password") {
      executePasswordUpdate();
    } else if (confirmation.action === "bulk-update-password") {
      executeBulkPasswordUpdate();
    } else if (confirmation.action === "save-account-password") {
      executeSaveAccount();
    } else if (confirmation.action === "rename-device-type") {
      executeSaveDeviceType();
    }
  }

  function openExportConfigDialog() {
    activePopover = null;
    activeDialog = "export-config";
  }

  function formatFileError(action: "导入" | "导出", error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (!message) return `配置${action}失败`;
    if (/denied|forbidden|scope|permission|not allowed/i.test(message)) {
      return `配置${action}失败：没有该文件位置的读写权限`;
    }
    return `配置${action}失败：${message}`;
  }

  async function exportConfig(format: ConfigFormat = exportConfigFormat) {
    const payload = createConfigPayload(items, customDeviceTypes, hiddenDeviceTypes, format);
    const filename = createConfigFilename(format);
    const formatLabel = format.toUpperCase();
    activePopover = null;
    activeDialog = null;

    if (isTauri()) {
      try {
        const path = await saveFileDialog({
          title: `导出 ${formatLabel} 配置`,
          defaultPath: filename,
          filters: [{ name: formatLabel, extensions: [format] }],
        });
        if (!path) {
          showStatus("已取消导出");
          return;
        }
        await writeTextFile(path, payload);
        showStatus(`${formatLabel} 配置已导出`);
      } catch (error) {
        showStatus(formatFileError("导出", error), 5000);
      }
      return;
    }

    const blob = new Blob([payload], { type: getConfigMimeType(format) });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    showStatus(`${formatLabel} 配置已导出`);
  }

  async function chooseConfigFile() {
    activePopover = null;
    if (isTauri()) {
      try {
        const path = await openFileDialog({
          title: "选择要导入的配置文件",
          multiple: false,
          filters: [{ name: "配置文件", extensions: ["json", "csv", "ini"] }],
        });
        if (!path || Array.isArray(path)) {
          showStatus("已取消导入");
          return;
        }
        let content = "";
        try {
          content = await readTextFile(path);
        } catch (error) {
          showStatus(formatFileError("导入", error), 5000);
          return;
        }
        tryRequestApplyConfig(content, inferConfigFormat(path));
      } catch (error) {
        showStatus(formatFileError("导入", error), 5000);
      }
      return;
    }

    document.getElementById("import-file")?.click();
  }

  function tryRequestApplyConfig(content: string, format: ConfigFormat) {
    try {
      requestApplyConfig(content, format);
    } catch {
      pendingConfigContent = "";
      pendingConfirmation = null;
      showStatus("配置文件格式不正确");
    }
  }

  function requestApplyConfig(content: string, preferredFormat: ConfigFormat) {
    const { config, format } = parseConfigContentWithFallback(content, preferredFormat);
    const summary = getConfigSummary(config);
    const summaryItems = formatConfigSummary(summary);
    const formatMismatchDetail = preferredFormat === format
      ? ""
      : `文件扩展名像是 ${preferredFormat.toUpperCase()}，已按内容识别为 ${format.toUpperCase()} 配置。`;
    activePopover = null;
    activeDialog = null;
    pendingConfigContent = content;
    pendingConfigFormat = format;
    pendingConfirmation = {
      action: "import-config",
      title: "覆盖导入配置",
      message: `导入这个 ${format.toUpperCase()} 配置并覆盖当前数据？`,
      detail: `${formatMismatchDetail}${formatMismatchDetail ? " " : ""}当前设备、账号和密码历史会被导入文件替换。需要保留现有数据时，请先导出当前配置。`,
      confirmLabel: "覆盖导入",
      summaryItems,
    };
  }

  function ensureDeviceTypeMetaForItems(targetItems: VaultItem[]) {
    const knownLabels = new Set([
      ...defaultDeviceTypeMeta.map((type) => type.label),
      ...customDeviceTypes.map((type) => type.label),
    ]);
    const missingTypes = targetItems.reduce<DeviceTypeMeta[]>((types, item) => {
      const label = item.deviceType.trim();
      if (!label || label === "全部设备" || knownLabels.has(label)) return types;
      knownLabels.add(label);
      types.push({
        label,
        iconText: item.iconText.trim() || label.slice(0, 1),
        color: "blue",
      });
      return types;
    }, []);
    if (missingTypes.length > 0) customDeviceTypes = [...customDeviceTypes, ...missingTypes];
  }

  function applyImportedConfig(content: string, format: ConfigFormat) {
    const config = parseConfigContent(content, format);
    items = config.items;
    customDeviceTypes = config.customDeviceTypes;
    ensureDeviceTypeMetaForItems(items);
    hiddenDeviceTypes = normalizeHiddenDeviceTypes(config.hiddenDeviceTypes, items);
    selectedId = items[0]?.id ?? 0;
    selectedAccountId = 0;
    selectedAccountIds = [];
    selectedDeviceType = "全部设备";
    searchQuery = "";
    sortMode = "updatedDesc";
    backStack = [];
    forwardStack = [];
    visibleHistoryIds = [];
    showStatus(`${format.toUpperCase()} 配置已导入`);
  }

  async function selectConfigFileFromBrowser(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      tryRequestApplyConfig(content, inferConfigFormat(file.name));
    } catch {
      showStatus("配置读取失败");
    } finally {
      input.value = "";
    }
  }
</script>

<main class="app-shell" style={layoutStyle}>
  <input id="import-file" class="hidden-file-input" type="file" accept=".json,.csv,.ini,application/json,text/csv,text/plain" on:change={selectConfigFileFromBrowser} />
  <SidebarPane
    {deviceTypeRows}
    {selectedDeviceType}
    {selectedTypeDeviceCount}
    canDeleteSelectedDeviceType={canDeleteDeviceType(selectedDeviceType)}
    {openTypeBlankContextMenu}
    {openAddTypeDialog}
    {openEditTypeDialog}
    requestDeleteSelectedType={() => requestDeleteDeviceType(selectedDeviceType)}
    openTypeSortPopover={(event) => openPopover("type-sort", event)}
    {selectDeviceType}
    {openTypeContextMenu}
  />

  <button
    class:active={resizingPane === "sidebar"}
    class="pane-resizer"
    type="button"
    aria-label="调整设备类型宽度"
    on:pointerdown={(event) => startPaneResize("sidebar", event)}
  ></button>

  <section class="workspace">
    <Topbar
      backDisabled={backStack.length === 0}
      forwardDisabled={forwardStack.length === 0}
      bind:searchInput
      {searchQuery}
      {searchPlaceholder}
      {goBack}
      {goForward}
      {updateSearchValue}
      openAddDeviceDialog={() => openAddDeviceDialog()}
      openBulkPasswordDialog={() => openBulkPasswordDialog()}
      openGeneratorPanel={() => openGeneratorPanel()}
    />

    <div class="content-grid">
      <DeviceListPane
        {filteredItems}
        selectedId={selectedItem.id}
        {selectedDeviceType}
        {searchQuery}
        {hasDevices}
        {listContextLabel}
        {listContextMeta}
        openDeviceSortPopover={(event) => openPopover("device-sort", event)}
        {openDeviceListBlankContextMenu}
        {selectDevice}
        {openDeviceContextMenu}
      />

      <button
        class:active={resizingPane === "list"}
        class="pane-resizer"
        type="button"
        aria-label="调整设备列表宽度"
        on:pointerdown={(event) => startPaneResize("list", event)}
      ></button>

      <DeviceDetailPane
        bind:passwordVisible
        bind:historyOpen
        {hasSelectedDevice}
        {hasDevices}
        {searchQuery}
        {selectedItem}
        {selectedAccounts}
        {selectedAccount}
        {selectedAccountIds}
        {selectedAccountTargetCount}
        {canDeleteSelectedAccountTargets}
        {sortedHistory}
        {visibleHistoryIds}
        {passwordStrength}
        {openDetailBlankContextMenu}
        {openAddAccountDialog}
        {openPasswordDialog}
        {copySelectedAccountInfo}
        {openEditAccountDialog}
        {requestDeleteSelectedAccount}
        openMorePopover={(event) => openPopover("more", event)}
        {openSelectedDeviceContextMenu}
        {copyText}
        {selectAccount}
        {toggleAccountBatchSelection}
        {selectAllCurrentAccounts}
        {clearAccountBatchSelection}
        {maskPassword}
        {toggleHistoryPassword}
        {clearSearch}
        openAddDeviceDialog={() => openAddDeviceDialog()}
      />
    </div>
  </section>

  <ActionPopover
    {activePopover}
    {popoverPosition}
    {deviceTypeSortMode}
    {sortMode}
    {contextDeviceType}
    {selectedDeviceType}
    {selectedItem}
    {selectedAccountTargetCount}
    {searchQuery}
    {listContextLabel}
    deviceTypeOptionsLength={deviceTypeOptions.length}
    {setDeviceTypeSortMode}
    {setSortMode}
    {selectDeviceType}
    {openEditTypeDialog}
    {requestDeleteDeviceType}
    {canDeleteDeviceType}
    {getDeviceTypeCount}
    {openAddTypeDialog}
    {clearSearch}
    {openAddDeviceDialog}
    {openEditDeviceDialog}
    {copySelectedDeviceInfo}
    {requestDeleteSelectedDevice}
    {openEditAccountDialog}
    {openPasswordDialog}
    {chooseConfigFile}
    {openExportConfigDialog}
    setActivePopover={(popover) => (activePopover = popover)}
    toggleHistorySort={() => { historySortDesc = !historySortDesc; activePopover = null; }}
  />

  <AppDialog
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
    {bulkUsernameSuggestionsOpen}
    {activeDialog}
    {selectedItem}
    {selectedAccount}
    {selectedAccountTargets}
    {selectedBulkTypeMeta}
    {selectedDeviceFormTypeMeta}
    {filteredBulkTypeRows}
    {filteredDeviceTypeOptions}
    deviceTypeOptionsLength={deviceTypeOptions.length}
    {bulkUsernameSuggestions}
    {bulkPasswordMatches}
    {bulkPasswordSelectedMatches}
    {closeOverlays}
    {saveDeviceType}
    {openGeneratorPanel}
    setActiveDialog={(dialog) => (activeDialog = dialog)}
    {toggleTypePicker}
    {setBulkPasswordDeviceType}
    {updateBulkUsernameSearch}
    {selectBulkUsername}
    {selectAllBulkPasswordMatches}
    {clearBulkPasswordMatches}
    {isBulkPasswordMatchSelected}
    {toggleBulkPasswordMatch}
    {saveBulkPasswordUpdate}
    {savePasswordUpdate}
    {saveAccount}
    {setDeviceFormType}
    {saveDevice}
    {exportConfig}
  />

  <ConfirmationDialog
    {pendingConfirmation}
    {closeOverlays}
    {confirmPendingAction}
  />

  {#if generatorPanelOpen}
    <PasswordGeneratorDrawer
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
      {canUseGeneratorForCurrentAccount}
      {canUseGeneratorForBulkUpdate}
      {selectedItem}
      {selectedAccount}
      itemCount={items.length}
      {closeGeneratorPanel}
      startGeneratorResize={(event) => startPaneResize("generator", event)}
      {generatePassword}
      copyGeneratedPassword={() => copyText(generatedPassword, "生成密码")}
      {setGeneratorLength}
      {setGeneratorMinimumNumbers}
      {setGeneratorMinimumSymbols}
      {setAllowedSymbols}
      {setExcludedCharacters}
      {updateGeneratorLengthFromSlider}
      {handleGeneratorLengthInput}
      {commitGeneratorLengthInput}
      {handleGeneratorLengthKeydown}
      {useGeneratedPasswordForCurrentDevice}
      {useGeneratedPasswordForBulkUpdate}
    />
  {/if}

  <StatusToast {copyStatus} {pauseStatusDismiss} {resumeStatusDismiss} {dismissStatus} />
</main>
