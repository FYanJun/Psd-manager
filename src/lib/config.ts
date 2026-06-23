import { APP_TITLE, CONFIG_FORMAT_VERSION, DEFAULT_ACCOUNT_TAG } from "./constants";
import type { ConfigData, ConfigSummary, ConfigFormat, DeviceAccount, DeviceTypeMeta, PasswordHistory, VaultItem } from "./types";
import { getAccounts, normalizeVaultItems } from "./vault";
import { formatDateTime, padDatePart, readNumber, readString } from "./utils";

const csvHeaders = [
  "deviceName",
  "deviceType",
  "ipAddress",
  "deviceNotes",
  "username",
  "password",
  "accountTag",
  "accountNotes",
  "updatedAt",
  "passwordHistory",
  "customDeviceTypes",
  "hiddenDeviceTypes",
];

const configFormats: ConfigFormat[] = ["json", "csv", "ini"];

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
  if (format === "ini") return createIniConfigPayload(config);
  return JSON.stringify(config, null, 2);
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
  if (format === "csv") return parseCsvConfigContent(content);
  if (format === "ini") return parseIniConfigContent(content);
  return parseJsonConfigContent(content);
}

export function parseConfigContentWithFallback(content: string, preferredFormat: ConfigFormat): { config: ConfigData; format: ConfigFormat } {
  const formats = [preferredFormat, ...configFormats.filter((format) => format !== preferredFormat)];
  let firstError: unknown = null;

  for (const format of formats) {
    try {
      return { config: parseConfigContent(content, format), format };
    } catch (error) {
      firstError ??= error;
    }
  }

  throw firstError ?? new Error("invalid config");
}

export function inferConfigFormat(pathOrName: string): ConfigFormat {
  const normalized = pathOrName.toLowerCase();
  if (normalized.endsWith(".csv")) return "csv";
  if (normalized.endsWith(".ini")) return "ini";
  return "json";
}

export function getConfigMimeType(format: ConfigFormat) {
  if (format === "csv") return "text/csv;charset=utf-8";
  if (format === "ini") return "text/plain;charset=utf-8";
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
  return value.reduce<DeviceTypeMeta[]>((types, type) => {
    if (type && typeof type === "object") {
      const label = readString((type as Partial<DeviceTypeMeta>).label).trim();
      if (!label || usedLabels.has(label)) return types;
      usedLabels.add(label);
      types.push({
        label,
        iconText: readString((type as Partial<DeviceTypeMeta>).iconText, label.slice(0, 1)).trim() || label.slice(0, 1),
        color: readString((type as Partial<DeviceTypeMeta>).color, "blue"),
      });
    }
    return types;
  }, []);
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
  return {
    meta: createConfigMeta(),
    items: normalizeVaultItems(items),
    customDeviceTypes: normalizeDeviceTypeMetaList(customDeviceTypes),
    hiddenDeviceTypes,
  };
}

function parseJsonConfigContent(content: string): ConfigData {
  const parsed = JSON.parse(stripUtf8Bom(content));
  const isLegacyArrayConfig = Array.isArray(parsed);
  const hasKnownJsonShape = isLegacyArrayConfig ||
    (parsed && typeof parsed === "object" &&
      (Array.isArray(parsed.items) ||
        Array.isArray(parsed.customDeviceTypes) ||
        Array.isArray(parsed.hiddenDeviceTypes) ||
        ["appName", "formatVersion", "exportedAt"].some((key) => key in (parsed.meta ?? {}))));
  if (!hasKnownJsonShape) throw new Error("invalid config");
  const configItems = normalizeVaultItems(isLegacyArrayConfig ? parsed : parsed?.items);
  const configMeta = isLegacyArrayConfig ? null : parsed?.meta;
  return {
    meta: {
      appName: readString(configMeta?.appName, APP_TITLE),
      formatVersion: readNumber(configMeta?.formatVersion, 0),
      exportedAt: readString(configMeta?.exportedAt),
    },
    items: configItems,
    customDeviceTypes: normalizeDeviceTypeMetaList(isLegacyArrayConfig ? [] : parsed?.customDeviceTypes),
    hiddenDeviceTypes: normalizeHiddenDeviceTypes(isLegacyArrayConfig ? [] : parsed?.hiddenDeviceTypes, configItems),
  };
}

function createCsvConfigPayload(config: ConfigData) {
  const rows = config.items.flatMap((item) => {
    const accounts = getAccounts(item);
    return accounts.map((account, index) => [
      item.deviceName,
      item.deviceType,
      item.ipAddress,
      item.notes,
      account.username,
      account.password,
      account.tag,
      account.notes,
      account.updatedAt || item.updatedAt,
      encodeStructuredValue(account.history),
      index === 0 ? encodeStructuredValue(config.customDeviceTypes) : "",
      index === 0 ? encodeStructuredValue(config.hiddenDeviceTypes) : "",
    ]);
  });
  if (rows.length === 0 && (config.customDeviceTypes.length > 0 || config.hiddenDeviceTypes.length > 0)) {
    rows.push(["", "", "", "", "", "", "", "", "", "", encodeStructuredValue(config.customDeviceTypes), encodeStructuredValue(config.hiddenDeviceTypes)]);
  }
  return `\uFEFF${[csvHeaders, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n")}`;
}

