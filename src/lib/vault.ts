import { DEFAULT_ACCOUNT_TAG, fallbackDeviceTypeMeta } from "./constants";
import type { AccountForm, DeviceAccount, DeviceForm, DeviceTypeMeta, PasswordHistory, VaultItem } from "./types";
import { formatDateTime, fuzzyContains, normalizeSearchValue, parseDateTimeValue, readNumber, readString } from "./utils";

export function iconClassForColor(color: string) {
  if (color === "cyan") return "icon-router";
  if (color === "rose") return "icon-rose";
  if (color === "indigo") return "icon-indigo";
  if (color === "sand") return "icon-sand";
  if (color === "gold") return "icon-gold";
  if (color === "dark") return "icon-terminal";
  return "icon-cyan";
}

export function iconClassForType(deviceType: string, deviceTypes: DeviceTypeMeta[]) {
  const meta = deviceTypes.find((type) => type.label === deviceType) ?? fallbackDeviceTypeMeta;
  return iconClassForColor(meta.color);
}

export function accountFromItem(item: VaultItem): DeviceAccount {
  return {
    id: 1,
    title: item.username || item.title || "未填写用户名",
    username: item.username,
    password: item.password,
    tag: item.tag,
    notes: item.notes,
    updatedAt: item.updatedAt,
    history: item.history ?? [],
  };
}

export function normalizeHistoryEntries(value: unknown): PasswordHistory[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => ({
    id: readNumber(entry?.id, index + 1),
    password: readString(entry?.password),
    newPassword: readString(entry?.newPassword),
    changedAt: readString(entry?.changedAt),
    reason: readString(entry?.reason),
  }));
}

export function normalizeAccount(value: unknown, fallback: VaultItem, index: number, inheritLegacyItemFields = false): DeviceAccount {
  const account = value as Partial<DeviceAccount>;
  const username = readString(account.username, fallback.username);
  const tagFallback = inheritLegacyItemFields ? fallback.tag : DEFAULT_ACCOUNT_TAG;
  return {
    id: readNumber(account.id, index + 1),
    title: username || readString(account.title, fallback.title || "未填写用户名") || "未填写用户名",
    username,
    password: readString(account.password, fallback.password),
    tag: readString(account.tag, tagFallback) || DEFAULT_ACCOUNT_TAG,
    notes: readString(account.notes, inheritLegacyItemFields ? fallback.notes : ""),
    updatedAt: readString(account.updatedAt, fallback.updatedAt),
    history: normalizeHistoryEntries(account.history ?? fallback.history),
  };
}

