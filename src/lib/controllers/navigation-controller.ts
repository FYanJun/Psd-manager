import type { ActivePopover, DeviceType, SortMode, VaultItem } from "../types";

export type NavigationState = {
  items: VaultItem[];
  selectedDeviceType: "全部设备" | DeviceType;
  selectedId: number;
  selectedAccountId: number;
  selectedAccountIds: number[];
  searchQuery: string;
  sortMode: SortMode;
  activePopover: ActivePopover;
  passwordVisible: boolean;
  visibleHistoryIds: number[];
};

type NavigationPort = {
  read(): NavigationState;
  write(patch: Partial<NavigationState>): void;
  focusSearch(): void;
};

export function createNavigationController(port: NavigationPort) {
  function updateSearch(value: string) {
    if (value === port.read().searchQuery) return;
    port.write({ searchQuery: value });
  }

  function clearSearch() {
    if (!port.read().searchQuery.trim()) return;
    port.write({ searchQuery: "" });
  }

  function selectDeviceType(deviceType: "全部设备" | DeviceType, searchValue = port.read().searchQuery) {
    const state = port.read();
    if (deviceType === state.selectedDeviceType) return;
    const firstMatch = state.items.find((item) => deviceType === "全部设备" || item.deviceType === deviceType);
    port.write({
      selectedDeviceType: deviceType,
      searchQuery: searchValue,
      selectedId: firstMatch?.id ?? 0,
      selectedAccountId: 0,
      selectedAccountIds: [],
      passwordVisible: false,
      activePopover: null,
      visibleHistoryIds: [],
    });
  }

  function selectDevice(id: number) {
    if (id === port.read().selectedId) return;
    port.write({
      selectedId: id,
      selectedAccountId: 0,
      selectedAccountIds: [],
      passwordVisible: false,
      visibleHistoryIds: [],
    });
  }

  function setSortMode(mode: SortMode) {
    if (mode === port.read().sortMode) return;
    port.write({ sortMode: mode });
  }

  function resetWorkspace(items: VaultItem[] = port.read().items) {
    port.write({
      selectedDeviceType: "全部设备",
      selectedId: items[0]?.id ?? 0,
      selectedAccountId: 0,
      selectedAccountIds: [],
      searchQuery: "",
      sortMode: port.read().sortMode,
      passwordVisible: false,
      visibleHistoryIds: [],
      activePopover: null,
    });
  }

  return {
    updateSearch,
    clearSearch,
    focusSearch: port.focusSearch,
    selectDeviceType,
    selectDevice,
    setSortMode,
    resetWorkspace,
  };
}
