import { invoke, isTauri } from "@tauri-apps/api/core";
import { stat } from "@tauri-apps/plugin-fs";
import { openFileDialog, saveFileDialog, readTextFile, writeTextFile } from "./platform-files";
import { platformOperation } from "./platform-operation";
import type { BackupPlatform } from "./controllers/backup-controller";

const MAX_BACKUP_FILE_BYTES = 100 * 1024 * 1024;
function desktop() { if (!isTauri()) throw new Error("加密备份仅在桌面应用中可用"); }
export const backupPlatform: BackupPlatform = {
  encode(vaultContent, settingsContent, password) {
    desktop();
    return platformOperation("security", () => invoke<string>("create_encrypted_backup", { vaultContent, settingsContent, password }));
  },
  decode(content, password) {
    desktop();
    return platformOperation("security", () => invoke("open_encrypted_backup", { content, password }));
  },
  async chooseSave() {
    desktop();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return saveFileDialog({ title: "保存加密备份", defaultPath: `Psd-Manager-${stamp}.psdbackup`,
      filters: [{ name: "Psd Manager 加密备份", extensions: ["psdbackup"] }] });
  },
  async chooseOpen() {
    desktop();
    const path = await openFileDialog({ title: "选择加密备份", multiple: false, directory: false,
      filters: [{ name: "Psd Manager 加密备份", extensions: ["psdbackup"] }] });
    return typeof path === "string" ? path : null;
  },
  async read(path) {
    const info = await platformOperation("storage", () => stat(path));
    if (!info.isFile || info.size > MAX_BACKUP_FILE_BYTES) throw new Error("备份必须是 100 MB 以内的文件");
    const content = await readTextFile(path);
    if (new TextEncoder().encode(content).byteLength > MAX_BACKUP_FILE_BYTES) throw new Error("备份文件不能超过 100 MB");
    return content;
  },
  async write(path, content) {
    await writeTextFile(path, content);
    const persisted = await readTextFile(path);
    if (persisted !== content) throw new Error("备份落盘校验失败，请重新保存到其他文件");
  },
};
