import { APP_TITLE, CONFIG_FORMAT_VERSION, DEFAULT_ACCOUNT_TAG } from "./constants";
import type { ConfigData, ConfigSummary, ConfigFormat, DeviceAccount, DeviceTypeMeta, PasswordHistory, VaultItem } from "./types";
import { getAccounts, normalizeVaultItems } from "./vault";
import { formatDateTime, padDatePart, readNumber, readString } from "./utils";
import { createUuid, isUuid } from "./uuid";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const CSV_HEADERS = [
  "设备类型UUID",
  "设备类型",
  "类型图标",
  "类型颜色",
  "设备UUID",
  "设备名称",
  "资产编号",
  "设备位置",
  "设备信息",
  "设备备注",
  "设备图标",
  "设备更新时间",
  "账号UUID",
  "用户名",
  "账号标签",
  "密码",
  "账号备注",
  "账号更新时间",
  "密码更新时间",
  "密码历史",
];

const configFormats: ConfigFormat[] = ["json", "csv", "yaml"];

export class ConfigImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigImportError";
  }
}

export function createConfigMeta() {
  return {
    appName: APP_TITLE,
    formatVersion: CONFIG_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
  };
}

export function createConfigPayload(items: VaultItem[], customDeviceTypes: DeviceTypeMeta[], hiddenDeviceTypes: string[], format: ConfigFormat) {
  const config = createConfigData(items, customDeviceTypes, hiddenDeviceTypes);
  if (format === "csv") return createCsvConfigPayload(config);
  if (format === "yaml") return createYamlConfigPayload(config);
  return JSON.stringify(createJsonConfigPayload(config), null, 2);
}

export function createConfigFilename(format: ConfigFormat) {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate()),
    padDatePart(now.getHours()),
    padDatePart(now.getMinutes()),
  ].join("-");
  return `密码管理器配置-${timestamp}.${format}`;
}

export function parseConfigContent(content: string, format: ConfigFormat): ConfigData {
  const config = format === "csv"
    ? parseCsvConfigContent(content)
    : format === "yaml"
      ? parseYamlConfigContent(content)
      : parseJsonConfigContent(content);
  if (!Number.isSafeInteger(config.meta.formatVersion) || config.meta.formatVersion < 1) {
    throw new ConfigImportError("配置格式版本无效");
  }
  if (config.meta.formatVersion > CONFIG_FORMAT_VERSION) {
    throw new ConfigImportError(`不支持配置格式 v${config.meta.formatVersion}，当前最高支持 v${CONFIG_FORMAT_VERSION}`);
  }
  assertValidConfigNames(config.items);
  assertValidConfigIdentities(config);
  return config;
}

export function parseConfigContentWithFallback(content: string, preferredFormat: ConfigFormat): { config: ConfigData; format: ConfigFormat } {
  const formats = [preferredFormat, ...configFormats.filter((format) => format !== preferredFormat)];
  let firstError: unknown = null;
  let configImportError: ConfigImportError | null = null;

  for (const format of formats) {
    try {
      return { config: parseConfigContent(content, format), format };
    } catch (error) {
      firstError ??= error;
      if (error instanceof ConfigImportError) configImportError ??= error;
    }
  }

  throw configImportError ?? firstError ?? new Error("invalid config");
}

export function inferConfigFormat(pathOrName: string): ConfigFormat {
  const normalized = pathOrName.toLowerCase();
  if (normalized.endsWith(".csv")) return "csv";
  if (normalized.endsWith(".yaml") || normalized.endsWith(".yml")) return "yaml";
  return "json";
}

export function getConfigMimeType(format: ConfigFormat) {
  if (format === "csv") return "text/csv;charset=utf-8";
  if (format === "yaml") return "application/yaml;charset=utf-8";
  return "application/json";
}

export function formatConfigExportedAt(value: string) {
  if (!value) return "";
  const exportedAt = new Date(value);
  if (Number.isNaN(exportedAt.getTime())) return "";
  return formatDateTime(exportedAt);
}

