import type { ConfigData, ConfigDiffSummary, DeviceAccount, DeviceTypeMeta, VaultItem, VaultSnapshot } from "./types";
import { ConfigImportError, normalizeHiddenDeviceTypes } from "./config";
import { getAccounts, normalizeVaultItems, syncItemWithAccounts } from "./vault";

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deviceKey(item: Pick<VaultItem, "uuid">) {
  return item.uuid;
}

function accountKey(account: Pick<DeviceAccount, "uuid">) {
  return account.uuid;
}

function canonicalDevice(item: VaultItem) {
  return JSON.stringify({
    deviceName: item.deviceName,
    deviceType: item.deviceType,
    deviceTypeUuid: item.deviceTypeUuid,
    assetCode: item.assetCode,
    location: item.location,
    ipAddress: item.ipAddress,
    notes: item.notes,
    iconText: item.iconText,
    updatedAt: item.updatedAt,
  });
}

function canonicalAccount(account: DeviceAccount) {
  const history = account.history
    .map((entry) => ({
      uuid: entry.uuid,
      password: entry.password,
      newPassword: entry.newPassword,
      changedAt: entry.changedAt,
      reason: entry.reason,
    }))
    .sort((left, right) => left.uuid.localeCompare(right.uuid));
  return JSON.stringify({
    title: account.title,
    username: account.username,
    password: account.password,
    passwordChangedAt: account.passwordChangedAt,
    tag: account.tag,
    notes: account.notes,
    updatedAt: account.updatedAt,
    history,
  });
}

function typeMap(types: DeviceTypeMeta[], items: VaultItem[]) {
  const map = new Map<string, string>();
  types.forEach((type) => map.set(type.uuid, JSON.stringify({ label: type.label, iconText: type.iconText, color: type.color })));
  items.forEach((item) => {
    if (item.deviceTypeUuid && !map.has(item.deviceTypeUuid)) {
      map.set(item.deviceTypeUuid, JSON.stringify({ label: item.deviceType, iconText: item.iconText, color: "" }));
    }
  });
  return map;
}

function compareMaps(current: Map<string, string>, incoming: Map<string, string>) {
  let added = 0;
  let removed = 0;
  let changed = 0;
  incoming.forEach((value, key) => {
    if (!current.has(key)) added += 1;
    else if (current.get(key) !== value) changed += 1;
  });
  current.forEach((_value, key) => {
    if (!incoming.has(key)) removed += 1;
  });
  return { added, removed, changed };
}

export function createVaultSnapshot(
  reason: string,
  items: VaultItem[],
  customDeviceTypes: DeviceTypeMeta[],
  hiddenDeviceTypes: string[]
): VaultSnapshot {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    reason,
    items: cloneValue(items),
    customDeviceTypes: cloneValue(customDeviceTypes),
    hiddenDeviceTypes: cloneValue(hiddenDeviceTypes),
  };
}

export function getConfigDiffSummary(
  currentItems: VaultItem[],
  currentTypes: DeviceTypeMeta[],
  incoming: ConfigData
): ConfigDiffSummary {
  const currentDevices = new Map(currentItems.map((item) => [deviceKey(item), canonicalDevice(item)]));
  const incomingDevices = new Map(incoming.items.map((item) => [deviceKey(item), canonicalDevice(item)]));
  const currentAccounts = new Map(currentItems.flatMap((item) => getAccounts(item).map((account) => [accountKey(account), canonicalAccount(account)] as const)));
  const incomingAccounts = new Map(incoming.items.flatMap((item) => getAccounts(item).map((account) => [accountKey(account), canonicalAccount(account)] as const)));
  const devices = compareMaps(currentDevices, incomingDevices);
  const accounts = compareMaps(currentAccounts, incomingAccounts);
  const types = compareMaps(typeMap(currentTypes, currentItems), typeMap(incoming.customDeviceTypes, incoming.items));
  return {
    devicesAdded: devices.added,
    devicesRemoved: devices.removed,
    devicesChanged: devices.changed,
    accountsAdded: accounts.added,
    accountsRemoved: accounts.removed,
    accountsChanged: accounts.changed,
    typesAdded: types.added,
    typesRemoved: types.removed,
    typesChanged: types.changed,
  };
}

