import { VAULT_SCHEMA_VERSION } from "./constants";
import type { DeviceAccount, DeviceTypeMeta, PasswordHistory, PersistedVaultState, VaultItem, VaultSnapshot } from "./types";
import { normalizeVaultIdentityData } from "./config";
import { isUuid } from "./uuid";
import { getAccounts, syncItemWithAccounts } from "./vault";

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

function validateHistory(value: unknown, path: string, requireIdentity: boolean, usedUuids: Set<string>): PasswordHistory[] {
  const ids = new Set<number>();
  return requireArray(value, path).map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requireRecord(entry, entryPath);
    const id = requireInteger(record, "id", entryPath, 1);
    if (ids.has(id)) throw new VaultSchemaError(`${path}存在重复历史 ID ${id}`);
    ids.add(id);
    return {
      uuid: requireIdentity ? requireUuid(record, "uuid", entryPath, usedUuids) : "",
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
  requireIdentity: boolean,
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
      uuid: requireIdentity ? requireUuid(record, "uuid", entryPath, accountUuids) : "",
      id,
      title: requireString(record, "title", entryPath),
      username,
      password: requireString(record, "password", entryPath),
      tag: requireString(record, "tag", entryPath),
      notes: requireString(record, "notes", entryPath),
      updatedAt: requireString(record, "updatedAt", entryPath),
      passwordChangedAt: requireString(record, "passwordChangedAt", entryPath),
      history: validateHistory(record.history, `${entryPath}.history`, requireIdentity, historyUuids),
    };
  });
}

function validateItems(
  value: unknown,
  path: string,
  requireIdentity: boolean,
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
    const deviceTypeUuid = requireIdentity ? requireString(record, "deviceTypeUuid", entryPath).trim().toLowerCase() : "";
    if (requireIdentity && !isUuid(deviceTypeUuid)) throw new VaultSchemaError(`${entryPath}.deviceTypeUuid必须是有效 UUID`);
    if (requireIdentity && deviceTypes.get(deviceType)?.uuid !== deviceTypeUuid) {
      throw new VaultSchemaError(`${entryPath}.deviceTypeUuid与设备类型“${deviceType}”不匹配`);
    }
    return {
      uuid: requireIdentity ? requireUuid(record, "uuid", entryPath, deviceUuids) : "",
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
      // item.history mirrors the primary account history for legacy UI compatibility.
      history: validateHistory(record.history, `${entryPath}.history`, requireIdentity, new Set<string>()),
      accounts: validateAccounts(record.accounts, `${entryPath}.accounts`, requireIdentity, accountUuids, historyUuids),
    };
  });
}

function validateDeviceTypes(value: unknown, path: string, requireIdentity: boolean): DeviceTypeMeta[] {
  const labels = new Set<string>();
  const uuids = new Set<string>();
  return requireArray(value, path).map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requireRecord(entry, entryPath);
    const label = requireString(record, "label", entryPath).trim();
    if (!label) throw new VaultSchemaError(`${entryPath}.label不能为空`);
    if (labels.has(label)) throw new VaultSchemaError(`${path}存在重复类型“${label}”`);
    labels.add(label);
    return {
      uuid: requireIdentity ? requireUuid(record, "uuid", entryPath, uuids) : "",
      label,
      iconText: requireString(record, "iconText", entryPath),
      color: requireString(record, "color", entryPath),
    };
  });
}

function validateSnapshots(value: unknown, path: string, requireIdentity: boolean): VaultSnapshot[] {
  const ids = new Set<string>();
  return requireArray(value, path).map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requireRecord(entry, entryPath);
    const id = requireString(record, "id", entryPath);
    if (!id) throw new VaultSchemaError(`${entryPath}.id不能为空`);
    if (ids.has(id)) throw new VaultSchemaError(`${path}存在重复快照 ID`);
    ids.add(id);
    const customDeviceTypes = validateDeviceTypes(record.customDeviceTypes, `${entryPath}.customDeviceTypes`, requireIdentity);
    const deviceTypes = new Map(customDeviceTypes.map((type) => [type.label, type]));
    return {
      id,
      createdAt: requireString(record, "createdAt", entryPath),
      reason: requireString(record, "reason", entryPath),
      items: validateItems(record.items, `${entryPath}.items`, requireIdentity, deviceTypes),
      customDeviceTypes,
    };
  });
}

function validatePaneLayout(value: unknown) {
  const record = requireRecord(value, "paneLayout");
  const result: PersistedVaultState["paneLayout"] = {};
  for (const key of ["sidebarRatio", "listRatio", "generatorRatio"] as const) {
    if (record[key] === undefined) continue;
    if (typeof record[key] !== "number" || !Number.isFinite(record[key])) {
      throw new VaultSchemaError(`paneLayout.${key}必须是数字`);
    }
    result[key] = record[key] as number;
  }
  return result;
}

