import { isTauri } from "@tauri-apps/api/core";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { ensureDeviceTypeMetadata } from "../device-type-meta";
import {
  ConfigImportError,
  createConfigFilename,
  createConfigPayload,
  formatConfigSummary,
  getConfigMimeType,
  getConfigSummary,
  inferConfigFormat,
  parseConfigContentWithFallback,
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
import {
  formatConfigDiffCount,
  getConfigDiffSummary,
  mergeMissingImportedConfig,
} from "../vault-recovery";

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
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) return `配置${action}失败`;
  if (/denied|forbidden|scope|permission|not allowed/i.test(message)) {
    return `配置${action}失败：没有该文件位置的读写权限`;
  }
  return `配置${action}失败：${message}`;
}

export function createConfigTransferController(port: ConfigTransferPort) {
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
          filters: [{ name: "配置文件", extensions: ["json", "csv", "yaml", "yml"] }],
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
    const { config, format } = parseConfigContentWithFallback(content, preferredFormat);
    const summary = getConfigSummary(config);
    const replaceDiff = getConfigDiffSummary(state.items, state.customDeviceTypes, config);
    let mergedConfig: ConfigData | null = null;
    let addMissingError = "";
    try {
      mergedConfig = mergeMissingImportedConfig(
        state.items,
        state.customDeviceTypes,
        config,
      );
    } catch (error) {
      addMissingError = error instanceof ConfigImportError
        ? error.message
        : error instanceof Error && error.message
          ? error.message
          : "当前数据与导入文件存在身份冲突";
    }
    const formatResultSummary = (resultSummary: typeof summary) => formatConfigSummary(resultSummary).map((item) => ({
      ...item,
      label: ["设备", "账号", "历史", "类型"].includes(item.label)
        ? `导入后${item.label}`
        : item.label === "格式" ? "文件格式" : item.label,
    }));
    const formatDiffSummary = (resultSummary: typeof summary, diff: typeof replaceDiff) => [
      ...formatResultSummary(resultSummary),
      { label: "设备变化", value: formatConfigDiffCount(diff.devicesAdded, diff.devicesRemoved, diff.devicesChanged) },
      { label: "账号变化", value: formatConfigDiffCount(diff.accountsAdded, diff.accountsRemoved, diff.accountsChanged) },
      { label: "类型变化", value: formatConfigDiffCount(diff.typesAdded, diff.typesRemoved, diff.typesChanged) },
    ];
    const addMissingSummary = mergedConfig
      ? formatDiffSummary(
          getConfigSummary(mergedConfig),
          getConfigDiffSummary(state.items, state.customDeviceTypes, mergedConfig),
        )
      : [
          { label: "校验状态", value: "仅新增不可用" },
          ...formatResultSummary(summary),
        ];
    const formatMismatchDetail = preferredFormat === format
      ? ""
      : `文件扩展名像是 ${preferredFormat.toUpperCase()}，已按内容识别为 ${format.toUpperCase()} 配置。`;

    port.setActivePopover(null);
    port.setActiveDialog(null);
    port.write({
      pendingImportedConfig: config,
      pendingConfigFormat: format,
      importConfigMode: "add-missing",
    });
    port.setPendingConfirmation({
      action: "import-config",
      title: "导入配置",
      message: `${format.toUpperCase()} 配置已完成整体验证，请选择导入方式。`,
      detail: "",
      confirmLabel: "导入配置",
      importModeSummaries: {
        replace: formatDiffSummary(summary, replaceDiff),
        "add-missing": addMissingSummary,
      },
      importModeDetails: {
        replace: `${formatMismatchDetail}${formatMismatchDetail ? " " : ""}当前设备、账号和密码历史会被导入文件整体替换。`,
        "add-missing": addMissingError
          ? "仅新增不可用，请切换到“全部覆盖”，并确认以导入文件为准。"
          : `${formatMismatchDetail}${formatMismatchDetail ? " " : ""}现有设备信息、现有账号、密码和历史记录保持不变，只添加缺少的设备、账号和类型。`,
      },
      importModeErrors: addMissingError ? { "add-missing": addMissingError } : undefined,
    });
  }

  async function applyImportedConfig(config: ConfigData, format: ConfigFormat, mode: ConfigImportMode) {
    const state = port.read();
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
