import { DEFAULT_ACCOUNT_TAG, fallbackDeviceTypeMeta } from "./constants";
import type { AccountForm, DeviceAccount, DeviceForm, DeviceTypeMeta, PasswordHistory, VaultItem } from "./types";
import { compactSearchValue, formatDateTime, normalizeSearchValue, parseDateTimeValue, readNumber, readString } from "./utils";
import { createUuid, isUuid, normalizeUuid } from "./uuid";
import { isHexColor } from "./color";

const updatedTimestampCache = new WeakMap<VaultItem, number>();
type SearchFields = {
  deviceName: string;
  ipAddress: string;
  assetCode: string;
  location: string;
  compactDeviceName: string;
  compactIpAddress: string;
  compactAssetCode: string;
  compactLocation: string;
};
const searchFieldsCache = new WeakMap<VaultItem, SearchFields>();

function uniqueUuid(value: unknown, usedUuids: Set<string>) {
  let uuid = normalizeUuid(value);
  while (usedUuids.has(uuid)) uuid = createUuid();
  usedUuids.add(uuid);
  return uuid;
}

export function iconClassForColor(color: string) {
  const normalizedColor = color.trim().toLowerCase();
  if (isHexColor(normalizedColor)) return `icon-custom icon-custom-${normalizedColor.slice(1)}`;
  if (normalizedColor === "cyan") return "icon-router";
  if (normalizedColor === "rose") return "icon-rose";
  if (normalizedColor === "indigo") return "icon-indigo";
  if (normalizedColor === "sand") return "icon-sand";
  if (normalizedColor === "gold") return "icon-gold";
  if (normalizedColor === "dark") return "icon-terminal";
  return "icon-cyan";
}

export function iconClassForType(deviceType: string, deviceTypes: DeviceTypeMeta[]) {
  const meta = deviceTypes.find((type) => type.label === deviceType) ?? fallbackDeviceTypeMeta;
  return iconClassForColor(meta.color);
}

export function normalizeHistoryEntries(value: unknown): PasswordHistory[] {
  if (!Array.isArray(value)) return [];
  const history = value.map((entry, index) => ({
    uuid: normalizeUuid(entry?.uuid),
    id: readNumber(entry?.id, index + 1),
    password: readString(entry?.password),
    newPassword: readString(entry?.newPassword),
    changedAt: readString(entry?.changedAt),
    reason: readString(entry?.reason),
  }));
  const usedIds = new Set<number>();
  const usedUuids = new Set<string>();
  let nextId = 1;
  return history.map((entry) => {
    let id = entry.id > 0 ? entry.id : nextId;
    while (usedIds.has(id)) id += 1;
    usedIds.add(id);
    nextId = Math.max(nextId, id + 1);
    return { ...entry, uuid: uniqueUuid(entry.uuid, usedUuids), id };
  });
}

export function normalizeAccount(value: unknown, index: number): DeviceAccount {
  const account = value as Partial<DeviceAccount>;
  const username = readString(account.username).trim();
  const history = normalizeHistoryEntries(account.history);
  const latestHistory = history.reduce<PasswordHistory | null>((latest, entry) => !latest || entry.id > latest.id ? entry : latest, null);
  const updatedAt = readString(account.updatedAt);
  const passwordChangedAt = readString(account.passwordChangedAt).trim() || latestHistory?.changedAt || updatedAt;
  return {
    uuid: normalizeUuid(account.uuid),
    id: readNumber(account.id, index + 1),
    title: username || readString(account.title, "未填写用户名") || "未填写用户名",
    username,
    password: readString(account.password),
    tag: readString(account.tag) || DEFAULT_ACCOUNT_TAG,
    notes: readString(account.notes),
    updatedAt,
    passwordChangedAt,
    history,
  };
}

