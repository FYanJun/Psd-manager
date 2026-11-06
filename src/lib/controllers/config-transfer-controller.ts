import { prepareConfigImport, prepareConfigImportData } from "../config-import-preview";
import { isTauri } from "@tauri-apps/api/core";
import { openFileDialog, saveFileDialog, readBinaryFile, readTextFile, writeBinaryFile, writeTextFile } from "../platform-files";
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
  ConfigTransferFormat,
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
  pendingConfigFormat: ConfigTransferFormat;
  importConfigMode: ConfigImportMode;
  exportConfigFormat: ConfigTransferFormat;
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
  isExportPasswordConfigured(): boolean;
  verifyExportPassword(password: string): Promise<void>;
};

export function getExportAuthorizationError(password: string, configured: boolean): string {
  if (configured && !password) return "请输入主密码以授权导出";
  return "";
}

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

  async function exportConfig(format: ConfigTransferFormat = port.read().exportConfigFormat, password = ""): Promise<string | null> {
    const authorizationError = getExportAuthorizationError(password, port.isExportPasswordConfigured());
    if (authorizationError) return authorizationError;
    if (port.isExportPasswordConfigured()) {
      try {
        await port.verifyExportPassword(password);
      } catch (error) {
        return `主密码验证失败：${getErrorMessage(error) || "密码不正确"}`;
      }
    }
    const state = port.read();
    let payload: string | Uint8Array;
    try {
      payload = format === "xlsx"
        ? await import("../config/xlsx").then(({ createXlsxConfigPayload }) => createXlsxConfigPayload(state.items, state.customDeviceTypes))
        : createConfigPayload(state.items, state.customDeviceTypes, format);
    } catch (error) {
      return `配置导出失败：${getErrorMessage(error) || "无法生成文件内容"}`;
    }
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
          return null;
        }
        if (payload instanceof Uint8Array) await writeBinaryFile(path, payload);
        else await writeTextFile(path, payload);
        port.setActiveDialog(null);
        port.showStatus(`${formatLabel} 配置已导出`);
      } catch (error) {
        port.showStatus(formatFileError("导出", error), 5000);
      }
      return null;
    }

    const blobData = payload instanceof Uint8Array ? new Uint8Array(payload).buffer : payload;
    const blob = new Blob([blobData], {
      type: format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : getConfigMimeType(format),
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    port.setActiveDialog(null);
    port.showStatus(`${formatLabel} 配置已导出`);
    return null;
  }

  async function chooseConfigFile() {
    port.setActivePopover(null);
    if (isTauri()) {
      try {
        const path = await openFileDialog({
          title: "选择要导入的配置文件",
          multiple: false,
          filters: [{ name: "配置文件", extensions: ["json", "yaml", "yml", "xlsx"] }],
        });
        if (!path || Array.isArray(path)) {
          port.showStatus("已取消导入");
          return;
        }
        const format = inferConfigFormat(path);
        try {
          if (format === "xlsx") await tryRequestApplyXlsxConfig(await readBinaryFile(path));
          else tryRequestApplyConfig(await readTextFile(path), format);
        } catch (error) {
          port.showStatus(formatFileError("导入", error), 5000);
        }
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

  async function tryRequestApplyXlsxConfig(content: ArrayBuffer | Uint8Array) {
    try {
      const { parseXlsxConfigContent } = await import("../config/xlsx");
      requestApplyParsedConfig(parseXlsxConfigContent(content), "xlsx");
    } catch (error) {
      clearPendingImport();
      port.setPendingConfirmation(null);
      const reason = error instanceof ConfigImportError
        ? error.message
        : "无法识别 Excel 工作簿结构或文件内容存在错误";
      port.showStatus(`配置导入失败：${reason}`, 7000);
    }
  }

  function requestApplyConfig(content: string, preferredFormat: ConfigFormat) {
    const state = port.read();
    const { config, format, confirmation } = prepareConfigImport(state, content, preferredFormat);
    stageConfigImport(config, format, confirmation);
  }

  function requestApplyParsedConfig(config: ConfigData, format: ConfigTransferFormat) {
    const state = port.read();
    const { confirmation } = prepareConfigImportData(state, config, format);
    stageConfigImport(config, format, confirmation);
  }

  function stageConfigImport(config: ConfigData, format: ConfigTransferFormat, confirmation: PendingConfirmation) {
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
      const format = inferConfigFormat(file.name);
      if (format === "xlsx") await tryRequestApplyXlsxConfig(await file.arrayBuffer());
      else tryRequestApplyConfig(await file.text(), format);
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
    tryRequestApplyXlsxConfig,
    requestApplyConfig,
    applyImportedConfig,
    selectConfigFileFromBrowser,
  };
}
