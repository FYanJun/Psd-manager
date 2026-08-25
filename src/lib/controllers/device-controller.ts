import { formatDateTime } from "../utils";
import {
  CONNECTION_ADDRESS_ERROR,
  getTextInputValidationError,
  INPUT_LIMITS,
  isValidConnectionAddress,
} from "../input-validation";
import type {
  ActiveDialog,
  ActivePopover,
  DeviceAccount,
  DeviceForm,
  DeviceType,
  DeviceTypeMeta,
  PendingConfirmation,
  TypePickerScope,
  VaultItem,
} from "../types";
import { createUuid } from "../uuid";
import { createEmptyDeviceForm, getAccounts, syncItemWithAccounts } from "../vault";

export type DeviceControllerState = {
  items: VaultItem[];
  selectedItem: VaultItem;
  selectedAccounts: DeviceAccount[];
  selectedDeviceType: "全部设备" | DeviceType;
  selectedId: number;
  selectedAccountId: number;
  selectedAccountIds: number[];
  searchQuery: string;
  hasSelectedDevice: boolean;
  deviceTypeOptions: DeviceTypeMeta[];
  deviceForm: DeviceForm;
  activeDialog: ActiveDialog;
  activePopover: ActivePopover;
  openTypePicker: TypePickerScope | null;
  deviceTypeSearch: string;
};

export type DeviceControllerPatch = Partial<Pick<
  DeviceControllerState,
  | "items"
  | "selectedDeviceType"
  | "selectedId"
  | "selectedAccountId"
  | "selectedAccountIds"
  | "searchQuery"
  | "deviceForm"
  | "activeDialog"
  | "activePopover"
  | "openTypePicker"
  | "deviceTypeSearch"
>>;

export type DeviceControllerPort = {
  read(): DeviceControllerState;
  write(patch: DeviceControllerPatch): void;
  getTypeMeta(deviceType: string): DeviceTypeMeta;
  iconClassForType(deviceType: string): string;
  openAddTypeDialog(): void;
  showStatus(message: string, duration?: number): void;
  pushNavigationState(): void;
  createSafetySnapshot(reason: string): Promise<{ id: string } | null>;
  offerSnapshotUndo(snapshotId: string, message: string): void;
  setPendingConfirmation(confirmation: PendingConfirmation): void;
};

