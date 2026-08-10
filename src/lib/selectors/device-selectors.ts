import { defaultDeviceTypeMeta } from "../constants";
import { sortDeviceTypeOptions } from "../layout";
import type { DeviceType, DeviceTypeMeta, DeviceTypeSortMode, SortMode, VaultItem } from "../types";
import { getVaultItemUpdatedTimestamp, matchesVaultItemSearch } from "../vault";

export function getFilteredVaultItems(
  items: VaultItem[],
  searchQuery: string,
  selectedDeviceType: "全部设备" | DeviceType,
  sortMode: SortMode,
) {
  const query = searchQuery.trim().toLowerCase();
  return items
    .filter((item) => {
      const matchesQuery = !query || matchesVaultItemSearch(item, query);
      const matchesType = selectedDeviceType === "全部设备" || item.deviceType === selectedDeviceType;
      return matchesQuery && matchesType;
    })
    .sort((left, right) => {
      if (sortMode === "nameAsc") return left.deviceName.localeCompare(right.deviceName, "zh-Hans-CN");
      if (sortMode === "typeAsc") return left.deviceType.localeCompare(right.deviceType, "zh-Hans-CN");
      return getVaultItemUpdatedTimestamp(right) - getVaultItemUpdatedTimestamp(left) || right.id - left.id;
    });
}

export function getVisibleDeviceTypeOptions(
  customDeviceTypes: DeviceTypeMeta[],
  hiddenDeviceTypes: string[],
) {
  return [
    ...defaultDeviceTypeMeta
      .filter((type) => type.label !== "全部设备" && !hiddenDeviceTypes.includes(type.label))
      .map((type) => customDeviceTypes.find((custom) => custom.label === type.label) ?? type),
    ...customDeviceTypes.filter((custom) =>
      !defaultDeviceTypeMeta.some((type) => type.label === custom.label) || hiddenDeviceTypes.includes(custom.label)
    ),
  ];
}

export function getDeviceTypeRows(
  options: DeviceTypeMeta[],
  sortMode: DeviceTypeSortMode,
  items: VaultItem[],
) {
  const sorted = sortDeviceTypeOptions(options, sortMode, items);
  const rows: Array<DeviceTypeMeta & { count: number }> = [
    { ...defaultDeviceTypeMeta[0], count: items.length },
    ...sorted.map((type) => ({
      ...type,
      count: items.filter((item) => item.deviceType === type.label).length,
    })),
  ];
  return rows;
}
