import type { DeviceTypeMeta, VaultItem } from "../types";
import { normalizeVaultItems } from "../vault";
import { readString } from "../utils";
import { createUuid, isUuid } from "../uuid";

function takeUniqueTypeUuid(value: unknown, usedUuids: Set<string>) {
  let uuid = readString(value).trim().toLowerCase();
  while (!isUuid(uuid) || usedUuids.has(uuid)) uuid = createUuid();
  usedUuids.add(uuid);
  return uuid;
}

export function normalizeDeviceTypeMetaList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const usedLabels = new Set<string>();
  const usedUuids = new Set<string>();
  return value.reduce<DeviceTypeMeta[]>((types, type) => {
    if (type && typeof type === "object") {
      const record = type as Partial<DeviceTypeMeta> & Record<string, unknown>;
      const label = readString(record.label, readString(record["设备类型"])).trim();
      if (!label || label === "全部设备" || usedLabels.has(label)) return types;
      usedLabels.add(label);
      const explicitUuid = readString(record.uuid).trim();
      const importedTypeUuid = readString(record["设备类型UUID"]).trim();
      const rawUuid = isUuid(explicitUuid) ? explicitUuid : importedTypeUuid;
      types.push({
        uuid: takeUniqueTypeUuid(rawUuid, usedUuids),
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
  const usedTypeUuids = new Set(customDeviceTypes.map((type) => type.uuid));

  items.forEach((item) => {
    const label = item.deviceType.trim();
    if (!label || label === "全部设备" || typesByLabel.has(label)) return;
    const type: DeviceTypeMeta = {
      uuid: takeUniqueTypeUuid(item.deviceTypeUuid, usedTypeUuids),
      label,
      iconText: item.iconText.trim() || label.slice(0, 1),
      color: "blue",
    };
    customDeviceTypes.push(type);
    typesByLabel.set(label, type);
  });

  return {
    items: items.map((item) => {
      const type = typesByLabel.get(item.deviceType.trim());
      return {
        ...item,
        deviceTypeUuid: type?.uuid ?? (item.deviceType.trim() === "全部设备" ? "" : item.deviceTypeUuid),
      };
    }),
    customDeviceTypes,
  };
}