function parseCsvConfigContent(content: string): ConfigData {
  const rows = parseCsvRows(stripUtf8Bom(content)).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length === 0) throw new Error("invalid config");
  const headers = rows[0].map((header) => header.trim());
  const hasExplicitConfigHeader = headers.some((header) =>
    ["deviceName", "设备名称", "customDeviceTypes", "设备类型配置", "hiddenDeviceTypes", "隐藏设备类型"].includes(header)
  );
  const hasLegacyDeviceNameHeader = headers.includes("name") &&
    headers.some((header) => ["username", "用户名", "password", "密码", "deviceType", "设备类型", "type", "ip", "IP"].includes(header));
  const hasKnownHeader = hasExplicitConfigHeader || hasLegacyDeviceNameHeader;
  if (!hasKnownHeader) throw new Error("invalid config");
  const dataRows = rows.slice(1);
  const deviceMap = new Map<string, VaultItem>();
  let customDeviceTypes: DeviceTypeMeta[] = [];
  let hiddenDeviceTypes: string[] = [];

  dataRows.forEach((row, index) => {
    const record = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] ?? ""]));
    customDeviceTypes = mergeStructuredList(customDeviceTypes, readRecordValue(record, "customDeviceTypes", "设备类型配置"));
    hiddenDeviceTypes = mergeStringList(hiddenDeviceTypes, readRecordValue(record, "hiddenDeviceTypes", "隐藏设备类型"));

    const deviceName = readRecordValue(record, "deviceName", "设备名称", "name").trim();
    if (!deviceName) return;

    const deviceType = readRecordValue(record, "deviceType", "设备类型", "type").trim();
    const ipAddress = readRecordValue(record, "ipAddress", "IP", "ip").trim();
    const deviceNotes = readRecordValue(record, "deviceNotes", "设备备注");
    const deviceKey = `${deviceName}\u0000${ipAddress}\u0000${deviceType}`;
    const existingItem = deviceMap.get(deviceKey);
    const account = createImportedAccount(record, index);

    if (existingItem) {
      existingItem.accounts = [...getAccounts(existingItem), account];
      return;
    }

    const item = {
      id: deviceMap.size + 1,
      title: account.title,
      deviceName,
      deviceType,
      username: account.username,
      password: account.password,
      ipAddress,
      tag: deviceType || DEFAULT_ACCOUNT_TAG,
      iconText: deviceType.slice(0, 1) || "设",
      iconClass: "",
      updatedAt: account.updatedAt,
      notes: deviceNotes,
      history: account.history,
      accounts: [account],
    };
    deviceMap.set(deviceKey, item);
  });

  const items = normalizeVaultItems(Array.from(deviceMap.values()));
  return {
    meta: { ...createConfigMeta(), formatVersion: CONFIG_FORMAT_VERSION },
    items,
    customDeviceTypes: normalizeDeviceTypeMetaList(customDeviceTypes),
    hiddenDeviceTypes: normalizeHiddenDeviceTypes(hiddenDeviceTypes, items),
  };
}

