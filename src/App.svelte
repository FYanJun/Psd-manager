<script lang="ts">
  import { invoke, isTauri } from "@tauri-apps/api/core";
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
  type ActiveDialog = "device" | "type" | "password" | "account" | null;
  type ActivePopover = "type-sort" | "device-sort" | "type-context" | "device-context" | "more" | null;
  type PopoverPosition = {
    top: number;
    left: number;
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

  const STORAGE_KEY = "device-password-manager-state-v1";

  const initialItems: VaultItem[] = [];

  const defaultDeviceTypeMeta: Array<DeviceTypeMeta & { label: "全部设备" | DeviceType }> = [
    { label: "全部设备", iconText: "全", color: "blue" },
    { label: "路由器", iconText: "路", color: "cyan" },
    { label: "NAS", iconText: "N", color: "rose" },
    { label: "服务器", iconText: "服", color: "indigo" },
    { label: "业务系统", iconText: "业", color: "sand" },
    { label: "网站账号", iconText: "网", color: "gold" },
    { label: "SSH 密钥", iconText: ">_", color: "dark" },
  ];
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
  let contextDeviceType: "全部设备" | DeviceType = "全部设备";
  let popoverPosition: PopoverPosition = { top: 72, left: 22 };
  let deviceForm: DeviceForm = createEmptyDeviceForm();
  let accountForm: AccountForm = createEmptyAccountForm();
  let typeForm: TypeForm = { originalLabel: null, label: "", iconText: "", color: "blue" };
  let passwordForm = { password: "", reason: "手动更新" };
  let selectedAccountId = 0;
  let passwordVisible = false;
  let historyOpen = true;
  let visibleHistoryIds: number[] = [];
  let generatorPanelOpen = false;
  let generatorPreset: GeneratorPreset = "balanced";
  let generatedPassword = "";
  let generatorLength = 20;
  let generatorLengthInput = "20";
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

  onMount(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.items)) items = normalizeVaultItems(parsed.items);
        if (Array.isArray(parsed.customDeviceTypes)) customDeviceTypes = parsed.customDeviceTypes;
        if (Array.isArray(parsed.hiddenDeviceTypes)) hiddenDeviceTypes = parsed.hiddenDeviceTypes;
      } catch {
        copyStatus = "本地数据读取失败，已使用默认数据";
      }
    }
    hydrated = true;
  });

  $: if (hydrated) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, customDeviceTypes, hiddenDeviceTypes }));
  }

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

  $: selectedAccounts = getAccounts(selectedItem);
  $: selectedAccount = selectedAccounts.find((account) => account.id === selectedAccountId) ?? selectedAccounts[0] ?? createBlankAccount();
  $: if (selectedAccounts.length > 0 && !selectedAccounts.some((account) => account.id === selectedAccountId)) {
    selectedAccountId = selectedAccounts[0].id;
  }
  $: passwordStrength = selectedAccount.password.length >= 14 ? "较强" : selectedAccount.password.length >= 10 ? "一般" : "较弱";
  $: selectedTypeDeviceCount = getDeviceTypeCount(selectedDeviceType);
  $: listContextLabel = searchQuery.trim() ? "搜索结果" : selectedDeviceType;
  $: listContextMeta = deviceTypeRows.find((type) => type.label === listContextLabel) ?? defaultDeviceTypeMeta[0];
  $: searchPlaceholder = searchQuery.trim() || selectedDeviceType === "全部设备" ? "在全部设备中搜索" : `在${selectedDeviceType}中搜索`;
  $: sortedHistory = [...selectedAccount.history].sort((left, right) =>
    historySortDesc ? right.id - left.id : left.id - right.id
  );
  $: deviceFormTypeMeta = getTypeMeta(deviceForm.deviceType);
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

  function matchesSearch(item: VaultItem, query: string) {
    const deviceName = normalizeSearchValue(item.deviceName);
    if (/^[a-z0-9]$/.test(query)) return deviceName.startsWith(query);
    return deviceName.includes(query);
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

  function openGeneratorPanel() {
    generatorPanelOpen = true;
    if (!generatedPassword) generatePassword();
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
      generatorLength = 28;
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
      generatorLength = 20;
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
    return Math.min(64, Math.max(8, Number.isFinite(length) ? Math.round(length) : 20));
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
    if (parsedLength >= 8 && parsedLength <= 64) {
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
    passwordForm = { password: generatedPassword, reason: "随机密码生成器" };
    generatorPanelOpen = false;
    activeDialog = "password";
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
      changedAt: readString(entry?.changedAt),
      reason: readString(entry?.reason, "手动更新"),
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
    const deviceType = readString(item.deviceType, "路由器") || "路由器";
    const fallback: VaultItem = {
      id: readNumber(item.id, index + 1),
      title: readString(item.title, "管理员账号") || "管理员账号",
      deviceName: readString(item.deviceName, readString(item.title, `设备 ${index + 1}`)) || `设备 ${index + 1}`,
      deviceType,
      username: readString(item.username),
      password: readString(item.password),
      website: readString(item.website),
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
    return `${selectedItem.deviceName}\n${account.username}\n${account.password}\n${account.website}`;
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
      deviceType: "路由器",
      username: "",
      password: "",
      website: "",
      tag: "",
      iconText: "?",
      iconClass: "icon-router",
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
      deviceType: "路由器",
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
    return deviceTypeOptions.find((type) => type.label === deviceType) ?? defaultDeviceTypeMeta[1];
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
    contextDeviceType = deviceType;
    activeDialog = null;
    popoverPosition = getPointerPopoverPosition(event);
    activePopover = "type-context";
  }

  function openDeviceContextMenu(item: VaultItem, event: MouseEvent) {
    event.preventDefault();
    if (item.id && selectedId !== item.id) selectDevice(item.id);
    contextDeviceType = item.deviceType;
    activeDialog = null;
    popoverPosition = getPointerPopoverPosition(event);
    activePopover = "device-context";
  }

  function openSelectedDeviceContextMenu(event: MouseEvent) {
    if (!selectedItem.id) return;
    if ((event.target as HTMLElement).closest("button, a, input, textarea, select, [role='button']")) {
      event.preventDefault();
      return;
    }
    openDeviceContextMenu(selectedItem, event);
  }

  function closeOverlays() {
    activePopover = null;
    activeDialog = null;
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
    deviceForm = createEmptyDeviceForm();
    if (deviceType !== "全部设备") deviceForm.deviceType = deviceType;
    activeDialog = "device";
  }

  function openEditDeviceDialog() {
    activePopover = null;
    deviceForm = {
      id: selectedItem.id,
      deviceName: selectedItem.deviceName,
      deviceType: selectedItem.deviceType,
      title: selectedAccount.title,
      username: selectedAccount.username,
      password: selectedAccount.password,
      website: selectedAccount.website,
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
    const now = new Date();
    const typeMeta = getTypeMeta(deviceForm.deviceType);
    const accountUpdatedAt = formatDateTime(now);
    const accountUsername = deviceForm.username.trim();
    const nextAccount: DeviceAccount = {
      id: deviceForm.id ? selectedAccount.id || 1 : 1,
      title: accountUsername || "未填写用户名",
      username: accountUsername,
      password: deviceForm.password,
      website: deviceForm.website.trim(),
      tag: deviceForm.tag.trim() || deviceForm.deviceType,
      notes: deviceForm.notes.trim(),
      updatedAt: accountUpdatedAt,
      history: deviceForm.id ? selectedAccount.history : [],
    };
    const nextItem: VaultItem = {
      id: deviceForm.id ?? Math.max(0, ...items.map((item) => item.id)) + 1,
      title: nextAccount.title,
      deviceName: name,
      deviceType: deviceForm.deviceType,
      username: nextAccount.username,
      password: nextAccount.password,
      website: nextAccount.website,
      tag: nextAccount.tag,
      iconText: typeMeta.iconText,
      iconClass: iconClassForType(deviceForm.deviceType),
      updatedAt: accountUpdatedAt,
      notes: nextAccount.notes,
      history: nextAccount.history,
      accounts: [nextAccount],
    };

    if (deviceForm.id) {
      const nextAccounts = selectedAccounts.map((account) =>
        account.id === selectedAccount.id ? { ...nextAccount, history: account.history } : account
      );
      items = items.map((item) =>
        item.id === deviceForm.id
          ? syncItemWithAccounts(
              {
                ...item,
                deviceName: nextItem.deviceName,
                deviceType: nextItem.deviceType,
                iconText: nextItem.iconText,
                iconClass: nextItem.iconClass,
              },
              nextAccounts.length > 0 ? nextAccounts : [nextAccount]
            )
          : item
      );
    } else {
      items = [nextItem, ...items];
    }
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
      website: selectedAccount.website || selectedItem.website,
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

  function openPasswordDialog() {
    activePopover = null;
    passwordForm = { password: generatedPassword || selectedAccount.password, reason: "手动更新" };
    activeDialog = "password";
  }

  function savePasswordUpdate() {
    if (!passwordForm.password) {
      copyStatus = "请输入新密码";
      return;
    }
    const now = new Date();
    const historyEntry: PasswordHistory = {
      id: Math.max(0, ...selectedAccount.history.map((entry) => entry.id)) + 1,
      password: selectedAccount.password,
      changedAt: formatDateTime(now),
      reason: passwordForm.reason.trim() || "手动更新",
    };
    const nextAccounts = selectedAccounts.map((account) =>
      account.id === selectedAccount.id
        ? {
            ...account,
            password: passwordForm.password,
            updatedAt: formatDateTime(now),
            history: account.password ? [historyEntry, ...account.history] : account.history,
          }
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
        const exported = await invoke<boolean>("export_backup", {
          contents: payload,
          suggestedFilename: filename,
        });
        copyStatus = exported ? "备份已导出" : "已取消导出";
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
        const content = await invoke<string | null>("import_backup");
        if (!content) {
          copyStatus = "已取消导入";
          return;
        }
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

<main class="app-shell">
  <input id="import-file" class="hidden-file-input" type="file" accept="application/json" on:change={importData} />
  <aside class="sidebar" aria-label="设备类型">
    <div class="pane-header sidebar-pane-header">
      <div>
        <span class="pane-kicker">设备库</span>
        <h2>设备类型</h2>
      </div>
      <div class="pane-actions">
        <button class="icon-button compact-action" aria-label="新增设备类型" on:click={openAddTypeDialog}><Plus size={18} /></button>
        <button class="icon-button compact-action" aria-label="编辑设备类型" disabled={selectedDeviceType === "全部设备"} on:click={openEditTypeDialog}><Pencil size={17} /></button>
        <button
          class="icon-button compact-action"
          aria-label="删除设备类型"
          disabled={!canDeleteDeviceType(selectedDeviceType)}
          title={selectedDeviceType === "全部设备" ? "全部设备不能删除" : selectedTypeDeviceCount > 0 ? "该类型下还有设备，不能直接删除" : "删除设备类型"}
          on:click={() => deleteDeviceType(selectedDeviceType)}
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

  <section class="workspace">
    <header class="topbar">
      <div class="history-buttons">
        <button class="icon-button" aria-label="后退" disabled={backStack.length === 0} on:click={goBack}><ChevronRight class="back-icon" size={24} /></button>
        <button class="icon-button" aria-label="前进" disabled={forwardStack.length === 0} on:click={goForward}><ChevronRight size={24} /></button>
      </div>

      <label class="search-box">
        <Search size={22} />
        <input value={searchQuery} on:input={updateSearch} placeholder={searchPlaceholder} aria-label="搜索项目" />
      </label>

      <button class="primary-button" on:click={() => openAddDeviceDialog()}>
        <Plus size={22} />
        <span>新增设备</span>
      </button>
      <button class="tool-button topbar-tool accent" on:click={openGeneratorPanel}>
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

        <div class="list-scroll">
          {#if filteredItems.length === 0}
            <div class="empty-list">
              <Folder size={24} />
              <span>没有匹配项目</span>
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
                  <small>{itemAccounts.length} 个账号 · {primaryAccount.username || "未填写用户名"} · {primaryAccount.website || "未填写地址"}</small>
                </span>
                {#if selectedDeviceType === "全部设备" || searchQuery.trim()}
                  <span class="item-type-pill">{item.deviceType}</span>
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      </section>

      <section class="detail-pane" aria-label="项目详情">
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
            <button class="tool-button" on:click={() => copyText(copyDeviceAccountInfo(), "账号信息")}>
              <Copy size={20} />
              <span>复制信息</span>
            </button>
            <button class="tool-button" on:click={openEditAccountDialog}>
              <Pencil size={20} />
              <span>编辑</span>
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
                <span>当前账号更新于 {selectedAccount.updatedAt}</span>
              </div>
            </div>
          </div>

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
                  <span>{account.website || account.tag || "未填写地址"}</span>
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

          <div class="single-field">
            <span class="field-label">网站</span>
            <a href={selectedAccount.website}>{selectedAccount.website}</a>
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
                      <strong class:masked={!visibleHistoryIds.includes(history.id)}>
                        {visibleHistoryIds.includes(history.id) ? history.password : maskPassword(history.password)}
                      </strong>
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
      </section>
    </div>
  </section>

  {#if activePopover}
    <button class="menu-scrim" aria-label="关闭菜单" on:click={() => (activePopover = null)} on:contextmenu={(event) => { event.preventDefault(); activePopover = null; }}></button>
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
        <button class="menu-item" on:click={() => openAddDeviceDialog(contextDeviceType)}>
          <Plus size={16} />
          <span>{contextDeviceType === "全部设备" ? "新增设备" : "新增此类型设备"}</span>
        </button>
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
            on:click={() => deleteDeviceType(contextDeviceType)}
          >
            <Trash2 size={16} />
            <span>删除设备类型</span>
          </button>
        {/if}
        <button class="menu-item" on:click={openAddTypeDialog}>
          <Plus size={16} />
          <span>新增设备类型</span>
        </button>
      {:else if activePopover === "device-context"}
        <div class="context-menu-title">
          <strong>{selectedItem.deviceName}</strong>
          <span>{selectedAccount.title} · {selectedItem.deviceType}</span>
        </div>
        <button class="menu-item" disabled={!selectedAccount.username} on:click={() => { copyText(selectedAccount.username, "用户名"); activePopover = null; }}>
          <UserRound size={16} />
          <span>复制用户名</span>
        </button>
        <button class="menu-item" disabled={!selectedAccount.password} on:click={() => { copyText(selectedAccount.password, "密码"); activePopover = null; }}>
          <KeyRound size={16} />
          <span>复制密码</span>
        </button>
        <button class="menu-item" on:click={() => { copyText(copyDeviceAccountInfo(), "账号信息"); activePopover = null; }}>
          <Copy size={16} />
          <span>复制账号信息</span>
        </button>
        <div class="menu-separator"></div>
        <button class="menu-item" on:click={openAddAccountDialog}>
          <Plus size={16} />
          <span>新增账号</span>
        </button>
        <button class="menu-item" on:click={openPasswordDialog}>
          <RefreshCcw size={16} />
          <span>更新密码</span>
        </button>
        <button class="menu-item" on:click={openEditAccountDialog}>
          <Pencil size={16} />
          <span>编辑账号</span>
        </button>
        <button class="menu-item danger-menu-item" disabled={selectedAccounts.length <= 1} on:click={deleteSelectedAccount}>
          <Trash2 size={16} />
          <span>删除账号</span>
        </button>
        <div class="menu-separator"></div>
        <button class="menu-item danger-menu-item" on:click={deleteSelectedDevice}>
          <Trash2 size={16} />
          <span>删除设备</span>
        </button>
      {:else if activePopover === "more"}
        <h3>更多操作</h3>
        <button on:click={openAddAccountDialog}>新增账号</button>
        <button on:click={openEditDeviceDialog}>编辑当前设备和账号</button>
        <button on:click={openEditAccountDialog}>编辑当前账号</button>
        <button on:click={openPasswordDialog}>更新当前密码</button>
        <button on:click={deleteSelectedAccount} disabled={selectedAccounts.length <= 1}>删除当前账号</button>
        <button on:click={() => { historyOpen = !historyOpen; activePopover = null; }}>{historyOpen ? "收起密码历史" : "展开密码历史"}</button>
        <button on:click={() => { historySortDesc = !historySortDesc; activePopover = null; }}>切换历史顺序</button>
        <button on:click={triggerImport}>导入 JSON 备份</button>
        <button on:click={exportData}>导出 JSON 备份</button>
        <button class="danger-menu-item" on:click={deleteSelectedDevice}>删除当前设备</button>
      {/if}
    </div>
  {/if}

  {#if activeDialog}
    <div class="modal-backdrop">
      <section class="modal" class:type-modal={activeDialog === "type"} role="dialog" aria-modal="true">
        <header class="modal-header">
          <h2>
            {#if activeDialog === "type"}
              {typeForm.originalLabel ? "编辑设备类型" : "新增设备类型"}
            {:else if activeDialog === "password"}
              更新密码
            {:else if activeDialog === "account"}
              {accountForm.id ? "编辑账号" : "新增账号"}
            {:else if deviceForm.id}
              编辑设备和账号
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
            <label class="wide-field">
              <span>新密码</span>
              <input bind:value={passwordForm.password} />
            </label>
            <label class="wide-field">
              <span>更新原因</span>
              <input bind:value={passwordForm.reason} />
            </label>
            <button class="secondary-button wide-field" on:click={() => { openGeneratorPanel(); activeDialog = null; }}>打开随机密码生成器</button>
          </div>
          <footer class="modal-actions">
            <button class="secondary-button" on:click={closeOverlays}>取消</button>
            <button class="primary-button" on:click={savePasswordUpdate}>保存并保留旧密码</button>
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
              <span>网站 / IP</span>
              <input bind:value={accountForm.website} />
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
            <label>
              <span>设备类型</span>
              <span class="select-shell">
                <span class={`select-icon type-${deviceFormTypeMeta.color}`}>{deviceFormTypeMeta.iconText}</span>
                <select bind:value={deviceForm.deviceType}>
                  {#each deviceTypeOptions as type}
                    <option value={type.label}>{type.label}</option>
                  {/each}
                </select>
                <ChevronDown class="select-chevron" size={18} />
              </span>
            </label>
            <label>
              <span>用户名</span>
              <input bind:value={deviceForm.username} />
            </label>
            <label>
              <span>密码</span>
              <input bind:value={deviceForm.password} />
            </label>
            <label>
              <span>网站 / IP</span>
              <input bind:value={deviceForm.website} />
            </label>
            <label>
              <span>标签</span>
              <input bind:value={deviceForm.tag} />
            </label>
            <label class="wide-field">
              <span>备注</span>
              <textarea bind:value={deviceForm.notes}></textarea>
            </label>
          </div>
          <footer class="modal-actions">
            <button class="secondary-button" on:click={closeOverlays}>取消</button>
            <button class="primary-button" on:click={saveDevice}>{deviceForm.id ? "保存修改" : "新增设备"}</button>
          </footer>
        {/if}
      </section>
    </div>
  {/if}

  {#if generatorPanelOpen}
    <button class="drawer-scrim" aria-label="关闭随机密码生成器" on:click={() => (generatorPanelOpen = false)}></button>
    <aside class="generator-drawer" aria-label="随机密码生成器">
      <header class="drawer-header">
        <div>
          <span class="drawer-kicker">工具</span>
          <h2>随机密码生成器</h2>
        </div>
        <button class="icon-button" aria-label="关闭随机密码生成器" on:click={() => (generatorPanelOpen = false)}>
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
              <span>20 位，字母数字符号</span>
            </button>
            <button class:selected={generatorPreset === "readable"} on:click={() => applyGeneratorPreset("readable")}>
              <strong>易读</strong>
              <span>排除易混字符，无符号</span>
            </button>
            <button class:selected={generatorPreset === "strong"} on:click={() => applyGeneratorPreset("strong")}>
              <strong>高强度</strong>
              <span>28 位，更多数字符号</span>
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
            {#each [16, 20, 24, 32] as length}
              <button class:selected={generatorLength === length} on:click={() => setGeneratorLength(length)}>{length}</button>
            {/each}
          </div>

          <label class="range-control drawer-range">
            <span>长度</span>
            <input type="range" min="8" max="64" value={generatorLength} on:input={(event) => setGeneratorLength(Number((event.currentTarget as HTMLInputElement).value))} />
            <input
              class="length-input"
              type="number"
              min="8"
              max="64"
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
        <button class="secondary-button" disabled={!generatedPassword} on:click={() => copyText(generatedPassword, "生成密码")}>
          <Copy size={18} />
          <span>复制</span>
        </button>
      </footer>
    </aside>
  {/if}

  {#if copyStatus}
    <div class="toast" role="status">{copyStatus}</div>
  {/if}
</main>
