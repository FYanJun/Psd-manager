import { validatePersistedVaultState } from "../persisted-vault";
import { getErrorMessage } from "../utils";
import type { AppSettings, PersistedVaultState, VaultSnapshot } from "../types";

export type BackupMode = "create" | "restore";
export type BackupView = {
  mode: BackupMode | null;
  stage: "password" | "review" | "done";
  busy: boolean;
  error: string;
  message: string;
  fileName: string;
  includeSettings: boolean;
  summary: { devices: number; accounts: number; snapshots: number; hasSettings: boolean } | null;
};
export const emptyBackupView = (): BackupView => ({ mode: null, stage: "password", busy: false,
  error: "", message: "", fileName: "", includeSettings: true, summary: null });

type BackupPort = {
  available(): boolean;
  capture(): PersistedVaultState;
  settings(): AppSettings;
  flushVault(): Promise<void>;
  flushSettings(): Promise<void>;
  createSafetySnapshot(): Promise<VaultSnapshot | null>;
  applyVault(data: PersistedVaultState): void;
  persistRestored(): Promise<void>;
  restoreSettings(content: string): Promise<void>;
  publish(view: BackupView): void;
  close(): void;
};
export type BackupPlatform = {
  encode(vault: string, settings: string | null, password: string): Promise<string>;
  decode(content: string, password: string): Promise<{ vault: string; settings: string | null }>;
  chooseSave(): Promise<string | null>;
  chooseOpen(): Promise<string | null>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
};

// Passwords stay in the form and the active call, never in the published view.
export function createBackupController(port: BackupPort, platform: BackupPlatform) {
  let view = emptyBackupView();
  let generation = 0;
  let preview: { data: PersistedVaultState; settings: string | null; baseline: string } | null = null;
  const publish = (patch: Partial<BackupView>) => { view = { ...view, ...patch }; port.publish(view); };
  const signature = () => JSON.stringify(port.capture());
  const current = (id: number) => generation === id && view.mode !== null;
  const ensureAvailable = () => { if (!port.available()) throw new Error("资产库当前不可用，请先解锁并完成保存后重试"); };

  function clear() { generation += 1; preview = null; view = emptyBackupView(); port.publish(view); }
  function open(mode: BackupMode) {
    if (view.busy || !port.available()) return;
    clear(); publish({ mode });
  }
  function close() { if (view.busy) return; clear(); port.close(); }

  async function submit(password: string, confirmation = "") {
    if (view.busy || !view.mode || view.stage !== "password") return;
    const length = Array.from(password).length;
    if (length < 8 || length > 256 || /[\u0000-\u001f\u007f-\u009f]/u.test(password)) {
      publish({ error: "备份密码至少 8 个字符，最多 256 个字符，且不能包含控制字符" }); return;
    }
    if (view.mode === "create" && password !== confirmation) { publish({ error: "两次输入的备份密码不一致" }); return; }
    const id = generation;
    const mode = view.mode;
    const includeSettings = view.includeSettings;
    publish({ busy: true, error: "", message: "" });
    try {
      ensureAvailable();
      if (mode === "create") {
        const path = await platform.chooseSave();
        if (!current(id) || !path) return;
        await port.flushVault();
        if (!current(id)) return;
        if (includeSettings) await port.flushSettings();
        if (!current(id)) return;
        ensureAvailable();
        const vault = JSON.stringify(port.capture());
        const settings = includeSettings ? JSON.stringify(port.settings()) : null;
        const encoded = await platform.encode(vault, settings, password);
        if (!current(id)) return;
        await platform.write(path, encoded);
        if (!current(id)) return;
        publish({ stage: "done", fileName: path.split(/[\\/]/).pop() || path,
          message: "加密备份已保存。请将文件保存在独立位置，并妥善保管备份密码。" });
      } else {
        const path = await platform.chooseOpen();
        if (!current(id) || !path) return;
        const content = await platform.read(path);
        if (!current(id)) return;
        const decoded = await platform.decode(content, password);
        if (!current(id)) return;
        ensureAvailable();
        const data = validatePersistedVaultState(JSON.parse(decoded.vault));
        preview = { data, settings: decoded.settings, baseline: signature() };
        publish({ stage: "review", fileName: path.split(/[\\/]/).pop() || path,
          summary: { devices: data.items.length, accounts: data.items.reduce((n, item) => n + item.accounts.length, 0),
            snapshots: data.snapshots.length, hasSettings: decoded.settings !== null } });
      }
    } catch (error) {
      if (current(id)) publish({ error: getErrorMessage(error, "备份操作失败") });
    } finally { if (current(id)) publish({ busy: false }); }
  }

  async function confirmRestore() {
    if (view.busy || view.stage !== "review" || !preview) return;
    const id = generation;
    const selected = preview;
    const includeSettings = view.includeSettings;
    let applied = false;
    publish({ busy: true, error: "" });
    try {
      ensureAvailable();
      if (signature() !== selected.baseline) throw new Error("预览后数据发生变化，请重新打开备份预览");
      await port.flushVault();
      if (!current(id)) return;
      if (signature() !== selected.baseline) throw new Error("保存期间数据发生变化，请重新打开备份预览");
      const before = JSON.parse(selected.baseline) as PersistedVaultState;
      const safety = await port.createSafetySnapshot();
      if (!current(id)) return;
      if (!safety) throw new Error("恢复前安全快照保存失败，已取消恢复");
      const expected = { ...before, snapshots: [safety, ...before.snapshots].slice(0, 10) };
      // Snapshot creation is asynchronous; reject any intervening edit, including
      // snapshot-list changes, instead of replacing a newer in-memory dataset.
      if (signature() !== JSON.stringify(expected)) throw new Error("创建快照期间数据发生变化，请重新打开备份预览");
      ensureAvailable();
      const restored = { ...selected.data, snapshots: [safety, ...selected.data.snapshots.filter(s => s.id !== safety.id)].slice(0, 10) };
      port.applyVault(restored);
      applied = true;
      preview = null;
      await port.persistRestored();
      if (!current(id)) return;
      publish({ stage: "done", message: "资产库已恢复；恢复前的数据保留在“数据快照”中。" });
      if (includeSettings && selected.settings !== null) {
        await port.restoreSettings(selected.settings);
        if (current(id)) publish({ message: "资产库和应用偏好已恢复；本机窗口、自启和主密码保护保持原设置。" });
      }
    } catch (error) {
      if (!current(id)) return;
      if (applied) {
        publish({ stage: "done", message: view.message || "备份数据已应用，但资产库保存失败；请关闭此窗口后重试保存，完成前不要退出应用。",
          error: getErrorMessage(error, "恢复保存失败") });
      } else {
        preview = null;
        publish({ stage: "password", summary: null, error: getErrorMessage(error, "恢复失败") });
      }
    } finally { if (current(id)) publish({ busy: false }); }
  }
  return { open, close, clear, submit, confirmRestore,
    setIncludeSettings(value: boolean) { if (!view.busy) publish({ includeSettings: value }); },
  };
}
