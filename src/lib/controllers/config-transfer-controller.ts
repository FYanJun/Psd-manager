import { prepareConfigImport } from "../config-import-preview";
import { isTauri } from "@tauri-apps/api/core";
import { openFileDialog, saveFileDialog, readTextFile, writeTextFile } from "../platform-files";
import { createConfigImportController } from "./config-import-controller";
import {
  ConfigImportError,
  createConfigFilename,
  createConfigPayload,
  getConfigMimeType,
  inferConfigFormat,
} from "../config";
import type {
  ActiveDialog,
  ActivePopover,
  ConfigData,
  ConfigFormat,
  ConfigImportMode,
  DeviceTypeMeta,
  PendingConfirmation,
  VaultItem,
} from "../types";
import { getErrorMessage } from "../utils";

export type ConfigTransferState = {
  items: VaultItem[];
  customDeviceTypes: DeviceTypeMeta[];
  pendingImportedConfig: ConfigData | null;
  pendingConfigFormat: ConfigFormat;
  importConfigMode: ConfigImportMode;
  exportConfigFormat: ConfigFormat;
};

type SafetySnapshot = { id: string };

export type ConfigTransferPort = {
  read(): ConfigTransferState;
  write(patch: Partial<ConfigTransferState>): void;
  setActiveDialog(dialog: ActiveDialog): void;
  setActivePopover(popover: ActivePopover): void;
  setPendingConfirmation(confirmation: PendingConfirmation | null): void;
  showStatus(message: string, duration?: number): void;
  createSafetySnapshot(reason: string): Promise<SafetySnapshot | null>;
  offerSnapshotUndo(snapshotId: string, message: string): void;
  resetWorkspaceAfterReplace(items: VaultItem[]): void;
};

function formatFileError(action: "导入" | "导出", error: unknown) {
  const message = getErrorMessage(error);
  if (!message) return `配置${action}失败`;
  if (/denied|forbidden|scope|permission|not allowed/i.test(message)) {
    return `配置${action}失败：没有该文件位置的读写权限`;
  }
  return `配置${action}失败：${message}`;
}

export function createConfigTransferController(port: ConfigTransferPort) {
  const { applyImportedConfig } = createConfigImportController(port);
  function clearPendingImport() {
    port.write({ pendingImportedConfig: null });
  }

  function openExportConfigDialog() {
    port.setActivePopover(null);
    port.setActiveDialog("export-config");
  }

  async function exportConfig(format: ConfigFormat = port.read().exportConfigFormat) {
    const state = port.read();
    const payload = createConfigPayload(state.items, state.customDeviceTypes, format);
    const filename = createConfigFilename(format);
    const formatLabel = format.toUpperCase();
    port.setActivePopover(null);

    if (isTauri()) {
      try {
        const path = await saveFileDialog({
          title: `导出 ${formatLabel} 配置`,
          defaultPath: filename,
          filters: [{ name: formatLabel, extensions: [format] }],
        });
        if (!path) {
          port.showStatus("已取消导出");
          return;
        }
        await writeTextFile(path, payload);
        port.setActiveDialog(null);
        port.showStatus(`${formatLabel} 配置已导出`);
      } catch (error) {
        port.showStatus(formatFileError("导出", error), 5000);
      }
      return;
    }

    const blob = new Blob([payload], { type: getConfigMimeType(format) });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    port.setActiveDialog(null);
    port.showStatus(`${formatLabel} 配置已导出`);
  }

  async function chooseConfigFile() {
    port.setActivePopover(null);
    if (isTauri()) {
      try {
        const path = await openFileDialog({
          title: "选择要导入的配置文件",
          multiple: false,
          filters: [{ name: "配置文件", extensions: ["json", "yaml", "yml"] }],
        });
        if (!path || Array.isArray(path)) {
          port.showStatus("已取消导入");
          return;
        }
        let content = "";
        try {
          content = await readTextFile(path);
        } catch (error) {
          port.showStatus(formatFileError("导入", error), 5000);
          return;
        }
        tryRequestApplyConfig(content, inferConfigFormat(path));
      } catch (error) {
        port.showStatus(formatFileError("导入", error), 5000);
      }
      return;
    }

    document.getElementById("import-file")?.click();
  }

  function tryRequestApplyConfig(content: string, format: ConfigFormat) {
    try {
      requestApplyConfig(content, format);
    } catch (error) {
      clearPendingImport();
      port.setPendingConfirmation(null);
      const reason = error instanceof ConfigImportError
        ? error.message
        : "无法识别配置结构或文件内容存在语法错误";
      port.showStatus(`配置导入失败：${reason}`, 7000);
    }
  }

  function requestApplyConfig(content: string, preferredFormat: ConfigFormat) {
    const state = port.read();
    const { config, format, confirmation } = prepareConfigImport(state, content, preferredFormat);
    port.setActivePopover(null);
    port.setActiveDialog(null);
    port.write({
      pendingImportedConfig: config,
      pendingConfigFormat: format,
      importConfigMode: "add-missing",
    });
    port.setPendingConfirmation(confirmation);
  }

  async function selectConfigFileFromBrowser(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      tryRequestApplyConfig(content, inferConfigFormat(file.name));
    } catch (error) {
      port.showStatus(formatFileError("导入", error), 5000);
    } finally {
      input.value = "";
    }
  }

  return {
    openExportConfigDialog,
    exportConfig,
    chooseConfigFile,
    tryRequestApplyConfig,
    requestApplyConfig,
    applyImportedConfig,
    selectConfigFileFromBrowser,
  };
}
