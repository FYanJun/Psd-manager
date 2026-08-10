import { formatDateTime } from "../utils";
import { CONNECTION_ADDRESS_ERROR, isValidConnectionAddress } from "../input-validation";
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

  function save() {
    const state = port.read();
    const form = state.deviceForm;
    const name = form.deviceName.trim();
    if (!name) {
      port.showStatus("请输入设备名称");
      return;
    }
    if (!form.deviceType.trim()) {
      port.showStatus("请先新增设备类型");
      return;
    }
    if (!isValidConnectionAddress(form.ipAddress)) {
      port.showStatus(CONNECTION_ADDRESS_ERROR, 5000);
      return;
    }
    if (hasDuplicateName(name, form.deviceType, form.id)) {
      port.showStatus("同一设备类型下已存在同名设备");
      return;
    }

    const typeMeta = port.getTypeMeta(form.deviceType);
    if (form.id) {
      const updatedAt = formatDateTime(new Date());
      const nextItems = state.items.map((item) => item.id === form.id
        ? syncItemWithAccounts({
            ...item,
            deviceName: name,
            deviceType: form.deviceType,
            deviceTypeUuid: typeMeta.uuid,
            assetCode: form.assetCode.trim(),
            location: form.location.trim(),
            ipAddress: form.ipAddress.trim(),
            iconText: typeMeta.iconText,
            iconClass: port.iconClassForType(form.deviceType),
            notes: form.notes.trim(),
            updatedAt,
          }, getAccounts(item))
        : item);
      const nextSelectedDeviceType = form.deviceType;
      if (nextSelectedDeviceType !== state.selectedDeviceType || form.id !== state.selectedId || state.searchQuery.trim()) {
        port.pushNavigationState();
      }
      port.write({
        items: nextItems,
        selectedId: form.id,
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
      title: name,
      deviceName: name,
      deviceType: form.deviceType,
      deviceTypeUuid: typeMeta.uuid,
      assetCode: form.assetCode.trim(),
      location: form.location.trim(),
      username: "",
      password: "",
      ipAddress: form.ipAddress.trim(),
      tag: form.deviceType,
      iconText: typeMeta.iconText,
      iconClass: port.iconClassForType(form.deviceType),
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

  return { openAddDialog, openEditDialog, save, setFormType, deleteSelected, requestDeleteSelected };
}
