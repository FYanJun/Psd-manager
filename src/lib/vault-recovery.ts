import type { ConfigData, ConfigDiffSummary, DeviceAccount, DeviceTypeMeta, PasswordHistory, VaultItem, VaultSnapshot } from "./types";
import { ConfigImportError } from "./config";
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

function canonicalHistory(history: PasswordHistory) {
  return JSON.stringify({
    password: history.password,
    newPassword: history.newPassword,
    changedAt: history.changedAt,
    reason: history.reason,
  });
}

function getEffectiveTypes(types: DeviceTypeMeta[], items: VaultItem[]) {
  const map = new Map<string, DeviceTypeMeta>();
  types.forEach((type) => {
    if (type.uuid) map.set(type.uuid, type);
  });
  items.forEach((item) => {
    const uuid = item.deviceTypeUuid.trim();
    if (!uuid || map.has(uuid)) return;
    map.set(uuid, {
      uuid,
      label: item.deviceType,
      iconText: item.iconText,
      color: "blue",
    });
  });
  return map;
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
): VaultSnapshot {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    reason,
    items: cloneValue(items),
    customDeviceTypes: cloneValue(customDeviceTypes),
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
  incoming: ConfigData,
): ConfigData {
  const incomingDevices = new Map(incoming.items.map((item) => [item.uuid, item]));
  const currentDeviceUuids = new Set(currentItems.map((item) => item.uuid));
  const currentAccountUuids = new Set(currentItems.flatMap((item) => getAccounts(item).map((account) => account.uuid)));
  const currentAccountOwners = new Map(currentItems.flatMap((item) =>
    getAccounts(item).map((account) => [account.uuid, { item, account }] as const)
  ));
  const currentHistoryOwners = new Map(currentItems.flatMap((item) =>
    getAccounts(item).flatMap((account) =>
      account.history.map((history) => [history.uuid, { item, account }] as const)
    )
  ));
  const currentTypesByUuid = getEffectiveTypes(currentTypes, currentItems);
  const incomingTypesByUuid = new Map(incoming.customDeviceTypes.map((type) => [type.uuid, type]));
  const currentTypeLabels = new Map<string, string>();
  currentTypesByUuid.forEach((type) => {
    const label = type.label.trim();
    if (label && !currentTypeLabels.has(label)) currentTypeLabels.set(label, type.uuid);
  });
  incoming.customDeviceTypes.forEach((type) => {
    const label = type.label.trim();
    const localType = currentTypesByUuid.get(type.uuid);
    if (localType && localType.label.trim() !== label) {
      throw new ConfigImportError(
        `设备类型 UUID ${type.uuid} 已对应名称“${localType.label}”，不能导入为“${type.label}”`,
      );
    }
    const existingUuid = currentTypeLabels.get(label);
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
    if (localType && localType.label.trim() !== item.deviceType.trim()) {
      throw new ConfigImportError(
        `设备“${item.deviceName}”的设备类型 UUID ${item.deviceTypeUuid} 与名称不匹配：本地为“${localType.label}”，导入为“${item.deviceType}”`,
      );
    }
    const key = `${item.deviceTypeUuid}\u0000${item.deviceName.trim()}`;
    const existingUuid = currentDeviceNames.get(key);
    if (localType && existingUuid && existingUuid !== item.uuid) {
      throw new ConfigImportError(`设备类型“${localType.label}”下的设备名称“${item.deviceName}”已被另一个 UUID 使用`);
    }
    getAccounts(item).forEach((account) => {
      const currentOwner = currentAccountOwners.get(account.uuid);
      if (currentOwner && currentOwner.item.uuid !== item.uuid) {
        throw new ConfigImportError(
          `账号 UUID ${account.uuid} 已属于设备“${currentOwner.item.deviceName}”，不能导入到设备“${item.deviceName}”`,
        );
      }
      account.history.forEach((history) => {
        const historyOwner = currentHistoryOwners.get(history.uuid);
        if (historyOwner && historyOwner.account.uuid !== account.uuid) {
          throw new ConfigImportError(
            `密码历史 UUID ${history.uuid} 已属于设备“${historyOwner.item.deviceName}”的账号“${historyOwner.account.username}”，不能导入到账号“${account.username}”`,
          );
        }
      });
    });
  });
  const mergedExistingItems = currentItems.map((item) => {
    const importedItem = incomingDevices.get(item.uuid);
    if (!importedItem) return item;
    const existingAccounts = getAccounts(item);
    const existingUsernames = new Map(existingAccounts.map((account) => [account.username.trim(), account.uuid]));
    const importedAccounts = getAccounts(importedItem);
    importedAccounts.forEach((account) => {
      const existingUuid = existingUsernames.get(account.username.trim());
      if (existingUuid && existingUuid !== account.uuid) {
        throw new ConfigImportError(`设备“${item.deviceName}”下的账号名“${account.username}”已被另一个 UUID 使用`);
      }
    });
    const mergedAccounts = existingAccounts.map((account) => {
      const importedAccount = importedAccounts.find((candidate) => candidate.uuid === account.uuid);
      if (!importedAccount) return account;
      const localHistoryByUuid = new Map(account.history.map((entry) => [entry.uuid, entry]));
      const missingHistory = importedAccount.history
        .filter((entry) => {
          const localEntry = localHistoryByUuid.get(entry.uuid);
          if (!localEntry) return true;
          if (canonicalHistory(localEntry) !== canonicalHistory(entry)) {
            throw new ConfigImportError(
              `密码历史 UUID ${entry.uuid} 在设备“${item.deviceName}”的账号“${account.username}”中内容不一致`,
            );
          }
          return false;
        })
        .map(cloneValue);
      return missingHistory.length > 0
        ? { ...account, history: [...account.history, ...missingHistory] }
        : account;
    });
    const missingAccounts = importedAccounts
      .filter((account) => !currentAccountUuids.has(account.uuid))
      .map(cloneValue);
    const hasMergedHistory = mergedAccounts.some((account, index) => account !== existingAccounts[index]);
    return missingAccounts.length > 0 || hasMergedHistory
      ? syncItemWithAccounts(item, [...mergedAccounts, ...missingAccounts])
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
    meta: cloneValue(incoming.meta),
  };
}

export function formatConfigDiffCount(added: number, removed: number, changed: number) {
  return `新增 ${added} / 删除 ${removed} / 修改 ${changed}`;
}
