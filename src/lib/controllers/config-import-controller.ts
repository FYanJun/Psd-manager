import { ensureDeviceTypeMetadata } from "../device-type-meta";
import { getConfigDiffSummary, mergeMissingImportedConfig } from "../vault-recovery";
import type { ConfigData, ConfigFormat, ConfigImportMode, DeviceTypeMeta, VaultItem } from "../types";

type ImportState = { items: VaultItem[]; customDeviceTypes: DeviceTypeMeta[] };
export type ConfigImportPort = {
  read(): ImportState;
  write(patch: ImportState): void;
  showStatus(message: string): void;
  createSafetySnapshot(reason: string): Promise<{ id: string } | null>;
  resetWorkspaceAfterReplace(items: VaultItem[]): void;
  offerSnapshotUndo(snapshotId: string, message: string): void;
};

export function createConfigImportController(port: ConfigImportPort) {
  async function applyImportedConfig(config: ConfigData, format: ConfigFormat, mode: ConfigImportMode) {
    const state = port.read();
    const beforeSnapshot = JSON.stringify({ items: state.items, customDeviceTypes: state.customDeviceTypes });
    const nextConfig = mode === "replace"
      ? config
      : mergeMissingImportedConfig(state.items, state.customDeviceTypes, config);
    const diff = getConfigDiffSummary(state.items, state.customDeviceTypes, nextConfig);
    const hasChanges = Object.values(diff).some((count) => count > 0);
    if (mode === "add-missing" && !hasChanges) {
      port.showStatus("没有可新增的数据");
      return false;
    }

    const modeLabel = mode === "replace" ? "全部覆盖" : "仅新增";
    const snapshot = await port.createSafetySnapshot(`${modeLabel}导入 ${format.toUpperCase()} 配置前`);
    if (!snapshot) return false;
    const current = port.read();
    if (JSON.stringify({ items: current.items, customDeviceTypes: current.customDeviceTypes }) !== beforeSnapshot) {
      port.showStatus("数据在保存安全快照期间发生变化，导入已取消，请重新确认");
      return false;
    }

    const normalized = ensureDeviceTypeMetadata(nextConfig.items, nextConfig.customDeviceTypes);
    const nextItems = normalized.items;
    port.write({
      items: nextItems,
      customDeviceTypes: normalized.customDeviceTypes,
    });
    if (mode === "replace") port.resetWorkspaceAfterReplace(nextItems);
    port.offerSnapshotUndo(snapshot.id, `${format.toUpperCase()} 配置已按“${modeLabel}”导入`);
    return true;
  }

  return { applyImportedConfig };
}