export function normalizeDeviceTypeMetaList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const usedLabels = new Set<string>();
  const usedUuids = new Set<string>();
  return value.reduce<DeviceTypeMeta[]>((types, type) => {
    if (type && typeof type === "object") {
      const record = type as Partial<DeviceTypeMeta> & Record<string, unknown>;
      const label = readString(record.label, readString(record["设备类型"])).trim();
      if (!label || usedLabels.has(label)) return types;
      usedLabels.add(label);
      let uuid = readString(record.uuid, readString(record["设备类型UUID"])).trim().toLowerCase();
      if (!isUuid(uuid) || usedUuids.has(uuid)) uuid = createUuid();
      usedUuids.add(uuid);
      types.push({
        uuid,
        label,
        iconText: readString(record.iconText, readString(record["图标文字"], label.slice(0, 1))).trim() || label.slice(0, 1),
        color: readString(record.color, readString(record["颜色"], "blue")),
      });
    }
    return types;
  }, []);
}

export function normalizeVaultIdentityData(itemsValue: unknown, typesValue: unknown) {
  const items = normalizeVaultItems(itemsValue);
  const customDeviceTypes = normalizeDeviceTypeMetaList(typesValue);
  const typesByLabel = new Map(customDeviceTypes.map((type) => [type.label.trim(), type]));

  items.forEach((item) => {
    const label = item.deviceType.trim();
    if (!label || typesByLabel.has(label)) return;
    const type: DeviceTypeMeta = {
      uuid: isUuid(item.deviceTypeUuid) ? item.deviceTypeUuid.toLowerCase() : createUuid(),
      label,
      iconText: item.iconText.trim() || label.slice(0, 1),
      color: "blue",
    };
    customDeviceTypes.push(type);
    typesByLabel.set(label, type);
  });

  return {
    items: items.map((item) => ({
      ...item,
      deviceTypeUuid: typesByLabel.get(item.deviceType.trim())?.uuid ?? item.deviceTypeUuid,
    })),
    customDeviceTypes,
  };
}

export function normalizeHiddenDeviceTypes(value: unknown, protectedItems: VaultItem[] = []) {
  if (!Array.isArray(value)) return [];
  const protectedLabels = new Set(protectedItems.map((item) => item.deviceType.trim()).filter(Boolean));
  return Array.from(new Set(value.map((type) => readString(type).trim())))
    .filter((type) => Boolean(type) && type !== "全部设备" && !protectedLabels.has(type));
}

export function getConfigSummary(config: ConfigData): ConfigSummary {
  const accountCount = config.items.reduce((count, item) => count + getAccounts(item).length, 0);
  const historyCount = config.items.reduce(
    (count, item) => count + getAccounts(item).reduce((total, account) => total + account.history.length, 0),
    0
  );
  const itemTypeLabels = config.items.map((item) => item.deviceType.trim()).filter(Boolean);
  const customTypeLabels = config.customDeviceTypes.map((type) => type.label.trim()).filter(Boolean);
  return {
    itemCount: config.items.length,
    accountCount,
    historyCount,
    typeCount: new Set([...itemTypeLabels, ...customTypeLabels]).size,
    exportedAtText: formatConfigExportedAt(config.meta.exportedAt),
    formatVersion: config.meta.formatVersion,
  };
}

export function formatConfigSummary(summary: ConfigSummary) {
  return [
    { label: "设备", value: `${summary.itemCount} 台` },
    { label: "账号", value: `${summary.accountCount} 个` },
    { label: "历史", value: `${summary.historyCount} 条` },
    { label: "类型", value: `${summary.typeCount} 个` },
    { label: "格式", value: `v${summary.formatVersion}` },
    { label: "导出时间", value: summary.exportedAtText || "未记录" },
  ];
}

function createConfigData(items: VaultItem[], customDeviceTypes: DeviceTypeMeta[], hiddenDeviceTypes: string[]): ConfigData {
  const normalized = normalizeVaultIdentityData(items, customDeviceTypes);
  return {
    meta: createConfigMeta(),
    items: normalized.items,
    customDeviceTypes: normalized.customDeviceTypes,
    hiddenDeviceTypes,
  };
}

