import { VAULT_SCHEMA_VERSION } from "./constants";
import { isValidDeviceTypeColor } from "./input-validation";
import type { DeviceAccount, DeviceTypeMeta, PasswordHistory, PersistedVaultState, VaultItem, VaultSnapshot } from "./types";
import { isUuid } from "./uuid";

export class VaultSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultSchemaError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireRecord(value: unknown, path: string) {
  if (!isRecord(value)) throw new VaultSchemaError(`${path}必须是对象`);
  return value;
}

function requireArray(value: unknown, path: string) {
  if (!Array.isArray(value)) throw new VaultSchemaError(`${path}必须是数组`);
  return value;
}

function requireString(record: Record<string, unknown>, key: string, path: string) {
  if (typeof record[key] !== "string") throw new VaultSchemaError(`${path}.${key}必须是文本`);
  return record[key] as string;
}

function requireInteger(record: Record<string, unknown>, key: string, path: string, minimum = 0) {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new VaultSchemaError(`${path}.${key}必须是大于等于 ${minimum} 的安全整数`);
  }
  return value as number;
}

function requireUuid(record: Record<string, unknown>, key: string, path: string, usedUuids: Set<string>) {
  const uuid = requireString(record, key, path).trim().toLowerCase();
  if (!isUuid(uuid)) throw new VaultSchemaError(`${path}.${key}必须是有效 UUID`);
  if (usedUuids.has(uuid)) throw new VaultSchemaError(`${path}.${key}与其他记录重复`);
  usedUuids.add(uuid);
  return uuid;
}

function rejectField(record: Record<string, unknown>, key: string, path: string) {
  if (key in record) throw new VaultSchemaError(`${path}包含当前格式不支持的字段 ${key}`);
}

function validateHistory(value: unknown, path: string, usedUuids: Set<string>): PasswordHistory[] {
  const ids = new Set<number>();
  return requireArray(value, path).map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requireRecord(entry, entryPath);
    const id = requireInteger(record, "id", entryPath, 1);
    if (ids.has(id)) throw new VaultSchemaError(`${path}存在重复历史 ID ${id}`);
    ids.add(id);
    return {
      uuid: requireUuid(record, "uuid", entryPath, usedUuids),
      id,
      password: requireString(record, "password", entryPath),
      newPassword: requireString(record, "newPassword", entryPath),
      changedAt: requireString(record, "changedAt", entryPath),
      reason: requireString(record, "reason", entryPath),
    };
  });
}

function validateAccounts(
  value: unknown,
  path: string,
  accountUuids: Set<string>,
  historyUuids: Set<string>,
): DeviceAccount[] {
  const ids = new Set<number>();
  const usernames = new Set<string>();
  return requireArray(value, path).map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requireRecord(entry, entryPath);
    const id = requireInteger(record, "id", entryPath, 1);
    const username = requireString(record, "username", entryPath).trim();
    if (ids.has(id)) throw new VaultSchemaError(`${path}存在重复账号 ID ${id}`);
    if (!username) throw new VaultSchemaError(`${entryPath}.username不能为空`);
    if (usernames.has(username)) throw new VaultSchemaError(`${path}存在重复用户名“${username}”`);
    ids.add(id);
    usernames.add(username);
    return {
      uuid: requireUuid(record, "uuid", entryPath, accountUuids),
      id,
      title: requireString(record, "title", entryPath),
      username,
      password: requireString(record, "password", entryPath),
      tag: requireString(record, "tag", entryPath),
      notes: requireString(record, "notes", entryPath),
      updatedAt: requireString(record, "updatedAt", entryPath),
      passwordChangedAt: requireString(record, "passwordChangedAt", entryPath),
      history: validateHistory(record.history, `${entryPath}.history`, historyUuids),
    };
  });
}

