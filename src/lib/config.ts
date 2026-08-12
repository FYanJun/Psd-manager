import { APP_TITLE, CONFIG_FORMAT_VERSION } from "./constants";
import type { ConfigData, ConfigSummary, ConfigFormat, DeviceTypeMeta, VaultItem } from "./types";
import { getAccounts } from "./vault";
import { padDatePart } from "./utils";
import { createCsvConfigPayload, parseCsvConfigContent } from "./config/csv";
import { createJsonConfigPayload, parseJsonConfigContent } from "./config/structured";
import { createYamlConfigPayload, parseYamlConfigContent } from "./config/yaml";
import { CONFIG_FORMATS, ConfigImportError } from "./config/shared";
import { normalizeVaultIdentityData } from "./config/normalization";
import {
  assertValidConfigFields,
  assertValidConfigIdentities,
  assertValidConfigNames,
} from "./config/validation";

export { ConfigImportError } from "./config/shared";
export {
  normalizeDeviceTypeMetaList,
  normalizeVaultIdentityData,
} from "./config/normalization";

export function createConfigMeta() {
  return {
    appName: APP_TITLE,
    formatVersion: CONFIG_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
  };
}

export function createConfigPayload(
  items: VaultItem[],
  customDeviceTypes: DeviceTypeMeta[],
  format: ConfigFormat,
) {
  const config = createConfigData(items, customDeviceTypes);
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
  assertValidConfigFields(config);
  assertValidConfigIdentities(config);
  return config;
}

export function parseConfigContentWithFallback(
  content: string,
  preferredFormat: ConfigFormat,
): { config: ConfigData; format: ConfigFormat } {
  const formats = [preferredFormat, ...CONFIG_FORMATS.filter((format) => format !== preferredFormat)];
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

export function getConfigSummary(config: ConfigData): ConfigSummary {
  const accountCount = config.items.reduce((count, item) => count + getAccounts(item).length, 0);
  const historyCount = config.items.reduce(
    (count, item) => count + getAccounts(item).reduce((total, account) => total + account.history.length, 0),
    0,
  );
  const itemTypeLabels = config.items.map((item) => item.deviceType.trim()).filter(Boolean);
  const customTypeLabels = config.customDeviceTypes.map((type) => type.label.trim()).filter(Boolean);
  return {
    itemCount: config.items.length,
    accountCount,
    historyCount,
    typeCount: new Set([...itemTypeLabels, ...customTypeLabels]).size,
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
  ];
}

function createConfigData(items: VaultItem[], customDeviceTypes: DeviceTypeMeta[]): ConfigData {
  const normalized = normalizeVaultIdentityData(items, customDeviceTypes);
  return {
    meta: createConfigMeta(),
    items: normalized.items,
    customDeviceTypes: normalized.customDeviceTypes,
  };
}
