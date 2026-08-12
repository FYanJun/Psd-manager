import { APP_TITLE, CONFIG_FORMAT_VERSION, DEFAULT_ACCOUNT_TAG } from "../constants";
import type { ConfigData, DeviceAccount, PasswordHistory, VaultItem } from "../types";
import { getAccounts, iconClassForColor } from "../vault";
import { readString } from "../utils";
import { buildDeviceTypeGroups } from "./export-utils";
import { normalizeVaultIdentityData } from "./normalization";
import { assertStructuredConfigIdentities } from "./validation";
import { ConfigImportError, stripUtf8Bom } from "./shared";

function readConnectionAddress(record: Record<string, unknown>) {
  return readString(record["连接地址"]).trim() || readString(record["IP地址"]).trim();
}

export function createJsonDeviceRecord(item: VaultItem, typeIconText: string) {
  const device: Record<string, unknown> = {
    设备UUID: item.uuid,
    设备名称: item.deviceName,
    更新时间: item.updatedAt,
    账号: getAccounts(item).map((account) => {
      const accountRecord: Record<string, unknown> = {
        账号UUID: account.uuid,
        用户名: account.username,
        密码: account.password,
        更新时间: account.updatedAt || item.updatedAt,
        密码历史: [...account.history]
          .sort((left, right) => left.id - right.id)
          .map((history) => {
            const historyRecord: Record<string, unknown> = {
              历史UUID: history.uuid,
              旧密码: history.password,
              新密码: history.newPassword,
              修改时间: history.changedAt,
            };
            if (history.reason.trim()) historyRecord["修改原因"] = history.reason;
            return historyRecord;
          }),
      };
      if (account.tag.trim()) accountRecord["账号标签"] = account.tag;
      if (account.notes.trim()) accountRecord["账号备注"] = account.notes;
      if (account.passwordChangedAt.trim()) accountRecord["密码更新时间"] = account.passwordChangedAt;
      return accountRecord;
    }),
  };
  const optionalFields: Array<[string, string]> = [
    ["资产编号", item.assetCode],
    ["设备位置", item.location],
    ["连接地址", item.ipAddress],
    ["设备备注", item.notes],
  ];
  optionalFields.forEach(([key, value]) => {
    if (value.trim()) device[key] = value;
  });
  if (item.iconText.trim() && item.iconText.trim() !== typeIconText.trim()) {
    device["图标文字"] = item.iconText;
  }
  return device;
}

export function createJsonConfigPayload(config: ConfigData) {
  return {
    设备类型: buildDeviceTypeGroups(config).map(({ type, items }) => ({
      设备类型UUID: type.uuid,
      设备类型: type.label,
      图标文字: type.iconText,
      颜色: type.color,
      设备: items.map((item) => createJsonDeviceRecord(item, type.iconText)),
    })),
  };
}

export function parseJsonConfigContent(content: string): ConfigData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripUtf8Bom(content));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error ?? "无法解析");
    throw new ConfigImportError(`JSON 配置语法错误：${reason}`);
  }
  if (isStructuredConfigPayload(parsed)) return parseStructuredConfigPayload(parsed);
  throw new ConfigImportError("JSON 配置结构错误：只支持以“设备类型”为顶层且不包含“元信息”的当前格式");
}

export function isStructuredConfigPayload(parsed: unknown): parsed is Record<string, unknown> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  return Array.isArray(record["设备类型"]) && !("元信息" in record);
}

export function parseStructuredConfigPayload(parsed: Record<string, unknown>): ConfigData {
  const rawTypes = Array.isArray(parsed["设备类型"]) ? parsed["设备类型"] : [];
  assertStructuredConfigIdentities(rawTypes);
  const rawItems = rawTypes.flatMap((type, typeIndex) => {
    if (!type || typeof type !== "object") return [];
    const typeRecord = type as Record<string, unknown>;
    const typeLabel = readString(typeRecord["设备类型"]).trim();
    const typeUuid = readString(typeRecord["设备类型UUID"]).trim();
    const typeIconText = readString(typeRecord["图标文字"], typeLabel.slice(0, 1)).trim() || typeLabel.slice(0, 1);
    const typeIconClass = iconClassForColor(readString(typeRecord["颜色"], "blue"));
    const rawItems = Array.isArray(typeRecord["设备"]) ? typeRecord["设备"] : [];
    return rawItems.map((item, itemIndex) => createImportedDeviceFromChineseRecord(
      item && typeof item === "object" ? item as Record<string, unknown> : {},
      itemIndex + typeIndex + 1,
      typeLabel,
      typeUuid,
      typeIconText,
      typeIconClass,
    ));
  });
  const normalized = normalizeVaultIdentityData(rawItems, rawTypes);
  return {
    meta: {
      appName: APP_TITLE,
      formatVersion: CONFIG_FORMAT_VERSION,
      exportedAt: "",
    },
    items: normalized.items,
    customDeviceTypes: normalized.customDeviceTypes,
  };
}

export function createImportedDeviceFromChineseRecord(
  record: Record<string, unknown>,
  index: number,
  fallbackDeviceType = "",
  fallbackDeviceTypeUuid = "",
  fallbackIconText = "设",
  fallbackIconClass = "icon-cyan",
): VaultItem {
  const accounts: DeviceAccount[] = Array.isArray(record["账号"]) ? record["账号"].map((account, accountIndex) => {
    const accountRecord = account && typeof account === "object" ? account as Record<string, unknown> : {};
    const username = readString(accountRecord["用户名"]).trim();
    return {
      uuid: readString(accountRecord["账号UUID"]),
      id: accountIndex + 1,
      title: username || "未填写用户名",
      username,
      password: readString(accountRecord["密码"]),
      tag: readString(accountRecord["账号标签"], DEFAULT_ACCOUNT_TAG).trim() || DEFAULT_ACCOUNT_TAG,
      notes: readString(accountRecord["账号备注"]),
      updatedAt: readString(accountRecord["更新时间"]),
      passwordChangedAt: readString(accountRecord["密码更新时间"]),
      history: Array.isArray(accountRecord["密码历史"]) ? accountRecord["密码历史"].map((history, historyIndex): PasswordHistory => {
        const historyRecord = history && typeof history === "object" ? history as Record<string, unknown> : {};
        return {
          uuid: readString(historyRecord["历史UUID"]),
          id: historyIndex + 1,
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
    id: index + 1,
    title: primaryAccount?.title ?? readString(record["设备名称"], `设备 ${index + 1}`),
    deviceName: readString(record["设备名称"]),
    deviceType,
    deviceTypeUuid: readString(record["设备类型UUID"], fallbackDeviceTypeUuid),
    assetCode: readString(record["资产编号"]),
    location: readString(record["设备位置"]),
    username: primaryAccount?.username ?? "",
    password: primaryAccount?.password ?? "",
    ipAddress: readConnectionAddress(record),
    tag: deviceType || DEFAULT_ACCOUNT_TAG,
    iconText: readString(record["图标文字"], fallbackIconText).trim() || fallbackIconText,
    iconClass: fallbackIconClass,
    updatedAt: readString(record["更新时间"]),
    notes: readString(record["设备备注"]),
    history: primaryAccount?.history ?? [],
    accounts,
  };
}
