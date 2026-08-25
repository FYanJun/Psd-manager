import { defaultDeviceTypeMeta } from "../constants";
import type { DeviceType, DeviceTypeMeta, DeviceTypeSortMode, SortMode, VaultItem } from "../types";
import { getVaultItemSearchScore, getVaultItemUpdatedTimestamp } from "../vault";

let filteredItemsCache: {
  items: VaultItem[];
  searchQuery: string;
  selectedDeviceType: "全部设备" | DeviceType;
  sortMode: SortMode;
  result: VaultItem[];
} | null = null;

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
  if (
    filteredItemsCache
    && filteredItemsCache.items === items
    && filteredItemsCache.searchQuery === searchQuery
    && filteredItemsCache.selectedDeviceType === selectedDeviceType
    && filteredItemsCache.sortMode === sortMode
  ) {
    return filteredItemsCache.result;
  }
  const query = searchQuery.trim().toLowerCase();
  const result = items
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
  filteredItemsCache = { items, searchQuery, selectedDeviceType, sortMode, result };
  return result;
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
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(item.deviceType, (counts.get(item.deviceType) ?? 0) + 1));
  const sorted = [...options].sort((left, right) => {
    if (sortMode === "nameAsc") return left.label.localeCompare(right.label, "zh-Hans-CN");
    if (sortMode === "countDesc") {
      return (counts.get(right.label) ?? 0) - (counts.get(left.label) ?? 0)
        || left.label.localeCompare(right.label, "zh-Hans-CN");
    }
    return options.indexOf(left) - options.indexOf(right);
  });
  const rows: Array<DeviceTypeMeta & { count: number }> = [
    { ...defaultDeviceTypeMeta[0], count: items.length },
    ...sorted.map((type) => ({
      ...type,
      count: counts.get(type.label) ?? 0,
    })),
  ];
  return rows;
}
