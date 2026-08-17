import { defaultDeviceTypeMeta } from "../constants";
import { sortDeviceTypeOptions } from "../layout";
import type { DeviceType, DeviceTypeMeta, DeviceTypeSortMode, SortMode, VaultItem } from "../types";
import { getVaultItemSearchScore, getVaultItemUpdatedTimestamp } from "../vault";

function compareVaultItems(left: VaultItem, right: VaultItem, sortMode: SortMode) {
  if (sortMode === "nameAsc") return left.deviceName.localeCompare(right.deviceName, "zh-Hans-CN");
  if (sortMode === "typeAsc") return left.deviceType.localeCompare(right.deviceType, "zh-Hans-CN");
  return getVaultItemUpdatedTimestamp(right) - getVaultItemUpdatedTimestamp(left) || right.id - left.id;
}

export function getFilteredVaultItems(
  items: VaultItem[],
  searchQuery: string,
  selectedDeviceType: "全部设备" | DeviceType,
  sortMode: SortMode,
) {
  const query = searchQuery.trim().toLowerCase();
  return items
    .map((item) => ({
      item,
      searchScore: query ? getVaultItemSearchScore(item, query) : 0,
    }))
    .filter(({ item, searchScore }) => {
      const matchesQuery = !query || searchScore > 0;
      const matchesType = selectedDeviceType === "全部设备" || item.deviceType === selectedDeviceType;
      return matchesQuery && matchesType;
    })
    .sort((left, right) => {
      if (query && left.searchScore !== right.searchScore) return right.searchScore - left.searchScore;
      return compareVaultItems(left.item, right.item, sortMode);
    })
    .map(({ item }) => item);
}

export function getVisibleDeviceTypeOptions(
  customDeviceTypes: DeviceTypeMeta[],
) {
  return [
    ...defaultDeviceTypeMeta
      .filter((type) => type.label !== "全部设备")
      .map((type) => customDeviceTypes.find((custom) => custom.label === type.label) ?? type),
    ...customDeviceTypes.filter((custom) =>
      !defaultDeviceTypeMeta.some((type) => type.label === custom.label)
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