export function mergeMissingImportedConfig(
  currentItems: VaultItem[],
  currentTypes: DeviceTypeMeta[],
  currentHiddenTypes: string[],
  incoming: ConfigData,
): ConfigData {
  const incomingDevices = new Map(incoming.items.map((item) => [item.uuid, item]));
  const currentDeviceUuids = new Set(currentItems.map((item) => item.uuid));
  const currentAccountUuids = new Set(currentItems.flatMap((item) => getAccounts(item).map((account) => account.uuid)));
  const currentTypesByUuid = new Map(currentTypes.map((type) => [type.uuid, type]));
  const incomingTypesByUuid = new Map(incoming.customDeviceTypes.map((type) => [type.uuid, type]));
  const currentTypeLabels = new Map(currentTypes.map((type) => [type.label.trim(), type.uuid]));
  incoming.customDeviceTypes.forEach((type) => {
    const existingUuid = currentTypeLabels.get(type.label.trim());
    if (existingUuid && existingUuid !== type.uuid) {
      throw new ConfigImportError(`设备类型名称“${type.label}”已被另一个 UUID 使用`);
    }
  });
  const currentDeviceNames = new Map(currentItems.map((item) => [
    `${item.deviceTypeUuid}\u0000${item.deviceName.trim()}`,
    item.uuid,
  ]));
  incoming.items.forEach((item) => {
    const localType = currentTypesByUuid.get(item.deviceTypeUuid);
    const key = `${item.deviceTypeUuid}\u0000${item.deviceName.trim()}`;
    const existingUuid = currentDeviceNames.get(key);
    if (localType && existingUuid && existingUuid !== item.uuid) {
      throw new ConfigImportError(`设备类型“${localType.label}”下的设备名称“${item.deviceName}”已被另一个 UUID 使用`);
    }
  });
  const mergedExistingItems = currentItems.map((item) => {
    const importedItem = incomingDevices.get(item.uuid);
    if (!importedItem) return item;
    const existingAccounts = getAccounts(item);
    const existingUsernames = new Map(existingAccounts.map((account) => [account.username.trim(), account.uuid]));
    getAccounts(importedItem).forEach((account) => {
      const existingUuid = existingUsernames.get(account.username.trim());
      if (existingUuid && existingUuid !== account.uuid) {
        throw new ConfigImportError(`设备“${item.deviceName}”下的账号名“${account.username}”已被另一个 UUID 使用`);
      }
    });
    const missingAccounts = getAccounts(importedItem)
      .filter((account) => !currentAccountUuids.has(account.uuid))
      .map(cloneValue);
    return missingAccounts.length > 0
      ? syncItemWithAccounts(item, [...existingAccounts, ...missingAccounts])
      : item;
  });
  const missingItems = incoming.items
    .filter((item) => !currentDeviceUuids.has(item.uuid))
    .map((item) => {
      const type = currentTypesByUuid.get(item.deviceTypeUuid) ?? incomingTypesByUuid.get(item.deviceTypeUuid);
      const accounts = getAccounts(item).filter((account) => !currentAccountUuids.has(account.uuid));
      return syncItemWithAccounts({
        ...cloneValue(item),
        deviceType: type?.label ?? item.deviceType,
        iconText: type?.iconText ?? item.iconText,
      }, accounts.map(cloneValue));
    });
  const items = normalizeVaultItems([...mergedExistingItems, ...missingItems]);
  const existingTypeUuids = new Set([
    ...currentTypes.map((type) => type.uuid),
    ...currentItems.map((item) => item.deviceTypeUuid),
  ]);
  const customDeviceTypes = [
    ...currentTypes,
    ...incoming.customDeviceTypes
      .filter((type) => !existingTypeUuids.has(type.uuid))
      .map(cloneValue),
  ];
  return {
    items,
    customDeviceTypes,
    hiddenDeviceTypes: normalizeHiddenDeviceTypes(currentHiddenTypes, items),
    meta: cloneValue(incoming.meta),
  };
}

export function formatConfigDiffCount(added: number, removed: number, changed: number) {
  return `新增 ${added} / 删除 ${removed} / 修改 ${changed}`;
}