export function createDeviceController(port: DeviceControllerPort) {
  function openAddDialog(deviceType = port.read().selectedDeviceType) {
    const state = port.read();
    port.write({ activePopover: null, openTypePicker: null, deviceTypeSearch: "" });
    if (state.deviceTypeOptions.length === 0) {
      port.openAddTypeDialog();
      port.showStatus("请先新增设备类型");
      return;
    }
    const form = createEmptyDeviceForm();
    form.deviceType = deviceType !== "全部设备" ? deviceType : state.deviceTypeOptions[0]?.label ?? "";
    port.write({ deviceForm: form, activeDialog: "device" });
  }

  function openEditDialog() {
    const state = port.read();
    port.write({ activePopover: null });
    if (!state.hasSelectedDevice) {
      port.showStatus("请先选择设备");
      return;
    }
    port.write({
      openTypePicker: null,
      deviceTypeSearch: "",
      deviceForm: {
        id: state.selectedItem.id,
        deviceName: state.selectedItem.deviceName,
        deviceType: state.selectedItem.deviceType,
        assetCode: state.selectedItem.assetCode,
        location: state.selectedItem.location,
        ipAddress: state.selectedItem.ipAddress,
        notes: state.selectedItem.notes,
      },
      activeDialog: "device",
    });
  }

  function hasDuplicateName(name: string, deviceType: string, currentId: number | null) {
    const normalizedName = name.trim();
    const normalizedType = deviceType.trim();
    return port.read().items.some((item) =>
      item.id !== currentId
      && item.deviceName.trim() === normalizedName
      && item.deviceType.trim() === normalizedType
    );
  }

  function validateDeviceForSave(form: DeviceForm) {
    if (form.id) {
      const currentItem = port.read().items.find((item) => item.id === form.id);
      if (currentItem) form.deviceType = currentItem.deviceType;
    }
    const name = form.deviceName.trim();
    if (!name) {
      port.showStatus("请输入设备名称");
      return null;
    }
    if (!form.deviceType.trim()) {
      port.showStatus("请先新增设备类型");
      return null;
    }
    const textFields: Array<[string, string, number, boolean]> = [
      ["设备名称", form.deviceName, INPUT_LIMITS.deviceName, false],
      ["设备类型", form.deviceType, INPUT_LIMITS.deviceTypeName, false],
      ["资产编号", form.assetCode, INPUT_LIMITS.assetCode, false],
      ["设备位置", form.location, INPUT_LIMITS.location, false],
      ["设备备注", form.notes, INPUT_LIMITS.notes, true],
    ];
    for (const [label, value, maxLength, allowLineBreaks] of textFields) {
      const error = getTextInputValidationError(value, maxLength, allowLineBreaks);
      if (error) {
        port.showStatus(`${label}${error}`, 5000);
        return null;
      }
    }
    if (!isValidConnectionAddress(form.ipAddress)) {
      port.showStatus(CONNECTION_ADDRESS_ERROR, 5000);
      return null;
    }
    if (hasDuplicateName(name, form.deviceType, form.id)) {
      port.showStatus("同一设备类型下已存在同名设备");
      return null;
    }

    return port.getTypeMeta(form.deviceType);
  }

  function getDeviceChanges(item: VaultItem, form: DeviceForm) {
    const values: Array<[string, string, string]> = [
      ["设备名称", item.deviceName, form.deviceName.trim()],
      ["设备类型", item.deviceType, form.deviceType.trim()],
      ["连接地址", item.ipAddress, form.ipAddress.trim()],
      ["资产编号", item.assetCode, form.assetCode.trim()],
      ["设备位置", item.location, form.location.trim()],
      ["备注", item.notes, form.notes.trim()],
    ];
    return values
      .filter(([, from, to]) => from !== to)
      .map(([label, from, to]) => ({ label, from, to }));
  }

  function save() {
    const state = port.read();
    const form = { ...state.deviceForm };
    const typeMeta = validateDeviceForSave(form);
    if (!typeMeta) return;

    if (form.id) {
      const currentItem = state.items.find((item) => item.id === form.id);
      if (!currentItem) {
        port.showStatus("保存失败：待修改的设备已不存在", 5000);
        return;
      }
      const changes = getDeviceChanges(currentItem, form);
      if (changes.length === 0) {
        port.showStatus("没有可保存的修改");
        return;
      }
      port.write({ activePopover: null });
      port.setPendingConfirmation({
        action: "save-device",
        title: "保存设备修改",
        message: `确认保存“${currentItem.deviceName}”的修改？`,
        detail: "确认后会更新设备信息，设备下的账号和密码不会改变。",
        confirmLabel: "保存修改",
        summaryItems: [{ label: "设备", value: currentItem.deviceName }],
        changes,
        itemUuid: currentItem.uuid,
        deviceDraft: form,
      });
      return;
    }

    executeSaveDevice({ deviceDraft: form });
  }

  function executeSaveDevice(
    target?: Pick<PendingConfirmation, "itemUuid" | "deviceDraft">,
  ) {
    const state = port.read();
    const form = target?.deviceDraft ? { ...target.deviceDraft } : { ...state.deviceForm };
    const typeMeta = validateDeviceForSave(form);
    if (!typeMeta) return;
    const currentItem = form.id
      ? target?.itemUuid
        ? state.items.find((item) => item.uuid === target.itemUuid)
        : state.items.find((item) => item.id === form.id)
      : undefined;
    if (form.id && !currentItem) {
      port.showStatus("保存失败：待修改的设备已不存在", 5000);
      return;
    }

    if (currentItem) {
      if (getDeviceChanges(currentItem, form).length === 0) {
        port.showStatus("没有可保存的修改");
        return;
      }
      const updatedAt = formatDateTime(new Date());
      const nextItems = state.items.map((item) => item.uuid === currentItem.uuid
        ? syncItemWithAccounts({
            ...item,
            deviceName: form.deviceName.trim(),
            deviceType: form.deviceType.trim(),
            deviceTypeUuid: typeMeta.uuid,
            assetCode: form.assetCode.trim(),
            location: form.location.trim(),
            ipAddress: form.ipAddress.trim(),
            iconText: typeMeta.iconText,
            iconClass: port.iconClassForType(form.deviceType.trim()),
            notes: form.notes.trim(),
            updatedAt,
          }, getAccounts(item))
        : item);
      const nextSelectedDeviceType = form.deviceType.trim();
      if (nextSelectedDeviceType !== state.selectedDeviceType || currentItem.id !== state.selectedId || state.searchQuery.trim()) {
        port.pushNavigationState();
      }
      port.write({
        items: nextItems,
        selectedId: currentItem.id,
        selectedDeviceType: nextSelectedDeviceType,
        searchQuery: "",
        selectedAccountIds: [],
        activeDialog: null,
      });
      return;
    }

    const nextItem: VaultItem = {
      uuid: createUuid(),
      id: Math.max(0, ...state.items.map((item) => item.id)) + 1,
      title: form.deviceName.trim(),
      deviceName: form.deviceName.trim(),
      deviceType: form.deviceType.trim(),
      deviceTypeUuid: typeMeta.uuid,
      assetCode: form.assetCode.trim(),
      location: form.location.trim(),
      username: "",
      password: "",
      ipAddress: form.ipAddress.trim(),
      tag: form.deviceType.trim(),
      iconText: typeMeta.iconText,
      iconClass: port.iconClassForType(form.deviceType.trim()),
      updatedAt: formatDateTime(new Date()),
      notes: form.notes.trim(),
      history: [],
      accounts: [],
    };
    port.pushNavigationState();
    port.write({
      items: [nextItem, ...state.items],
      selectedId: nextItem.id,
      selectedDeviceType: nextItem.deviceType,
      selectedAccountId: 0,
      selectedAccountIds: [],
      activeDialog: null,
    });
  }

  function setFormType(deviceType: DeviceType) {
    const state = port.read();
    if (state.deviceForm.id) return;
    port.write({
      deviceForm: { ...state.deviceForm, deviceType },
      deviceTypeSearch: "",
      openTypePicker: null,
    });
  }

  async function deleteSelected(target: Pick<PendingConfirmation, "itemUuid">) {
    const itemUuid = target.itemUuid;
    if (!itemUuid) {
      port.showStatus("删除失败：设备目标信息不完整，请重新选择");
      return;
    }

    const initialState = port.read();
    const initialItem = initialState.items.find((item) => item.uuid === itemUuid);
    if (!initialItem) {
      port.showStatus("删除失败：待删除的设备已不存在");
      return;
    }
    const snapshot = await port.createSafetySnapshot(`删除设备“${initialItem.deviceName}”前`);
    if (!snapshot) return;

    const state = port.read();
    const targetItem = state.items.find((item) => item.uuid === itemUuid);
    if (!targetItem) {
      port.showStatus("删除失败：待删除的设备已不存在");
      return;
    }
    const remainingItems = state.items.filter((item) => item.uuid !== itemUuid);
    const nextDeviceType = state.selectedDeviceType === "全部设备"
      || remainingItems.some((item) => item.deviceType === state.selectedDeviceType)
      ? state.selectedDeviceType
      : "全部设备";
    const deletingCurrentDevice = state.selectedItem.uuid === itemUuid;
    if (deletingCurrentDevice || nextDeviceType !== state.selectedDeviceType) {
      port.pushNavigationState();
    }
    const patch: DeviceControllerPatch = {
      items: remainingItems,
      selectedDeviceType: nextDeviceType,
      activePopover: null,
    };
    if (deletingCurrentDevice) {
      patch.selectedId = 0;
      patch.selectedAccountId = 0;
      patch.selectedAccountIds = [];
    }
    port.write(patch);
    port.offerSnapshotUndo(snapshot.id, "设备已删除");
  }

  function requestDeleteSelected() {
    const state = port.read();
    if (!state.selectedItem.id) return;
    port.write({ activePopover: null, activeDialog: null });
    port.setPendingConfirmation({
      action: "delete-device",
      title: "删除设备",
      message: `确认删除“${state.selectedItem.deviceName}”？`,
      detail: `将删除这台设备下的 ${state.selectedAccounts.length} 个账号、当前密码和历史密码记录。`,
      confirmLabel: "删除设备",
      itemUuid: state.selectedItem.uuid,
    });
  }

  return { openAddDialog, openEditDialog, save, executeSaveDevice, setFormType, deleteSelected, requestDeleteSelected };
}
