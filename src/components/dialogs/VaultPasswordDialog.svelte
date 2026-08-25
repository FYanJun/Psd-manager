<script lang="ts">
  import ClearableInput from "../ClearableInput.svelte";
  import { ShieldCheck } from "@lucide/svelte";
  import type { VaultPasswordDialogMode } from "../../lib/types";

  export let mode: VaultPasswordDialogMode = "set";
  export let currentPassword = "";
  export let newPassword = "";
  export let confirmPassword = "";
  export let error = "";
  export let busy = false;
  export let recoveryKey = "";
  export let recoveryAcknowledged = false;
  export let recoveryFileName = "";
  export let recoveryFileSaved = false;
  export let recoveryFileBusy = false;
  export let recoveryFileError = "";
  export let saveRecoveryFile: () => void;
  export let finishRecoverySetup: () => void;
  export let close: () => void;
  export let save: () => void;

  $: title = mode === "set" ? "设置启动密码" : mode === "change" ? "修改启动密码" : "关闭启动密码";
  $: submitLabel = mode === "set" ? "启用启动密码" : mode === "change" ? "保存新密码" : "关闭启动密码";
  $: passwordMismatch = mode !== "disable" && newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;
  $: canSubmit = !busy
    && currentPassword.length >= (mode === "set" ? 0 : 8)
    && (mode === "disable" || (newPassword.length >= 8 && confirmPassword.length >= 8 && !passwordMismatch));

</script>

{#if recoveryKey}
  <div class="vault-password-body recovery-key-body">
    <div class="vault-password-intro">
      <span class="vault-password-icon" aria-hidden="true"><ShieldCheck size={22} /></span>
      <p>请立即保存恢复文件。它只生成一次，可在忘记主密码时重置密码。</p>
    </div>
    <button class="secondary-button recovery-file-save" type="button" disabled={recoveryFileBusy} on:click={() => saveRecoveryFile()}>
      {recoveryFileBusy ? "正在保存…" : "保存恢复文件"}
    </button>
    {#if recoveryFileName}<p class="recovery-file-status">已保存：{recoveryFileName}</p>{/if}
    {#if recoveryFileError}<p class="vault-password-error" role="alert">{recoveryFileError}</p>{/if}
    <label class:recovery-ack-disabled={!recoveryFileSaved} class="recovery-key-ack"><input type="checkbox" bind:checked={recoveryAcknowledged} disabled={!recoveryFileSaved} /><span>我已将恢复文件保存到安全位置</span></label>
  </div>
  <footer class="modal-actions recovery-key-actions">
    <button class="primary-button" type="button" disabled={!recoveryFileSaved || !recoveryAcknowledged} on:click={() => finishRecoverySetup()}>我已保存，完成</button>
  </footer>
{:else}
  <form id="vault-password-form" class="vault-password-body" on:submit|preventDefault={() => canSubmit && save()}>
    <div class="vault-password-intro">
      <span class="vault-password-icon" aria-hidden="true"><ShieldCheck size={22} /></span>
      <p>{mode === "set" ? "设置后，应用启动和从托盘恢复时需要输入主密码。" : mode === "change" ? "只会重新保护资产库密钥，不会重新加密现有设备和账号数据。" : "关闭后，应用启动时将自动读取本地资产库密钥。"}</p>
    </div>

    {#if mode !== "set"}
      <label class="vault-password-field">
        <span>当前主密码</span>
        <ClearableInput bind:value={currentPassword} type="password" maxlength={256} autocomplete="current-password" ariaLabel="当前主密码" />
      </label>
    {/if}

    {#if mode !== "disable"}
      <label class="vault-password-field">
        <span>新主密码</span>
        <ClearableInput bind:value={newPassword} type="password" maxlength={256} autocomplete="new-password" ariaLabel="新主密码" />
      </label>
      <label class="vault-password-field">
        <span>确认新主密码</span>
        <ClearableInput bind:value={confirmPassword} type="password" maxlength={256} autocomplete="new-password" ariaLabel="确认新主密码" />
      </label>
    {/if}

    <p class="vault-password-hint">主密码至少 8 个字符，不会保存到应用设置中。忘记后可使用恢复文件重置。</p>
    {#if passwordMismatch}<p class="vault-password-error" role="alert">两次输入的新主密码不一致。</p>{/if}
    {#if error}<p class="vault-password-error" role="alert">{error}</p>{/if}
  </form>

  <footer class="modal-actions">
    <button class="secondary-button" type="button" disabled={busy} on:click={() => close()}>取消</button>
    <button class:danger-button={mode === "disable"} class:primary-button={mode !== "disable"} type="submit" form="vault-password-form" disabled={!canSubmit}>{submitLabel}</button>
  </footer>
{/if}

<style>
  .vault-password-body { display: grid; align-content: start; gap: 14px; min-width: 0; min-height: 0; overflow: auto; padding: 20px; }
  .vault-password-intro { display: flex; align-items: flex-start; gap: 10px; color: var(--text-secondary); font-size: var(--font-size-13); line-height: 1.55; }
  .vault-password-intro p { margin: 0; }
  .vault-password-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 34px; height: 34px; border-radius: 8px; color: var(--blue); background: var(--accent-subtle); }
  .vault-password-field { display: grid; gap: 7px; color: var(--text-strong); font-size: var(--font-size-13); font-weight: 750; }
  .vault-password-body :global(.clearable-input) :global(input) { width: 100%; min-height: 42px; border: 1px solid var(--field-border); border-radius: 8px; padding: 0 11px; outline: 0; color: var(--app-text); background: var(--field); transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease; }
  .vault-password-body :global(.clearable-input) :global(input:focus) { border-color: var(--blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 15%, transparent); }
  .vault-password-hint, .vault-password-error { margin: 0; font-size: var(--font-size-12); line-height: 1.5; }
  .vault-password-hint { color: var(--muted); }
  .vault-password-error { color: #d45b4f; }
  .recovery-key-body { gap: 16px; }
  .recovery-key-body .vault-password-intro { width: min(100%, 500px); }
  .recovery-file-save { min-width: 160px; }
  .recovery-file-status { width: 100%; margin: -4px 0 0; color: var(--text-secondary); font-size: var(--font-size-12); overflow-wrap: anywhere; text-align: center; }
  .recovery-key-ack { display: inline-flex; align-items: center; justify-content: center; gap: 8px; max-width: 100%; color: var(--text-secondary); font-size: var(--font-size-13); font-weight: 700; line-height: 1.4; text-align: left; }
  .recovery-key-ack input { width: 16px; height: 16px; margin: 0; accent-color: var(--blue); }
  .recovery-ack-disabled { opacity: 0.58; }

  .modal-actions .primary-button,
  .modal-actions .secondary-button,
  .modal-actions .danger-button { min-width: 112px; }
  .recovery-key-actions { justify-content: center; }
  .recovery-key-actions .primary-button { min-width: 160px; }

  @media (max-width: 520px) {
    .vault-password-body { padding: 16px; }
    .modal-actions { flex-wrap: wrap; }
    .modal-actions .primary-button,
    .modal-actions .secondary-button,
    .modal-actions .danger-button { flex: 1 1 140px; }
  }
</style>
