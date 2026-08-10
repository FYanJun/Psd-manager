<script lang="ts">
  import ClearableInput from "../ClearableInput.svelte";
  import { formatAccountTag } from "../../lib/vault";
  import { sanitizePasswordInput } from "../../lib/input-validation";
  import type { ActiveDialog, DeviceAccount, VaultItem } from "../../lib/types";

  export let passwordForm: { password: string; reason: string };
  export let selectedItem: VaultItem;
  export let selectedAccount: DeviceAccount;
  export let selectedAccountTargets: DeviceAccount[] = [];
  export let revealResetToken = 0;
  export let closeOverlays: () => void;
  export let openGeneratorPanel: (target?: "current-account" | "bulk-password" | null) => void;
  export let setActiveDialog: (dialog: ActiveDialog) => void;
  export let savePasswordUpdate: () => void;
</script>

<div class="form-grid">
  <section class="password-target-card wide-field" aria-label="当前更新账号">
    <span class={`type-icon ${selectedItem.iconClass}`}>{selectedItem.iconText}</span>
    <div>
      <strong>{selectedAccountTargets.length > 1 ? `已选择 ${selectedAccountTargets.length} 个账号` : selectedAccount.username || selectedAccount.title || "未填写用户名"}</strong>
      <span>{selectedItem.deviceName} · {selectedAccountTargets.length > 1 ? "批量更新密码" : formatAccountTag(selectedAccount, selectedItem.deviceType, selectedItem.tag)}</span>
    </div>
  </section>
  <label class="wide-field">
    <span>新密码</span>
    <ClearableInput bind:value={passwordForm.password} type="password" transformValue={sanitizePasswordInput} {revealResetToken} />
  </label>
  <label class="wide-field">
    <span>更新原因</span>
    <ClearableInput bind:value={passwordForm.reason} />
  </label>
  <button class="secondary-button wide-field" on:click={() => { openGeneratorPanel("current-account"); setActiveDialog(null); }}>使用随机密码</button>
</div>
<footer class="modal-actions">
  <button class="secondary-button" on:click={() => closeOverlays()}>取消</button>
  <button class="primary-button" disabled={!passwordForm.password.trim()} on:click={() => savePasswordUpdate()}>保存修改</button>
</footer>
