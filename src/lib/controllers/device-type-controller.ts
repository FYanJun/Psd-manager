import { fallbackDeviceTypeMeta, typeColorOptions } from "../constants";
import {
  getTextInputValidationError,
  INPUT_LIMITS,
  isValidDeviceTypeColor,
  isValidDeviceTypeIconText,
} from "../input-validation";
import { getVisibleDeviceTypeOptions } from "../selectors/device-selectors";
import type {
  ActiveDialog,
  ActivePopover,
  DeviceType,
  DeviceTypeMeta,
  PendingConfirmation,
  TypeForm,
  VaultItem,
} from "../types";
import { createUuid } from "../uuid";
import { formatDateTime } from "../utils";
import { getAccounts, iconClassForColor } from "../vault";

type DeviceTypeSelection = "全部设备" | DeviceType;

export type DeviceTypeControllerState = {
  items: VaultItem[];
  customDeviceTypes: DeviceTypeMeta[];
  selectedDeviceType: DeviceTypeSelection;
  selectedId: number;
  selectedAccountIds: number[];
  typeForm: TypeForm;
};

type SafetySnapshot = { id: string };

export type DeviceTypeControllerPort = {
  read(): DeviceTypeControllerState;
  write(patch: Partial<DeviceTypeControllerState>): void;
  setActiveDialog(dialog: ActiveDialog): void;
  setActivePopover(popover: ActivePopover): void;
  setPendingConfirmation(confirmation: PendingConfirmation | null): void;
  showStatus(message: string, duration?: number): void;
  createSafetySnapshot(reason: string): Promise<SafetySnapshot | null>;
  offerSnapshotUndo(snapshotId: string, message: string): void;
  pushNavigationState(): void;
};

function getVisibleTypes(state: DeviceTypeControllerState) {
  return getVisibleDeviceTypeOptions(state.customDeviceTypes);
}

function formatTypeColor(color: string) {
  return typeColorOptions.find((option) => option.value === color)?.label ?? `自定义 ${color}`;
}