function validateItems(
  value: unknown,
  path: string,
  deviceTypes: Map<string, DeviceTypeMeta>,
): VaultItem[] {
  const ids = new Set<number>();
  const names = new Set<string>();
  const deviceUuids = new Set<string>();
  const accountUuids = new Set<string>();
  const historyUuids = new Set<string>();
  return requireArray(value, path).map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requireRecord(entry, entryPath);
    rejectField(record, "ip", entryPath);
    const id = requireInteger(record, "id", entryPath, 1);
    const deviceName = requireString(record, "deviceName", entryPath).trim();
    const deviceType = requireString(record, "deviceType", entryPath).trim();
    if (ids.has(id)) throw new VaultSchemaError(`${path}存在重复设备 ID ${id}`);
    if (!deviceName) throw new VaultSchemaError(`${entryPath}.deviceName不能为空`);
    if (!deviceType) throw new VaultSchemaError(`${entryPath}.deviceType不能为空`);
    const nameKey = `${deviceType}\u0000${deviceName}`;
    if (names.has(nameKey)) throw new VaultSchemaError(`设备类型“${deviceType}”下存在重复设备“${deviceName}”`);
    ids.add(id);
    names.add(nameKey);
    const deviceTypeUuid = requireString(record, "deviceTypeUuid", entryPath).trim().toLowerCase();
    if (!isUuid(deviceTypeUuid)) throw new VaultSchemaError(`${entryPath}.deviceTypeUuid必须是有效 UUID`);
    if (deviceTypes.get(deviceType)?.uuid !== deviceTypeUuid) {
      throw new VaultSchemaError(`${entryPath}.deviceTypeUuid与设备类型“${deviceType}”不匹配`);
    }
    return {
      uuid: requireUuid(record, "uuid", entryPath, deviceUuids),
      id,
      title: requireString(record, "title", entryPath),
      deviceName,
      deviceType,
      deviceTypeUuid,
      assetCode: requireString(record, "assetCode", entryPath),
      location: requireString(record, "location", entryPath),
      username: requireString(record, "username", entryPath),
      password: requireString(record, "password", entryPath),
      ipAddress: requireString(record, "ipAddress", entryPath),
      tag: requireString(record, "tag", entryPath),
      iconText: requireString(record, "iconText", entryPath),
      iconClass: requireString(record, "iconClass", entryPath),
      updatedAt: requireString(record, "updatedAt", entryPath),
      notes: requireString(record, "notes", entryPath),
      history: validateHistory(record.history, `${entryPath}.history`, new Set<string>()),
      accounts: validateAccounts(record.accounts, `${entryPath}.accounts`, accountUuids, historyUuids),
    };
  });
}

function validateDeviceTypes(value: unknown, path: string): DeviceTypeMeta[] {
  const labels = new Set<string>();
  const uuids = new Set<string>();
  return requireArray(value, path).map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requireRecord(entry, entryPath);
    const label = requireString(record, "label", entryPath).trim();
    if (!label) throw new VaultSchemaError(`${entryPath}.label不能为空`);
    if (labels.has(label)) throw new VaultSchemaError(`${path}存在重复类型“${label}”`);
    const color = requireString(record, "color", entryPath).trim().toLowerCase();
    if (!isValidDeviceTypeColor(color)) throw new VaultSchemaError(`${entryPath}.color不是有效的设备类型颜色`);
    labels.add(label);
    return {
      uuid: requireUuid(record, "uuid", entryPath, uuids),
      label,
      iconText: requireString(record, "iconText", entryPath),
      color,
    };
  });
}

function validateSnapshots(value: unknown, path: string): VaultSnapshot[] {
  const ids = new Set<string>();
  return requireArray(value, path).map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requireRecord(entry, entryPath);
    const id = requireString(record, "id", entryPath);
    if (!id) throw new VaultSchemaError(`${entryPath}.id不能为空`);
    if (ids.has(id)) throw new VaultSchemaError(`${path}存在重复快照 ID`);
    ids.add(id);
    const customDeviceTypes = validateDeviceTypes(record.customDeviceTypes, `${entryPath}.customDeviceTypes`);
    const deviceTypes = new Map(customDeviceTypes.map((type) => [type.label, type]));
    return {
      id,
      createdAt: requireString(record, "createdAt", entryPath),
      reason: requireString(record, "reason", entryPath),
      items: validateItems(record.items, `${entryPath}.items`, deviceTypes),
      customDeviceTypes,
    };
  });
}

function validateCurrentState(value: unknown): PersistedVaultState {
  const record = requireRecord(value, "资产库");
  const schemaVersion = requireInteger(record, "schemaVersion", "资产库", 1);
  if (schemaVersion !== VAULT_SCHEMA_VERSION) throw new VaultSchemaError(`资产库数据版本应为 ${VAULT_SCHEMA_VERSION}`);
  rejectField(record, "paneLayout", "资产库");
  const customDeviceTypes = validateDeviceTypes(record.customDeviceTypes, "customDeviceTypes");
  const deviceTypes = new Map(customDeviceTypes.map((type) => [type.label, type]));
  const state: PersistedVaultState = {
    schemaVersion,
    revision: requireInteger(record, "revision", "资产库"),
    items: validateItems(record.items, "items", deviceTypes),
    customDeviceTypes,
    snapshots: validateSnapshots(record.snapshots, "snapshots").slice(0, 10),
  };
  return state;
}

export function parsePersistedVaultContent(content: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new VaultSchemaError("资产库内容不是合法 JSON");
  }
  return validateCurrentState(parsed);
}

export function validatePersistedVaultState(state: PersistedVaultState) {
  return validateCurrentState(state);
}
