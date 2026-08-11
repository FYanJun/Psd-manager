import { APP_TITLE, CONFIG_FORMAT_VERSION, DEFAULT_ACCOUNT_TAG } from "../constants";
import type { ConfigData, DeviceAccount, PasswordHistory, VaultItem } from "../types";
import { getAccounts } from "../vault";
import { readNumber, readString } from "../utils";
import { buildDeviceTypeGroups } from "./export-utils";
import { normalizeVaultIdentityData } from "./normalization";
import { assertStructuredConfigIdentities } from "./validation";
import { ConfigImportError, stripUtf8Bom } from "./shared";

function readConnectionAddress(record: Record<string, unknown>) {
  return readString(record["连接地址"]).trim() || readString(record["IP地址"]).trim();
}

export function createJsonDeviceRecord(item: VaultItem) {
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

export function createJsonConfigPayload(config: ConfigData) {
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

export function parseJsonConfigContent(content: string): ConfigData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripUtf8Bom(content));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error ?? "无法解析");
    throw new ConfigImportError(`JSON 配置语法错误：${reason}`);
  }
  if (isStructuredConfigPayload(parsed)) return parseStructuredConfigPayload(parsed);
  throw new ConfigImportError("JSON 配置结构错误：缺少“设备类型”数组或有效的“元信息”");
}

export function isStructuredConfigPayload(parsed: unknown): parsed is Record<string, unknown> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  const meta = record["元信息"];
  return Array.isArray(record["设备类型"]) || Boolean(meta && typeof meta === "object" &&
    ["应用名称", "格式版本", "导出时间"].some((key) => key in (meta as Record<string, unknown>)));
}

export function parseStructuredConfigPayload(parsed: Record<string, unknown>): ConfigData {
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
  };
}

export function createImportedDeviceFromChineseRecord(
  record: Record<string, unknown>,
  index: number,
  fallbackDeviceType = "",
  fallbackDeviceTypeUuid = "",
): VaultItem {
  const accounts: DeviceAccount[] = Array.isArray(record["账号"]) ? record["账号"].map((account, accountIndex) => {
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
      history: Array.isArray(accountRecord["密码历史"]) ? accountRecord["密码历史"].map((history, historyIndex): PasswordHistory => {
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
    ipAddress: readConnectionAddress(record),
    tag: deviceType || DEFAULT_ACCOUNT_TAG,
    iconText: readString(record["图标文字"]),
    iconClass: "",
    updatedAt: readString(record["更新时间"]),
    notes: readString(record["设备备注"]),
    history: primaryAccount?.history ?? [],
    accounts,
  };
}
