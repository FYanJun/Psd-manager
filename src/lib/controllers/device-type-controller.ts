import { defaultDeviceTypeMeta, fallbackDeviceTypeMeta } from "../constants";
import { isValidDeviceTypeColor, isValidDeviceTypeIconText } from "../input-validation";
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
  hiddenDeviceTypes: string[];
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
  return getVisibleDeviceTypeOptions(state.customDeviceTypes, state.hiddenDeviceTypes);
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
    const currentDeviceType = currentTypeMeta.label;
    port.pushNavigationState();
    const isVisibleDefault = defaultDeviceTypeMeta.some((type) => type.label === currentDeviceType)
      && !current.hiddenDeviceTypes.includes(currentDeviceType);
    port.write({
      hiddenDeviceTypes: isVisibleDefault
        ? [...current.hiddenDeviceTypes, currentDeviceType]
        : current.hiddenDeviceTypes,
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
    const { typeForm } = port.read();
    const label = typeForm.label.trim();
    const originalUuid = typeForm.originalUuid;
    const originalLabel = typeForm.originalLabel;
    if (!label) {
      port.showStatus("请输入设备类型名称");
      return;
    }
    if (!isValidDeviceTypeIconText(typeForm.iconText)) {
      port.showStatus("设备类型图标最多输入 2 个字符");
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

    const affectedDeviceCount = originalLabel && originalLabel !== label
      ? port.read().items.filter((item) => item.deviceTypeUuid === originalUuid).length
      : 0;
    if (affectedDeviceCount > 0) {
      port.setActivePopover(null);
      port.setPendingConfirmation({
        action: "rename-device-type",
        deviceType: originalLabel ?? "",
        deviceTypeUuid: originalUuid ?? undefined,
        typeDraft: { ...typeForm },
        title: "重命名设备类型",
        message: `确认将“${originalLabel}”改为“${label}”？`,
        detail: "该类型下的设备会一起改到新类型名，设备本身和账号密码不会删除。",
        confirmLabel: "确认重命名",
        summaryItems: [
          { label: "影响设备", value: `${affectedDeviceCount} 台` },
          { label: "新类型", value: label },
        ],
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
    if (!isValidDeviceTypeIconText(form.iconText)) {
      port.showStatus("设备类型图标最多输入 2 个字符");
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
    let hiddenDeviceTypes = state.hiddenDeviceTypes;
    if (defaultDeviceTypeMeta.some((type) => type.label === label) && hiddenDeviceTypes.includes(label)) {
      hiddenDeviceTypes = hiddenDeviceTypes.filter((type) => type !== label);
    }

    let customDeviceTypes = state.customDeviceTypes;
    let items = state.items;
    const updatedAt = originalLabel ? formatDateTime(new Date()) : "";
    if (originalLabel) {
      const renamedDefault = originalLabel !== label
        && defaultDeviceTypeMeta.some((type) => type.label === originalLabel);
      if (renamedDefault && !hiddenDeviceTypes.includes(originalLabel)) {
        hiddenDeviceTypes = [...hiddenDeviceTypes, originalLabel];
      }
      customDeviceTypes = [
        ...customDeviceTypes.filter((type) => type.uuid !== originalUuid),
        nextMeta,
      ];
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

    port.write({ items, customDeviceTypes, hiddenDeviceTypes });
    port.pushNavigationState();
    port.write({ selectedDeviceType: label });
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