function assertValidConfigNames(items: VaultItem[]) {
  const deviceKeys = new Set<string>();
  items.forEach((item, itemIndex) => {
    const deviceName = item.deviceName.trim();
    const deviceType = item.deviceType.trim();
    if (!deviceName) throw new ConfigImportError(`第 ${itemIndex + 1} 台设备缺少设备名称`);
    if (!deviceType) throw new ConfigImportError(`设备“${deviceName}”缺少设备类型`);

    const deviceKey = `${deviceType}\u0000${deviceName}`;
    if (deviceKeys.has(deviceKey)) {
      throw new ConfigImportError(`设备类型“${deviceType}”下存在重复设备“${deviceName}”`);
    }
    deviceKeys.add(deviceKey);

    const accountNames = new Set<string>();
    getAccounts(item).forEach((account, accountIndex) => {
      const accountName = account.username.trim();
      if (!accountName) {
        throw new ConfigImportError(`设备“${deviceName}”下的第 ${accountIndex + 1} 个账号缺少用户名`);
      }
      if (accountNames.has(accountName)) {
        throw new ConfigImportError(`设备“${deviceName}”下存在重复账号“${accountName}”`);
      }
      accountNames.add(accountName);
    });
  });
}

function assertValidConfigIdentities(config: ConfigData) {
  if (config.meta.formatVersion < 3) return;
  const typeUuids = new Set<string>();
  const typesByUuid = new Map<string, DeviceTypeMeta>();
  config.customDeviceTypes.forEach((type, index) => {
    if (!isUuid(type.uuid)) throw new ConfigImportError(`第 ${index + 1} 个设备类型缺少有效 UUID`);
    if (typeUuids.has(type.uuid)) throw new ConfigImportError(`设备类型 UUID 重复：${type.uuid}`);
    typeUuids.add(type.uuid);
    typesByUuid.set(type.uuid, type);
  });

  const deviceUuids = new Set<string>();
  const accountUuids = new Set<string>();
  const historyUuids = new Set<string>();
  config.items.forEach((item) => {
    if (!isUuid(item.uuid)) throw new ConfigImportError(`设备“${item.deviceName}”缺少有效 UUID`);
    if (deviceUuids.has(item.uuid)) throw new ConfigImportError(`设备 UUID 重复：${item.uuid}`);
    deviceUuids.add(item.uuid);
    const type = typesByUuid.get(item.deviceTypeUuid);
    if (!type || type.label !== item.deviceType) {
      throw new ConfigImportError(`设备“${item.deviceName}”的设备类型 UUID 不匹配`);
    }
    getAccounts(item).forEach((account) => {
      if (!isUuid(account.uuid)) throw new ConfigImportError(`账号“${account.username}”缺少有效 UUID`);
      if (accountUuids.has(account.uuid)) throw new ConfigImportError(`账号 UUID 重复：${account.uuid}`);
      accountUuids.add(account.uuid);
      account.history.forEach((entry) => {
        if (!isUuid(entry.uuid)) throw new ConfigImportError(`账号“${account.username}”存在缺少有效 UUID 的密码历史`);
        if (historyUuids.has(entry.uuid)) throw new ConfigImportError(`密码历史 UUID 重复：${entry.uuid}`);
        historyUuids.add(entry.uuid);
      });
    });
  });
}

function requireImportedUuid(value: unknown, label: string, used: Set<string>) {
  const uuid = readString(value).trim().toLowerCase();
  if (!isUuid(uuid)) throw new ConfigImportError(`${label}缺少有效 UUID`);
  if (used.has(uuid)) throw new ConfigImportError(`${label}的 UUID 重复：${uuid}`);
  used.add(uuid);
  return uuid;
}