export function normalizeAccountIds(accounts: DeviceAccount[]) {
  const usedIds = new Set<number>();
  const usedUuids = new Set<string>();
  let nextId = 1;
  return accounts.map((account) => {
    let id = account.id > 0 ? account.id : nextId;
    while (usedIds.has(id)) id += 1;
    usedIds.add(id);
    nextId = Math.max(nextId, id + 1);
    return { ...account, uuid: uniqueUuid(account.uuid, usedUuids), id };
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
    // Keep device metadata time independent from the primary account time.
    updatedAt: item.updatedAt || primaryAccount?.updatedAt || "",
    history: primaryAccount?.history ?? [],
    accounts,
  };
}

export function normalizeVaultItem(value: unknown, index: number): VaultItem {
  const item = value as Partial<VaultItem>;
  const deviceType = readString(item.deviceType);
  const fallback: VaultItem = {
    uuid: normalizeUuid(item.uuid),
    id: readNumber(item.id, index + 1),
    title: readString(item.title, "管理员账号") || "管理员账号",
    deviceName: readString(item.deviceName, readString(item.title, `设备 ${index + 1}`)) || `设备 ${index + 1}`,
    deviceType,
    deviceTypeUuid: readString(item.deviceTypeUuid),
    assetCode: readString(item.assetCode),
    location: readString(item.location),
    username: readString(item.username),
    password: readString(item.password),
    ipAddress: readString(item.ipAddress).trim(),
    tag: readString(item.tag, DEFAULT_ACCOUNT_TAG) || DEFAULT_ACCOUNT_TAG,
    iconText: readString(item.iconText, fallbackDeviceTypeMeta.iconText),
    iconClass: readString(item.iconClass).trim() || iconClassForColor(fallbackDeviceTypeMeta.color),
    updatedAt: readString(item.updatedAt, formatDateTime(new Date())),
    notes: readString(item.notes),
    history: normalizeHistoryEntries(item.history),
    accounts: [],
  };
  if (!Array.isArray(item.accounts)) throw new Error("设备账号字段必须是数组");
  const accounts = normalizeAccountIds(item.accounts.map((account, accountIndex) => normalizeAccount(account, accountIndex)));
  const normalizedItem = syncItemWithAccounts(fallback, accounts);
  const primaryAccount = accounts[0];
  if (primaryAccount?.tag && normalizedItem.tag === primaryAccount.tag) {
    return { ...normalizedItem, tag: normalizedItem.deviceType || DEFAULT_ACCOUNT_TAG };
  }
  return normalizedItem;
}

export function normalizeVaultItems(value: unknown) {
  if (!Array.isArray(value)) throw new Error("invalid config");
  const usedIds = new Set<number>();
  const usedDeviceUuids = new Set<string>();
  const usedAccountUuids = new Set<string>();
  const usedHistoryUuids = new Set<string>();
  let nextId = 1;
  return value.map((item, index) => {
    const normalized = normalizeVaultItem(item, index);
    let id = normalized.id > 0 ? normalized.id : nextId;
    while (usedIds.has(id)) id += 1;
    usedIds.add(id);
    nextId = Math.max(nextId, id + 1);
    const accounts = getAccounts(normalized).map((account) => ({
      ...account,
      uuid: uniqueUuid(account.uuid, usedAccountUuids),
      history: account.history.map((entry) => ({
        ...entry,
        uuid: uniqueUuid(entry.uuid, usedHistoryUuids),
      })),
    }));
    return syncItemWithAccounts({
      ...normalized,
      uuid: uniqueUuid(normalized.uuid, usedDeviceUuids),
      deviceTypeUuid: isUuid(normalized.deviceTypeUuid) ? normalized.deviceTypeUuid.toLowerCase() : "",
      id,
    }, accounts);
  });
}

export function getAccounts(item: VaultItem) {
  return item.accounts.filter((account) => !isBlankPlaceholderAccount(account));
}

export function formatAccountTag(account: Pick<DeviceAccount, "tag">, deviceType = "", deviceTag = "") {
  const tag = account.tag.trim();
  if (!tag || tag === deviceType.trim() || tag === deviceTag.trim()) return DEFAULT_ACCOUNT_TAG;
  return tag;
}

export function getVaultItemUpdatedTimestamp(item: VaultItem) {
  const cached = updatedTimestampCache.get(item);
  if (cached !== undefined) return cached;
  const timestamp = Math.max(parseDateTimeValue(item.updatedAt), ...getAccounts(item).map((account) => parseDateTimeValue(account.updatedAt)));
  updatedTimestampCache.set(item, timestamp);
  return timestamp;
}

function getSearchMatchStrength(source: string, compactSource: string, query: string, compactQuery: string) {
  if (!source || !query) return 0;
  if (source === query) return 4;
  if (source.startsWith(query)) return 3;
  if (source.includes(query)) return 2;
  return compactQuery && compactSource.includes(compactQuery) ? 1 : 0;
}

function getSearchFields(item: VaultItem): SearchFields {
  const cached = searchFieldsCache.get(item);
  if (cached) return cached;
  const fields = [item.deviceName, item.ipAddress, item.assetCode, item.location].map((value) => normalizeSearchValue(value));
  const [deviceName, ipAddress, assetCode, location] = fields;
  const searchFields = {
    deviceName,
    ipAddress,
    assetCode,
    location,
    compactDeviceName: compactSearchValue(deviceName),
    compactIpAddress: compactSearchValue(ipAddress),
    compactAssetCode: compactSearchValue(assetCode),
    compactLocation: compactSearchValue(location),
  };
  searchFieldsCache.set(item, searchFields);
  return searchFields;
}

export function getVaultItemSearchScore(item: VaultItem, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  const compactQuery = compactSearchValue(normalizedQuery);
  const fields = getSearchFields(item);
  const deviceNameStrength = getSearchMatchStrength(fields.deviceName, fields.compactDeviceName, normalizedQuery, compactQuery);
  if (deviceNameStrength) return 500 + deviceNameStrength;

  const ipAddressStrength = getSearchMatchStrength(fields.ipAddress, fields.compactIpAddress, normalizedQuery, compactQuery);
  const assetCodeStrength = getSearchMatchStrength(fields.assetCode, fields.compactAssetCode, normalizedQuery, compactQuery);
  const locationStrength = getSearchMatchStrength(fields.location, fields.compactLocation, normalizedQuery, compactQuery);
  return Math.max(
    ipAddressStrength ? ipAddressStrength * 100 + 3 : 0,
    assetCodeStrength ? assetCodeStrength * 100 + 2 : 0,
    locationStrength ? locationStrength * 100 + 1 : 0,
  );
}

export function createBlankItem(): VaultItem {
  return {
    uuid: "",
    id: 0,
    title: "未选择设备",
    deviceName: "未选择设备",
    deviceType: "",
    deviceTypeUuid: "",
    assetCode: "",
    location: "",
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
    uuid: "",
    id: 0,
    title: "未选择账号",
    username: "",
    password: "",
    tag: "",
    notes: "",
    updatedAt: formatDateTime(new Date()),
    passwordChangedAt: "",
    history: [],
  };
}

export function createEmptyDeviceForm(): DeviceForm {
  return {
    id: null,
    deviceName: "",
    deviceType: "",
    assetCode: "",
    location: "",
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
