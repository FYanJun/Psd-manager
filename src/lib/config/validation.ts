import {
  getTextInputValidationError,
  hasValidPersistedPassword,
  INPUT_LIMITS,
  CONNECTION_ADDRESS_ERROR,
  isValidDeviceTypeColor,
  isValidDeviceTypeIconText,
  isValidConnectionAddress,
} from "../input-validation";
import type { ConfigData } from "../types";
import { getAccounts } from "../vault";
import { readString } from "../utils";
import { isUuid } from "../uuid";
import { ConfigImportError, readRecordValue } from "./shared";

function assertValidTextField(
  value: string,
  label: string,
  maxLength: number,
  allowLineBreaks = false,
) {
  const error = getTextInputValidationError(value, maxLength, allowLineBreaks);
  if (error) throw new ConfigImportError(`${label}${error}`);
}

export function assertAllowedFields(
  record: Record<string, unknown>,
  label: string,
  allowedFields: readonly string[],
) {
  const allowed = new Set(allowedFields);
  const unsupported = Object.keys(record).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new ConfigImportError(`${label}包含当前格式不支持的字段：${unsupported.join("、")}`);
  }
}

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
    if (!type.label.trim()) {
      throw new ConfigImportError(`${typeLabel}缺少设备类型名称`);
    }
    assertValidTextField(type.label, `设备类型“${typeLabel}”的名称`, INPUT_LIMITS.deviceTypeName);
    const typeIconError = getTextInputValidationError(type.iconText, INPUT_LIMITS.deviceTypeIcon);
    if (typeIconError || !isValidDeviceTypeIconText(type.iconText)) {
      throw new ConfigImportError(`设备类型“${typeLabel}”的图标文字${typeIconError ?? "不能超过 2 个字符"}`);
    }
    if (!isValidDeviceTypeColor(type.color)) {
      throw new ConfigImportError(`设备类型“${typeLabel}”使用了不支持的颜色“${type.color}”`);
    }
  });
  config.items.forEach((item) => {
    const deviceName = item.deviceName.trim() || "未命名设备";
    assertValidTextField(item.deviceName, `设备“${deviceName}”的名称`, INPUT_LIMITS.deviceName);
    assertValidTextField(item.deviceType, `设备“${deviceName}”的设备类型`, INPUT_LIMITS.deviceTypeName);
    assertValidTextField(item.assetCode, `设备“${deviceName}”的资产编号`, INPUT_LIMITS.assetCode);
    assertValidTextField(item.location, `设备“${deviceName}”的设备位置`, INPUT_LIMITS.location);
    assertValidTextField(item.notes, `设备“${deviceName}”的设备备注`, INPUT_LIMITS.notes, true);
    const deviceIconError = getTextInputValidationError(item.iconText, INPUT_LIMITS.deviceTypeIcon);
    if (deviceIconError || !isValidDeviceTypeIconText(item.iconText)) {
      throw new ConfigImportError(`设备“${deviceName}”的图标文字${deviceIconError ?? "不能超过 2 个字符"}`);
    }
    if (!isValidConnectionAddress(item.ipAddress)) {
      throw new ConfigImportError(`设备“${deviceName}”的${CONNECTION_ADDRESS_ERROR}`);
    }
    getAccounts(item).forEach((account) => {
      const accountName = account.username.trim() || "未命名账号";
      assertValidTextField(account.username, `设备“${deviceName}”账号“${accountName}”的用户名`, INPUT_LIMITS.username);
      assertValidTextField(account.tag, `设备“${deviceName}”账号“${accountName}”的账号标签`, INPUT_LIMITS.accountTag);
      assertValidTextField(account.notes, `设备“${deviceName}”账号“${accountName}”的账号备注`, INPUT_LIMITS.notes, true);
      if (!hasValidPersistedPassword(account.password)) {
        throw new ConfigImportError(`设备“${deviceName}”账号“${accountName}”的密码包含不可用字符或长度超出限制`);
      }
      account.history.forEach((history, historyIndex) => {
        if (!hasValidPersistedPassword(history.password) || !hasValidPersistedPassword(history.newPassword)) {
          throw new ConfigImportError(`设备“${deviceName}”账号“${accountName}”的第 ${historyIndex + 1} 条密码历史包含控制字符或长度超出限制`);
        }
        assertValidTextField(
          history.reason,
          `设备“${deviceName}”账号“${accountName}”的第 ${historyIndex + 1} 条密码历史修改原因`,
          INPUT_LIMITS.passwordReason,
        );
      });
    });
  });
}