export function createDeviceTypeController(port: DeviceTypeControllerPort) {
  function getTypeMeta(deviceType: string) {
    return getVisibleTypes(port.read()).find((type) => type.label === deviceType) ?? fallbackDeviceTypeMeta;
  }

  function getTypeMetaByUuid(uuid: string) {
    return getVisibleTypes(port.read()).find((type) => type.uuid === uuid);
  }

  function getDeviceTypeCount(deviceType: DeviceTypeSelection) {
    const { items } = port.read();
    if (deviceType === "全部设备") return items.length;
    const typeMeta = getTypeMeta(deviceType);
    return items.filter((item) => item.deviceTypeUuid === typeMeta.uuid).length;
  }

  function canDeleteDeviceType(deviceType: DeviceTypeSelection) {
    return deviceType !== "全部设备" && getDeviceTypeCount(deviceType) === 0;
  }

  function hasDuplicateLabel(label: string, originalUuid: string | null) {
    if (label === "全部设备") return true;
    return getVisibleTypes(port.read()).some((type) => type.label === label && type.uuid !== originalUuid);
  }

  function openAddTypeDialog() {
    port.setActivePopover(null);
    port.write({
      typeForm: { originalUuid: null, originalLabel: null, label: "", iconText: "", color: "blue" },
    });
    port.setActiveDialog("type");
  }

  function openEditTypeDialog(deviceType: DeviceTypeSelection = port.read().selectedDeviceType) {
    if (deviceType === "全部设备") {
      port.showStatus("请先选择一个具体设备类型");
      return;
    }

    port.setActivePopover(null);
    const typeMeta = getTypeMeta(deviceType);
    if (!typeMeta.uuid) {
      port.showStatus("编辑失败：设备类型身份信息不完整，请重新加载资产库", 5000);
      return;
    }
    port.write({
      typeForm: {
        originalUuid: typeMeta.uuid,
        originalLabel: deviceType,
        label: typeMeta.label,
        iconText: typeMeta.iconText,
        color: typeMeta.color,
      },
    });
    port.setActiveDialog("type");
  }

  function requestDeleteDeviceType(deviceType: DeviceTypeSelection = port.read().selectedDeviceType) {
    if (deviceType === "全部设备") return;
    const typeMeta = getTypeMeta(deviceType);
    if (!typeMeta.uuid) {
      port.showStatus("删除失败：设备类型身份信息不完整，请重新加载资产库", 5000);
      return;
    }
    const deviceCount = getDeviceTypeCount(deviceType);
    if (deviceCount > 0) {
      port.showStatus(`该类型下还有 ${deviceCount} 个设备，请先移动或删除设备`);
      port.setActivePopover(null);
      return;
    }

    port.setActivePopover(null);
    port.setActiveDialog(null);
    port.setPendingConfirmation({
      action: "delete-device-type",
      deviceType,
      deviceTypeUuid: typeMeta.uuid,
      title: "删除设备类型",
      message: `确认删除“${deviceType}”？`,
      detail: "这个类型会从侧边栏移除，之后仍可重新新增。",
      confirmLabel: "删除类型",
    });
  }

  async function deleteDeviceType(
    target: Pick<PendingConfirmation, "deviceType" | "deviceTypeUuid"> = {
      deviceType: port.read().selectedDeviceType,
    },
  ) {
    const requestedType = target.deviceType ?? port.read().selectedDeviceType;
    if (requestedType === "全部设备") return;
    const typeMeta = target.deviceTypeUuid
      ? getTypeMetaByUuid(target.deviceTypeUuid)
      : getTypeMeta(requestedType);
    if (!typeMeta?.uuid) {
      port.showStatus("删除失败：待删除的设备类型已不存在", 5000);
      return;
    }
    const deviceType = typeMeta.label;
    if (deviceType === "全部设备") return;
    const state = port.read();
    const deviceCount = state.items.filter((item) => item.deviceTypeUuid === typeMeta.uuid).length;
    if (deviceCount > 0) {
      port.showStatus(`该类型下还有 ${deviceCount} 个设备，请先移动或删除设备`);
      port.setActivePopover(null);
      return;
    }

    const snapshot = await port.createSafetySnapshot(`删除设备类型“${deviceType}”前`);
    if (!snapshot) return;

    const current = port.read();
    const currentTypeMeta = getTypeMetaByUuid(typeMeta.uuid);
    if (!currentTypeMeta) {
      port.showStatus("删除失败：待删除的设备类型已不存在", 5000);
      return;
    }
    const currentDeviceCount = current.items.filter((item) => item.deviceTypeUuid === typeMeta.uuid).length;
    if (currentDeviceCount > 0) {
      port.showStatus(`该类型下已有 ${currentDeviceCount} 个设备，已取消删除`);
      return;
    }
    port.pushNavigationState();
    port.write({
      customDeviceTypes: current.customDeviceTypes.filter((type) => type.uuid !== typeMeta.uuid),
      selectedDeviceType: "全部设备",
      selectedId: current.items[0]?.id ?? 0,
      selectedAccountIds: [],
    });
    port.setActivePopover(null);
    port.setActiveDialog(null);
    port.offerSnapshotUndo(snapshot.id, "设备类型已删除");
  }

  function saveDeviceType() {
    const state = port.read();
    const { typeForm } = state;
    const label = typeForm.label.trim();
    const originalUuid = typeForm.originalUuid;
    if (!label) {
      port.showStatus("请输入设备类型名称");
      return;
    }
    const labelError = getTextInputValidationError(typeForm.label, INPUT_LIMITS.deviceTypeName);
    if (labelError) {
      port.showStatus(`设备类型名称${labelError}`, 5000);
      return;
    }
    const iconError = getTextInputValidationError(typeForm.iconText, INPUT_LIMITS.deviceTypeIcon);
    if (iconError || !isValidDeviceTypeIconText(typeForm.iconText)) {
      port.showStatus(`设备类型图标${iconError ?? "不能超过 2 个字符"}`, 5000);
      return;
    }
    if (!isValidDeviceTypeColor(typeForm.color)) {
      port.showStatus("请选择有效的设备类型颜色");
      return;
    }
    if (hasDuplicateLabel(label, originalUuid)) {
      port.showStatus("设备类型已存在");
      return;
    }

    if (originalUuid) {
      const originalMeta = getTypeMetaByUuid(originalUuid);
      if (!originalMeta) {
        port.showStatus("保存失败：待修改的设备类型已不存在", 5000);
        return;
      }
      const nextIconText = typeForm.iconText.trim() || label.slice(0, 1);
      const changes = [
        { label: "类型名称", from: originalMeta.label, to: label },
        { label: "图标", from: originalMeta.iconText, to: nextIconText },
        { label: "颜色", from: formatTypeColor(originalMeta.color), to: formatTypeColor(typeForm.color) },
      ].filter((change) => change.from !== change.to);
      if (changes.length === 0) {
        port.showStatus("没有可保存的修改");
        return;
      }

      const affectedDeviceCount = state.items.filter((item) => item.deviceTypeUuid === originalUuid).length;
      port.setActivePopover(null);
      port.setPendingConfirmation({
        action: "save-device-type",
        deviceType: originalMeta.label,
        deviceTypeUuid: originalUuid,
        typeDraft: { ...typeForm },
        title: "保存设备类型修改",
        message: `确认保存“${originalMeta.label}”的修改？`,
        detail: affectedDeviceCount > 0 && originalMeta.label !== label
          ? `该类型下的 ${affectedDeviceCount} 台设备会一起更新类型名称，设备本身和账号密码不会删除。`
          : "确认后会更新设备类型显示，不会删除设备和账号密码。",
        confirmLabel: "保存修改",
        summaryItems: affectedDeviceCount > 0 ? [{ label: "影响设备", value: `${affectedDeviceCount} 台` }] : undefined,
        changes,
      });
      return;
    }

    executeSaveDeviceType();
  }

  function executeSaveDeviceType(
    target?: Pick<PendingConfirmation, "deviceTypeUuid" | "typeDraft">,
  ) {
    const state = port.read();
    const form = target?.typeDraft ? { ...target.typeDraft } : { ...state.typeForm };
    const label = form.label.trim();
    const originalUuid = target?.deviceTypeUuid ?? form.originalUuid;
    const originalMeta = originalUuid ? getTypeMetaByUuid(originalUuid) : undefined;
    const originalLabel = originalMeta?.label ?? form.originalLabel;
    if (originalUuid && !originalMeta) {
      port.showStatus("保存失败：待修改的设备类型已不存在", 5000);
      return;
    }
    if (!label) {
      port.showStatus("请输入设备类型名称");
      return;
    }
    const labelError = getTextInputValidationError(form.label, INPUT_LIMITS.deviceTypeName);
    if (labelError) {
      port.showStatus(`设备类型名称${labelError}`, 5000);
      return;
    }
    const iconError = getTextInputValidationError(form.iconText, INPUT_LIMITS.deviceTypeIcon);
    if (iconError || !isValidDeviceTypeIconText(form.iconText)) {
      port.showStatus(`设备类型图标${iconError ?? "不能超过 2 个字符"}`, 5000);
      return;
    }
    if (!isValidDeviceTypeColor(form.color)) {
      port.showStatus("请选择有效的设备类型颜色");
      return;
    }
    if (hasDuplicateLabel(label, originalUuid)) {
      port.showStatus("设备类型已存在");
      return;
    }

    const nextMeta: DeviceTypeMeta = {
      uuid: originalUuid ?? createUuid(),
      label,
      iconText: form.iconText.trim() || label.slice(0, 1),
      color: form.color,
    };
    if (originalMeta
      && originalMeta.label === nextMeta.label
      && originalMeta.iconText === nextMeta.iconText
      && originalMeta.color === nextMeta.color) {
      port.showStatus("没有可保存的修改");
      return;
    }
    let customDeviceTypes = state.customDeviceTypes;
    let items = state.items;
    const updatedAt = originalLabel ? formatDateTime(new Date()) : "";
    if (originalLabel) {
      const originalIndex = customDeviceTypes.findIndex((type) => type.uuid === originalUuid);
      if (originalIndex < 0) {
        port.showStatus("保存失败：待修改的设备类型已不存在", 5000);
        return;
      }
      customDeviceTypes = customDeviceTypes.map((type, index) => index === originalIndex ? nextMeta : type);
      items = items.map((item) =>
        item.deviceTypeUuid === originalUuid
          ? {
              ...item,
              deviceType: label,
              deviceTypeUuid: nextMeta.uuid,
              tag: item.tag === originalLabel ? label : item.tag,
              iconText: nextMeta.iconText,
              iconClass: iconClassForColor(nextMeta.color),
              updatedAt: updatedAt || item.updatedAt,
              accounts: getAccounts(item),
            }
          : item
      );
    } else {
      customDeviceTypes = [...customDeviceTypes, nextMeta];
    }

    const nextSelectedDeviceType = originalLabel
      ? state.selectedDeviceType === originalLabel ? label : state.selectedDeviceType
      : label;
    port.write({
      items,
      customDeviceTypes,
      selectedDeviceType: nextSelectedDeviceType,
    });
    port.setActiveDialog(null);
  }

  return {
    getTypeMeta,
    getDeviceTypeCount,
    canDeleteDeviceType,
    openAddTypeDialog,
    openEditTypeDialog,
    requestDeleteDeviceType,
    deleteDeviceType,
    saveDeviceType,
    executeSaveDeviceType,
  };
}
