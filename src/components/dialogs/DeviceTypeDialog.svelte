<script lang="ts">
  import ClearableInput from "../ClearableInput.svelte";
  import { typeColorOptions } from "../../lib/constants";
  import { INPUT_LIMITS, sanitizeSingleLineTextInput } from "../../lib/input-validation";
  import { colorInputValue, typeColorClass, typeColorStyle } from "../../lib/color";
  import type { TypeForm } from "../../lib/types";

  export let typeForm: TypeForm;
  export let closeOverlays: () => void;
  export let saveDeviceType: () => void;

  function setCustomColor(event: Event) {
    typeForm.color = (event.currentTarget as HTMLInputElement).value;
  }
</script>

<div class="type-editor-layout">
  <div class="type-preview-card">
    <span class={`type-icon ${typeColorClass(typeForm.color)} type-preview-icon`} style={typeColorStyle(typeForm.color)}>{typeForm.iconText.trim() || typeForm.label.trim().slice(0, 1) || "类"}</span>
    <div>
      <strong>{typeForm.label.trim() || "设备类型"}</strong>
      <small>预览</small>
    </div>
  </div>
  <div class="type-editor-fields">
    <label>
      <span>类型名称</span>
      <ClearableInput bind:value={typeForm.label} placeholder="例如：交换机" maxlength={INPUT_LIMITS.deviceTypeName} transformValue={sanitizeSingleLineTextInput} />
    </label>
    <label>
      <span>图标文字</span>
      <ClearableInput bind:value={typeForm.iconText} placeholder="例如：交" maxlength={INPUT_LIMITS.deviceTypeIcon} transformValue={sanitizeSingleLineTextInput} />
    </label>
  </div>
  <div class="form-control type-color-control">
    <span>颜色</span>
    <div class="color-swatch-grid" role="group" aria-label="设备类型颜色">
      <label class:active={typeForm.color.startsWith("#")} class="color-picker-swatch" aria-label="自定义颜色" data-tooltip="自定义颜色">
        <span class="swatch-dot custom-color-dot"></span>
        <input type="color" aria-label="选择自定义颜色" value={colorInputValue(typeForm.color)} on:input={setCustomColor} />
      </label>
      {#each typeColorOptions as option}
        <button
          type="button"
          class:selected={typeForm.color === option.value}
          class="color-swatch-button"
          aria-label={option.label}
          on:click={() => (typeForm.color = option.value)}
        >
          <span class={`swatch-dot ${typeColorClass(option.value)}`}></span>
        </button>
      {/each}
    </div>
  </div>
</div>
<footer class="modal-actions">
  <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
  <button class="primary-button" on:click={() => saveDeviceType()}>{typeForm.originalLabel ? "保存修改" : "保存类型"}</button>
</footer>
