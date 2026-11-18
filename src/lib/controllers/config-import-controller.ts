import type { StatusOperation, StatusReporter } from "../status-presentation";
import { ensureDeviceTypeMetadata } from "../device-type-meta";
import { getConfigDiffSummary, mergeMissingImportedConfig, mergeXlsxImportedConfig } from "../vault-recovery";
import type { ConfigData, ConfigDiffSummary, ConfigTransferFormat, ConfigImportMode, DeviceTypeMeta, VaultItem } from "../types";

type ImportState = { items: VaultItem[]; customDeviceTypes: DeviceTypeMeta[] };
export type ConfigImportPort = {
  read(): ImportState;
  write(patch: ImportState): void;
  showStatus: StatusReporter;
  createSafetySnapshot(reason: string): Promise<{ id: string } | null>;
  resetWorkspaceAfterReplace(items: VaultItem[]): void;
  offerSnapshotUndo(snapshotId: string, message: string, operation: StatusOperation): void;
};

export function formatImportResultSummary(format: ConfigTransferFormat, modeLabel: string, diff: ConfigDiffSummary): string {
  const changed = Object.values(diff).some(count => count > 0);
  return `${format.toUpperCase()} ${modeLabel}导入完成${changed ? "" : "，无变更"}`;
}

export function createConfigImportController(port: ConfigImportPort) {
  async function applyImportedConfig(
    config: ConfigData,
    format: ConfigTransferFormat,
    mode: ConfigImportMode,
    overwriteDeviceKeys: string[] = [],
  ) {
    const state = port.read();
    const beforeSnapshot = JSON.stringify({ items: state.items, customDeviceTypes: state.customDeviceTypes });
    const nextConfig = format === "xlsx"
      ? mergeXlsxImportedConfig(state.items, state.customDeviceTypes, config, overwriteDeviceKeys)
      : mode === "replace"
        ? config
        : mergeMissingImportedConfig(state.items, state.customDeviceTypes, config);
    const diff = getConfigDiffSummary(state.items, state.customDeviceTypes, nextConfig);
    const hasChanges = Object.values(diff).some((count) => count > 0);
    if ((mode === "add-missing" || format === "xlsx") && !hasChanges) {
      port.showStatus(format === "xlsx" ? "没有新设备或已选择覆盖的设备" : "没有可新增的数据", undefined, "", null, { tone: "info", operation: "import" });
      return false;
    }

    const modeLabel = format === "xlsx" ? "按设备选择覆盖" : mode === "replace" ? "全部覆盖" : "仅新增";
    const snapshot = await port.createSafetySnapshot(`${modeLabel}导入 ${format.toUpperCase()} 配置前`);
    if (!snapshot) return false;
    const current = port.read();
    if (JSON.stringify({ items: current.items, customDeviceTypes: current.customDeviceTypes }) !== beforeSnapshot) {
      port.showStatus("数据在保存安全快照期间发生变化，导入已取消，请重新确认", undefined, "", null, { tone: "warning", operation: "import" });
      return false;
    }

    const normalized = ensureDeviceTypeMetadata(nextConfig.items, nextConfig.customDeviceTypes);
    const nextItems = normalized.items;
    port.write({
      items: nextItems,
      customDeviceTypes: normalized.customDeviceTypes,
    });
    if (mode === "replace" && format !== "xlsx") port.resetWorkspaceAfterReplace(nextItems);
    port.offerSnapshotUndo(snapshot.id, formatImportResultSummary(format, modeLabel, diff), "import");
    return true;
  }

  return { applyImportedConfig };
}
