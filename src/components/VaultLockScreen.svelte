<script lang="ts">
  import { ArrowLeft, LockKeyhole } from "@lucide/svelte";
  import ClearableInput from "./ClearableInput.svelte";

  export let password = "";
  export let error = "";
  export let busy = false;
  export let unlock: () => void;
  export let recover: (newPassword: string, manualRecoveryKey: string) => void;
  export let chooseRecoveryFile: () => void;
  export let recoveryBusy = false;
  export let recoveryError = "";
  export let recoveryResultFile = "";
  export let recoveryResultAcknowledged = false;
  export let recoveryFileName = "";
  export let recoveryFileSaved = false;
  export let recoveryFileBusy = false;
  export let recoveryFileError = "";
  export let saveRecoveryFile: () => void;
  export let finishRecovery: () => void;

  let recoveryMode = false;
  let manualRecoveryMode = false;
  let manualRecoveryKey = "";
  let recoveryNewPassword = "";
  let recoveryConfirmPassword = "";
  $: recoveryMismatch = recoveryNewPassword.length > 0 && recoveryConfirmPassword.length > 0 && recoveryNewPassword !== recoveryConfirmPassword;
  $: canRecover = !recoveryBusy && (manualRecoveryMode ? manualRecoveryKey.length > 0 : recoveryFileName.length > 0) && recoveryNewPassword.length >= 8 && recoveryConfirmPassword.length >= 8 && !recoveryMismatch;
</script>

