import type { ActivePopover, DeviceType, SortMode, VaultItem, ViewState } from "../types";

export type NavigationState = {
  items: VaultItem[];
  selectedDeviceType: "全部设备" | DeviceType;
  selectedId: number;
  selectedAccountId: number;
  selectedAccountIds: number[];
  searchQuery: string;
  sortMode: SortMode;
  backStack: ViewState[];
  forwardStack: ViewState[];
  restoringView: boolean;
  activePopover: ActivePopover;
  passwordVisible: boolean;
  visibleHistoryIds: number[];
};

type NavigationPort = {
  read(): NavigationState;
  write(patch: Partial<NavigationState>): void;
  focusSearch(): void;
  isDeviceTypeAvailable(deviceType: "全部设备" | DeviceType): boolean;
};

function snapshot(state: NavigationState): ViewState {
  return {
    selectedDeviceType: state.selectedDeviceType,
    selectedId: state.selectedId,
    searchQuery: state.searchQuery,
    sortMode: state.sortMode,
  };
}

function statesMatch(left: ViewState, right: ViewState) {
  return left.selectedDeviceType === right.selectedDeviceType
    && left.selectedId === right.selectedId
    && left.searchQuery === right.searchQuery
    && left.sortMode === right.sortMode;
}

export function createNavigationController(port: NavigationPort) {
  function push() {
    const state = port.read();
    if (state.restoringView) return;
    const current = snapshot(state);
    const previous = state.backStack[state.backStack.length - 1];
    port.write({
      backStack: !previous || !statesMatch(previous, current)
        ? [...state.backStack.slice(-79), current]
        : state.backStack,
      forwardStack: [],
    });
  }

  function applyView(state: ViewState) {
    const selectedDeviceType = state.selectedDeviceType === "全部设备" || port.isDeviceTypeAvailable(state.selectedDeviceType)
      ? state.selectedDeviceType
      : "全部设备";
    const matchingItems = port.read().items.filter((item) =>
      selectedDeviceType === "全部设备" || item.deviceType === selectedDeviceType
    );
    const selectedId = matchingItems.some((item) => item.id === state.selectedId)
      ? state.selectedId
      : matchingItems[0]?.id ?? 0;
    port.write({
      restoringView: true,
      selectedDeviceType,
      selectedId,
      selectedAccountId: 0,
      selectedAccountIds: [],
      searchQuery: state.searchQuery,
      sortMode: state.sortMode,
      passwordVisible: false,
      visibleHistoryIds: [],
    });
    queueMicrotask(() => port.write({ restoringView: false }));
  }

  function back() {
    const state = port.read();
    const previous = state.backStack[state.backStack.length - 1];
    if (!previous) return;
    port.write({
      backStack: state.backStack.slice(0, -1),
      forwardStack: [snapshot(state), ...state.forwardStack.slice(0, 79)],
    });
    applyView(previous);
  }

  function forward() {
    const state = port.read();
    const next = state.forwardStack[0];
    if (!next) return;
    port.write({
      forwardStack: state.forwardStack.slice(1),
      backStack: [...state.backStack.slice(-79), snapshot(state)],
    });
    applyView(next);
  }

  function updateSearch(value: string) {
    const state = port.read();
    if (value === state.searchQuery) return;
    if (!state.searchQuery.trim() || !value.trim()) push();
    port.write({ searchQuery: value });
  }

  function clearSearch() {
    if (!port.read().searchQuery.trim()) return;
    push();
    port.write({ searchQuery: "" });
  }

  function selectDeviceType(deviceType: "全部设备" | DeviceType) {
    const state = port.read();
    if (deviceType === state.selectedDeviceType && !state.searchQuery) return;
    push();
    const firstMatch = state.items.find((item) => deviceType === "全部设备" || item.deviceType === deviceType);
    port.write({
      selectedDeviceType: deviceType,
      searchQuery: "",
      selectedId: firstMatch?.id ?? 0,
      selectedAccountIds: [],
      activePopover: null,
      visibleHistoryIds: [],
    });
  }

  function selectDevice(id: number) {
    if (id === port.read().selectedId) return;
    push();
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
    push();
    port.write({ sortMode: mode });
  }

  function reset() {
    port.write({ backStack: [], forwardStack: [], restoringView: false });
  }

  function resetWorkspace(items: VaultItem[] = port.read().items) {
    port.write({
      selectedDeviceType: "全部设备",
      selectedId: items[0]?.id ?? 0,
      selectedAccountId: 0,
      selectedAccountIds: [],
      searchQuery: "",
      sortMode: "updatedDesc",
      backStack: [],
      forwardStack: [],
      restoringView: false,
      passwordVisible: false,
      visibleHistoryIds: [],
      activePopover: null,
    });
  }

  return {
    push,
    back,
    forward,
    updateSearch,
    clearSearch,
    focusSearch: port.focusSearch,
    selectDeviceType,
    selectDevice,
    setSortMode,
    reset,
    resetWorkspace,
  };
}
