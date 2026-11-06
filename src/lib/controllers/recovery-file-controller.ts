import { isTauri } from "@tauri-apps/api/core";
import { openFileDialog, saveFileDialog, readTextFile, writeTextFile } from "../platform-files";

type RecoveryFileState = {
  recoveryKey: string;
  recoveryAcknowledged: boolean;
  recoveryFileBusy: boolean;
  recoveryFileError: string;
  recoveryFileName: string;
  recoveryFileSaved: boolean;
  recoveryFileContent: string;
  recoveryError: string;
};

type RecoveryFilePort = {
  read(): Pick<RecoveryFileState, "recoveryKey" | "recoveryFileBusy">;
  write(patch: Partial<Omit<RecoveryFileState, "recoveryKey">>): void;
  showStatus(message: string): void;
};

type RecoveryFileIO = {
  isTauri(): boolean;
  saveFileDialog: typeof saveFileDialog;
  openFileDialog: typeof openFileDialog;
  writeTextFile: typeof writeTextFile;
  readTextFile: typeof readTextFile;
  downloadFile(content: string, name: string): void;
  chooseBrowserFile(): Promise<{ content: string; name: string } | null>;
};

const defaultFileName = "PsdManager-Recovery.psdm-recovery";

const recoveryFileIO: RecoveryFileIO = {
  isTauri,
  saveFileDialog,
  openFileDialog,
  writeTextFile,
  readTextFile,
  downloadFile(content, name) {
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  },
  chooseBrowserFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".psdm-recovery,application/json";
      input.oncancel = () => resolve(null);
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        file.text().then(content => resolve({ content, name: file.name }), reject);
      };
      input.click();
    });
  },
};

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || defaultFileName;
}

export function createRecoveryFileController(port: RecoveryFilePort, io: RecoveryFileIO = recoveryFileIO) {
  let busy = false;

  async function saveRecoveryFile() {
    const state = port.read();
    if (!state.recoveryKey || state.recoveryFileBusy || busy) return;
    busy = true;
    port.write({ recoveryFileBusy: true, recoveryFileError: "" });
    try {
      const content = state.recoveryKey;
      let name = defaultFileName;
      if (io.isTauri()) {
        const path = await io.saveFileDialog({
          title: "保存恢复文件",
          defaultPath: defaultFileName,
          filters: [{ name: "Psd Manager 恢复文件", extensions: ["psdm-recovery"] }],
        });
        if (!path) {
          port.write({ recoveryFileError: "已取消保存恢复文件" });
          return;
        }
        await io.writeTextFile(path, content);
        name = fileNameFromPath(path);
      } else {
        io.downloadFile(content, defaultFileName);
      }
      port.write({ recoveryFileName: name, recoveryFileSaved: true, recoveryAcknowledged: false });
      port.showStatus("恢复文件已保存");
    } catch (error) {
      port.write({
        recoveryFileSaved: false,
        recoveryFileError: error instanceof Error ? error.message : String(error ?? "恢复文件保存失败"),
      });
    } finally {
      busy = false;
      port.write({ recoveryFileBusy: false });
    }
  }

  async function chooseRecoveryFile() {
    if (busy || port.read().recoveryFileBusy) return;
    busy = true;
    port.write({ recoveryError: "" });
    try {
      let file: { content: string; name: string } | null;
      if (io.isTauri()) {
        const path = await io.openFileDialog({
          title: "选择恢复文件",
          multiple: false,
          filters: [{ name: "Psd Manager 恢复文件", extensions: ["psdm-recovery"] }],
        });
        if (!path || Array.isArray(path)) return;
        file = { content: await io.readTextFile(path), name: fileNameFromPath(path) };
      } else {
        file = await io.chooseBrowserFile();
      }
      if (!file) return;
      if (!file.content.trim()) throw new Error("恢复文件为空");
      port.write({ recoveryFileContent: file.content, recoveryFileName: file.name, recoveryFileSaved: false });
      port.showStatus(`已选择恢复文件：${file.name}`);
    } catch (error) {
      port.write({
        recoveryFileContent: "",
        recoveryFileName: "",
        recoveryError: error instanceof Error ? error.message : String(error ?? "恢复文件读取失败"),
      });
    } finally {
      busy = false;
    }
  }

  return { saveRecoveryFile, chooseRecoveryFile };
}
