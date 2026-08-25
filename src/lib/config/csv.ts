import { APP_TITLE, CONFIG_FORMAT_VERSION, DEFAULT_ACCOUNT_TAG } from "../constants";
import type { ConfigData, DeviceAccount, PasswordHistory, VaultItem } from "../types";
import { getAccounts, iconClassForColor } from "../vault";
import { formatDateTime, readString } from "../utils";
import { isUuid } from "../uuid";
import { buildDeviceTypeGroups } from "./export-utils";
import { normalizeVaultIdentityData } from "./normalization";
import { assertCsvConfigIdentities } from "./validation";
import {
  CSV_HEADERS,
  ConfigImportError,
  escapeCsvValue,
  parseCsvRows,
  readRecordValue,
  stripUtf8Bom,
} from "./shared";

export function createCsvConfigPayload(config: ConfigData) {
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

export function createCsvRow({
  type,
  item,
  account,
}: {
  type?: ConfigData["customDeviceTypes"][number];
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
    if (header === "连接地址") return item?.ipAddress ?? "";
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

export function createCsvHistoryRecords(history: PasswordHistory[]) {
  return [...history]
    .sort((left, right) => left.id - right.id)
    .map((entry) => ({
      历史UUID: entry.uuid,
      旧密码: entry.password,
      新密码: entry.newPassword,
      修改时间: entry.changedAt,
      修改原因: entry.reason,
    }));
}

export function parseCsvConfigContent(content: string): ConfigData {
  const rows = parseCsvRows(stripUtf8Bom(content)).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length === 0) throw new ConfigImportError("CSV 配置为空，没有可导入的数据");
  return parseFlatCsvConfigRows(rows);
}

export function parseFlatCsvConfigRows(rows: string[][]): ConfigData {
  const headers = rows[0].map((header) => header.trim());
  const unsupportedHeaders = ["IP地址", "设备信息"].filter((header) => headers.includes(header));
  if (unsupportedHeaders.length > 0) {
    throw new ConfigImportError(`CSV 配置包含已废弃字段：${unsupportedHeaders.join("、")}；请改用连接地址`);
  }
  if (!["设备类型", "设备名称", "用户名", "密码历史"].every((header) => headers.includes(header))) {
    throw new ConfigImportError("CSV 配置缺少必要列：设备类型、设备名称、用户名、密码历史");
  }

  const uuidHeaders = ["设备类型UUID", "设备UUID", "账号UUID"];
  const uuidHeaderCount = uuidHeaders.filter((header) => headers.includes(header)).length;
  if (uuidHeaderCount !== uuidHeaders.length) {
    throw new ConfigImportError("CSV 配置缺少当前格式的 UUID 列：必须包含设备类型UUID、设备UUID和账号UUID");
  }

  const records = rows.slice(1)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  assertCsvConfigIdentities(records);

  const typeRecords = new Map<string, Record<string, string>>();
  const devicesByKey = new Map<string, VaultItem>();

  records.forEach((record, rowIndex) => {
    const rowNumber = rowIndex + 2;
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
    const deviceInfo = readRecordValue(record, "连接地址").trim();
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
      if (hasAccount) throw new ConfigImportError(`CSV 第 ${rowNumber} 行包含账号，但缺少设备名称`);
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
        iconClass: iconClassForColor(typeColor),
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
      id: item.accounts.length + 1,
      title: username || "未填写用户名",
      username,
      password: readRecordValue(record, "密码"),
      tag: readRecordValue(record, "账号标签").trim() || DEFAULT_ACCOUNT_TAG,
      notes: readRecordValue(record, "账号备注"),
      updatedAt: readRecordValue(record, "账号更新时间").trim() || item.updatedAt,
      passwordChangedAt: readRecordValue(record, "密码更新时间").trim(),
      history,
    };
    item.accounts = [...item.accounts, account];
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
      formatVersion: CONFIG_FORMAT_VERSION,
      exportedAt: "",
    },
    items: normalized.items,
    customDeviceTypes: normalized.customDeviceTypes,
  };
}

export function parseCsvHistory(value: string, rowNumber: number): PasswordHistory[] {
  const text = value.trim();
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error ?? "无法解析");
    throw new ConfigImportError(`CSV 第 ${rowNumber} 行的密码历史不是有效 JSON：${reason}`);
  }
  if (!Array.isArray(parsed)) {
    throw new ConfigImportError(`CSV 第 ${rowNumber} 行的密码历史必须是 JSON 数组`);
  }
  return parsed.map((entry, index) => {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      uuid: readString(record["历史UUID"]),
      id: index + 1,
      password: readString(record["旧密码"]),
      newPassword: readString(record["新密码"]),
      changedAt: readString(record["修改时间"]),
      reason: readString(record["修改原因"]),
    };
  });
}
