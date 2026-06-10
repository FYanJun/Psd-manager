<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
  import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
  import { onMount } from "svelte";
  import {
    ChevronDown,
    ChevronRight,
    Clock3,
    Copy,
    Eye,
    EyeOff,
    Folder,
    Grid2X2,
    History,
    KeyRound,
    ListFilter,
    MoreVertical,
    Pencil,
    Plus,
    RefreshCcw,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    UserRound,
    X,
  } from "@lucide/svelte";

  type DeviceType = string;
  type SortMode = "updatedDesc" | "nameAsc" | "typeAsc";
  type ActiveDialog = "device" | "type" | "password" | "account" | "bulk-password" | null;
  type ActivePopover =
    | "type-sort"
    | "device-sort"
    | "type-context"
    | "device-context"
    | "type-blank-context"
    | "list-blank-context"
    | "detail-blank-context"
    | "more"
    | null;
  type ConfirmationAction = "delete-device" | "delete-account" | "delete-device-type";
  type PopoverPosition = {
    top: number;
    left: number;
  };
  type PendingConfirmation = {
    action: ConfirmationAction;
    title: string;
    message: string;
    detail: string;
    confirmLabel: string;
    deviceType?: "全部设备" | DeviceType;
  };
  type DeviceTypeMeta = {
    label: string;
    iconText: string;
    color: string;
  };
  type GeneratorPreset = "balanced" | "readable" | "strong" | "pin";
  type ViewState = {
    selectedDeviceType: "全部设备" | DeviceType;
    selectedId: number;
    searchQuery: string;
    sortMode: SortMode;
  };

  type PasswordHistory = {
    id: number;
    password: string;
    newPassword: string;
    changedAt: string;
    reason: string;
  };

  type DeviceAccount = {
    id: number;
    title: string;
    username: string;
    password: string;
    website: string;
    tag: string;
    notes: string;
    updatedAt: string;
    history: PasswordHistory[];
  };

  type VaultItem = {
    id: number;
    title: string;
    deviceName: string;
    deviceType: DeviceType;
    username: string;
    password: string;
    website: string;
    ipAddress: string;
    tag: string;
    iconText: string;
    iconClass: string;
    updatedAt: string;
    notes: string;
    history: PasswordHistory[];
    accounts?: DeviceAccount[];
  };

  type DeviceForm = {
    id: number | null;
    deviceName: string;
    deviceType: string;
    title: string;
    username: string;
    password: string;
    website: string;
    ipAddress: string;
    tag: string;
    notes: string;
  };

  type TypeForm = {
    originalLabel: string | null;
    label: string;
    iconText: string;
    color: string;
  };

  type AccountForm = {
    id: number | null;
    title: string;
    username: string;
    password: string;
    website: string;
    tag: string;
    notes: string;
  };
  type BulkPasswordForm = {
    deviceType: "全部设备" | DeviceType;
    username: string;
    password: string;
    reason: string;
  };
  type BulkPasswordMatch = {
    itemId: number;
    accountId: number;
    deviceName: string;
    deviceType: string;
    ipAddress: string;
    username: string;
    tag: string;
  };
  type GeneratorTarget = "current-account" | "bulk-password" | null;
  type TypePickerScope = "device" | "bulk";
  type ResizePane = "sidebar" | "list";

  const STORAGE_KEY = "device-password-manager-state-v1";
  const SIDEBAR_DEFAULT_WIDTH = 252;
  const SIDEBAR_MIN_WIDTH = 208;
  const SIDEBAR_MAX_WIDTH = 360;
  const LIST_DEFAULT_WIDTH = 368;
  const LIST_MIN_WIDTH = 300;
  const LIST_MAX_WIDTH = 540;
  const DETAIL_MIN_WIDTH = 420;
  const RESIZER_WIDTH = 8;

  const initialItems: VaultItem[] = [];

  const defaultDeviceTypeMeta: Array<DeviceTypeMeta & { label: "全部设备" | DeviceType }> = [
    { label: "全部设备", iconText: "全", color: "blue" },
  ];
  const fallbackDeviceTypeMeta: DeviceTypeMeta = { label: "", iconText: "设", color: "blue" };
  const typeColorOptions = [
    { value: "blue", label: "蓝色" },
    { value: "cyan", label: "青色" },
    { value: "rose", label: "红色" },
    { value: "indigo", label: "靛蓝" },
    { value: "sand", label: "沙色" },
    { value: "gold", label: "金色" },
    { value: "dark", label: "深色" },
  ];

  let items: VaultItem[] = initialItems;
  let customDeviceTypes: DeviceTypeMeta[] = [];
  let hiddenDeviceTypes: string[] = [];
  let hydrated = false;
  let searchQuery = "";
  let selectedDeviceType: "全部设备" | DeviceType = "全部设备";
  let selectedId = 0;
  let sortMode: SortMode = "updatedDesc";
  let historySortDesc = true;
  let activeDialog: ActiveDialog = null;
  let activePopover: ActivePopover = null;
  let pendingConfirmation: PendingConfirmation | null = null;
  let contextDeviceType: "全部设备" | DeviceType = "全部设备";
  let popoverPosition: PopoverPosition = { top: 72, left: 22 };
  let deviceForm: DeviceForm = createEmptyDeviceForm();
  let accountForm: AccountForm = createEmptyAccountForm();
  let typeForm: TypeForm = { originalLabel: null, label: "", iconText: "", color: "blue" };
  let passwordForm = { password: "", reason: "" };
  let bulkPasswordForm: BulkPasswordForm = { deviceType: "全部设备", username: "", password: "", reason: "" };
  let openTypePicker: TypePickerScope | null = null;
  let deviceTypeSearch = "";
  let bulkTypeSearch = "";
  let selectedAccountId = 0;
  let passwordVisible = false;
  let historyOpen = true;
  let visibleHistoryIds: number[] = [];
  let generatorPanelOpen = false;
  let generatorTarget: GeneratorTarget = null;
  let generatorPreset: GeneratorPreset = "balanced";
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
  let generatorStrengthLabel = "未生成";
  let copyStatus = "";
  let backStack: ViewState[] = [];
  let forwardStack: ViewState[] = [];
  let restoringView = false;
  let searchInput: HTMLInputElement | null = null;
  let sidebarWidth = SIDEBAR_DEFAULT_WIDTH;
  let listWidth = LIST_DEFAULT_WIDTH;
  let resizingPane: ResizePane | null = null;
  let resizeStartX = 0;
  let resizeStartSidebarWidth = SIDEBAR_DEFAULT_WIDTH;
  let resizeStartListWidth = LIST_DEFAULT_WIDTH;

  onMount(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.items)) items = normalizeVaultItems(parsed.items);
        if (Array.isArray(parsed.customDeviceTypes)) customDeviceTypes = parsed.customDeviceTypes;
        if (Array.isArray(parsed.hiddenDeviceTypes)) hiddenDeviceTypes = parsed.hiddenDeviceTypes;
        if (parsed.paneLayout) {
          sidebarWidth = clampPaneWidth(readNumber(parsed.paneLayout.sidebarWidth, SIDEBAR_DEFAULT_WIDTH), "sidebar");
          listWidth = clampPaneWidth(readNumber(parsed.paneLayout.listWidth, LIST_DEFAULT_WIDTH), "list");
        }
      } catch {
        copyStatus = "本地数据读取失败，已使用默认数据";
      }
    }
    clampPaneLayout();
    hydrated = true;
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("resize", clampPaneLayout);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeydown);
      window.removeEventListener("resize", clampPaneLayout);
      stopPaneResize();
    };
  });

  $: if (hydrated) {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items, customDeviceTypes, hiddenDeviceTypes, paneLayout: { sidebarWidth, listWidth } })
    );
  }

  $: layoutStyle = `--sidebar-width: ${sidebarWidth}px; --list-width: ${listWidth}px;`;

  $: filteredItems = items.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery = !query || matchesSearch(item, query);

    const isSearching = query.length > 0;
    const matchesType = isSearching || selectedDeviceType === "全部设备" || item.deviceType === selectedDeviceType;
    return matchesQuery && matchesType;
  }).sort((left, right) => {
    if (sortMode === "nameAsc") return left.deviceName.localeCompare(right.deviceName, "zh-Hans-CN");
    if (sortMode === "typeAsc") return left.deviceType.localeCompare(right.deviceType, "zh-Hans-CN");
    return right.id - left.id;
  });

  $: selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? createBlankItem();
  $: hasDevices = items.length > 0;
  $: hasSelectedDevice = selectedItem.id > 0 && filteredItems.some((item) => item.id === selectedItem.id);

  $: if (filteredItems.length > 0 && !filteredItems.some((item) => item.id === selectedId)) {
    selectedId = filteredItems[0].id;
    selectedAccountId = 0;
  }

  $: deviceTypeOptions = [
    ...defaultDeviceTypeMeta
      .filter((type) => type.label !== "全部设备" && !hiddenDeviceTypes.includes(type.label))
      .map((type) => customDeviceTypes.find((custom) => custom.label === type.label) ?? type),
    ...customDeviceTypes.filter((custom) =>
      !defaultDeviceTypeMeta.some((type) => type.label === custom.label) || hiddenDeviceTypes.includes(custom.label)
    ),
  ];

  $: deviceTypeRows = [
    defaultDeviceTypeMeta[0],
    ...deviceTypeOptions,
  ].map((type) => ({
    ...type,
    count: type.label === "全部设备" ? items.length : items.filter((item) => item.deviceType === type.label).length,
  }));
  $: filteredDeviceTypeOptions = filterDeviceTypeChoices(deviceTypeOptions, deviceTypeSearch);
  $: filteredBulkTypeRows = filterDeviceTypeChoices(deviceTypeRows, bulkTypeSearch);
  $: selectedDeviceFormTypeMeta = getTypeMeta(deviceForm.deviceType);
  $: selectedBulkTypeMeta = deviceTypeRows.find((type) => type.label === bulkPasswordForm.deviceType) ?? deviceTypeRows[0];

  $: selectedAccounts = getAccounts(selectedItem);
  $: selectedAccount = selectedAccounts.find((account) => account.id === selectedAccountId) ?? selectedAccounts[0] ?? createBlankAccount();
  $: if (selectedAccounts.length > 0 && !selectedAccounts.some((account) => account.id === selectedAccountId)) {
    selectedAccountId = selectedAccounts[0].id;
  }
  $: passwordStrength = selectedAccount.password.length >= 14 ? "较强" : selectedAccount.password.length >= 10 ? "一般" : "较弱";
  $: selectedTypeDeviceCount = getDeviceTypeCount(selectedDeviceType);
  $: listContextLabel = searchQuery.trim() ? "搜索结果" : selectedDeviceType;
  $: listContextMeta = deviceTypeRows.find((type) => type.label === listContextLabel) ?? defaultDeviceTypeMeta[0];
  $: searchPlaceholder =
    searchQuery.trim() || selectedDeviceType === "全部设备"
      ? "在全部设备中搜索设备名或 IP"
      : `在${selectedDeviceType}中搜索设备名或 IP`;
  $: sortedHistory = [...selectedAccount.history].sort((left, right) =>
    historySortDesc ? right.id - left.id : left.id - right.id
  );
  $: bulkPasswordMatches = getBulkPasswordMatches(bulkPasswordForm);
  $: bulkPasswordPreview = bulkPasswordMatches.slice(0, 8);
  $: {
    useUpper;
    useLower;
    useNumbers;
    useSymbols;
    excludeSimilar;
    allowedSymbols;
    excludedCharacters;
    generatorPool = buildGeneratorPool();
  }
  $: generatorSummary =
    generatorPool.length > 0
      ? `当前字符池 ${generatorPool.length} 个字符`
      : "至少选择一种可用字符";
  $: {
    generatedPassword;
    generatorLength;
    useUpper;
    useLower;
    useNumbers;
    useSymbols;
    generatorStrengthLabel = getGeneratorStrengthLabel();
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

  function normalizeSearchValue(value: string) {
    return value.trim().toLowerCase();
  }

  function compactSearchValue(value: string) {
    return normalizeSearchValue(value).replace(/[\s._:/\\-]+/g, "");
  }

  function fuzzyContains(source: string, query: string) {
    if (!query) return true;
    if (source.includes(query)) return true;

    const compactSource = compactSearchValue(source);
    const compactQuery = compactSearchValue(query);
    if (!compactQuery) return true;
    if (compactSource.includes(compactQuery)) return true;

    let queryIndex = 0;
    for (const char of compactSource) {
      if (char === compactQuery[queryIndex]) queryIndex += 1;
      if (queryIndex === compactQuery.length) return true;
    }
    return false;
  }

  function matchesSearch(item: VaultItem, query: string) {
    const deviceName = normalizeSearchValue(item.deviceName);
    const ipAddress = normalizeSearchValue(item.ipAddress);
    return fuzzyContains(deviceName, query) || fuzzyContains(ipAddress, query);
  }

  function filterDeviceTypeChoices<T extends { label: string }>(types: T[], query: string) {
    const normalizedQuery = normalizeSearchValue(query);
    if (!normalizedQuery) return types;
    return types.filter((type) => normalizeSearchValue(type.label).includes(normalizedQuery));
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

  function updateSearch(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
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
    activePopover = null;
    visibleHistoryIds = [];
  }

  function selectDevice(id: number) {
    if (id === selectedId) return;
    pushNavigationState();
    selectedId = id;
    selectedAccountId = 0;
    passwordVisible = false;
    visibleHistoryIds = [];
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      copyStatus = `${label}已复制`;
      window.setTimeout(() => {
        copyStatus = "";
      }, 1600);
    } catch {
      copyStatus = "复制失败";
    }
  }

  function dismissStatus() {
    copyStatus = "";
  }

  function buildGeneratorPool() {
    const groups = getGeneratorGroups();
    return uniqueChars(groups.flatMap((group) => group.chars).join(""));
  }

  function getGeneratorGroups() {
    const customExcludes = new Set(
      `${excludedCharacters}${excludeSimilar ? "0O1Il|`'" : ""}`.split("")
    );
    const filter = (source: string) =>
      uniqueChars(
        source
          .split("")
          .filter((char) => !customExcludes.has(char))
          .join("")
      );

    return [
      { key: "upper", chars: useUpper ? filter("ABCDEFGHIJKLMNOPQRSTUVWXYZ") : "" },
      { key: "lower", chars: useLower ? filter("abcdefghijklmnopqrstuvwxyz") : "" },
      { key: "numbers", chars: useNumbers ? filter("0123456789") : "" },
      { key: "symbols", chars: useSymbols ? filter(allowedSymbols) : "" },
    ].filter((group) => group.chars.length > 0);
  }

  function uniqueChars(value: string) {
    return Array.from(new Set(value.split(""))).join("");
  }

  function randomIndex(max: number) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % max;
  }

  function pickFrom(source: string, previous = "") {
    if (source.length === 0) return "";
    if (!preventRepeats || source.length === 1) return source[randomIndex(source.length)];

    let next = source[randomIndex(source.length)];
    let guard = 0;
    while (next === previous && guard < 8) {
      next = source[randomIndex(source.length)];
      guard += 1;
    }
    return next;
  }

  function shufflePassword(chars: string[]) {
    for (let index = chars.length - 1; index > 0; index -= 1) {
      const swapIndex = randomIndex(index + 1);
      [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
    }
    return chars;
  }

  function generatePassword() {
    const groups = getGeneratorGroups();
    const pool = groups.map((group) => group.chars).join("");

    if (!pool) {
      generatedPassword = "";
      return;
    }

    const numbers = groups.find((group) => group.key === "numbers")?.chars ?? "";
    const symbols = groups.find((group) => group.key === "symbols")?.chars ?? "";
    const requiredNumbers = numbers ? Math.min(minimumNumbers, generatorLength) : 0;
    const requiredSymbols = symbols ? Math.min(minimumSymbols, generatorLength - requiredNumbers) : 0;
    const required: string[] = [];

    for (let index = 0; index < requiredNumbers; index += 1) {
      required.push(pickFrom(numbers, required[required.length - 1]));
    }

    for (let index = 0; index < requiredSymbols; index += 1) {
      required.push(pickFrom(symbols, required[required.length - 1]));
    }

    while (required.length < generatorLength) {
      required.push(pickFrom(pool, required[required.length - 1]));
    }

    generatedPassword = shufflePassword(required).join("");
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

  function applyGeneratorPreset(preset: GeneratorPreset) {
    generatorPreset = preset;
    if (preset === "readable") {
      generatorLength = 16;
      useUpper = true;
      useLower = true;
      useNumbers = true;
      useSymbols = false;
      excludeSimilar = true;
      preventRepeats = true;
      minimumNumbers = 2;
      minimumSymbols = 0;
    } else if (preset === "strong") {
      generatorLength = 24;
      useUpper = true;
      useLower = true;
      useNumbers = true;
      useSymbols = true;
      excludeSimilar = true;
      preventRepeats = true;
      minimumNumbers = 3;
      minimumSymbols = 3;
    } else if (preset === "pin") {
      generatorLength = 12;
      useUpper = false;
      useLower = false;
      useNumbers = true;
      useSymbols = false;
      excludeSimilar = false;
      preventRepeats = false;
      minimumNumbers = 12;
      minimumSymbols = 0;
    } else {
      generatorLength = 8;
      useUpper = true;
      useLower = true;
      useNumbers = true;
      useSymbols = true;
      excludeSimilar = true;
      preventRepeats = false;
      minimumNumbers = 2;
      minimumSymbols = 2;
    }
    generatorLengthInput = String(generatorLength);
    generatePassword();
  }

  function normalizeGeneratorLength(length: number) {
    return Math.min(24, Math.max(3, Number.isFinite(length) ? Math.round(length) : 8));
  }

  function setGeneratorLength(length: number, syncInput = true) {
    generatorLength = normalizeGeneratorLength(length);
    if (syncInput) generatorLengthInput = String(generatorLength);
    if (minimumNumbers > generatorLength) minimumNumbers = generatorLength;
    if (minimumSymbols > generatorLength) minimumSymbols = generatorLength;
    generatePassword();
  }

  function handleGeneratorLengthInput(value: string) {
    const nextValue = value.replace(/[^\d]/g, "");
    generatorLengthInput = nextValue;

    if (!nextValue) return;

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

  function getGeneratorStrengthLabel() {
    if (!generatedPassword) return "未生成";
    if (useNumbers && !useUpper && !useLower && !useSymbols) return generatorLength >= 12 ? "数字 PIN" : "短 PIN";
    if (generatorLength >= 24 && useSymbols && useNumbers && useUpper && useLower) return "高强度";
    if (generatorLength >= 16 && useNumbers && useUpper && useLower) return "适合日常";
    return "基础";
  }

  function setSortMode(mode: SortMode) {
    if (mode === sortMode) return;
    pushNavigationState();
    sortMode = mode;
  }

  function getMaxPaneWidth(pane: ResizePane) {
    if (typeof window === "undefined") return pane === "sidebar" ? SIDEBAR_MAX_WIDTH : LIST_MAX_WIDTH;
    const availableWidth = window.innerWidth - DETAIL_MIN_WIDTH - RESIZER_WIDTH * 2;
    if (pane === "sidebar") return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, availableWidth - listWidth));
    return Math.max(LIST_MIN_WIDTH, Math.min(LIST_MAX_WIDTH, availableWidth - sidebarWidth));
  }

  function clampPaneWidth(width: number, pane: ResizePane) {
    const minWidth = pane === "sidebar" ? SIDEBAR_MIN_WIDTH : LIST_MIN_WIDTH;
    return Math.round(Math.min(Math.max(width, minWidth), getMaxPaneWidth(pane)));
  }

  function clampPaneLayout() {
    listWidth = clampPaneWidth(listWidth, "list");
    sidebarWidth = clampPaneWidth(sidebarWidth, "sidebar");
    listWidth = clampPaneWidth(listWidth, "list");
  }

  function startPaneResize(pane: ResizePane, event: PointerEvent) {
    event.preventDefault();
    activePopover = null;
    openTypePicker = null;
    resizingPane = pane;
    resizeStartX = event.clientX;
    resizeStartSidebarWidth = sidebarWidth;
    resizeStartListWidth = listWidth;
    document.body.classList.add("is-resizing-pane");
    window.addEventListener("pointermove", handlePaneResize);
    window.addEventListener("pointerup", stopPaneResize);
    window.addEventListener("pointercancel", stopPaneResize);
  }

  function handlePaneResize(event: PointerEvent) {
    if (!resizingPane) return;
    const deltaX = event.clientX - resizeStartX;
    if (resizingPane === "sidebar") {
      sidebarWidth = clampPaneWidth(resizeStartSidebarWidth + deltaX, "sidebar");
    } else {
      listWidth = clampPaneWidth(resizeStartListWidth + deltaX, "list");
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
    if (!generatedPassword) generatePassword();
    if (!generatedPassword) return;
    passwordForm = { password: generatedPassword, reason: "" };
    closeGeneratorPanel();
    activeDialog = "password";
  }

  function useGeneratedPasswordForBulkUpdate() {
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

  function accountFromItem(item: VaultItem): DeviceAccount {
    return {
      id: 1,
      title: item.username || item.title || "未填写用户名",
      username: item.username,
      password: item.password,
      website: item.website,
      tag: item.tag,
      notes: item.notes,
      updatedAt: item.updatedAt,
      history: item.history ?? [],
    };
  }

  function readString(value: unknown, fallback = "") {
    return typeof value === "string" ? value : fallback;
  }

  function readNumber(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function normalizeHistoryEntries(value: unknown): PasswordHistory[] {
    if (!Array.isArray(value)) return [];
    return value.map((entry, index) => ({
      id: readNumber(entry?.id, index + 1),
      password: readString(entry?.password),
      newPassword: readString(entry?.newPassword),
      changedAt: readString(entry?.changedAt),
      reason: readString(entry?.reason),
    }));
  }

  function normalizeAccount(value: unknown, fallback: VaultItem, index: number): DeviceAccount {
    const account = value as Partial<DeviceAccount>;
    const username = readString(account.username, fallback.username);
    return {
      id: readNumber(account.id, index + 1),
      title: username || readString(account.title, fallback.title || "未填写用户名") || "未填写用户名",
      username,
      password: readString(account.password, fallback.password),
      website: readString(account.website, fallback.website),
      tag: readString(account.tag, fallback.tag || fallback.deviceType) || fallback.deviceType,
      notes: readString(account.notes, fallback.notes),
      updatedAt: readString(account.updatedAt, fallback.updatedAt),
      history: normalizeHistoryEntries(account.history ?? fallback.history),
    };
  }

  function normalizeAccountIds(accounts: DeviceAccount[]) {
    const usedIds = new Set<number>();
    let nextId = 1;
    return accounts.map((account) => {
      let id = account.id > 0 ? account.id : nextId;
      while (usedIds.has(id)) id += 1;
      usedIds.add(id);
      nextId = Math.max(nextId, id + 1);
      return { ...account, id };
    });
  }

  function normalizeVaultItem(value: unknown, index: number): VaultItem {
    const item = value as Partial<VaultItem>;
    const deviceType = readString(item.deviceType);
    const fallback: VaultItem = {
      id: readNumber(item.id, index + 1),
      title: readString(item.title, "管理员账号") || "管理员账号",
      deviceName: readString(item.deviceName, readString(item.title, `设备 ${index + 1}`)) || `设备 ${index + 1}`,
      deviceType,
      username: readString(item.username),
      password: readString(item.password),
      website: readString(item.website),
      ipAddress: readString(item.ipAddress, readString((item as { ip?: unknown }).ip)),
      tag: readString(item.tag, deviceType) || deviceType,
      iconText: readString(item.iconText, getTypeMeta(deviceType).iconText),
      iconClass: readString(item.iconClass, iconClassForType(deviceType)),
      updatedAt: readString(item.updatedAt, formatDateTime(new Date())),
      notes: readString(item.notes),
      history: normalizeHistoryEntries(item.history),
      accounts: [],
    };
    const accountSource = Array.isArray(item.accounts) && item.accounts.length > 0 ? item.accounts : [item];
    const accounts = normalizeAccountIds(accountSource.map((account, accountIndex) => normalizeAccount(account, fallback, accountIndex)));
    return syncItemWithAccounts(fallback, accounts);
  }

  function normalizeVaultItems(value: unknown) {
    if (!Array.isArray(value)) throw new Error("invalid backup");
    return value.map((item, index) => normalizeVaultItem(item, index));
  }

  function getAccounts(item: VaultItem) {
    if (Array.isArray(item.accounts) && item.accounts.length > 0) return item.accounts;
    return item.id ? [accountFromItem(item)] : [];
  }

  function createAccountFromForm(id: number, updatedAt: string): DeviceAccount {
    const username = accountForm.username.trim();
    return {
      id,
      title: username || "未填写用户名",
      username,
      password: accountForm.password,
      website: accountForm.website.trim(),
      tag: accountForm.tag.trim() || selectedItem.deviceType,
      notes: accountForm.notes.trim(),
      updatedAt,
      history: [],
    };
  }

  function syncItemWithAccounts(item: VaultItem, accounts: DeviceAccount[]) {
    const primaryAccount = accounts[0] ?? createBlankAccount();
    return {
      ...item,
      title: primaryAccount.title,
      username: primaryAccount.username,
      password: primaryAccount.password,
      website: primaryAccount.website,
      tag: primaryAccount.tag,
      notes: primaryAccount.notes,
      updatedAt: primaryAccount.updatedAt,
      history: primaryAccount.history,
      accounts,
    };
  }

  function copyDeviceAccountInfo(account = selectedAccount) {
    return [
      account.username ? `用户名: ${account.username}` : "",
      account.password ? `密码: ${account.password}` : "",
    ].filter(Boolean).join("\n");
  }

  function copyDeviceInfo(item = selectedItem) {
    return [
      item.deviceName,
      item.deviceType ? `类型: ${item.deviceType}` : "",
      item.ipAddress ? `IP: ${item.ipAddress}` : "",
      `${getAccounts(item).length} 个账号`,
    ].filter(Boolean).join("\n");
  }

  function copySelectedDeviceInfo() {
    activePopover = null;
    copyText(copyDeviceInfo(), "设备信息");
  }

  function copySelectedAccountInfo() {
    activePopover = null;
    copyText(copyDeviceAccountInfo(), "账号密码");
  }

  function selectAccount(id: number) {
    if (id === selectedAccountId) return;
    selectedAccountId = id;
    passwordVisible = false;
    visibleHistoryIds = [];
  }

  function createBlankItem(): VaultItem {
    return {
      id: 0,
      title: "未选择项目",
      deviceName: "未选择设备",
      deviceType: "",
      username: "",
      password: "",
      website: "",
      ipAddress: "",
      tag: "",
      iconText: "?",
      iconClass: iconClassForColor(fallbackDeviceTypeMeta.color),
      updatedAt: formatDateTime(new Date()),
      notes: "",
      history: [],
      accounts: [],
    };
  }

  function createBlankAccount(): DeviceAccount {
    return {
      id: 0,
      title: "未选择账号",
      username: "",
      password: "",
      website: "",
      ipAddress: "",
      tag: "",
      notes: "",
      updatedAt: formatDateTime(new Date()),
      history: [],
    };
  }

  function createEmptyDeviceForm(): DeviceForm {
    return {
      id: null,
      deviceName: "",
      deviceType: "",
      title: "管理员账号",
      username: "",
      password: "",
      website: "",
      tag: "",
      notes: "",
    };
  }

  function createEmptyAccountForm(): AccountForm {
    return {
      id: null,
      title: "管理员账号",
      username: "",
      password: "",
      website: "",
      tag: "",
      notes: "",
    };
  }

  function formatDateTime(date: Date) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  }

  function getTypeMeta(deviceType: string) {
    return deviceTypeOptions.find((type) => type.label === deviceType) ?? fallbackDeviceTypeMeta;
  }

  function getDeviceTypeCount(deviceType: "全部设备" | DeviceType) {
    return deviceType === "全部设备" ? items.length : items.filter((item) => item.deviceType === deviceType).length;
  }

  function canDeleteDeviceType(deviceType: "全部设备" | DeviceType) {
    return deviceType !== "全部设备" && getDeviceTypeCount(deviceType) === 0;
  }

  function iconClassForColor(color: string) {
    if (color === "cyan") return "icon-router";
    if (color === "rose") return "icon-rose";
    if (color === "indigo") return "icon-indigo";
    if (color === "sand") return "icon-sand";
    if (color === "gold") return "icon-gold";
    if (color === "dark") return "icon-terminal";
    return "icon-cyan";
  }

  function iconClassForType(deviceType: string) {
    return iconClassForColor(getTypeMeta(deviceType).color);
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
    if ((event.target as HTMLElement).closest("button, a, input, textarea, select, [role='button']")) {
      event.preventDefault();
      return;
    }
    openDeviceContextMenu(selectedItem, event);
  }

  function handleMenuScrimContextMenu(event: MouseEvent) {
    event.preventDefault();
    const { clientX, clientY } = event;
    activePopover = null;

    requestAnimationFrame(() => {
      const target = document.elementFromPoint(clientX, clientY);
      if (!target || !(target instanceof HTMLElement)) return;
      target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          screenX: event.screenX,
          screenY: event.screenY,
          button: 2,
          buttons: 2,
        })
      );
    });
  }

  function closeOverlays() {
    activePopover = null;
    activeDialog = null;
    pendingConfirmation = null;
    openTypePicker = null;
  }

  function closeKeyboardSurface() {
    if (openTypePicker) {
      openTypePicker = null;
      return true;
    }
    if (pendingConfirmation) {
      pendingConfirmation = null;
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
      copyStatus = "请先选择一个具体设备类型";
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
      copyStatus = `该类型下还有 ${deviceCount} 个设备，请先移动或删除设备`;
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
      copyStatus = `该类型下还有 ${deviceCount} 个设备，请先移动或删除设备`;
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
    activePopover = null;
    activeDialog = null;
    copyStatus = "设备类型已删除";
  }

  function saveDeviceType() {
    const label = typeForm.label.trim();
    const originalLabel = typeForm.originalLabel;
    if (!label) {
      copyStatus = "请输入设备类型名称";
      return;
    }
    if (deviceTypeRows.some((type) => type.label === label && type.label !== originalLabel)) {
      copyStatus = "设备类型已存在";
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
              accounts: getAccounts(item).map((account) => ({
                ...account,
                tag: account.tag === originalLabel ? label : account.tag,
              })),
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
      copyStatus = "请先新增设备类型";
      return;
    }
    deviceForm = createEmptyDeviceForm();
    if (deviceType !== "全部设备") deviceForm.deviceType = deviceType;
    else deviceForm.deviceType = deviceTypeOptions[0]?.label ?? "";
    activeDialog = "device";
  }

  function openEditDeviceDialog() {
    activePopover = null;
    openTypePicker = null;
    deviceTypeSearch = "";
    deviceForm = {
      id: selectedItem.id,
      deviceName: selectedItem.deviceName,
      deviceType: selectedItem.deviceType,
      title: selectedAccount.title,
      username: selectedAccount.username,
      password: selectedAccount.password,
      website: selectedAccount.website,
      ipAddress: selectedItem.ipAddress,
      tag: selectedAccount.tag,
      notes: selectedAccount.notes,
    };
    activeDialog = "device";
  }

  function saveDevice() {
    const name = deviceForm.deviceName.trim();
    if (!name) {
      copyStatus = "请输入设备名称";
      return;
    }
    if (!deviceForm.deviceType.trim()) {
      copyStatus = "请先新增设备类型";
      return;
    }
    const now = new Date();
    const typeMeta = getTypeMeta(deviceForm.deviceType);
    const accountUpdatedAt = formatDateTime(now);

    if (deviceForm.id) {
      items = items.map((item) => {
        if (item.id !== deviceForm.id) return item;
        const nextAccounts = getAccounts(item).map((account) => ({
          ...account,
          tag: account.tag === item.deviceType ? deviceForm.deviceType : account.tag,
        }));
        return syncItemWithAccounts(
          {
            ...item,
            deviceName: name,
            deviceType: deviceForm.deviceType,
            ipAddress: deviceForm.ipAddress.trim(),
            iconText: typeMeta.iconText,
            iconClass: iconClassForType(deviceForm.deviceType),
          },
          nextAccounts
        );
      });
      pushNavigationState();
      selectedId = deviceForm.id;
      selectedDeviceType = deviceForm.deviceType;
      activeDialog = null;
      return;
    }

    const accountUsername = deviceForm.username.trim();
    const nextAccount: DeviceAccount = {
      id: 1,
      title: accountUsername || "未填写用户名",
      username: accountUsername,
      password: deviceForm.password,
      website: deviceForm.website.trim(),
      tag: deviceForm.tag.trim() || deviceForm.deviceType,
      notes: deviceForm.notes.trim(),
      updatedAt: accountUpdatedAt,
      history: [],
    };
    const nextItem: VaultItem = {
      id: Math.max(0, ...items.map((item) => item.id)) + 1,
      title: nextAccount.title,
      deviceName: name,
      deviceType: deviceForm.deviceType,
      username: nextAccount.username,
      password: nextAccount.password,
      website: nextAccount.website,
      ipAddress: deviceForm.ipAddress.trim(),
      tag: nextAccount.tag,
      iconText: typeMeta.iconText,
      iconClass: iconClassForType(deviceForm.deviceType),
      updatedAt: accountUpdatedAt,
      notes: nextAccount.notes,
      history: nextAccount.history,
      accounts: [nextAccount],
    };

    items = [nextItem, ...items];
    pushNavigationState();
    selectedId = nextItem.id;
    selectedDeviceType = nextItem.deviceType;
    selectedAccountId = nextAccount.id;
    activeDialog = null;
  }

  function openAddAccountDialog() {
    activePopover = null;
    accountForm = {
      ...createEmptyAccountForm(),
      tag: selectedAccount.tag || selectedItem.tag || selectedItem.deviceType,
    };
    activeDialog = "account";
  }

  function openEditAccountDialog() {
    activePopover = null;
    accountForm = {
      id: selectedAccount.id,
      title: selectedAccount.username || selectedAccount.title,
      username: selectedAccount.username,
      password: selectedAccount.password,
      website: selectedAccount.website,
      tag: selectedAccount.tag,
      notes: selectedAccount.notes,
    };
    activeDialog = "account";
  }

  function saveAccount() {
    if (!selectedItem.id) return;
    const now = formatDateTime(new Date());
    const nextId = accountForm.id ?? Math.max(0, ...selectedAccounts.map((account) => account.id)) + 1;
    const nextAccount = createAccountFromForm(nextId, now);
    const nextAccounts = accountForm.id
      ? selectedAccounts.map((account) =>
          account.id === accountForm.id ? { ...nextAccount, history: account.history, updatedAt: now } : account
        )
      : [...selectedAccounts, nextAccount];

    items = items.map((item) =>
      item.id === selectedItem.id ? syncItemWithAccounts(item, nextAccounts) : item
    );
    pushNavigationState();
    selectedAccountId = nextId;
    activeDialog = null;
  }

  function deleteSelectedAccount() {
    if (!selectedItem.id || !selectedAccount.id) return;
    if (selectedAccounts.length <= 1) {
      copyStatus = "每台设备至少保留一个账号";
      activePopover = null;
      return;
    }

    const nextAccounts = selectedAccounts.filter((account) => account.id !== selectedAccount.id);
    items = items.map((item) =>
      item.id === selectedItem.id ? syncItemWithAccounts(item, nextAccounts) : item
    );
    pushNavigationState();
    selectedAccountId = nextAccounts[0]?.id ?? 0;
    passwordVisible = false;
    visibleHistoryIds = [];
    activePopover = null;
    copyStatus = "账号已删除";
  }

  function requestDeleteSelectedAccount() {
    if (!selectedItem.id || !selectedAccount.id) return;
    if (selectedAccounts.length <= 1) {
      copyStatus = "每台设备至少保留一个账号";
      activePopover = null;
      return;
    }
    activePopover = null;
    activeDialog = null;
    pendingConfirmation = {
      action: "delete-account",
      title: "删除账号",
      message: `确认删除“${selectedAccount.username || selectedAccount.title || "当前账号"}”？`,
      detail: "该账号的当前密码和历史密码记录都会从当前设备中移除。",
      confirmLabel: "删除账号",
    };
  }

  function openPasswordDialog() {
    activePopover = null;
    passwordForm = { password: generatedPassword || selectedAccount.password, reason: "" };
    activeDialog = "password";
  }

  function openBulkPasswordDialog(useGenerated = false) {
    activePopover = null;
    openTypePicker = null;
    bulkTypeSearch = "";
    bulkPasswordForm = {
      deviceType: selectedDeviceType,
      username: selectedAccount.id ? selectedAccount.username : "",
      password: useGenerated ? generatedPassword : generatedPassword || "",
      reason: "",
    };
    activeDialog = "bulk-password";
  }

  function setBulkPasswordDeviceType(deviceType: "全部设备" | DeviceType) {
    bulkPasswordForm = { ...bulkPasswordForm, deviceType };
    bulkTypeSearch = "";
    openTypePicker = null;
  }

  function setDeviceFormType(deviceType: DeviceType) {
    deviceForm = { ...deviceForm, deviceType };
    deviceTypeSearch = "";
    openTypePicker = null;
  }

  function toggleTypePicker(scope: TypePickerScope) {
    openTypePicker = openTypePicker === scope ? null : scope;
  }

  function matchesBulkUsername(account: DeviceAccount, username: string) {
    const target = username.trim().toLowerCase();
    if (!target) return true;
    return account.username.trim().toLowerCase() === target;
  }

  function matchesBulkDeviceType(item: VaultItem, deviceType: "全部设备" | DeviceType) {
    return deviceType === "全部设备" || item.deviceType === deviceType;
  }

  function getBulkPasswordMatches(form: BulkPasswordForm): BulkPasswordMatch[] {
    return items.filter((item) => matchesBulkDeviceType(item, form.deviceType)).flatMap((item) =>
      getAccounts(item)
        .filter((account) => matchesBulkUsername(account, form.username))
        .map((account) => ({
          itemId: item.id,
          accountId: account.id,
          deviceName: item.deviceName,
          deviceType: item.deviceType,
          ipAddress: item.ipAddress,
          username: account.username,
          tag: account.tag,
        }))
    );
  }

  function updateAccountPassword(account: DeviceAccount, password: string, changedAt: string, reason: string) {
    const historyEntry: PasswordHistory = {
      id: Math.max(0, ...account.history.map((entry) => entry.id)) + 1,
      password: account.password,
      newPassword: password,
      changedAt,
      reason,
    };
    return {
      ...account,
      password,
      updatedAt: changedAt,
      history: account.password ? [historyEntry, ...account.history] : account.history,
    };
  }

  function savePasswordUpdate() {
    if (!passwordForm.password) {
      copyStatus = "请输入新密码";
      return;
    }
    const changedAt = formatDateTime(new Date());
    const reason = passwordForm.reason.trim();
    const nextAccounts = selectedAccounts.map((account) =>
      account.id === selectedAccount.id
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
  }

  function saveBulkPasswordUpdate() {
    const password = bulkPasswordForm.password.trim();
    if (!password) {
      copyStatus = "请输入新密码";
      return;
    }
    const matches = getBulkPasswordMatches(bulkPasswordForm);
    if (matches.length === 0) {
      copyStatus = "没有匹配账号";
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
    copyStatus = `已批量更新 ${matches.length} 个账号`;
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
    activePopover = null;
    copyStatus = "设备已删除";
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
    pendingConfirmation = null;
    if (confirmation.action === "delete-device-type") {
      deleteDeviceType(confirmation.deviceType ?? selectedDeviceType);
    } else if (confirmation.action === "delete-account") {
      deleteSelectedAccount();
    } else if (confirmation.action === "delete-device") {
      deleteSelectedDevice();
    }
  }

  function createBackupPayload() {
    return JSON.stringify({ items: normalizeVaultItems(items), customDeviceTypes, hiddenDeviceTypes }, null, 2);
  }

  function createBackupFilename() {
    return `设备密码管理工具备份-${new Date().toISOString().slice(0, 10)}.json`;
  }

  async function exportData() {
    const payload = createBackupPayload();
    const filename = createBackupFilename();
    activePopover = null;

    if (isTauri()) {
      try {
        const path = await saveFileDialog({
          title: "导出 JSON 备份",
          defaultPath: filename,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (!path) {
          copyStatus = "已取消导出";
          return;
        }
        await writeTextFile(path, payload);
        copyStatus = "备份已导出";
      } catch {
        copyStatus = "备份导出失败";
      }
      return;
    }

    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    copyStatus = "备份已导出";
  }

  async function triggerImport() {
    activePopover = null;
    if (isTauri()) {
      try {
        const path = await openFileDialog({
          title: "导入 JSON 备份",
          multiple: false,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (!path || Array.isArray(path)) {
          copyStatus = "已取消导入";
          return;
        }
        const content = await readTextFile(path);
        applyImportedBackup(content);
      } catch {
        copyStatus = "备份导入失败";
      }
      return;
    }

    document.getElementById("import-file")?.click();
  }

  function applyImportedBackup(content: string) {
    const parsed = JSON.parse(content);
    items = normalizeVaultItems(parsed.items);
    customDeviceTypes = Array.isArray(parsed.customDeviceTypes) ? parsed.customDeviceTypes : [];
    hiddenDeviceTypes = Array.isArray(parsed.hiddenDeviceTypes) ? parsed.hiddenDeviceTypes : [];
    selectedId = items[0]?.id ?? 0;
    selectedAccountId = 0;
    selectedDeviceType = "全部设备";
    searchQuery = "";
    sortMode = "updatedDesc";
    backStack = [];
    forwardStack = [];
    visibleHistoryIds = [];
    copyStatus = "备份已导入";
  }

  async function importData(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      applyImportedBackup(await file.text());
    } catch {
      copyStatus = "备份导入失败";
    } finally {
      input.value = "";
    }
  }
</script>

<main class="app-shell" style={layoutStyle}>
  <input id="import-file" class="hidden-file-input" type="file" accept="application/json" on:change={importData} />
  <aside class="sidebar" aria-label="设备类型" on:contextmenu={openTypeBlankContextMenu}>
    <div class="pane-header sidebar-pane-header">
      <div class="sidebar-pane-title">
        <span class="pane-kicker">设备库</span>
        <h2>设备类型</h2>
      </div>
      <div class="pane-actions">
        <button class="icon-button compact-action" aria-label="新增设备类型" on:click={openAddTypeDialog}><Plus size={18} /></button>
        <button class="icon-button compact-action" aria-label="编辑设备类型" disabled={selectedDeviceType === "全部设备"} on:click={() => openEditTypeDialog()}><Pencil size={17} /></button>
        <button
          class="icon-button compact-action"
          aria-label="删除设备类型"
          disabled={!canDeleteDeviceType(selectedDeviceType)}
          title={selectedDeviceType === "全部设备" ? "全部设备不能删除" : selectedTypeDeviceCount > 0 ? "该类型下还有设备，不能直接删除" : "删除设备类型"}
          on:click={() => requestDeleteDeviceType(selectedDeviceType)}
        ><Trash2 size={17} /></button>
        <button class="icon-button compact-action" aria-label="排序设备类型" on:click={(event) => openPopover("type-sort", event)}><ListFilter size={18} /></button>
      </div>
    </div>

    <div class="device-type-list">
      {#each deviceTypeRows as type}
        <button
          class:selected={selectedDeviceType === type.label}
          class="device-type-row"
          on:click={() => selectDeviceType(type.label)}
          on:contextmenu={(event) => openTypeContextMenu(type.label, event)}
        >
          <span class={`type-icon type-${type.color}`}>{type.iconText}</span>
          <span class="type-copy">
            <strong>{type.label}</strong>
            <small>{type.count} 个设备</small>
          </span>
          <ChevronRight size={17} />
        </button>
      {/each}
    </div>
  </aside>

  <button
    class:active={resizingPane === "sidebar"}
    class="pane-resizer"
    type="button"
    aria-label="调整设备类型宽度"
    on:pointerdown={(event) => startPaneResize("sidebar", event)}
  ></button>

  <section class="workspace">
    <header class="topbar">
      <div class="history-buttons">
        <button class="icon-button" aria-label="后退" aria-keyshortcuts="Meta+ArrowLeft Control+ArrowLeft" disabled={backStack.length === 0} on:click={goBack}><ChevronRight class="back-icon" size={24} /></button>
        <button class="icon-button" aria-label="前进" aria-keyshortcuts="Meta+ArrowRight Control+ArrowRight" disabled={forwardStack.length === 0} on:click={goForward}><ChevronRight size={24} /></button>
      </div>

      <label class="search-box">
        <Search size={22} />
        <input bind:this={searchInput} value={searchQuery} on:input={updateSearch} placeholder={searchPlaceholder} aria-label="搜索项目" aria-keyshortcuts="Meta+F Control+F Meta+K Control+K" />
      </label>

      <button class="primary-button" aria-keyshortcuts="Meta+N Control+N" on:click={() => openAddDeviceDialog()}>
        <Plus size={22} />
        <span>新增设备</span>
      </button>
      <button class="tool-button topbar-tool" aria-keyshortcuts="Meta+B Control+B" on:click={() => openBulkPasswordDialog()}>
        <KeyRound size={20} />
        <span>批量改密</span>
      </button>
      <button class="tool-button topbar-tool accent" aria-keyshortcuts="Meta+G Control+G" on:click={() => openGeneratorPanel()}>
        <Sparkles size={20} />
        <span>生成密码</span>
      </button>
    </header>

    <div class="content-grid">
      <section class="item-list" aria-label="设备名称">
        <div class="list-toolbar pane-list-toolbar">
          <div class="list-context" aria-label="当前设备范围">
            {#if searchQuery.trim()}
              <Search size={21} />
            {:else}
              <span class={`context-type-icon type-${listContextMeta.color}`}>{listContextMeta.iconText}</span>
            {/if}
            <span>{listContextLabel}</span>
            <small>{filteredItems.length}</small>
          </div>
          <div class="toolbar-actions">
            <button class="icon-button" aria-label="排序设备" on:click={(event) => openPopover("device-sort", event)}><ListFilter size={20} /></button>
          </div>
        </div>

        <div class="list-scroll" role="group" aria-label="设备列表右键菜单区域" on:contextmenu={openDeviceListBlankContextMenu}>
          {#if filteredItems.length === 0}
            <div class="empty-list" class:onboarding-empty={!hasDevices}>
              <Folder size={24} />
              <div>
                <strong>{hasDevices ? "没有匹配设备" : "还没有设备"}</strong>
                <span>{hasDevices ? "换个设备名或 IP 搜索，或新增一台设备。" : "新增第一台设备后，这里会显示账号和密码信息。"}</span>
              </div>
            </div>
          {:else}
            <h2 class="list-heading">{searchQuery.trim() ? "搜索结果" : "设备名称"}</h2>
            {#each filteredItems as item}
              {@const itemAccounts = getAccounts(item)}
              {@const primaryAccount = itemAccounts[0] ?? createBlankAccount()}
              <button
                class:selected={item.id === selectedItem.id}
                class:no-type-pill={selectedDeviceType !== "全部设备" && !searchQuery.trim()}
                class="item-row"
                on:click={() => selectDevice(item.id)}
                on:contextmenu={(event) => openDeviceContextMenu(item, event)}
              >
                <span class={`item-icon ${item.iconClass}`}>
                  {#if item.id === 1}
                    <KeyRound size={28} />
                  {:else}
                    {item.iconText}
                  {/if}
                </span>
                <span class="item-copy">
                  <strong>{item.deviceName}</strong>
                  <small>{itemAccounts.length} 个账号 · {primaryAccount.username || "未填写用户名"}{#if item.ipAddress} · {item.ipAddress}{/if}</small>
                </span>
                {#if selectedDeviceType === "全部设备" || searchQuery.trim()}
                  <span class="item-type-pill">{item.deviceType}</span>
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      </section>

      <button
        class:active={resizingPane === "list"}
        class="pane-resizer"
        type="button"
        aria-label="调整设备列表宽度"
        on:pointerdown={(event) => startPaneResize("list", event)}
      ></button>

      <section class="detail-pane" aria-label="项目详情" on:contextmenu={openDetailBlankContextMenu}>
        {#if hasSelectedDevice}
        <div class="detail-topline">
          <div class="breadcrumb" aria-label="当前详情设备类型">
            <span class="device-type-badge"><ShieldCheck size={16} /></span>
            <span>{selectedItem.deviceType}</span>
          </div>
          <div class="detail-actions">
            <button class="tool-button" on:click={openAddAccountDialog}>
              <Plus size={19} />
              <span>新增账号</span>
            </button>
            <button class="tool-button update-password-action" on:click={openPasswordDialog}>
              <KeyRound size={19} />
              <span>更新密码</span>
            </button>
            <button class="tool-button" on:click={copySelectedAccountInfo}>
              <Copy size={20} />
              <span>复制账号信息</span>
            </button>
            <button class="tool-button" on:click={openEditAccountDialog}>
              <Pencil size={20} />
              <span>编辑账号</span>
            </button>
            <button class="icon-button" aria-label="更多操作" on:click={(event) => openPopover("more", event)}><MoreVertical size={22} /></button>
          </div>
        </div>

        <div class="detail-scroll" role="group" aria-label="当前设备右键菜单区域" on:contextmenu={openSelectedDeviceContextMenu}>
          <div class="identity-row">
            <span class={`detail-icon ${selectedItem.iconClass}`}>
              {#if selectedItem.id === 1}
                <KeyRound size={42} />
              {:else}
                {selectedItem.iconText}
              {/if}
            </span>
            <div>
              <h1>{selectedItem.deviceName}</h1>
              <p class="identity-subtitle">{selectedItem.deviceType} · {selectedAccounts.length} 个账号</p>
              <div class="identity-meta">
                <span>{selectedAccount.tag || selectedItem.deviceType}</span>
                {#if selectedItem.ipAddress}
                  <span>IP {selectedItem.ipAddress}</span>
                {/if}
                <span>当前账号更新于 {selectedAccount.updatedAt}</span>
              </div>
            </div>
          </div>

          {#if selectedItem.ipAddress}
            <div class="device-info-row">
              <div>
                <span class="field-label">IP 地址</span>
                <p>{selectedItem.ipAddress}</p>
              </div>
              <button class="icon-button inline" aria-label="复制 IP 地址" on:click={() => copyText(selectedItem.ipAddress, "IP 地址")}>
                <Copy size={18} />
              </button>
            </div>
          {/if}

          <section class="account-section" aria-label="设备账号">
            <div class="panel-heading account-heading">
              <UserRound size={19} />
              <h2>账号</h2>
              <button class="secondary-button account-add-action" on:click={openAddAccountDialog}>新增账号</button>
            </div>
            <div class="account-list" role="tablist" aria-label="当前设备账号">
              {#each selectedAccounts as account}
                <button
                  class:selected={account.id === selectedAccount.id}
                  role="tab"
                  aria-selected={account.id === selectedAccount.id}
                  on:click={() => selectAccount(account.id)}
                >
                  <strong>{account.username || account.title || "未填写用户名"}</strong>
                  <span>{account.tag || "账号信息"}</span>
                </button>
              {/each}
            </div>
          </section>

          <div class="field-group">
            <div class="field-row">
              <div>
                <span class="field-label">用户名</span>
                <p>{selectedAccount.username}</p>
              </div>
              <button class="icon-button inline" aria-label="复制用户名" on:click={() => copyText(selectedAccount.username, "用户名")}>
                <Copy size={18} />
              </button>
            </div>
            <div class="field-row">
              <div>
                <span class="field-label">密码</span>
                <p class="password-value">{passwordVisible ? selectedAccount.password : "••••••••••"}</p>
              </div>
              <div class="field-tools">
                <span class={`strength ${passwordStrength === "较弱" ? "weak" : ""}`}>{passwordStrength}</span>
                <button class="icon-button inline" aria-label={passwordVisible ? "隐藏密码" : "显示密码"} on:click={() => (passwordVisible = !passwordVisible)}>
                  {#if passwordVisible}
                    <EyeOff size={18} />
                  {:else}
                    <Eye size={18} />
                  {/if}
                </button>
                <button class="icon-button inline" aria-label="复制密码" on:click={() => copyText(selectedAccount.password, "密码")}>
                  <Copy size={18} />
                </button>
                <button class="secondary-button inline-update" on:click={openPasswordDialog}>更新</button>
              </div>
            </div>
            {#if selectedAccount.notes}
              <div class="field-row">
                <div>
                  <span class="field-label">备注</span>
                  <p>{selectedAccount.notes}</p>
                </div>
              </div>
            {/if}
          </div>

          <button class="meta-row" on:click={() => (historyOpen = !historyOpen)}>
            {#if historyOpen}
              <ChevronDown size={19} />
            {:else}
              <ChevronRight size={19} />
            {/if}
            <Clock3 size={18} />
            <span>当前账号最后编辑 {selectedAccount.updatedAt}</span>
          </button>

          {#if historyOpen}
            <section class="history-section">
              <div class="panel-heading">
                <History size={19} />
                <h2>密码历史</h2>
              </div>
              {#if selectedAccount.history.length === 0}
                <p class="quiet-text">暂无旧密码记录</p>
              {:else}
                {#each sortedHistory as history}
                  <div class="history-row">
                    <div>
                      <div class="history-password-pair">
                        <span>旧密码</span>
                        <strong class:masked={!visibleHistoryIds.includes(history.id)}>
                          {visibleHistoryIds.includes(history.id) ? history.password : maskPassword(history.password)}
                        </strong>
                        {#if history.newPassword}
                          <span>新密码</span>
                          <strong class:masked={!visibleHistoryIds.includes(history.id)}>
                            {visibleHistoryIds.includes(history.id) ? history.newPassword : maskPassword(history.newPassword)}
                          </strong>
                        {/if}
                      </div>
                      <span>{history.reason}</span>
                    </div>
                    <div class="history-actions">
                      <button class="icon-button inline" aria-label={visibleHistoryIds.includes(history.id) ? "隐藏旧密码" : "显示旧密码"} on:click={() => toggleHistoryPassword(history.id)}>
                        {#if visibleHistoryIds.includes(history.id)}
                          <EyeOff size={17} />
                        {:else}
                          <Eye size={17} />
                        {/if}
                      </button>
                      <button class="icon-button inline" aria-label="复制旧密码" on:click={() => copyText(history.password, "旧密码")}>
                        <Copy size={17} />
                      </button>
                    </div>
                    <time>{history.changedAt}</time>
                  </div>
                {/each}
              {/if}
            </section>
          {/if}

        </div>
        {:else}
          <div class="detail-topline">
            <div class="breadcrumb" aria-label="当前详情设备类型">
              <span class="device-type-badge"><ShieldCheck size={16} /></span>
              <span>设备详情</span>
            </div>
          </div>

          <div class="detail-empty-state">
            <span class="empty-state-icon"><Folder size={34} /></span>
            <h1>{hasDevices ? "没有找到设备" : "还没有设备"}</h1>
            <p>{hasDevices ? "当前搜索会匹配设备名和 IP。清空搜索后可以回到全部设备。" : "新增第一台设备后，账号、密码和历史记录会在这里集中管理。"}</p>
            <div class="empty-state-actions">
              {#if searchQuery.trim()}
                <button class="secondary-button" on:click={clearSearch}>清空搜索</button>
              {/if}
              <button class="primary-button" on:click={() => openAddDeviceDialog()}>新增设备</button>
            </div>
          </div>
        {/if}
      </section>
    </div>
  </section>

  {#if activePopover}
    <button class="menu-scrim" aria-label="关闭菜单" on:click={() => (activePopover = null)} on:contextmenu={handleMenuScrimContextMenu}></button>
    <div class="action-popover" role="menu" tabindex="-1" style={`top: ${popoverPosition.top}px; left: ${popoverPosition.left}px;`} on:contextmenu={(event) => event.preventDefault()}>
      {#if activePopover === "type-sort"}
        <h3>设备类型排序</h3>
        <button on:click={() => selectDeviceType("全部设备")}>全部设备置顶</button>
        <button on:click={() => { setSortMode("typeAsc"); activePopover = null; }}>按类型名称排序</button>
      {:else if activePopover === "device-sort"}
        <h3>设备排序</h3>
        <button class:selected={sortMode === "updatedDesc"} on:click={() => { setSortMode("updatedDesc"); activePopover = null; }}>最近更新优先</button>
        <button class:selected={sortMode === "nameAsc"} on:click={() => { setSortMode("nameAsc"); activePopover = null; }}>设备名称 A-Z</button>
        <button class:selected={sortMode === "typeAsc"} on:click={() => { setSortMode("typeAsc"); activePopover = null; }}>设备类型 A-Z</button>
      {:else if activePopover === "type-context"}
        <div class="context-menu-title">
          <strong>{contextDeviceType}</strong>
          <span>设备类型</span>
        </div>
        {#if contextDeviceType !== selectedDeviceType || searchQuery.trim()}
          <button class="menu-item" on:click={() => { selectDeviceType(contextDeviceType); activePopover = null; }}>
            <Search size={16} />
            <span>显示此类型</span>
          </button>
        {/if}
        {#if contextDeviceType !== "全部设备"}
          <div class="menu-separator"></div>
          <button class="menu-item" on:click={() => openEditTypeDialog(contextDeviceType)}>
            <Pencil size={16} />
            <span>编辑设备类型</span>
          </button>
          <button
            class="menu-item danger-menu-item"
            disabled={!canDeleteDeviceType(contextDeviceType)}
            title={getDeviceTypeCount(contextDeviceType) > 0 ? "该类型下还有设备，不能直接删除" : "删除设备类型"}
            on:click={() => requestDeleteDeviceType(contextDeviceType)}
          >
            <Trash2 size={16} />
            <span>删除设备类型</span>
          </button>
        {/if}
        <button class="menu-item" on:click={openAddTypeDialog}>
          <Plus size={16} />
          <span>新增设备类型</span>
        </button>
      {:else if activePopover === "type-blank-context"}
        <div class="context-menu-title">
          <strong>设备类型</strong>
          <span>管理分类</span>
        </div>
        <button class="menu-item" on:click={openAddTypeDialog}>
          <Plus size={16} />
          <span>新增设备类型</span>
        </button>
        <button class="menu-item" on:click={() => (activePopover = "type-sort")}>
          <ListFilter size={16} />
          <span>排序设备类型</span>
        </button>
      {:else if activePopover === "list-blank-context" || activePopover === "detail-blank-context"}
        <div class="context-menu-title">
          <strong>{activePopover === "detail-blank-context" ? "设备详情" : listContextLabel}</strong>
          <span>{activePopover === "detail-blank-context" ? "未选择设备" : "当前范围"}</span>
        </div>
        {#if searchQuery.trim()}
          <button class="menu-item" on:click={() => { clearSearch(); activePopover = null; }}>
            <Search size={16} />
            <span>清空搜索</span>
          </button>
        {/if}
        <button
          class="menu-item"
          disabled={deviceTypeOptions.length === 0}
          title={deviceTypeOptions.length === 0 ? "请先新增设备类型" : "新增设备"}
          on:click={() => openAddDeviceDialog(contextDeviceType)}
        >
          <Plus size={16} />
          <span>新增设备</span>
        </button>
        <button class="menu-item" on:click={openAddTypeDialog}>
          <Plus size={16} />
          <span>新增设备类型</span>
        </button>
        <div class="menu-separator"></div>
        <button class="menu-item" class:selected={sortMode === "updatedDesc"} on:click={() => { setSortMode("updatedDesc"); activePopover = null; }}>
          <ListFilter size={16} />
          <span>最近更新优先</span>
        </button>
        <button class="menu-item" class:selected={sortMode === "nameAsc"} on:click={() => { setSortMode("nameAsc"); activePopover = null; }}>
          <ListFilter size={16} />
          <span>设备名称 A-Z</span>
        </button>
        <button class="menu-item" class:selected={sortMode === "typeAsc"} on:click={() => { setSortMode("typeAsc"); activePopover = null; }}>
          <ListFilter size={16} />
          <span>设备类型 A-Z</span>
        </button>
      {:else if activePopover === "device-context"}
        <div class="context-menu-title">
          <strong>{selectedItem.deviceName}</strong>
          <span>{selectedItem.ipAddress ? `${selectedItem.deviceType} · ${selectedItem.ipAddress}` : selectedItem.deviceType}</span>
        </div>
        <button class="menu-item" on:click={openEditDeviceDialog}>
          <Pencil size={16} />
          <span>编辑设备信息</span>
        </button>
        <button class="menu-item" on:click={copySelectedDeviceInfo}>
          <Copy size={16} />
          <span>复制设备信息</span>
        </button>
        <div class="menu-separator"></div>
        <button class="menu-item danger-menu-item" on:click={requestDeleteSelectedDevice}>
          <Trash2 size={16} />
          <span>删除设备</span>
        </button>
      {:else if activePopover === "more"}
        <h3>更多操作</h3>
        <button on:click={openAddAccountDialog}>新增账号</button>
        <button on:click={openEditDeviceDialog}>编辑设备信息</button>
        <button on:click={openEditAccountDialog}>编辑当前账号</button>
        <button on:click={openPasswordDialog}>更新当前密码</button>
        <button on:click={requestDeleteSelectedAccount} disabled={selectedAccounts.length <= 1}>删除当前账号</button>
        <button on:click={() => { historyOpen = !historyOpen; activePopover = null; }}>{historyOpen ? "收起密码历史" : "展开密码历史"}</button>
        <button on:click={() => { historySortDesc = !historySortDesc; activePopover = null; }}>切换历史顺序</button>
        <button on:click={triggerImport}>导入 JSON 备份</button>
        <button on:click={exportData}>导出 JSON 备份</button>
        <button class="danger-menu-item" on:click={requestDeleteSelectedDevice}>删除当前设备</button>
      {/if}
    </div>
  {/if}

  {#if activeDialog}
    <div class="modal-backdrop">
      <div class="modal" class:type-modal={activeDialog === "type"} class:bulk-modal={activeDialog === "bulk-password"} role="dialog" aria-modal="true">
        <header class="modal-header">
          <h2>
            {#if activeDialog === "type"}
              {typeForm.originalLabel ? "编辑设备类型" : "新增设备类型"}
            {:else if activeDialog === "password"}
              更新密码
            {:else if activeDialog === "bulk-password"}
              批量修改密码
            {:else if activeDialog === "account"}
              {accountForm.id ? "编辑账号" : "新增账号"}
            {:else if deviceForm.id}
              编辑设备信息
            {:else}
              新增设备
            {/if}
          </h2>
          <button class="icon-button" aria-label="关闭弹窗" on:click={closeOverlays}><X size={20} /></button>
        </header>

        {#if activeDialog === "type"}
          <div class="type-editor-layout">
            <div class="type-preview-card">
              <span class={`type-icon type-${typeForm.color} type-preview-icon`}>{typeForm.iconText.trim() || typeForm.label.trim().slice(0, 1) || "类"}</span>
              <div>
                <strong>{typeForm.label.trim() || "设备类型"}</strong>
                <small>预览</small>
              </div>
            </div>
            <div class="type-editor-fields">
              <label>
                <span>类型名称</span>
                <input bind:value={typeForm.label} placeholder="例如：交换机" />
              </label>
              <label>
                <span>图标文字</span>
                <input bind:value={typeForm.iconText} placeholder="例如：交" maxlength="2" />
              </label>
            </div>
            <div class="form-control type-color-control">
              <span>颜色</span>
              <div class="color-swatch-grid" role="group" aria-label="设备类型颜色">
                {#each typeColorOptions as option}
                  <button
                    type="button"
                    class:selected={typeForm.color === option.value}
                    class="color-swatch-button"
                    aria-label={option.label}
                    on:click={() => (typeForm.color = option.value)}
                  >
                    <span class={`swatch-dot type-${option.value}`}></span>
                  </button>
                {/each}
              </div>
            </div>
          </div>
          <footer class="modal-actions">
            <button class="secondary-button" on:click={closeOverlays}>取消</button>
            <button class="primary-button" on:click={saveDeviceType}>{typeForm.originalLabel ? "保存修改" : "保存类型"}</button>
          </footer>
        {:else if activeDialog === "password"}
          <div class="form-grid">
            <section class="password-target-card wide-field" aria-label="当前更新账号">
              <span class={`type-icon ${selectedItem.iconClass}`}>{selectedItem.iconText}</span>
              <div>
                <strong>{selectedAccount.username || selectedAccount.title || "未填写用户名"}</strong>
                <span>{selectedItem.deviceName} · {selectedAccount.tag || selectedItem.deviceType}</span>
              </div>
            </section>
            <section class="password-change-card wide-field" aria-label="密码变更预览">
              <div>
                <span>旧密码</span>
                <strong>{selectedAccount.password || "未填写密码"}</strong>
              </div>
              <div>
                <span>新密码</span>
                <strong>{passwordForm.password || "待输入"}</strong>
              </div>
            </section>
            <label class="wide-field">
              <span>新密码</span>
              <input bind:value={passwordForm.password} />
            </label>
            <label class="wide-field">
              <span>更新原因</span>
              <input bind:value={passwordForm.reason} />
            </label>
            <button class="secondary-button wide-field" on:click={() => { openGeneratorPanel("current-account"); activeDialog = null; }}>使用生成器密码</button>
          </div>
          <footer class="modal-actions">
            <button class="secondary-button" on:click={closeOverlays}>取消</button>
            <button class="primary-button" on:click={savePasswordUpdate}>保存并保留旧密码</button>
          </footer>
        {:else if activeDialog === "bulk-password"}
          <div class="form-grid bulk-password-grid">
            <div class="form-control type-combo-field wide-field">
              <span>设备类型</span>
              <div class="type-combo">
                {#if selectedBulkTypeMeta}
                  <button
                    type="button"
                    class="type-combo-trigger"
                    aria-expanded={openTypePicker === "bulk"}
                    aria-controls="bulk-type-options"
                    on:click={() => toggleTypePicker("bulk")}
                  >
                    <span class={`type-combo-icon type-${selectedBulkTypeMeta.color}`}>{selectedBulkTypeMeta.iconText}</span>
                    <span class="type-combo-copy">
                      <strong>{selectedBulkTypeMeta.label}</strong>
                      <small>{selectedBulkTypeMeta.count} 个设备</small>
                    </span>
                    <ChevronDown size={18} />
                  </button>
                {/if}
                {#if openTypePicker === "bulk"}
                  <div class="type-combo-popover" id="bulk-type-options">
                    <div class="type-combo-search">
                      <Search size={15} />
                      <input bind:value={bulkTypeSearch} placeholder="搜索设备类型" aria-label="搜索批量改密设备类型" />
                    </div>
                    <div class="type-combo-list" role="listbox" aria-label="批量改密设备类型">
                      {#if filteredBulkTypeRows.length === 0}
                        <div class="type-combo-empty">没有匹配的设备类型</div>
                      {:else}
                        {#each filteredBulkTypeRows as type}
                          <button
                            type="button"
                            class:selected={bulkPasswordForm.deviceType === type.label}
                            role="option"
                            aria-selected={bulkPasswordForm.deviceType === type.label}
                            on:click={() => setBulkPasswordDeviceType(type.label)}
                          >
                            <span class={`type-combo-icon type-${type.color}`}>{type.iconText}</span>
                            <span class="type-combo-copy">
                              <strong>{type.label}</strong>
                              <small>{type.count} 个设备</small>
                            </span>
                          </button>
                        {/each}
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
            <label>
              <span>指定用户名</span>
              <input bind:value={bulkPasswordForm.username} placeholder="留空则更新全部账号" />
            </label>
            <label>
              <span>新密码</span>
              <input bind:value={bulkPasswordForm.password} />
            </label>
            <label class="wide-field">
              <span>更新原因</span>
              <input bind:value={bulkPasswordForm.reason} />
            </label>
            <button class="secondary-button wide-field" on:click={() => { openGeneratorPanel("bulk-password"); activeDialog = null; }}>使用生成器密码</button>

            <section class="bulk-preview wide-field" aria-label="批量修改命中账号">
              <div class="bulk-preview-head">
                <strong>命中 {bulkPasswordMatches.length} 个账号</strong>
                <span>{bulkPasswordForm.deviceType === "全部设备" ? "全部设备" : `类型：${bulkPasswordForm.deviceType}`} · {bulkPasswordForm.username.trim() ? `用户名：${bulkPasswordForm.username.trim()}` : "全部账号"}</span>
              </div>
              {#if bulkPasswordMatches.length === 0}
                <p class="quiet-text">没有匹配账号，换一个用户名或留空更新全部账号。</p>
              {:else}
                <div class="bulk-match-list">
                  {#each bulkPasswordPreview as match}
                    <div>
                      <strong>{match.deviceName}</strong>
                      <span>{match.username || "未填写用户名"} · {match.ipAddress || match.deviceType} · {match.tag || "账号"}</span>
                    </div>
                  {/each}
                </div>
                {#if bulkPasswordMatches.length > bulkPasswordPreview.length}
                  <p class="quiet-text">还有 {bulkPasswordMatches.length - bulkPasswordPreview.length} 个账号将在保存时一起更新。</p>
                {/if}
              {/if}
            </section>
          </div>
          <footer class="modal-actions">
            <button class="secondary-button" on:click={closeOverlays}>取消</button>
            <button class="primary-button" disabled={!bulkPasswordForm.password.trim() || bulkPasswordMatches.length === 0} on:click={saveBulkPasswordUpdate}>批量保存并保留旧密码</button>
          </footer>
        {:else if activeDialog === "account"}
          <div class="form-grid">
            <label>
              <span>用户名</span>
              <input bind:value={accountForm.username} />
            </label>
            <label>
              <span>密码</span>
              <input bind:value={accountForm.password} />
            </label>
            <label>
              <span>标签</span>
              <input bind:value={accountForm.tag} />
            </label>
            <label class="wide-field">
              <span>备注</span>
              <textarea bind:value={accountForm.notes}></textarea>
            </label>
          </div>
          <footer class="modal-actions">
            <button class="secondary-button" on:click={closeOverlays}>取消</button>
            <button class="primary-button" on:click={saveAccount}>{accountForm.id ? "保存账号" : "新增账号"}</button>
          </footer>
        {:else}
          <div class="form-grid">
            <label>
              <span>设备名称</span>
              <input bind:value={deviceForm.deviceName} />
            </label>
            <div class="form-control type-combo-field">
              <span>设备类型</span>
              {#if deviceTypeOptions.length === 0}
                <div class="type-combo-empty-state">请先新增设备类型</div>
              {:else}
                <div class="type-combo">
                  {#if selectedDeviceFormTypeMeta}
                    <button
                      type="button"
                      class="type-combo-trigger"
                      aria-expanded={openTypePicker === "device"}
                      aria-controls="device-type-options"
                      on:click={() => toggleTypePicker("device")}
                    >
                      <span class={`type-combo-icon type-${selectedDeviceFormTypeMeta.color}`}>{selectedDeviceFormTypeMeta.iconText}</span>
                      <span class="type-combo-copy">
                        <strong>{selectedDeviceFormTypeMeta.label || "选择设备类型"}</strong>
                      </span>
                      <ChevronDown size={18} />
                    </button>
                  {/if}
                  {#if openTypePicker === "device"}
                    <div class="type-combo-popover" id="device-type-options">
                      <div class="type-combo-search">
                        <Search size={15} />
                        <input bind:value={deviceTypeSearch} placeholder="搜索设备类型" aria-label="搜索设备类型" />
                      </div>
                      <div class="type-combo-list" role="listbox" aria-label="设备类型">
                        {#if filteredDeviceTypeOptions.length === 0}
                          <div class="type-combo-empty">没有匹配的设备类型</div>
                        {:else}
                          {#each filteredDeviceTypeOptions as type}
                            <button
                              type="button"
                              class:selected={deviceForm.deviceType === type.label}
                              role="option"
                              aria-selected={deviceForm.deviceType === type.label}
                              on:click={() => setDeviceFormType(type.label)}
                            >
                              <span class={`type-combo-icon type-${type.color}`}>{type.iconText}</span>
                              <span class="type-combo-copy">
                                <strong>{type.label}</strong>
                              </span>
                            </button>
                          {/each}
                        {/if}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
            <label>
              <span>IP 地址</span>
              <input bind:value={deviceForm.ipAddress} placeholder="例如：192.168.1.1" />
            </label>
            {#if !deviceForm.id}
              <label>
                <span>用户名</span>
                <input bind:value={deviceForm.username} />
              </label>
              <label>
                <span>密码</span>
                <input bind:value={deviceForm.password} />
              </label>
              <label>
                <span>标签</span>
                <input bind:value={deviceForm.tag} />
              </label>
              <label class="wide-field">
                <span>备注</span>
                <textarea bind:value={deviceForm.notes}></textarea>
              </label>
            {/if}
          </div>
          <footer class="modal-actions">
            <button class="secondary-button" on:click={closeOverlays}>取消</button>
            <button class="primary-button" disabled={!deviceForm.deviceName.trim() || !deviceForm.deviceType.trim()} on:click={saveDevice}>{deviceForm.id ? "保存设备" : "新增设备"}</button>
          </footer>
        {/if}
      </div>
    </div>
  {/if}

  {#if pendingConfirmation}
    <div class="modal-backdrop">
      <div class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <header class="modal-header">
          <h2 id="confirm-title">{pendingConfirmation.title}</h2>
          <button class="icon-button" aria-label="关闭弹窗" on:click={closeOverlays}><X size={20} /></button>
        </header>
        <div class="confirmation-body">
          <strong>{pendingConfirmation.message}</strong>
          <p>{pendingConfirmation.detail}</p>
        </div>
        <footer class="modal-actions">
          <button class="secondary-button" on:click={closeOverlays}>取消</button>
          <button class="danger-button" on:click={confirmPendingAction}>{pendingConfirmation.confirmLabel}</button>
        </footer>
      </div>
    </div>
  {/if}

  {#if generatorPanelOpen}
    <button class="drawer-scrim" aria-label="关闭随机密码生成器" on:click={() => closeGeneratorPanel(true)}></button>
    <aside class="generator-drawer" aria-label="随机密码生成器">
      <header class="drawer-header">
        <div>
          <span class="drawer-kicker">工具</span>
          <h2>随机密码生成器</h2>
        </div>
        <button class="icon-button" aria-label="关闭随机密码生成器" on:click={() => closeGeneratorPanel(true)}>
          <X size={21} />
        </button>
      </header>

      <div class="generator-result">
        <div>
          <span>生成结果</span>
          <code>{generatedPassword || "未选择可用字符"}</code>
        </div>
        <div class="result-actions">
          <button class="icon-button inline" aria-label="重新生成" on:click={generatePassword}>
            <RefreshCcw size={18} />
          </button>
          <button class="icon-button inline" aria-label="复制生成密码" disabled={!generatedPassword} on:click={() => copyText(generatedPassword, "生成密码")}>
            <Copy size={18} />
          </button>
        </div>
      </div>

      <div class="generator-note">
        <strong>{generatorStrengthLabel}</strong>
        <span>{generatorSummary}</span>
      </div>

      <div class="drawer-body">
        <section class="drawer-section">
          <div class="drawer-section-title">
            <Sparkles size={18} />
            <h3>常用预设</h3>
          </div>

          <div class="preset-grid" role="group" aria-label="密码生成预设">
            <button class:selected={generatorPreset === "balanced"} on:click={() => applyGeneratorPreset("balanced")}>
              <strong>日常</strong>
              <span>8 位，字母数字符号</span>
            </button>
            <button class:selected={generatorPreset === "readable"} on:click={() => applyGeneratorPreset("readable")}>
              <strong>易读</strong>
              <span>排除易混字符，无符号</span>
            </button>
            <button class:selected={generatorPreset === "strong"} on:click={() => applyGeneratorPreset("strong")}>
              <strong>高强度</strong>
              <span>24 位，更多数字符号</span>
            </button>
            <button class:selected={generatorPreset === "pin"} on:click={() => applyGeneratorPreset("pin")}>
              <strong>PIN</strong>
              <span>12 位纯数字</span>
            </button>
          </div>
        </section>

        <section class="drawer-section">
          <div class="drawer-section-title">
            <SlidersHorizontal size={18} />
            <h3>基础规则</h3>
          </div>

          <div class="quick-lengths" role="group" aria-label="常用密码长度">
            {#each [3, 8, 16, 24] as length}
              <button class:selected={generatorLength === length} on:click={() => setGeneratorLength(length)}>{length}</button>
            {/each}
          </div>

          <label class="range-control drawer-range">
            <span>长度</span>
            <input type="range" min="3" max="24" value={generatorLength} on:input={(event) => setGeneratorLength(Number((event.currentTarget as HTMLInputElement).value))} />
            <input
              class="length-input"
              type="number"
              min="3"
              max="24"
              bind:value={generatorLengthInput}
              aria-label="密码长度"
              on:input={(event) => handleGeneratorLengthInput((event.currentTarget as HTMLInputElement).value)}
              on:blur={commitGeneratorLengthInput}
              on:keydown={handleGeneratorLengthKeydown}
            />
          </label>

          <div class="stepper-grid">
            <label class="number-control">
              <span>最少数字</span>
              <input type="number" min="0" max={generatorLength} bind:value={minimumNumbers} disabled={!useNumbers} on:input={generatePassword} />
            </label>
            <label class="number-control">
              <span>最少符号</span>
              <input type="number" min="0" max={generatorLength} bind:value={minimumSymbols} disabled={!useSymbols} on:input={generatePassword} />
            </label>
          </div>
        </section>

        <section class="drawer-section">
          <div class="drawer-section-title">
            <Grid2X2 size={18} />
            <h3>使用哪些字符</h3>
          </div>

          <div class="switch-list">
            <label><input type="checkbox" bind:checked={useUpper} on:change={generatePassword} /> 大写字母 A-Z</label>
            <label><input type="checkbox" bind:checked={useLower} on:change={generatePassword} /> 小写字母 a-z</label>
            <label><input type="checkbox" bind:checked={useNumbers} on:change={generatePassword} /> 数字 0-9</label>
            <label><input type="checkbox" bind:checked={useSymbols} on:change={generatePassword} /> 符号</label>
          </div>

          <label class="text-control">
            <span>允许使用的符号</span>
            <input bind:value={allowedSymbols} disabled={!useSymbols} on:input={generatePassword} />
          </label>
        </section>

        <section class="drawer-section">
          <div class="drawer-section-title">
            <KeyRound size={18} />
            <h3>排除哪些字符</h3>
          </div>

          <div class="switch-list">
            <label><input type="checkbox" bind:checked={excludeSimilar} on:change={generatePassword} /> 排除易混字符 0 O 1 I l</label>
            <label><input type="checkbox" bind:checked={preventRepeats} on:change={generatePassword} /> 避免相邻重复字符</label>
          </div>

          <label class="text-control">
            <span>额外排除字符</span>
            <input bind:value={excludedCharacters} placeholder="例如：@ / \\ &quot; 空格" on:input={generatePassword} />
          </label>
        </section>
      </div>

      <footer class="drawer-footer">
        <button class="primary-button drawer-primary" on:click={generatePassword}>
          <RefreshCcw size={20} />
          <span>重新生成</span>
        </button>
        <button class="secondary-button" disabled={!generatedPassword || !selectedItem.id || !selectedAccount.id} on:click={useGeneratedPasswordForCurrentDevice}>
          <KeyRound size={18} />
          <span>用于当前账号</span>
        </button>
        <button class="secondary-button" disabled={!generatedPassword || items.length === 0} on:click={useGeneratedPasswordForBulkUpdate}>
          <KeyRound size={18} />
          <span>用于批量改密</span>
        </button>
        <button class="secondary-button" disabled={!generatedPassword} on:click={() => copyText(generatedPassword, "生成密码")}>
          <Copy size={18} />
          <span>复制</span>
        </button>
      </footer>
    </aside>
  {/if}

  {#if copyStatus}
    <div class="toast" role="status">
      <span>{copyStatus}</span>
      <button class="toast-close" aria-label="关闭提示" on:click={dismissStatus}>
        <X size={16} />
      </button>
    </div>
  {/if}
</main>
