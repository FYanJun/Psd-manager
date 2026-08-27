import type { DeviceTypeMeta, PendingConfirmation, VaultItem, VaultSnapshot } from "../types";
import { createVaultSnapshot } from "../vault-recovery";

type SnapshotState = {
  items: VaultItem[];
  customDeviceTypes: DeviceTypeMeta[];
  snapshots: VaultSnapshot[];
};

type SnapshotControllerPort = {
  read(): SnapshotState;
  writeSnapshots(snapshots: VaultSnapshot[]): void;
  applySnapshot(snapshot: VaultSnapshot): void;
  setActiveDialog(dialog: null): void;
  setPendingConfirmation(confirmation: PendingConfirmation | null): void;
  showStatus(message: string, duration?: number, actionLabel?: string, action?: (() => void) | null): void;
  persistImmediately(): Promise<void>;
  refreshDirtyState(): void;
};

export function createSnapshotController(port: SnapshotControllerPort) {
  function dataSignature() {
    const { items, customDeviceTypes } = port.read();
    return JSON.stringify({ items, customDeviceTypes });
  }

  async function createSafetySnapshot(reason: string) {
    const state = port.read();
    const previousSnapshots = state.snapshots;
    const snapshot = createVaultSnapshot(reason, state.items, state.customDeviceTypes);
    port.writeSnapshots([snapshot, ...previousSnapshots].slice(0, 10));
    try {
      await port.persistImmediately();
      return snapshot;
    } catch (error) {
      port.writeSnapshots(previousSnapshots);
      port.refreshDirtyState();
      const reason = error instanceof Error ? error.message : String(error ?? "未知错误");
      port.showStatus(
        reason
          ? `安全快照保存失败，操作已取消：${reason}`
          : "安全快照保存失败，操作已取消",
        7000,
      );
      return null;
    }
  }

  async function restoreSnapshot(snapshotId: string, createCurrentBackup: boolean): Promise<boolean> {
    const snapshot = port.read().snapshots.find((candidate) => candidate.id === snapshotId);
    if (!snapshot) {
      port.showStatus("找不到要恢复的数据快照", 5000);
      return false;
    }
    if (createCurrentBackup) {
      const backup = await createSafetySnapshot("恢复快照前自动保存");
      if (!backup) return false;
    }
    port.applySnapshot(snapshot);
    port.setActiveDialog(null);
    port.setPendingConfirmation(null);
    try {
      await port.persistImmediately();
      port.showStatus("数据快照已恢复");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error ?? "未知错误");
      // The restored state remains in memory and dirty so the storage retry path
      // can persist it without silently discarding the user's selected snapshot.
      port.showStatus(
        reason
          ? `快照已应用，但保存失败：${reason}；请重试保存后再关闭程序`
          : "快照已应用，但保存失败；请重试保存后再关闭程序",
        8000,
      );
    }
    return true;
  }

  function offerUndo(snapshotId: string, message: string, onRestored?: () => void) {
    const expectedState = dataSignature();
    port.showStatus(message, 8000, "撤销", () => {
      if (dataSignature() !== expectedState) {
        port.showStatus("数据已继续变化，请从“数据快照”中选择恢复", 5000);
        return;
      }
      void restoreSnapshot(snapshotId, false).then((restored) => {
        if (restored) onRestored?.();
      });
    });
  }

  function requestRestore(snapshot: VaultSnapshot) {
    port.setActiveDialog(null);
    port.setPendingConfirmation({
      action: "restore-snapshot",
      snapshotId: snapshot.id,
      title: "恢复数据快照",
      message: `恢复“${snapshot.reason}”？`,
      detail: "当前资产库会被这个快照替换；恢复前会自动再保存一份当前数据。",
      confirmLabel: "确认恢复",
      summaryItems: [
        { label: "设备", value: `${snapshot.items.length} 台` },
        { label: "快照时间", value: new Date(snapshot.createdAt).toLocaleString("zh-CN", { hour12: false }) },
      ],
    });
  }

  return { createSafetySnapshot, restoreSnapshot, offerUndo, requestRestore };
}