function stripUtf8Bom(content: string) {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function createIniConfigPayload(config: ConfigData) {
  const lines = [
    "[meta]",
    `appName=${escapeIniValue(config.meta.appName)}`,
    `formatVersion=${config.meta.formatVersion}`,
    `exportedAt=${escapeIniValue(config.meta.exportedAt)}`,
    `customDeviceTypes=${escapeIniValue(encodeStructuredValue(config.customDeviceTypes))}`,
    `hiddenDeviceTypes=${escapeIniValue(encodeStructuredValue(config.hiddenDeviceTypes))}`,
    "",
  ];
  let sectionIndex = 1;
  config.items.forEach((item) => {
    getAccounts(item).forEach((account) => {
      lines.push(`[account.${sectionIndex}]`);
      lines.push(`deviceName=${escapeIniValue(item.deviceName)}`);
      lines.push(`deviceType=${escapeIniValue(item.deviceType)}`);
      lines.push(`ipAddress=${escapeIniValue(item.ipAddress)}`);
      lines.push(`deviceNotes=${escapeIniValue(item.notes)}`);
      lines.push(`username=${escapeIniValue(account.username)}`);
      lines.push(`password=${escapeIniValue(account.password)}`);
      lines.push(`accountTag=${escapeIniValue(account.tag)}`);
      lines.push(`accountNotes=${escapeIniValue(account.notes)}`);
      lines.push(`updatedAt=${escapeIniValue(account.updatedAt || item.updatedAt)}`);
      lines.push(`passwordHistory=${escapeIniValue(encodeStructuredValue(account.history))}`);
      lines.push("");
      sectionIndex += 1;
    });
  });
  return lines.join("\n").trimEnd() + "\n";
}

function parseIniConfigContent(content: string): ConfigData {
  const sections = parseIniSections(stripUtf8Bom(content));
  const meta = sections.get("meta") ?? {};
  const accountSections = Array.from(sections)
    .filter(([section]) => section.startsWith("account."))
    .map(([, record]) => record);
  const hasKnownMeta = ["appName", "formatVersion", "exportedAt", "customDeviceTypes", "hiddenDeviceTypes"].some((key) => key in meta);
  const hasKnownAccount = accountSections.some((record) => readRecordValue(record, "deviceName", "设备名称", "name").trim());
  if (!hasKnownMeta && !hasKnownAccount) {
    throw new Error("invalid config");
  }

  const deviceMap = new Map<string, VaultItem>();
  accountSections.forEach((record, index) => {
    const deviceName = readRecordValue(record, "deviceName", "设备名称", "name").trim();
    if (!deviceName) return;
    const deviceType = readRecordValue(record, "deviceType", "设备类型", "type").trim();
    const ipAddress = readRecordValue(record, "ipAddress", "IP", "ip").trim();
    const deviceNotes = readRecordValue(record, "deviceNotes", "设备备注");
    const account = createImportedAccount(record, index);
    const deviceKey = `${deviceName}\u0000${ipAddress}\u0000${deviceType}`;
    const existingItem = deviceMap.get(deviceKey);

    if (existingItem) {
      existingItem.accounts = [...getAccounts(existingItem), account];
      return;
    }

    deviceMap.set(deviceKey, {
      id: deviceMap.size + 1,
      title: account.title,
      deviceName,
      deviceType,
      username: account.username,
      password: account.password,
      ipAddress,
      tag: deviceType || DEFAULT_ACCOUNT_TAG,
      iconText: deviceType.slice(0, 1) || "设",
      iconClass: "",
      updatedAt: account.updatedAt,
      notes: deviceNotes,
      history: account.history,
      accounts: [account],
    });
  });

  const items = normalizeVaultItems(Array.from(deviceMap.values()));
  return {
    meta: {
      appName: readString(meta.appName, APP_TITLE),
      formatVersion: readNumber(Number(meta.formatVersion), CONFIG_FORMAT_VERSION),
      exportedAt: readString(meta.exportedAt),
    },
    items,
    customDeviceTypes: normalizeDeviceTypeMetaList(decodeStructuredValue(meta.customDeviceTypes, [])),
    hiddenDeviceTypes: normalizeHiddenDeviceTypes(decodeStructuredValue(meta.hiddenDeviceTypes, []), items),
  };
}

function createImportedAccount(record: Record<string, string>, index: number): DeviceAccount {
  const username = readRecordValue(record, "username", "用户名", "account").trim();
  const updatedAt = readRecordValue(record, "updatedAt", "更新时间").trim() || formatDateTime(new Date());
  return {
    id: index + 1,
    title: username || "未填写用户名",
    username,
    password: readRecordValue(record, "password", "密码"),
    tag: readRecordValue(record, "accountTag", "标签").trim() || DEFAULT_ACCOUNT_TAG,
    notes: readRecordValue(record, "accountNotes", "备注"),
    updatedAt,
    history: normalizeImportedHistory(readRecordValue(record, "passwordHistory", "历史密码")),
  };
}

function normalizeImportedHistory(value: string): PasswordHistory[] {
  const parsed = decodeStructuredValue(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((entry, index) => ({
    id: readNumber(entry?.id, index + 1),
    password: readString(entry?.password),
    newPassword: readString(entry?.newPassword),
    changedAt: readString(entry?.changedAt),
    reason: readString(entry?.reason),
  }));
}

function readRecordValue(record: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key] ?? "";
  }
  return "";
}

function encodeStructuredValue(value: unknown) {
  return JSON.stringify(value ?? []);
}

function decodeStructuredValue(value: string | undefined, fallback: unknown) {
  if (!value?.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mergeStructuredList<T>(current: T[], value: string) {
  const parsed = decodeStructuredValue(value, []);
  return Array.isArray(parsed) ? [...current, ...parsed] : current;
}

function mergeStringList(current: string[], value: string) {
  const parsed = decodeStructuredValue(value, []);
  if (!Array.isArray(parsed)) return current;
  return [...current, ...parsed.map((item) => readString(item)).filter(Boolean)];
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

function escapeIniValue(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function unescapeIniValue(value: string) {
  return value
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function parseIniSections(content: string) {
  const sections = new Map<string, Record<string, string>>();
  let currentSection = "";

  content.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) return;
    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      sections.set(currentSection, sections.get(currentSection) ?? {});
      return;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0 || !currentSection) return;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    sections.get(currentSection)![key] = unescapeIniValue(value);
  });

  return sections;
}
