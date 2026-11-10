<script lang="ts">
  import ModalFrame from "../ModalFrame.svelte";
  import ClearableInput from "../ClearableInput.svelte";
  import SettingsSwitch from "../settings/SettingsSwitch.svelte";
  import type { BackupView } from "../../lib/controllers/backup-controller";

  export let view: BackupView;
  export let revealResetToken = 0;
  export let close: () => void;
  export let submit: (password: string, confirmation?: string) => Promise<void>;
  export let confirmRestore: () => Promise<void>;
  export let setIncludeSettings: (value: boolean) => void;
  let password = "";
  let confirmation = "";
  $: creating = view.mode === "create";
  async function send() {
    await submit(password, confirmation);
    if (view.stage !== "password") { password = ""; confirmation = ""; }
  }
</script>

<ModalFrame title={creating ? "创建加密备份" : "从加密备份恢复"}
  description={creating ? "完整保存设备、账号、密码历史和数据快照，可在其他设备恢复。" : "使用创建文件时设置的备份密码读取内容，确认后才替换当前资产库。"}
  {close} canClose={!view.busy}>
  <div class="backup-body" aria-busy={view.busy}>
    {#if view.stage === "password"}
      <form id="encrypted-backup-form" on:submit|preventDefault={send}>
        <label class="backup-field"><span>备份密码</span>
          <ClearableInput bind:value={password} type="password" {revealResetToken} disabled={view.busy}
            autocomplete={creating ? "new-password" : "current-password"} ariaLabel="备份密码" />
        </label>
        {#if creating}
          <label class="backup-field"><span>确认备份密码</span>
            <ClearableInput bind:value={confirmation} type="password" {revealResetToken} disabled={view.busy}
              autocomplete="new-password" ariaLabel="确认备份密码" />
          </label>
          <SettingsSwitch label="包含应用偏好" description="保存主题、排序和生成规则；不包含本机窗口、搜索记录和主密码设置。"
            checked={view.includeSettings} disabled={view.busy} onChange={setIncludeSettings} />
        {/if}
        <p class="backup-hint">{creating ? "备份密码为 8–256 个字符，与应用主密码独立。忘记后无法找回，请妥善保管。建议把备份文件存放在独立位置。" : "请选择 .psdbackup 文件。备份密码与当前应用主密码可以不同；读取文件不会修改当前数据。"}</p>
      </form>
    {:else if view.stage === "review" && view.summary}
      <p class="backup-file">{view.fileName}</p>
      <dl class="backup-summary">
        <div><dt>设备</dt><dd>{view.summary.devices} 台</dd></div>
        <div><dt>账号</dt><dd>{view.summary.accounts} 个</dd></div>
        <div><dt>备份内快照</dt><dd>{view.summary.snapshots} 份</dd></div>
      </dl>
      <p class="backup-warning">确认后将替换当前设备、账号、密码历史和快照。恢复前会先保存当前数据快照；最多保留 10 份，最旧快照可能被移除。</p>
      {#if view.summary.hasSettings}
        <SettingsSwitch label="恢复应用偏好" description="恢复主题、排序和生成规则；保留当前主密码、自启和本机窗口设置。"
          checked={view.includeSettings} disabled={view.busy} onChange={setIncludeSettings} />
      {/if}
    {:else if view.stage === "done"}
      <p class="backup-result" role="status">{view.message}</p>
      {#if creating}<p class="backup-file">{view.fileName}</p>{/if}
    {/if}
    {#if view.busy}<p class="backup-hint" role="status">正在{view.stage === "review" ? "恢复数据" : creating ? "生成并保存备份" : "读取并验证备份"}，请稍候…</p>{/if}
    {#if view.error}<p class="backup-error" role="alert">{view.error}</p>{/if}
  </div>
  <footer class="modal-actions">
    <button class="secondary-button" type="button" disabled={view.busy} on:click={close}>{view.stage === "done" ? "完成" : "取消"}</button>
    {#if view.stage === "password"}
      <button class="primary-button" type="submit" form="encrypted-backup-form" disabled={view.busy || !password || (creating && !confirmation)}>{creating ? "选择位置并创建" : "选择文件并预览"}</button>
    {:else if view.stage === "review"}
      <button class="danger-button" type="button" disabled={view.busy} on:click={confirmRestore}>确认替换并恢复</button>
    {/if}
  </footer>
</ModalFrame>

<style>
  .backup-body { display: grid; gap: 16px; min-height: 0; overflow: auto; padding: 20px 24px; }
  form { display: grid; gap: 16px; }
  .backup-field { display: grid; gap: 8px; color: var(--text-strong); font-size: var(--font-size-13); font-weight: var(--weight-semibold); }
  .backup-field :global(input) { width: 100%; min-height: 42px; border: 1px solid var(--field-border); border-radius: 8px; padding: 0 11px; color: var(--app-text); background: var(--field); }
  .backup-field :global(input:focus-visible) { outline: 2px solid var(--accent-focus); outline-offset: 2px; }
  .backup-hint, .backup-result, .backup-file { margin: 0; color: var(--text-secondary); font-size: var(--font-size-13); line-height: 1.6; overflow-wrap: anywhere; }
  .backup-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 0; }
  .backup-summary div { display: grid; gap: 8px; }
  .backup-summary dt { color: var(--muted); font-size: var(--font-size-12); }
  .backup-summary dd { margin: 0; color: var(--text-strong); font-size: var(--font-size-16); font-weight: var(--weight-semibold); }
  .backup-warning, .backup-error { margin: 0; color: var(--danger-panel-text); font-size: var(--font-size-13); line-height: 1.6; }
  .backup-warning { padding: 12px; border: 1px solid var(--danger-panel-border); border-radius: 8px; background: var(--danger-panel); }
</style>