function assertStructuredConfigIdentities(rawTypes: unknown[]) {
  const typeUuids = new Set<string>();
  const typeUuidsByLabel = new Map<string, string>();
  const deviceUuids = new Set<string>();
  const accountUuids = new Set<string>();
  const historyUuids = new Set<string>();
  rawTypes.forEach((type, typeIndex) => {
    const typeRecord = type && typeof type === "object" ? type as Record<string, unknown> : {};
    const typeLabel = readString(typeRecord["设备类型"]).trim() || `第 ${typeIndex + 1} 个设备类型`;
    const typeUuid = requireImportedUuid(typeRecord["设备类型UUID"], `设备类型“${typeLabel}”`, typeUuids);
    const knownTypeUuid = typeUuidsByLabel.get(typeLabel);
    if (knownTypeUuid && knownTypeUuid !== typeUuid) {
      throw new ConfigImportError(`设备类型名称“${typeLabel}”对应了不同 UUID`);
    }
    typeUuidsByLabel.set(typeLabel, typeUuid);
    const devices = Array.isArray(typeRecord["设备"]) ? typeRecord["设备"] : [];
    devices.forEach((device, deviceIndex) => {
      const deviceRecord = device && typeof device === "object" ? device as Record<string, unknown> : {};
      const deviceName = readString(deviceRecord["设备名称"]).trim() || `第 ${deviceIndex + 1} 台设备`;
      requireImportedUuid(deviceRecord["设备UUID"], `设备“${deviceName}”`, deviceUuids);
      if (readString(deviceRecord["设备类型UUID"], typeUuid).trim().toLowerCase() !== typeUuid) {
        throw new ConfigImportError(`设备“${deviceName}”的设备类型 UUID 不匹配`);
      }
      const accounts = Array.isArray(deviceRecord["账号"]) ? deviceRecord["账号"] : [];
      accounts.forEach((account, accountIndex) => {
        const accountRecord = account && typeof account === "object" ? account as Record<string, unknown> : {};
        const username = readString(accountRecord["用户名"]).trim() || `第 ${accountIndex + 1} 个账号`;
        requireImportedUuid(accountRecord["账号UUID"], `账号“${username}”`, accountUuids);
        const history = Array.isArray(accountRecord["密码历史"]) ? accountRecord["密码历史"] : [];
        history.forEach((entry, historyIndex) => {
          const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
          requireImportedUuid(record["历史UUID"], `账号“${username}”的第 ${historyIndex + 1} 条密码历史`, historyUuids);
        });
      });
    });
  });
}

function assertCsvConfigIdentities(records: Array<Record<string, string>>) {
  const typeLabelsByUuid = new Map<string, string>();
  const typeUuidsByLabel = new Map<string, string>();
  const devicesByUuid = new Map<string, string>();
  const accountUuids = new Set<string>();
  const historyUuids = new Set<string>();
  records.forEach((record, index) => {
    const rowLabel = `CSV 第 ${index + 2} 行`;
    const typeUuid = readRecordValue(record, "设备类型UUID").trim().toLowerCase();
    const typeLabel = readRecordValue(record, "设备类型").trim();
    if (!isUuid(typeUuid)) throw new ConfigImportError(`${rowLabel}的设备类型缺少有效 UUID`);
    const knownTypeLabel = typeLabelsByUuid.get(typeUuid);
    if (knownTypeLabel && knownTypeLabel !== typeLabel) throw new ConfigImportError(`${rowLabel}的设备类型 UUID 对应了不同名称`);
    const knownTypeUuid = typeUuidsByLabel.get(typeLabel);
    if (knownTypeUuid && knownTypeUuid !== typeUuid) throw new ConfigImportError(`${rowLabel}的设备类型名称对应了不同 UUID`);
    typeLabelsByUuid.set(typeUuid, typeLabel);
    typeUuidsByLabel.set(typeLabel, typeUuid);

    const deviceName = readRecordValue(record, "设备名称").trim();
    if (!deviceName) return;
    const deviceUuid = readRecordValue(record, "设备UUID").trim().toLowerCase();
    if (!isUuid(deviceUuid)) throw new ConfigImportError(`${rowLabel}的设备缺少有效 UUID`);
    const canonicalDevice = JSON.stringify({
      typeUuid,
      deviceName,
      assetCode: readRecordValue(record, "资产编号"),
      location: readRecordValue(record, "设备位置"),
      info: readRecordValue(record, "设备信息", "IP地址"),
      notes: readRecordValue(record, "设备备注"),
      icon: readRecordValue(record, "设备图标"),
      updatedAt: readRecordValue(record, "设备更新时间"),
    });
    const knownDevice = devicesByUuid.get(deviceUuid);
    if (knownDevice && knownDevice !== canonicalDevice) throw new ConfigImportError(`${rowLabel}的设备 UUID 对应了不同设备内容`);
    devicesByUuid.set(deviceUuid, canonicalDevice);

    const hasAccount = ["用户名", "密码", "账号标签", "账号备注", "密码历史"]
      .some((key) => readRecordValue(record, key).trim() && readRecordValue(record, key).trim() !== "[]");
    if (!hasAccount) return;
    requireImportedUuid(readRecordValue(record, "账号UUID"), `${rowLabel}的账号`, accountUuids);
    const historyText = readRecordValue(record, "密码历史").trim();
    if (!historyText) return;
    let history: unknown;
    try {
      history = JSON.parse(historyText);
    } catch {
      throw new ConfigImportError(`${rowLabel}的密码历史不是有效 JSON`);
    }
    if (!Array.isArray(history)) throw new ConfigImportError(`${rowLabel}的密码历史必须是数组`);
    history.forEach((entry, historyIndex) => {
      const historyRecord = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      requireImportedUuid(historyRecord["历史UUID"], `${rowLabel}的第 ${historyIndex + 1} 条密码历史`, historyUuids);
    });
  });
}

