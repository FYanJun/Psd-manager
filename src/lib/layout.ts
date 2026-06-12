import {
  DETAIL_MIN_WIDTH,
  GENERATOR_MAX_WIDTH,
  GENERATOR_MIN_WIDTH,
  LIST_MAX_WIDTH,
  LIST_MIN_WIDTH,
  RESIZER_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "./constants";
import type { DeviceTypeMeta, DeviceTypeSortMode, ResizePane, VaultItem } from "./types";

export function sortDeviceTypeOptions(types: DeviceTypeMeta[], mode: DeviceTypeSortMode, vaultItems: VaultItem[]) {
  const rows = types.map((type, index) => ({
    ...type,
    count: vaultItems.filter((item) => item.deviceType === type.label).length,
    index,
  }));
  if (mode === "nameAsc") {
    rows.sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN"));
  } else if (mode === "countDesc") {
    rows.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-Hans-CN"));
  } else {
    rows.sort((left, right) => left.index - right.index);
  }
  return rows.map(({ index, count, ...type }) => type);
}

export function getMaxPaneWidth(
  pane: ResizePane,
  viewportWidth: number,
  sidebarWidth: number,
  listWidth: number
) {
  if (pane === "generator") {
    return Math.max(GENERATOR_MIN_WIDTH, Math.min(GENERATOR_MAX_WIDTH, viewportWidth - 120));
  }
  const availableWidth = viewportWidth - DETAIL_MIN_WIDTH - RESIZER_WIDTH * 2;
  if (pane === "sidebar") return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, availableWidth - listWidth));
  return Math.max(LIST_MIN_WIDTH, Math.min(LIST_MAX_WIDTH, availableWidth - sidebarWidth));
}

export function getPaneMinWidth(pane: ResizePane) {
  if (pane === "sidebar") return SIDEBAR_MIN_WIDTH;
  if (pane === "list") return LIST_MIN_WIDTH;
  return GENERATOR_MIN_WIDTH;
}

export function clampPaneWidth(
  width: number,
  pane: ResizePane,
  viewportWidth: number,
  sidebarWidth: number,
  listWidth: number
) {
  return Math.round(Math.min(Math.max(width, getPaneMinWidth(pane)), getMaxPaneWidth(pane, viewportWidth, sidebarWidth, listWidth)));
}