function validateVersionedState(value: unknown, expectedVersion: number): PersistedVaultState {
  const record = requireRecord(value, "资产库");
  const schemaVersion = requireInteger(record, "schemaVersion", "资产库", 1);
  if (schemaVersion !== expectedVersion) throw new VaultSchemaError(`资产库数据版本应为 ${expectedVersion}`);
  const requireIdentity = expectedVersion >= 2;
  const customDeviceTypes = validateDeviceTypes(record.customDeviceTypes, "customDeviceTypes", requireIdentity);
  const deviceTypes = new Map(customDeviceTypes.map((type) => [type.label, type]));
  const paneLayout = isRecord(record.paneLayout) ? validatePaneLayout(record.paneLayout) : undefined;
  const state: PersistedVaultState = {
    schemaVersion,
    revision: requireInteger(record, "revision", "资产库"),
    items: validateItems(record.items, "items", requireIdentity, deviceTypes),
    customDeviceTypes,
    snapshots: validateSnapshots(record.snapshots, "snapshots", requireIdentity).slice(0, 10),
  };
  if (paneLayout) state.paneLayout = paneLayout;
  return state;
}

type LegacyIdentityRegistry = {
  typeUuids: Map<string, string>;
  deviceUuids: Map<number, string>;
  accountUuids: Map<string, string>;
  historyUuids: Map<string, string>;
};

function createLegacyIdentityRegistry(): LegacyIdentityRegistry {
  return {
    typeUuids: new Map(),
    deviceUuids: new Map(),
    accountUuids: new Map(),
    historyUuids: new Map(),
  };
}

function normalizeLegacyIdentityData(itemsValue: unknown, typesValue: unknown, registry: LegacyIdentityRegistry) {
  const normalized = normalizeVaultIdentityData(itemsValue, typesValue);
  const customDeviceTypes = normalized.customDeviceTypes.map((type) => {
    const uuid = registry.typeUuids.get(type.label) ?? type.uuid;
    registry.typeUuids.set(type.label, uuid);
    return { ...type, uuid };
  });
  const typesByLabel = new Map(customDeviceTypes.map((type) => [type.label, type]));
  const items = normalized.items.map((item) => {
    const deviceUuid = registry.deviceUuids.get(item.id) ?? item.uuid;
    registry.deviceUuids.set(item.id, deviceUuid);
    const accounts = getAccounts(item).map((account) => {
      const accountKey = `${deviceUuid}:${account.id}`;
      const accountUuid = registry.accountUuids.get(accountKey) ?? account.uuid;
      registry.accountUuids.set(accountKey, accountUuid);
      const history = account.history.map((entry) => {
        const historyKey = `${accountUuid}:${entry.id}`;
        const uuid = registry.historyUuids.get(historyKey) ?? entry.uuid;
        registry.historyUuids.set(historyKey, uuid);
        return { ...entry, uuid };
      });
      return { ...account, uuid: accountUuid, history };
    });
    const type = typesByLabel.get(item.deviceType);
    return syncItemWithAccounts({
      ...item,
      uuid: deviceUuid,
      deviceTypeUuid: type?.uuid ?? item.deviceTypeUuid,
    }, accounts);
  });
  return { items, customDeviceTypes };
}

function migrateLegacySnapshot(value: unknown, index: number, registry: LegacyIdentityRegistry): VaultSnapshot {
  const record = requireRecord(value, `snapshots[${index}]`);
  const normalized = normalizeLegacyIdentityData(record.items, record.customDeviceTypes, registry);
  return {
    id: typeof record.id === "string" && record.id ? record.id : `legacy-${index + 1}`,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    reason: typeof record.reason === "string" ? record.reason : "旧版数据快照",
    items: normalized.items,
    customDeviceTypes: normalized.customDeviceTypes,
  };
}

function migrateLegacyState(value: Record<string, unknown>): PersistedVaultState {
  const registry = createLegacyIdentityRegistry();
  const normalized = normalizeLegacyIdentityData(requireArray(value.items, "items"), value.customDeviceTypes, registry);
  const paneLayout = isRecord(value.paneLayout) ? validatePaneLayout(value.paneLayout) : {};
  const snapshots = value.snapshots === undefined
    ? []
    : requireArray(value.snapshots, "snapshots")
      .map((snapshot, index) => migrateLegacySnapshot(snapshot, index, registry))
      .slice(0, 10);
  return validateVersionedState({
    schemaVersion: VAULT_SCHEMA_VERSION,
    revision: Number.isSafeInteger(value.revision) ? value.revision : 0,
    items: normalized.items,
    customDeviceTypes: normalized.customDeviceTypes,
    paneLayout,
    snapshots,
  }, VAULT_SCHEMA_VERSION);
}

export function parsePersistedVaultContent(content: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new VaultSchemaError("资产库内容不是合法 JSON");
  }
  const record = requireRecord(parsed, "资产库");
  if (record.schemaVersion === undefined) {
    return { state: migrateLegacyState(record), migrated: true };
  }
  if (record.schemaVersion === 1) {
    const legacy = validateVersionedState(record, 1);
    return { state: migrateLegacyState(legacy as unknown as Record<string, unknown>), migrated: true };
  }
  if (record.schemaVersion !== VAULT_SCHEMA_VERSION) {
    throw new VaultSchemaError(`不支持资产库数据版本 ${String(record.schemaVersion)}，当前仅支持 ${VAULT_SCHEMA_VERSION}`);
  }
  return { state: validateVersionedState(record, VAULT_SCHEMA_VERSION), migrated: false };
}

export function validatePersistedVaultState(state: PersistedVaultState) {
  return validateVersionedState(state, VAULT_SCHEMA_VERSION);
}