function readRecordValue(record: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key] ?? "";
  }
  return "";
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

function compareVaultItemsForExport(left: VaultItem, right: VaultItem) {
  return compareText(left.deviceType, right.deviceType) ||
    compareText(left.deviceName, right.deviceName) ||
    compareText(left.ipAddress, right.ipAddress) ||
    left.id - right.id;
}

function buildDeviceTypeGroups(config: ConfigData) {
  const typeMap = new Map<string, DeviceTypeMeta>();
  config.customDeviceTypes.forEach((type) => {
    const label = type.label.trim();
    if (label && label !== "全部设备") typeMap.set(label, type);
  });
  config.items.forEach((item) => {
    const label = item.deviceType.trim();
    if (!label || typeMap.has(label)) return;
    typeMap.set(label, {
      uuid: isUuid(item.deviceTypeUuid) ? item.deviceTypeUuid : createUuid(),
      label,
      iconText: item.iconText?.trim() || label.slice(0, 1),
      color: "cyan",
    });
  });

  return Array.from(typeMap.values())
    .sort((left, right) => compareText(left.label, right.label))
    .map((type) => ({
      type,
      items: [...config.items]
        .filter((item) => item.deviceType.trim() === type.label)
        .sort(compareVaultItemsForExport),
    }));
}

function createJsonDeviceRecord(item: VaultItem) {
  return {
    设备ID: item.id,
    设备UUID: item.uuid,
    设备名称: item.deviceName,
    设备类型: item.deviceType,
    设备类型UUID: item.deviceTypeUuid,
    资产编号: item.assetCode,
    设备位置: item.location,
    IP地址: item.ipAddress,
    设备备注: item.notes,
    图标文字: item.iconText,
    更新时间: item.updatedAt,
    账号: getAccounts(item).map((account) => ({
      账号ID: account.id,
      账号UUID: account.uuid,
      用户名: account.username,
      密码: account.password,
      账号标签: account.tag,
      账号备注: account.notes,
      更新时间: account.updatedAt || item.updatedAt,
      密码更新时间: account.passwordChangedAt,
      密码历史: [...account.history]
        .sort((left, right) => left.id - right.id)
        .map((history) => ({
          历史ID: history.id,
          历史UUID: history.uuid,
          旧密码: history.password,
          新密码: history.newPassword,
          修改时间: history.changedAt,
          修改原因: history.reason,
        })),
    })),
  };
}

function createJsonConfigPayload(config: ConfigData) {
  return {
    元信息: {
      应用名称: config.meta.appName,
      格式版本: config.meta.formatVersion,
      导出时间: config.meta.exportedAt,
    },
    设备类型: buildDeviceTypeGroups(config).map(({ type, items }) => ({
      设备类型UUID: type.uuid,
      设备类型: type.label,
      图标文字: type.iconText,
      颜色: type.color,
      设备: items.map(createJsonDeviceRecord),
    })),
  };
}

function parseJsonConfigContent(content: string): ConfigData {
  const parsed = JSON.parse(stripUtf8Bom(content));
  if (isStructuredConfigPayload(parsed)) return parseStructuredConfigPayload(parsed);
  throw new Error("invalid config");
}

function isStructuredConfigPayload(parsed: unknown): parsed is Record<string, unknown> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  const meta = record["元信息"];
  return Array.isArray(record["设备类型"]) || Boolean(meta && typeof meta === "object" &&
    ["应用名称", "格式版本", "导出时间"].some((key) => key in (meta as Record<string, unknown>)));
}

