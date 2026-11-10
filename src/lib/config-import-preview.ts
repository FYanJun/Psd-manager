import { ConfigImportError, formatConfigSummary, getConfigSummary, parseConfigContentWithFallback } from "./config";
import { findXlsxDeviceConflicts, formatConfigDiffCount, getConfigDiffSummary, mergeMissingImportedConfig } from "./vault-recovery";
import type { ConfigData, ConfigFormat, ConfigTransferFormat, DeviceTypeMeta, PendingConfirmation, VaultItem } from "./types";

// Pure preparation shared by desktop and browser file entry points.
export function prepareConfigImport(
  state: { items: VaultItem[]; customDeviceTypes: DeviceTypeMeta[] },
  content: string,
  preferredFormat: ConfigFormat,
) {
  const { config, format } = parseConfigContentWithFallback(content, preferredFormat);
  const formatMismatchDetail = preferredFormat === format
    ? ""
    : `文件扩展名像是 ${preferredFormat.toUpperCase()}，已按内容识别为 ${format.toUpperCase()} 配置。`;
  return prepareConfigImportData(state, config, format, formatMismatchDetail);
}

export function prepareConfigImportData(
  state: { items: VaultItem[]; customDeviceTypes: DeviceTypeMeta[] },
  config: ConfigData,
  format: ConfigTransferFormat,
  formatMismatchDetail = "",
) {
  if (format === "xlsx") return prepareXlsxConfigImport(state, config);
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
    label: `导入后${item.label}`,
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
  const confirmation: PendingConfirmation = {
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
        : `${formatMismatchDetail}${formatMismatchDetail ? " " : ""}保留现有设备信息、账号字段和当前密码，补充缺少的设备、账号、类型及密码历史，不覆盖已有历史。`,
    },
    importModeErrors: addMissingError ? { "add-missing": addMissingError } : undefined,
  };
  return { config, format, confirmation };
}

function prepareXlsxConfigImport(
  state: { items: VaultItem[]; customDeviceTypes: DeviceTypeMeta[] },
  config: ConfigData,
) {
  const conflicts = findXlsxDeviceConflicts(state.items, config.items);
  const summary = getConfigSummary(config);
  const confirmation: PendingConfirmation = {
    action: "import-config",
    title: "导入 Excel 工作簿",
    message: `Excel 工作簿已校验：${config.items.length} 台设备、${summary.accountCount} 个账号、${summary.historyCount} 条密码历史。`,
    detail: "新设备会直接添加。设备类型和设备名称均相同的项目会列在下方；勾选即以工作簿整台替换，未勾选则保留本地设备。整台替换会删除本地该设备中未列在工作簿里的账号。",
    confirmLabel: "导入工作簿",
    xlsxImport: true,
    xlsxDeviceConflicts: conflicts,
    xlsxOverwriteDeviceKeys: [],
    summaryItems: [
      { label: "新增设备", value: `${config.items.length - conflicts.length} 台` },
      { label: "同名待选", value: `${conflicts.length} 台` },
      { label: "工作簿账号", value: `${summary.accountCount} 个` },
      { label: "密码历史", value: `${summary.historyCount} 条` },
    ],
  };
  return { config, format: "xlsx" as const, confirmation };
}
