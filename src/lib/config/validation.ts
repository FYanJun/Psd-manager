import {
  hasValidPasswordCharacters,
  CONNECTION_ADDRESS_ERROR,
  isValidDeviceTypeColor,
  isValidDeviceTypeIconText,
  isValidConnectionAddress,
  PASSWORD_CHARACTER_ERROR,
} from "../input-validation";
import type { ConfigData } from "../types";
import { getAccounts } from "../vault";
import { readString } from "../utils";
import { isUuid } from "../uuid";
import { ConfigImportError, readRecordValue } from "./shared";

export function assertValidConfigNames(items: ConfigData["items"]) {
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

export function assertValidConfigFields(config: ConfigData) {
  config.customDeviceTypes.forEach((type, typeIndex) => {
    const typeLabel = type.label.trim() || `第 ${typeIndex + 1} 个设备类型`;
    if (!isValidDeviceTypeIconText(type.iconText)) {
      throw new ConfigImportError(`设备类型“${typeLabel}”的图标文字不能超过 2 个字符`);
    }
    if (!isValidDeviceTypeColor(type.color)) {
      throw new ConfigImportError(`设备类型“${typeLabel}”使用了不支持的颜色“${type.color}”`);
    }
  });
  config.items.forEach((item) => {
    const deviceName = item.deviceName.trim() || "未命名设备";
    if (!isValidDeviceTypeIconText(item.iconText)) {
      throw new ConfigImportError(`设备“${deviceName}”的图标文字不能超过 2 个字符`);
    }
    if (!isValidConnectionAddress(item.ipAddress)) {
      throw new ConfigImportError(`设备“${deviceName}”的${CONNECTION_ADDRESS_ERROR}`);
    }
    getAccounts(item).forEach((account) => {
      const accountName = account.username.trim() || "未命名账号";
      if (!hasValidPasswordCharacters(account.password)) {
        throw new ConfigImportError(`设备“${deviceName}”账号“${accountName}”的${PASSWORD_CHARACTER_ERROR}`);
      }
      account.history.forEach((history, historyIndex) => {
        if (!hasValidPasswordCharacters(history.password) || !hasValidPasswordCharacters(history.newPassword)) {
          throw new ConfigImportError(`设备“${deviceName}”账号“${accountName}”的第 ${historyIndex + 1} 条密码历史包含不合规字符`);
        }
      });
    });
  });
}

export function assertValidConfigIdentities(config: ConfigData) {
  if (config.meta.formatVersion < 3) return;
  const typeUuids = new Set<string>();
  const typesByUuid = new Map<string, ConfigData["customDeviceTypes"][number]>();
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

export function requireImportedUuid(value: unknown, label: string, used: Set<string>) {
  const uuid = readString(value).trim().toLowerCase();
  if (!isUuid(uuid)) throw new ConfigImportError(`${label}缺少有效 UUID`);
  if (used.has(uuid)) throw new ConfigImportError(`${label}的 UUID 重复：${uuid}`);
  used.add(uuid);
  return uuid;
}

export function assertStructuredConfigIdentities(rawTypes: unknown[]) {
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

export function assertCsvConfigIdentities(records: Array<Record<string, string>>) {
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
      info: readRecordValue(record, "连接地址", "设备信息", "IP地址").trim(),
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
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error ?? "无法解析");
      throw new ConfigImportError(`${rowLabel}的密码历史不是有效 JSON：${reason}`);
    }
    if (!Array.isArray(history)) throw new ConfigImportError(`${rowLabel}的密码历史必须是数组`);
    history.forEach((entry, historyIndex) => {
      const historyRecord = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      requireImportedUuid(historyRecord["历史UUID"], `${rowLabel}的第 ${historyIndex + 1} 条密码历史`, historyUuids);
    });
  });
}
