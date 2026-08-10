import type { ConfigData, DeviceTypeMeta, VaultItem } from "../types";
import { compareText } from "./shared";
import { createUuid, isUuid } from "../uuid";

export function compareVaultItemsForExport(left: VaultItem, right: VaultItem) {
  return compareText(left.deviceType, right.deviceType) ||
    compareText(left.deviceName, right.deviceName) ||
    compareText(left.ipAddress, right.ipAddress) ||
    left.id - right.id;
}

export function buildDeviceTypeGroups(config: ConfigData) {
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
