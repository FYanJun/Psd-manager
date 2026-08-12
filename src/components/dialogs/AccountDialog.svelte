<script lang="ts">
  import ClearableInput from "../ClearableInput.svelte";
  import ClearableTextarea from "../ClearableTextarea.svelte";
  import {
    INPUT_LIMITS,
    sanitizeMultilineTextInput,
    sanitizePasswordInput,
    sanitizeSingleLineTextInput,
  } from "../../lib/input-validation";
  import type { AccountForm, VaultItem } from "../../lib/types";

  export let accountForm: AccountForm;
  export let selectedItem: VaultItem;
  export let revealResetToken = 0;
  export let closeOverlays: () => void;
  export let saveAccount: () => void;
</script>

<div class="form-grid">
  <label>
    <span>用户名</span>
    <ClearableInput bind:value={accountForm.username} maxlength={INPUT_LIMITS.username} transformValue={sanitizeSingleLineTextInput} />
  </label>
  <label>
    <span>密码</span>
    <ClearableInput bind:value={accountForm.password} type="password" maxlength={INPUT_LIMITS.password} transformValue={sanitizePasswordInput} {revealResetToken} />
  </label>
  <label>
    <span>账号标签</span>
    <ClearableInput bind:value={accountForm.tag} placeholder="例如：普通账号、管理账号" maxlength={INPUT_LIMITS.accountTag} transformValue={sanitizeSingleLineTextInput} />
  </label>
  <div class="readonly-field" aria-label="所属设备">
    <span>所属设备</span>
    <strong>{selectedItem.deviceName || "未选择设备"}</strong>
  </div>
  <label class="wide-field">
    <span>备注</span>
    <ClearableTextarea bind:value={accountForm.notes} maxlength={INPUT_LIMITS.notes} transformValue={sanitizeMultilineTextInput} />
  </label>
</div>
<footer class="modal-actions">
  <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
  <button class="primary-button" on:click={() => saveAccount()}>{accountForm.id ? "保存账号" : "新增账号"}</button>
</footer>