function parseStructuredConfigPayload(parsed: Record<string, unknown>): ConfigData {
  const rawTypes = Array.isArray(parsed["设备类型"]) ? parsed["设备类型"] : [];
  const meta = parsed["元信息"] && typeof parsed["元信息"] === "object" ? parsed["元信息"] as Record<string, unknown> : {};
  const formatVersion = readNumber(meta["格式版本"], 1);
  if (formatVersion > CONFIG_FORMAT_VERSION) {
    throw new ConfigImportError(`不支持配置格式 v${formatVersion}，当前最高支持 v${CONFIG_FORMAT_VERSION}`);
  }
  if (formatVersion >= 3) assertStructuredConfigIdentities(rawTypes);
  const rawItems = rawTypes.flatMap((type, typeIndex) => {
    if (!type || typeof type !== "object") return [];
    const typeRecord = type as Record<string, unknown>;
    const typeLabel = readString(typeRecord["设备类型"]).trim();
    const typeUuid = readString(typeRecord["设备类型UUID"]).trim();
    const rawItems = Array.isArray(typeRecord["设备"]) ? typeRecord["设备"] : [];
    return rawItems.map((item, itemIndex) => createImportedDeviceFromChineseRecord(
      item && typeof item === "object" ? item as Record<string, unknown> : {},
      itemIndex + typeIndex + 1,
      typeLabel,
      typeUuid,
    ));
  });
  const normalized = normalizeVaultIdentityData(rawItems, rawTypes);
  return {
    meta: {
      appName: readString(meta["应用名称"], APP_TITLE),
      formatVersion,
      exportedAt: readString(meta["导出时间"]),
    },
    items: normalized.items,
    customDeviceTypes: normalized.customDeviceTypes,
    hiddenDeviceTypes: [],
  };
}

function createImportedDeviceFromChineseRecord(
  record: Record<string, unknown>,
  index: number,
  fallbackDeviceType = "",
  fallbackDeviceTypeUuid = "",
) {
  const accounts = Array.isArray(record["账号"]) ? record["账号"].map((account, accountIndex) => {
    const accountRecord = account && typeof account === "object" ? account as Record<string, unknown> : {};
    const username = readString(accountRecord["用户名"]).trim();
    return {
      uuid: readString(accountRecord["账号UUID"]),
      id: readNumber(accountRecord["账号ID"], accountIndex + 1),
      title: username || "未填写用户名",
      username,
      password: readString(accountRecord["密码"]),
      tag: readString(accountRecord["账号标签"], DEFAULT_ACCOUNT_TAG).trim() || DEFAULT_ACCOUNT_TAG,
      notes: readString(accountRecord["账号备注"]),
      updatedAt: readString(accountRecord["更新时间"]),
      passwordChangedAt: readString(accountRecord["密码更新时间"]),
      history: Array.isArray(accountRecord["密码历史"]) ? accountRecord["密码历史"].map((history, historyIndex) => {
        const historyRecord = history && typeof history === "object" ? history as Record<string, unknown> : {};
        return {
          uuid: readString(historyRecord["历史UUID"]),
          id: readNumber(historyRecord["历史ID"], historyIndex + 1),
          password: readString(historyRecord["旧密码"]),
          newPassword: readString(historyRecord["新密码"]),
          changedAt: readString(historyRecord["修改时间"]),
          reason: readString(historyRecord["修改原因"]),
        };
      }) : [],
    };
  }) : [];
  const primaryAccount = accounts[0];
  const deviceType = readString(record["设备类型"], fallbackDeviceType).trim();
  return {
    uuid: readString(record["设备UUID"]),
    id: readNumber(record["设备ID"], index + 1),
    title: primaryAccount?.title ?? readString(record["设备名称"], `设备 ${index + 1}`),
    deviceName: readString(record["设备名称"]),
    deviceType,
    deviceTypeUuid: readString(record["设备类型UUID"], fallbackDeviceTypeUuid),
    assetCode: readString(record["资产编号"]),
    location: readString(record["设备位置"]),
    username: primaryAccount?.username ?? "",
    password: primaryAccount?.password ?? "",
    ipAddress: readString(record["IP地址"]),
    tag: deviceType || DEFAULT_ACCOUNT_TAG,
    iconText: readString(record["图标文字"]),
    iconClass: "",
    updatedAt: readString(record["更新时间"]),
    notes: readString(record["设备备注"]),
    history: primaryAccount?.history ?? [],
    accounts,
  };
}

