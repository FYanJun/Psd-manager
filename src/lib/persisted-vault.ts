import { VAULT_SCHEMA_VERSION } from "./constants";
import {
  getTextInputValidationError,
  hasValidPersistedPassword,
  isValidConnectionAddress,
  isValidDeviceTypeColor,
  INPUT_LIMITS,
} from "./input-validation";
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

function requireText(
  record: Record<string, unknown>,
  key: string,
  path: string,
  maximum: number,
  allowLineBreaks = false,
) {
  const value = requireString(record, key, path);
  const error = getTextInputValidationError(value, maximum, allowLineBreaks);
  if (error) throw new VaultSchemaError(`${path}.${key}${error}`);
  return value;
}

function requirePassword(record: Record<string, unknown>, key: string, path: string) {
  const value = requireString(record, key, path);
  if (!hasValidPersistedPassword(value)) throw new VaultSchemaError(`${path}.${key}包含不可用字符或长度超出限制`);
  return value;
}

function requireConnectionAddress(record: Record<string, unknown>, key: string, path: string) {
  const value = requireString(record, key, path);
  if (!isValidConnectionAddress(value)) throw new VaultSchemaError(`${path}.${key}格式不正确`);
  return value;
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

function rejectUnknownFields(record: Record<string, unknown>, path: string, allowedFields: readonly string[]) {
  const allowed = new Set(allowedFields);
  const unsupported = Object.keys(record).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new VaultSchemaError(`${path}包含当前格式不支持的字段 ${unsupported.join("、")}`);
  }
}

function validateHistory(value: unknown, path: string, usedUuids: Set<string>): PasswordHistory[] {
  const ids = new Set<number>();
  return requireArray(value, path).map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requireRecord(entry, entryPath);
    rejectUnknownFields(record, entryPath, ["uuid", "id", "password", "newPassword", "changedAt", "reason"]);
    const id = requireInteger(record, "id", entryPath, 1);
    if (ids.has(id)) throw new VaultSchemaError(`${path}存在重复历史 ID ${id}`);
    ids.add(id);
    return {
      uuid: requireUuid(record, "uuid", entryPath, usedUuids),
      id,
      password: requirePassword(record, "password", entryPath),
      newPassword: requirePassword(record, "newPassword", entryPath),
      changedAt: requireText(record, "changedAt", entryPath, 64),
      reason: requireText(record, "reason", entryPath, INPUT_LIMITS.passwordReason),
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
    rejectUnknownFields(record, entryPath, [
      "uuid", "id", "title", "username", "password", "tag", "notes", "updatedAt", "passwordChangedAt", "history",
    ]);
    const id = requireInteger(record, "id", entryPath, 1);
    const username = requireText(record, "username", entryPath, INPUT_LIMITS.username).trim();
    if (ids.has(id)) throw new VaultSchemaError(`${path}存在重复账号 ID ${id}`);
    if (!username) throw new VaultSchemaError(`${entryPath}.username不能为空`);
    if (usernames.has(username)) throw new VaultSchemaError(`${path}存在重复用户名“${username}”`);
    ids.add(id);
    usernames.add(username);
    return {
      uuid: requireUuid(record, "uuid", entryPath, accountUuids),
      id,
      title: requireText(record, "title", entryPath, INPUT_LIMITS.username),
      username,
      password: requirePassword(record, "password", entryPath),
      tag: requireText(record, "tag", entryPath, INPUT_LIMITS.accountTag),
      notes: requireText(record, "notes", entryPath, INPUT_LIMITS.notes, true),
      updatedAt: requireText(record, "updatedAt", entryPath, 64),
      passwordChangedAt: requireText(record, "passwordChangedAt", entryPath, 64),
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
    rejectUnknownFields(record, entryPath, [
      "uuid", "id", "title", "deviceName", "deviceType", "deviceTypeUuid", "assetCode", "location", "username", "password",
      "ipAddress", "tag", "iconText", "iconClass", "updatedAt", "notes", "history", "accounts",
    ]);
    const id = requireInteger(record, "id", entryPath, 1);
    const deviceName = requireText(record, "deviceName", entryPath, INPUT_LIMITS.deviceName).trim();
    const deviceType = requireText(record, "deviceType", entryPath, INPUT_LIMITS.deviceTypeName).trim();
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
      title: requireText(record, "title", entryPath, INPUT_LIMITS.deviceName),
      deviceName,
      deviceType,
      deviceTypeUuid,
      assetCode: requireText(record, "assetCode", entryPath, INPUT_LIMITS.assetCode),
      location: requireText(record, "location", entryPath, INPUT_LIMITS.location),
      username: requireText(record, "username", entryPath, INPUT_LIMITS.username),
      password: requirePassword(record, "password", entryPath),
      ipAddress: requireConnectionAddress(record, "ipAddress", entryPath),
      tag: requireText(record, "tag", entryPath, INPUT_LIMITS.accountTag),
      iconText: requireText(record, "iconText", entryPath, INPUT_LIMITS.deviceTypeIcon),
      iconClass: requireText(record, "iconClass", entryPath, 64),
      updatedAt: requireText(record, "updatedAt", entryPath, 64),
      notes: requireText(record, "notes", entryPath, INPUT_LIMITS.notes, true),
      // The device-level history is a denormalized mirror of the primary
      // account history, so it intentionally has its own UUID scope.
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
    rejectUnknownFields(record, entryPath, ["uuid", "label", "iconText", "color"]);
    const label = requireText(record, "label", entryPath, INPUT_LIMITS.deviceTypeName).trim();
    if (!label) throw new VaultSchemaError(`${entryPath}.label不能为空`);
    if (labels.has(label)) throw new VaultSchemaError(`${path}存在重复类型“${label}”`);
    const color = requireString(record, "color", entryPath).trim().toLowerCase();
    if (!isValidDeviceTypeColor(color)) throw new VaultSchemaError(`${entryPath}.color不是有效的设备类型颜色`);
    labels.add(label);
    const iconText = requireText(record, "iconText", entryPath, INPUT_LIMITS.deviceTypeIcon);
    if (!iconText.trim()) throw new VaultSchemaError(`${entryPath}.iconText不能为空`);
    return {
      uuid: requireUuid(record, "uuid", entryPath, uuids),
      label,
      iconText,
      color,
    };
  });
}

function validateSnapshots(value: unknown, path: string): VaultSnapshot[] {
  const ids = new Set<string>();
  return requireArray(value, path).map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requireRecord(entry, entryPath);
    rejectUnknownFields(record, entryPath, ["id", "createdAt", "reason", "items", "customDeviceTypes"]);
    const id = requireText(record, "id", entryPath, 128);
    if (!id) throw new VaultSchemaError(`${entryPath}.id不能为空`);
    if (ids.has(id)) throw new VaultSchemaError(`${path}存在重复快照 ID`);
    ids.add(id);
    const customDeviceTypes = validateDeviceTypes(record.customDeviceTypes, `${entryPath}.customDeviceTypes`);
    const deviceTypes = new Map(customDeviceTypes.map((type) => [type.label, type]));
    return {
      id,
      createdAt: requireText(record, "createdAt", entryPath, 64),
      reason: requireText(record, "reason", entryPath, 200),
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
  rejectUnknownFields(record, "资产库", ["schemaVersion", "revision", "items", "customDeviceTypes", "snapshots"]);
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