<div class="vault-lock-screen">
  <section class="vault-lock-card" aria-labelledby="vault-lock-title">
    {#if recoveryResultFile}
      <span class="vault-lock-icon" aria-hidden="true"><LockKeyhole size={30} /></span>
      <h1 id="vault-lock-title">请保存新的恢复文件</h1>
      <p>恢复成功。旧恢复文件已经失效，请保存下面新生成的文件。</p>
      <button class="secondary-button recovery-file-save" type="button" disabled={recoveryFileBusy} on:click={() => saveRecoveryFile()}>
        {recoveryFileBusy ? "正在保存…" : "保存恢复文件"}
      </button>
      {#if recoveryFileName}<p class="recovery-file-status">已保存：{recoveryFileName}</p>{/if}
      {#if recoveryFileError}<p class="vault-lock-error" role="alert">{recoveryFileError}</p>{/if}
      <label class:recovery-ack-disabled={!recoveryFileSaved} class="recovery-ack"><input type="checkbox" bind:checked={recoveryResultAcknowledged} disabled={!recoveryFileSaved} /><span>我已将恢复文件保存到安全位置</span></label>
      <button class="primary-button vault-lock-submit" type="button" disabled={!recoveryFileSaved || !recoveryResultAcknowledged} on:click={() => finishRecovery()}>我已保存，进入应用</button>
    {:else if recoveryMode}
      <span class="vault-lock-icon" aria-hidden="true"><LockKeyhole size={30} /></span>
      <h1 id="vault-lock-title">使用恢复文件</h1>
      <p>选择恢复文件并验证成功后，需要设置新的主密码。</p>
      <form on:submit|preventDefault={() => canRecover && recover(recoveryNewPassword, manualRecoveryMode ? manualRecoveryKey : "")}>
        {#if manualRecoveryMode}
          <label>
            <span>恢复密钥</span>
            <ClearableInput bind:value={manualRecoveryKey} maxlength={100} autocomplete="off" ariaLabel="恢复密钥" disabled={recoveryBusy} />
          </label>
          <button class="text-button recovery-back-button" type="button" on:click={() => (manualRecoveryMode = false)}>返回选择恢复文件</button>
        {:else}
          <button class="secondary-button recovery-file-select" type="button" disabled={recoveryBusy} on:click={() => chooseRecoveryFile()}>选择恢复文件</button>
          {#if recoveryFileName}<p class="recovery-file-status">已选择：{recoveryFileName}</p>{/if}
          <button class="text-button recovery-back-button" type="button" on:click={() => (manualRecoveryMode = true)}>高级选项：手动输入恢复密钥</button>
        {/if}
        <label>
          <span>新主密码</span>
          <ClearableInput bind:value={recoveryNewPassword} type="password" maxlength={256} autocomplete="new-password" ariaLabel="新主密码" disabled={recoveryBusy} />
        </label>
        <label>
          <span>确认新主密码</span>
          <ClearableInput bind:value={recoveryConfirmPassword} type="password" maxlength={256} autocomplete="new-password" ariaLabel="确认新主密码" disabled={recoveryBusy} />
        </label>
        {#if recoveryMismatch}<p class="vault-lock-error" role="alert">两次输入的新主密码不一致。</p>{/if}
        {#if recoveryError}<p class="vault-lock-error" role="alert">{recoveryError}</p>{/if}
        <button class="primary-button vault-lock-submit" type="submit" disabled={!canRecover}>{recoveryBusy ? "正在恢复…" : "恢复并设置新密码"}</button>
      </form>
      <button class="text-button recovery-back-button" type="button" on:click={() => (recoveryMode = false)}><ArrowLeft size={15} />返回主密码解锁</button>
    {:else}
      <span class="vault-lock-icon" aria-hidden="true"><LockKeyhole size={30} /></span>
      <h1 id="vault-lock-title">资产库已锁定</h1>
      <p>输入主密码后继续使用密码管理器。</p>
      <form on:submit|preventDefault={() => unlock()}>
        <label>
          <span>主密码</span>
          <ClearableInput bind:value={password} type="password" maxlength={256} autocomplete="current-password" ariaLabel="主密码" disabled={busy} />
        </label>
        {#if error}<p class="vault-lock-error" role="alert">{error}</p>{/if}
        <button class="primary-button vault-lock-submit" type="submit" disabled={busy || password.length === 0}>{busy ? "正在解锁…" : "解锁资产库"}</button>
      </form>
      <button class="text-button recovery-back-button" type="button" on:click={() => (recoveryMode = true)}>忘记主密码？使用恢复文件</button>
      <small>主密码不会发送到网络，也不会保存到应用设置中。</small>
    {/if}
  </section>
</div>

<style>
  .vault-lock-screen { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; overflow: auto; padding: 24px; background: var(--app-background); }
  .vault-lock-card { display: grid; justify-items: center; gap: 16px; width: min(430px, 100%); max-height: calc(100vh - 48px); overflow: auto; padding: 32px 30px 28px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); box-shadow: var(--modal-shadow); text-align: center; }
  .vault-lock-icon { display: inline-flex; align-items: center; justify-content: center; width: 58px; height: 58px; border-radius: 16px; color: var(--blue); background: var(--accent-subtle); }
  .vault-lock-card h1 { margin: 0; color: var(--text-strong); font-size: var(--font-size-21); line-height: 1.25; }
  .vault-lock-card > p { max-width: 34em; margin: 0; color: var(--text-secondary); font-size: var(--font-size-13); line-height: 1.55; }
  .vault-lock-card form { display: grid; gap: 14px; width: 100%; margin-top: 2px; text-align: left; }
  .vault-lock-card label { display: grid; gap: 7px; color: var(--text-strong); font-size: var(--font-size-13); font-weight: 750; }
  .vault-lock-card :global(.clearable-input) :global(input) { width: 100%; min-height: 44px; border: 1px solid var(--field-border); border-radius: 8px; padding: 0 11px; outline: 0; color: var(--app-text); background: var(--field); transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease; }
  .vault-lock-card :global(.clearable-input) :global(input:focus) { border-color: var(--blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 15%, transparent); }
  .vault-lock-submit { width: 100%; min-height: 42px; }
  .vault-lock-error { margin: 0; color: #d45b4f; font-size: var(--font-size-12); text-align: left; }
  .vault-lock-card small { color: var(--muted); font-size: var(--font-size-11); line-height: 1.4; }
  .text-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 30px; padding: 0 6px; color: var(--blue); background: transparent; font-size: var(--font-size-12); font-weight: 750; line-height: 1.25; text-align: center; }
  .text-button:hover { color: var(--blue-hover); }
  .recovery-back-button { justify-self: center; }
  .recovery-file-save, .recovery-file-select { min-width: 160px; }
  .recovery-file-status { width: 100%; margin: -4px 0 0; color: var(--text-secondary); font-size: var(--font-size-12); overflow-wrap: anywhere; text-align: center; }
  .recovery-ack { display: inline-flex; align-items: center; justify-content: center; gap: 8px; max-width: 100%; color: var(--text-secondary); font-size: var(--font-size-12); font-weight: 700; line-height: 1.4; text-align: left; }
  .recovery-ack input { width: 16px; height: 16px; margin: 0; accent-color: var(--blue); }
  .recovery-ack-disabled { opacity: 0.58; }

  @media (max-width: 520px) {
    .vault-lock-screen { padding: 14px; }
    .vault-lock-card { width: 100%; max-height: calc(100vh - 28px); padding: 26px 20px 22px; }
    .vault-lock-card h1 { font-size: var(--font-size-20); }
  }
</style>
