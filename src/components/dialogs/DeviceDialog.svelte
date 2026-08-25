<script lang="ts">
  import { ChevronDown, Search } from "@lucide/svelte";
  import ClearableInput from "../ClearableInput.svelte";
  import ClearableTextarea from "../ClearableTextarea.svelte";
  import {
    INPUT_LIMITS,
    sanitizeConnectionAddressInput,
    sanitizeMultilineTextInput,
    sanitizeSingleLineTextInput,
  } from "../../lib/input-validation";
  import type { DeviceForm, DeviceType, DeviceTypeMeta, TypePickerScope } from "../../lib/types";
  import { typeColorClass, typeColorStyle } from "../../lib/color";

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
</script>

<div class="form-grid">
  <label>
    <span>设备名称</span>
    <ClearableInput bind:value={deviceForm.deviceName} maxlength={INPUT_LIMITS.deviceName} transformValue={sanitizeSingleLineTextInput} />
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
      <div class="type-combo">
        {#if selectedDeviceFormTypeMeta}
          <button
            type="button"
            class="type-combo-trigger"
            aria-expanded={openTypePicker === "device"}
            aria-controls="device-type-options"
            on:click={() => toggleTypePicker("device")}
          >
            <span class={`type-combo-icon ${typeColorClass(selectedDeviceFormTypeMeta.color)}`} style={typeColorStyle(selectedDeviceFormTypeMeta.color)}>{selectedDeviceFormTypeMeta.iconText}</span>
            <span class="type-combo-copy"><strong>{selectedDeviceFormTypeMeta.label || "选择设备类型"}</strong></span>
            <ChevronDown size={18} />
          </button>
        {/if}
        {#if openTypePicker === "device"}
          <div class="type-combo-popover" id="device-type-options">
            <div class="type-combo-search">
              <Search size={15} />
              <ClearableInput bind:value={deviceTypeSearch} placeholder="搜索设备类型" ariaLabel="搜索设备类型" maxlength={INPUT_LIMITS.deviceTypeName} transformValue={sanitizeSingleLineTextInput} />
            </div>
            <div class="type-combo-list" role="listbox" aria-label="设备类型">
              {#if filteredDeviceTypeOptions.length === 0}
                <div class="type-combo-empty">没有匹配的设备类型</div>
              {:else}
                {#each filteredDeviceTypeOptions as type}
                  <button
                    type="button"
                    class:selected={deviceForm.deviceType === type.label}
                    role="option"
                    aria-selected={deviceForm.deviceType === type.label}
                    on:click={() => setDeviceFormType(type.label)}
                  >
                    <span class={`type-combo-icon ${typeColorClass(type.color)}`} style={typeColorStyle(type.color)}>{type.iconText}</span>
                    <span class="type-combo-copy"><strong>{type.label}</strong></span>
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  <label>
    <span>连接地址</span>
    <ClearableInput bind:value={deviceForm.ipAddress} placeholder="例如：https://nas.local 或 ssh://server.local" maxlength={INPUT_LIMITS.connectionAddress} transformValue={sanitizeConnectionAddressInput} />
  </label>
  <label>
    <span>资产编号</span>
    <ClearableInput bind:value={deviceForm.assetCode} maxlength={INPUT_LIMITS.assetCode} transformValue={sanitizeSingleLineTextInput} />
  </label>
  <label>
    <span>设备位置</span>
    <ClearableInput bind:value={deviceForm.location} maxlength={INPUT_LIMITS.location} transformValue={sanitizeSingleLineTextInput} />
  </label>
  <label class="wide-field">
    <span>备注</span>
    <ClearableTextarea bind:value={deviceForm.notes} maxlength={INPUT_LIMITS.notes} transformValue={sanitizeMultilineTextInput} />
  </label>
</div>
<footer class="modal-actions">
  <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
  <button class="primary-button" disabled={!deviceForm.deviceName.trim() || !deviceForm.deviceType.trim()} on:click={() => saveDevice()}>{deviceForm.id ? "保存设备" : "新增设备"}</button>
</footer>
