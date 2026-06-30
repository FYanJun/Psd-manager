import {
  GENERATOR_DEFAULT_RATIO,
  GENERATOR_MAX_RATIO,
  GENERATOR_MIN_RATIO,
  LIST_DEFAULT_RATIO,
  LIST_MAX_RATIO,
  LIST_MIN_RATIO,
  SIDEBAR_DEFAULT_RATIO,
  SIDEBAR_MAX_RATIO,
  SIDEBAR_MIN_RATIO,
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

export function getDefaultPaneRatio(pane: ResizePane) {
  if (pane === "sidebar") return SIDEBAR_DEFAULT_RATIO;
  if (pane === "list") return LIST_DEFAULT_RATIO;
  return GENERATOR_DEFAULT_RATIO;
}

export function getPaneRatioBounds(pane: ResizePane) {
  if (pane === "sidebar") return { min: SIDEBAR_MIN_RATIO, max: SIDEBAR_MAX_RATIO };
  if (pane === "list") return { min: LIST_MIN_RATIO, max: LIST_MAX_RATIO };
  return { min: GENERATOR_MIN_RATIO, max: GENERATOR_MAX_RATIO };
}

export function clampPaneRatio(ratio: number, pane: ResizePane) {
  const fallback = getDefaultPaneRatio(pane);
  const nextRatio = Number.isFinite(ratio) ? ratio : fallback;
  const { min, max } = getPaneRatioBounds(pane);
  return Number(Math.min(Math.max(nextRatio, min), max).toFixed(4));
}