export function assertValidConfigIdentities(config: ConfigData) {
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
  const typeLabels = new Set<string>();
  const typeUuidsByLabel = new Map<string, string>();
  const deviceUuids = new Set<string>();
  const accountUuids = new Set<string>();
  const historyUuids = new Set<string>();
  rawTypes.forEach((type, typeIndex) => {
    if (!type || typeof type !== "object" || Array.isArray(type)) {
      throw new ConfigImportError(`第 ${typeIndex + 1} 个设备类型必须是对象`);
    }
    const typeRecord = type as Record<string, unknown>;
    const typeLabel = readString(typeRecord["设备类型"]).trim() || `第 ${typeIndex + 1} 个设备类型`;
    assertAllowedFields(typeRecord, `设备类型“${typeLabel}”`, [
      "设备类型UUID",
      "设备类型",
      "图标文字",
      "颜色",
      "设备",
    ]);
    if (typeLabels.has(typeLabel)) {
      throw new ConfigImportError(`设备类型名称重复：${typeLabel}`);
    }
    typeLabels.add(typeLabel);
    const typeUuid = requireImportedUuid(typeRecord["设备类型UUID"], `设备类型“${typeLabel}”`, typeUuids);
    const knownTypeUuid = typeUuidsByLabel.get(typeLabel);
    if (knownTypeUuid && knownTypeUuid !== typeUuid) {
      throw new ConfigImportError(`设备类型名称“${typeLabel}”对应了不同 UUID`);
    }
    typeUuidsByLabel.set(typeLabel, typeUuid);
    if (!Array.isArray(typeRecord["设备"])) {
      throw new ConfigImportError(`设备类型“${typeLabel}”的“设备”必须是数组`);
    }
    const devices = typeRecord["设备"];
    devices.forEach((device, deviceIndex) => {
      if (!device || typeof device !== "object" || Array.isArray(device)) {
        throw new ConfigImportError(`设备类型“${typeLabel}”下的第 ${deviceIndex + 1} 台设备必须是对象`);
      }
      const deviceRecord = device as Record<string, unknown>;
      const deviceName = readString(deviceRecord["设备名称"]).trim() || `第 ${deviceIndex + 1} 台设备`;
      ["IP地址", "设备信息"].forEach((field) => {
        if (field in deviceRecord) {
          throw new ConfigImportError(`设备“${deviceName}”包含已废弃字段“${field}”，请改用“连接地址”`);
        }
      });
      assertAllowedFields(deviceRecord, `设备“${deviceName}”`, [
        "设备UUID",
        "设备名称",
        "设备类型UUID",
        "更新时间",
        "账号",
        "资产编号",
        "设备位置",
        "连接地址",
        "设备备注",
        "图标文字",
      ]);
      requireImportedUuid(deviceRecord["设备UUID"], `设备“${deviceName}”`, deviceUuids);
      if (readString(deviceRecord["设备类型UUID"], typeUuid).trim().toLowerCase() !== typeUuid) {
        throw new ConfigImportError(`设备“${deviceName}”的设备类型 UUID 不匹配`);
      }
      if (!Array.isArray(deviceRecord["账号"])) {
        throw new ConfigImportError(`设备“${deviceName}”的“账号”必须是数组`);
      }
      const accounts = deviceRecord["账号"];
      accounts.forEach((account, accountIndex) => {
        if (!account || typeof account !== "object" || Array.isArray(account)) {
          throw new ConfigImportError(`设备“${deviceName}”下的第 ${accountIndex + 1} 个账号必须是对象`);
        }
        const accountRecord = account as Record<string, unknown>;
        const username = readString(accountRecord["用户名"]).trim() || `第 ${accountIndex + 1} 个账号`;
        assertAllowedFields(accountRecord, `账号“${username}”`, [
          "账号UUID",
          "用户名",
          "密码",
          "更新时间",
          "密码历史",
          "账号标签",
          "账号备注",
          "密码更新时间",
        ]);
        requireImportedUuid(accountRecord["账号UUID"], `账号“${username}”`, accountUuids);
        if (!Array.isArray(accountRecord["密码历史"])) {
          throw new ConfigImportError(`账号“${username}”的“密码历史”必须是数组`);
        }
        const history = accountRecord["密码历史"];
        history.forEach((entry, historyIndex) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new ConfigImportError(`账号“${username}”的第 ${historyIndex + 1} 条密码历史必须是对象`);
          }
          const record = entry as Record<string, unknown>;
          assertAllowedFields(record, `账号“${username}”的第 ${historyIndex + 1} 条密码历史`, [
            "历史UUID",
            "旧密码",
            "新密码",
            "修改时间",
            "修改原因",
          ]);
          requireImportedUuid(record["历史UUID"], `账号“${username}”的第 ${historyIndex + 1} 条密码历史`, historyUuids);
        });
      });
    });
  });
}

export function assertCsvConfigIdentities(records: Array<Record<string, string>>) {
  const typeLabelsByUuid = new Map<string, string>();
  const typeUuidsByLabel = new Map<string, string>();
  const typeMetadataByUuid = new Map<string, string>();
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
    const typeMetadata = JSON.stringify({
      label: typeLabel,
      icon: readRecordValue(record, "类型图标", "设备图标").trim() || typeLabel.slice(0, 1),
      color: readRecordValue(record, "类型颜色").trim().toLowerCase() || "cyan",
    });
    const knownTypeMetadata = typeMetadataByUuid.get(typeUuid);
    if (knownTypeMetadata && knownTypeMetadata !== typeMetadata) {
      throw new ConfigImportError(`${rowLabel}的设备类型 UUID 对应了不同的名称、图标或颜色`);
    }
    typeMetadataByUuid.set(typeUuid, typeMetadata);

    const deviceName = readRecordValue(record, "设备名称").trim();
    if (!deviceName) return;
    const deviceUuid = readRecordValue(record, "设备UUID").trim().toLowerCase();
    if (!isUuid(deviceUuid)) throw new ConfigImportError(`${rowLabel}的设备缺少有效 UUID`);
    const canonicalDevice = JSON.stringify({
      typeUuid,
      deviceName,
      assetCode: readRecordValue(record, "资产编号"),
      location: readRecordValue(record, "设备位置"),
      info: readRecordValue(record, "连接地址").trim(),
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
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new ConfigImportError(`${rowLabel}的第 ${historyIndex + 1} 条密码历史必须是对象`);
      }
      const historyRecord = entry as Record<string, unknown>;
      assertAllowedFields(historyRecord, `${rowLabel}的第 ${historyIndex + 1} 条密码历史`, [
        "历史UUID",
        "旧密码",
        "新密码",
        "修改时间",
        "修改原因",
      ]);
      requireImportedUuid(historyRecord["历史UUID"], `${rowLabel}的第 ${historyIndex + 1} 条密码历史`, historyUuids);
    });
  });
}
