<script lang="ts">
  import type { FormValidationFeedback } from "../../lib/form-validation";
  import ClearableInput from "../ClearableInput.svelte";
  import ClearableTextarea from "../ClearableTextarea.svelte";
  import TypePicker from "../TypePicker.svelte";
  import {
    INPUT_LIMITS,
    sanitizeConnectionAddressInput,
    sanitizeMultilineTextInput,
    sanitizeSingleLineTextInput,
  } from "../../lib/input-validation";
  import type { DeviceForm, DeviceType, DeviceTypeMeta, TypePickerScope } from "../../lib/types";
  import { typeColorClass, typeColorStyle } from "../../lib/color";

  export let validationFeedback: FormValidationFeedback | null = null;
  export let deviceForm: DeviceForm;
  export let selectedDeviceFormTypeMeta: DeviceTypeMeta;
  export let openTypePicker: TypePickerScope | null = null;
  export let deviceTypeSearch = "";
  export let filteredDeviceTypeOptions: DeviceTypeMeta[];
  export let deviceTypeOptionsLength = 0;
  export let closeOverlays: () => void;
  export let toggleTypePicker: (scope: TypePickerScope) => void;
  export let setDeviceFormType: (deviceType: DeviceType) => void;
  export let saveDevice: () => void;

  $: formFeedback = validationFeedback?.form === "device" ? validationFeedback : null;

</script>

<div class="form-grid">
  <label>
    <span>设备名称</span>
    <ClearableInput
      bind:value={deviceForm.deviceName}
      ariaLabel="设备名称"
      errorMessage={formFeedback?.field === "deviceName" ? formFeedback.message : ""}
      errorFocusToken={formFeedback?.revision ?? 0}
      maxlength={INPUT_LIMITS.deviceName} transformValue={sanitizeSingleLineTextInput}
    />
  </label>
  <div class="form-control type-combo-field">
    <span>设备类型</span>
    {#if deviceForm.id}
      <strong class="type-readonly-value" aria-readonly="true">
        {#if selectedDeviceFormTypeMeta}
          <span class={`type-combo-icon ${typeColorClass(selectedDeviceFormTypeMeta.color)}`} style={typeColorStyle(selectedDeviceFormTypeMeta.color)}>{selectedDeviceFormTypeMeta.iconText}</span>
        {/if}
        <span>{selectedDeviceFormTypeMeta?.label || deviceForm.deviceType || "未设置"}</span>
      </strong>
    {:else if deviceTypeOptionsLength === 0}
      <div class="type-combo-empty-state">请先新增设备类型</div>
    {:else}
      <TypePicker
        selectedMeta={selectedDeviceFormTypeMeta}
        selectedValue={deviceForm.deviceType}
        options={filteredDeviceTypeOptions}
        bind:search={deviceTypeSearch}
        open={openTypePicker === "device"}
        scope="device"
        optionsId="device-type-options"
        ariaLabel="设备类型"
        searchAriaLabel="搜索设备类型"
        toggle={toggleTypePicker}
        select={setDeviceFormType}
      />
    {/if}
  </div>
  <label>
    <span>连接地址</span>
    <ClearableInput
      bind:value={deviceForm.ipAddress}
      ariaLabel="连接地址"
      errorMessage={formFeedback?.field === "ipAddress" ? formFeedback.message : ""}
      errorFocusToken={formFeedback?.revision ?? 0}
      placeholder="例如：https://nas.local 或 ssh://server.local" maxlength={INPUT_LIMITS.connectionAddress} transformValue={sanitizeConnectionAddressInput}
    />
  </label>
  <label>
    <span>资产编号</span>
    <ClearableInput
      bind:value={deviceForm.assetCode}
      ariaLabel="资产编号"
      errorMessage={formFeedback?.field === "assetCode" ? formFeedback.message : ""}
      errorFocusToken={formFeedback?.revision ?? 0}
      maxlength={INPUT_LIMITS.assetCode} transformValue={sanitizeSingleLineTextInput}
    />
  </label>
  <label>
    <span>设备位置</span>
    <ClearableInput
      bind:value={deviceForm.location}
      ariaLabel="设备位置"
      errorMessage={formFeedback?.field === "location" ? formFeedback.message : ""}
      errorFocusToken={formFeedback?.revision ?? 0}
      maxlength={INPUT_LIMITS.location} transformValue={sanitizeSingleLineTextInput}
    />
  </label>
  <label class="wide-field">
    <span>备注</span>
    <ClearableTextarea
      bind:value={deviceForm.notes}
      ariaLabel="备注"
      errorMessage={formFeedback?.field === "notes" ? formFeedback.message : ""}
      errorFocusToken={formFeedback?.revision ?? 0}
      maxlength={INPUT_LIMITS.notes} transformValue={sanitizeMultilineTextInput}
    />
  </label>
</div>
<footer class="modal-actions">
  <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
  <button class="primary-button" disabled={!deviceForm.deviceType.trim()} on:click={() => saveDevice()}>{deviceForm.id ? "保存设备" : "新增设备"}</button>
</footer>
