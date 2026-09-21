import { ConfigImportError, formatConfigSummary, getConfigSummary, parseConfigContentWithFallback } from "./config";
import { formatConfigDiffCount, getConfigDiffSummary, mergeMissingImportedConfig } from "./vault-recovery";
import type { ConfigData, ConfigFormat, DeviceTypeMeta, PendingConfirmation, VaultItem } from "./types";

// Pure preparation shared by desktop and browser file entry points.
export function prepareConfigImport(
  state: { items: VaultItem[]; customDeviceTypes: DeviceTypeMeta[] },
  content: string,
  preferredFormat: ConfigFormat,
) {
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
        : `${formatMismatchDetail}${formatMismatchDetail ? " " : ""}现有设备信息、现有账号、密码和历史记录保持不变，只添加缺少的设备、账号和类型。`,
    },
    importModeErrors: addMissingError ? { "add-missing": addMissingError } : undefined,
  };
  return { config, format, confirmation };
}
