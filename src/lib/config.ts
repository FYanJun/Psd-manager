import { APP_TITLE } from "./constants";
import type { ConfigData, ConfigSummary, ConfigFormat, ConfigTransferFormat, DeviceTypeMeta, VaultItem } from "./types";
import { countVaultAccounts, countVaultHistory } from "./vault";
import { padDatePart } from "./utils";
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
    exportedAt: new Date().toISOString(),
  };
}

export function createConfigPayload(
  items: VaultItem[],
  customDeviceTypes: DeviceTypeMeta[],
  format: ConfigFormat,
) {
  const config = createConfigData(items, customDeviceTypes);
  if (format === "yaml") return createYamlConfigPayload(config);
  return JSON.stringify(createJsonConfigPayload(config), null, 2);
}

export function createConfigFilename(format: ConfigTransferFormat) {
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
  const config = format === "yaml"
      ? parseYamlConfigContent(content)
      : parseJsonConfigContent(content);
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

export function inferConfigFormat(pathOrName: string): ConfigTransferFormat {
  const normalized = pathOrName.toLowerCase();
  if (normalized.endsWith(".xlsx")) return "xlsx";
  if (normalized.endsWith(".yaml") || normalized.endsWith(".yml")) return "yaml";
  return "json";
}

export function getConfigMimeType(format: ConfigFormat) {
  if (format === "yaml") return "application/yaml;charset=utf-8";
  return "application/json";
}

export function getConfigSummary(config: ConfigData): ConfigSummary {
  const accountCount = countVaultAccounts(config.items);
  const historyCount = countVaultHistory(config.items);
  const itemTypeLabels = config.items.map((item) => item.deviceType.trim()).filter(Boolean);
  const customTypeLabels = config.customDeviceTypes.map((type) => type.label.trim()).filter(Boolean);
  return {
    itemCount: config.items.length,
    accountCount,
    historyCount,
    typeCount: new Set([...itemTypeLabels, ...customTypeLabels]).size,
  };
}

export function formatConfigSummary(summary: ConfigSummary) {
  return [
    { label: "设备", value: `${summary.itemCount} 台` },
    { label: "账号", value: `${summary.accountCount} 个` },
    { label: "历史", value: `${summary.historyCount} 条` },
    { label: "类型", value: `${summary.typeCount} 个` },
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