function createCsvConfigPayload(config: ConfigData) {
  const rows: unknown[][] = [];

  buildDeviceTypeGroups(config).forEach(({ type, items }) => {
    if (items.length === 0) {
      rows.push(createCsvRow({ type }));
      return;
    }

    items.forEach((item) => {
      const accounts = getAccounts(item);
      if (accounts.length === 0) {
        rows.push(createCsvRow({ type, item }));
        return;
      }

      accounts.forEach((account) => rows.push(createCsvRow({ type, item, account })));
    });
  });

  return `\uFEFF${[CSV_HEADERS, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n")}\n`;
}

function createCsvRow({
  type,
  item,
  account,
}: {
  type?: DeviceTypeMeta;
  item?: VaultItem;
  account?: DeviceAccount;
}) {
  const history = account ? JSON.stringify(createCsvHistoryRecords(account.history)) : "[]";
  return CSV_HEADERS.map((header) => {
    if (header === "设备类型UUID") return type?.uuid ?? item?.deviceTypeUuid ?? "";
    if (header === "设备类型") return type?.label ?? item?.deviceType ?? "";
    if (header === "类型图标") return type?.iconText ?? "";
    if (header === "类型颜色") return type?.color ?? "";
    if (header === "设备UUID") return item?.uuid ?? "";
    if (header === "设备名称") return item?.deviceName ?? "";
    if (header === "资产编号") return item?.assetCode ?? "";
    if (header === "设备位置") return item?.location ?? "";
    if (header === "设备信息") return item?.ipAddress ?? "";
    if (header === "设备备注") return item?.notes ?? "";
    if (header === "设备图标") return item?.iconText ?? type?.iconText ?? "";
    if (header === "设备更新时间") return item?.updatedAt ?? "";
    if (header === "账号UUID") return account?.uuid ?? "";
    if (header === "用户名") return account?.username ?? "";
    if (header === "账号标签") return account?.tag ?? "";
    if (header === "密码") return account?.password ?? "";
    if (header === "账号备注") return account?.notes ?? "";
    if (header === "账号更新时间") return account?.updatedAt || item?.updatedAt || "";
    if (header === "密码更新时间") return account?.passwordChangedAt ?? "";
    if (header === "密码历史") return history;
    return "";
  });
}

function createCsvHistoryRecords(history: PasswordHistory[]) {
  return [...history]
    .sort((left, right) => left.id - right.id)
    .map((entry) => ({
      历史ID: entry.id,
      历史UUID: entry.uuid,
      旧密码: entry.password,
      新密码: entry.newPassword,
      修改时间: entry.changedAt,
      修改原因: entry.reason,
    }));
}

function parseCsvConfigContent(content: string): ConfigData {
  const rows = parseCsvRows(stripUtf8Bom(content)).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length === 0) throw new Error("invalid config");
  return parseFlatCsvConfigRows(rows);
}

