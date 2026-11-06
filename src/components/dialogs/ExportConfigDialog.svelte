<script lang="ts">
  import { tick } from "svelte";
  import { RadioGroup } from "bits-ui";
  import ClearableInput from "../ClearableInput.svelte";
  import type { ConfigTransferFormat } from "../../lib/types";

  export let exportConfigFormat: ConfigTransferFormat = "json";
  export let closeOverlays: () => void;
  export let exportConfig: (format?: ConfigTransferFormat, password?: string) => Promise<string | null>;
  export let exportPasswordConfigured = false;
  export let revealResetToken = 0;
  let password = "";
  let error = "";
  let busy = false;
  let passwordPromptOpen = false;
  let passwordInput: HTMLInputElement | null = null;

  async function submit() {
    if (busy) return;
    if (exportPasswordConfigured && !passwordPromptOpen) {
      passwordPromptOpen = true;
      await tick();
      passwordInput?.focus();
      return;
    }
    busy = true;
    error = "";
    try {
      error = await exportConfig(exportConfigFormat, password) || "";
    } finally {
      password = "";
      busy = false;
      if (!error) passwordPromptOpen = false;
    }
  }
</script>

<form id="export-config-form" class="form-grid export-config-grid" on:submit|preventDefault={submit}>
  {#if passwordPromptOpen}
    <p class="export-config-note wide-field">请输入当前主密码，验证后导出 {exportConfigFormat.toUpperCase()} 配置。</p>
    <label class="wide-field">
      <span>主密码</span>
      <ClearableInput bind:value={password} bind:inputRef={passwordInput} type="password" {revealResetToken} maxlength={256} autocomplete="current-password" ariaLabel="导出授权主密码" disabled={busy} />
    </label>
  {:else}
    <RadioGroup.Root class="format-choice-list wide-field" bind:value={() => exportConfigFormat, (value) => { exportConfigFormat = value as ConfigTransferFormat; }} disabled={busy} aria-label="选择导出配置格式">
      <RadioGroup.Item value="json" type="button" class={exportConfigFormat === "json" ? "selected" : ""}>
        <strong>JSON</strong>
        <span>完整保留应用结构，适合日常迁移和交接。</span>
      </RadioGroup.Item>
      <RadioGroup.Item value="yaml" type="button" class={exportConfigFormat === "yaml" ? "selected" : ""}>
        <strong>YAML</strong>
        <span>保留完整层级，适合人工阅读和手动编辑。</span>
      </RadioGroup.Item>
      <RadioGroup.Item value="xlsx" type="button" class={exportConfigFormat === "xlsx" ? "selected" : ""}>
        <strong>Excel（XLSX）</strong>
        <span>按设备类型、设备、账号和密码历史分表，便于查看与筛选。</span>
      </RadioGroup.Item>
    </RadioGroup.Root>
  {/if}
  <p class="export-config-note wide-field">导出的配置会包含明文用户名、密码和密码历史，请只保存到可信位置。</p>
  {#if error}<p class="export-config-error wide-field" role="alert">{error}</p>{/if}
</form>
<footer class="modal-actions">
  <button type="button" class="secondary-button" disabled={busy} on:click={() => closeOverlays()}>取消</button>
  <button type="submit" form="export-config-form" class="primary-button" disabled={busy}>{busy ? "正在导出…" : passwordPromptOpen ? "验证并导出" : "导出配置"}</button>
</footer>

<style>
  .export-config-error { margin: 0; color: var(--danger-panel-text); font-size: var(--font-size-13); }
</style>