export function normalizeAccountIds(accounts: DeviceAccount[]) {
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

export function isBlankPlaceholderAccount(account: DeviceAccount) {
  return (
    !readString(account.username).trim() &&
    !account.password &&
    !readString(account.notes).trim() &&
    (account.history ?? []).length === 0 &&
    account.tag === DEFAULT_ACCOUNT_TAG &&
    (account.title === "未填写用户名" || account.title === "未选择账号")
  );
}

export function syncItemWithAccounts(item: VaultItem, accounts: DeviceAccount[]) {
  const primaryAccount = accounts[0];
  return {
    ...item,
    title: primaryAccount?.title ?? "",
    username: primaryAccount?.username ?? "",
    password: primaryAccount?.password ?? "",
    updatedAt: primaryAccount?.updatedAt ?? item.updatedAt,
    history: primaryAccount?.history ?? [],
    accounts,
  };
}

export function normalizeVaultItem(value: unknown, index: number): VaultItem {
  const item = value as Partial<VaultItem>;
  const deviceType = readString(item.deviceType);
  const hasExplicitAccounts = Array.isArray(item.accounts);
  const fallback: VaultItem = {
    id: readNumber(item.id, index + 1),
    title: readString(item.title, "管理员账号") || "管理员账号",
    deviceName: readString(item.deviceName, readString(item.title, `设备 ${index + 1}`)) || `设备 ${index + 1}`,
    deviceType,
    username: readString(item.username),
    password: readString(item.password),
    ipAddress: readString(item.ipAddress, readString((item as { ip?: unknown }).ip)),
    tag: readString(item.tag, DEFAULT_ACCOUNT_TAG) || DEFAULT_ACCOUNT_TAG,
    iconText: readString(item.iconText, fallbackDeviceTypeMeta.iconText),
    iconClass: readString(item.iconClass).trim() || iconClassForColor(fallbackDeviceTypeMeta.color),
    updatedAt: readString(item.updatedAt, formatDateTime(new Date())),
    notes: readString(item.notes),
    history: normalizeHistoryEntries(item.history),
    accounts: [],
  };
  const accountSource = hasExplicitAccounts ? item.accounts ?? [] : [item];
  const accounts = normalizeAccountIds(accountSource.map((account, accountIndex) => normalizeAccount(account, fallback, accountIndex, !hasExplicitAccounts)));
  const normalizedItem = syncItemWithAccounts(fallback, accounts);
  const primaryAccount = accounts[0];
  if (hasExplicitAccounts && primaryAccount?.tag && normalizedItem.tag === primaryAccount.tag) {
    return { ...normalizedItem, tag: normalizedItem.deviceType || DEFAULT_ACCOUNT_TAG };
  }
  return normalizedItem;
}

export function normalizeVaultItems(value: unknown) {
  if (!Array.isArray(value)) throw new Error("invalid config");
  return value.map((item, index) => normalizeVaultItem(item, index));
}

export function getAccounts(item: VaultItem) {
  if (Array.isArray(item.accounts)) return item.accounts.filter((account) => !isBlankPlaceholderAccount(account));
  return item.id ? [accountFromItem(item)].filter((account) => !isBlankPlaceholderAccount(account)) : [];
}

export function formatAccountTag(account: Pick<DeviceAccount, "tag">, deviceType = "", deviceTag = "") {
  const tag = account.tag.trim();
  if (!tag || tag === deviceType.trim() || tag === deviceTag.trim()) return DEFAULT_ACCOUNT_TAG;
  return tag;
}

export function getVaultItemUpdatedTimestamp(item: VaultItem) {
  return Math.max(parseDateTimeValue(item.updatedAt), ...getAccounts(item).map((account) => parseDateTimeValue(account.updatedAt)));
}

export function matchesVaultItemSearch(item: VaultItem, query: string) {
  const deviceName = normalizeSearchValue(item.deviceName);
  const ipAddress = normalizeSearchValue(item.ipAddress);
  return fuzzyContains(deviceName, query) || fuzzyContains(ipAddress, query);
}

export function createBlankItem(): VaultItem {
  return {
    id: 0,
    title: "未选择设备",
    deviceName: "未选择设备",
    deviceType: "",
    username: "",
    password: "",
    ipAddress: "",
    tag: DEFAULT_ACCOUNT_TAG,
    iconText: "?",
    iconClass: iconClassForColor(fallbackDeviceTypeMeta.color),
    updatedAt: formatDateTime(new Date()),
    notes: "",
    history: [],
    accounts: [],
  };
}

export function createBlankAccount(): DeviceAccount {
  return {
    id: 0,
    title: "未选择账号",
    username: "",
    password: "",
    tag: "",
    notes: "",
    updatedAt: formatDateTime(new Date()),
    history: [],
  };
}

export function createEmptyDeviceForm(): DeviceForm {
  return {
    id: null,
    deviceName: "",
    deviceType: "",
    username: "",
    password: "",
    ipAddress: "",
    notes: "",
  };
}

export function createEmptyAccountForm(): AccountForm {
  return {
    id: null,
    username: "",
    password: "",
    tag: DEFAULT_ACCOUNT_TAG,
    notes: "",
  };
}