function parseFlatCsvConfigRows(rows: string[][]): ConfigData {
  const headers = rows[0].map((header) => header.trim());
  if (!["设备类型", "设备名称", "用户名", "密码历史"].every((header) => headers.includes(header))) {
    throw new Error("invalid config");
  }

  const records = rows.slice(1)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  const hasUuidColumns = headers.includes("设备UUID") && headers.includes("账号UUID") && headers.includes("设备类型UUID");
  if (hasUuidColumns) assertCsvConfigIdentities(records);

  const typeRecords = new Map<string, Record<string, string>>();
  const devicesByKey = new Map<string, VaultItem>();

  records.forEach((record, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const deviceType = readRecordValue(record, "设备类型").trim();
      const deviceTypeUuid = readRecordValue(record, "设备类型UUID").trim();
      const typeIcon = readRecordValue(record, "类型图标", "设备图标").trim() || deviceType.slice(0, 1);
      const typeColor = readRecordValue(record, "类型颜色").trim() || "cyan";
      if (deviceType && !typeRecords.has(deviceType)) {
        typeRecords.set(deviceType, { 设备类型UUID: deviceTypeUuid, 设备类型: deviceType, 图标文字: typeIcon, 颜色: typeColor });
      }

      const deviceName = readRecordValue(record, "设备名称").trim();
      const assetCode = readRecordValue(record, "资产编号").trim();
      const location = readRecordValue(record, "设备位置").trim();
      const deviceInfo = readRecordValue(record, "设备信息", "IP地址").trim();
      const deviceNotes = readRecordValue(record, "设备备注");
      const deviceIcon = readRecordValue(record, "设备图标").trim() || typeIcon || deviceType.slice(0, 1) || "设";
      const history = parseCsvHistory(readRecordValue(record, "密码历史"), rowNumber);
      const hasAccount = [
        readRecordValue(record, "用户名"),
        readRecordValue(record, "密码"),
        readRecordValue(record, "账号标签"),
        readRecordValue(record, "账号备注"),
      ].some((value) => value.trim()) || history.length > 0;

      if (!deviceName) {
        if (hasAccount) throw new Error("invalid config");
        return;
      }

      const deviceUuid = readRecordValue(record, "设备UUID").trim();
      const deviceKey = isUuid(deviceUuid)
        ? `uuid:${deviceUuid.toLowerCase()}`
        : [deviceType, deviceName, assetCode, location, deviceInfo, deviceNotes, deviceIcon].join("\u0000");
      let item = devicesByKey.get(deviceKey);
      if (!item) {
        item = {
          uuid: deviceUuid,
          id: devicesByKey.size + 1,
          title: deviceName,
          deviceName,
          deviceType,
          deviceTypeUuid,
          assetCode,
          location,
          username: "",
          password: "",
          ipAddress: deviceInfo,
          tag: deviceType || DEFAULT_ACCOUNT_TAG,
          iconText: deviceIcon,
          iconClass: "",
          updatedAt: readRecordValue(record, "设备更新时间").trim() || formatDateTime(new Date()),
          notes: deviceNotes,
          history: [],
          accounts: [],
        };
        devicesByKey.set(deviceKey, item);
      }

      if (!hasAccount) return;
      const username = readRecordValue(record, "用户名").trim();
      const account: DeviceAccount = {
        uuid: readRecordValue(record, "账号UUID"),
        id: (item.accounts ?? []).length + 1,
        title: username || "未填写用户名",
        username,
        password: readRecordValue(record, "密码"),
        tag: readRecordValue(record, "账号标签").trim() || DEFAULT_ACCOUNT_TAG,
        notes: readRecordValue(record, "账号备注"),
        updatedAt: readRecordValue(record, "账号更新时间").trim() || item.updatedAt,
        passwordChangedAt: readRecordValue(record, "密码更新时间").trim(),
        history,
      };
      item.accounts = [...(item.accounts ?? []), account];
      if (item.accounts.length === 1) {
        item.title = account.title;
        item.username = account.username;
        item.password = account.password;
        item.history = account.history;
      }
    });

  const normalized = normalizeVaultIdentityData(Array.from(devicesByKey.values()), Array.from(typeRecords.values()));
  return {
    meta: {
      appName: APP_TITLE,
      formatVersion: hasUuidColumns ? CONFIG_FORMAT_VERSION : 2,
      exportedAt: "",
    },
    items: normalized.items,
    customDeviceTypes: normalized.customDeviceTypes,
    hiddenDeviceTypes: [],
  };
}

function parseCsvHistory(value: string, rowNumber: number): PasswordHistory[] {
  const text = value.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("invalid config");
    return parsed.map((entry, index) => {
      const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return {
        uuid: readString(record["历史UUID"]),
        id: readNumber(record["历史ID"], index + 1),
        password: readString(record["旧密码"]),
        newPassword: readString(record["新密码"]),
        changedAt: readString(record["修改时间"]),
        reason: readString(record["修改原因"]),
      };
    });
  } catch {
    throw new Error(`invalid config row ${rowNumber}`);
  }
}

function stripUtf8Bom(content: string) {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function createYamlConfigPayload(config: ConfigData) {
  const payload = stringifyYaml(createJsonConfigPayload(config), {
    aliasDuplicateObjects: false,
    indent: 2,
    lineWidth: 0,
    simpleKeys: true,
  });
  return `# 密码管理器 YAML 配置文件\n# 包含明文账号、密码和密码历史，请只保存到可信位置。\n${payload}`;
}

function parseYamlConfigContent(content: string): ConfigData {
  const parsed = parseYaml(stripUtf8Bom(content), {
    customTags: [],
    maxAliasCount: 0,
    merge: false,
    resolveKnownTags: false,
    schema: "core",
  });
  if (isStructuredConfigPayload(parsed)) return parseStructuredConfigPayload(parsed);
  throw new Error("invalid config");
}

function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}
