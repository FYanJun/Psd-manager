<script lang="ts">
  import { Copy, Eye, EyeOff, RefreshCcw } from "@lucide/svelte";
  import type { PasswordGeneratorActions } from "../../lib/view-models";

  export let generatedPassword = "";
  export let revealResetToken = 0;
  let passwordVisible = document.hasFocus();
  let appliedRevealResetToken = revealResetToken;
  $: if (appliedRevealResetToken !== revealResetToken) {
    appliedRevealResetToken = revealResetToken;
    passwordVisible = false;
  }
  export let generatePassword: PasswordGeneratorActions["generatePassword"];
  export let copyGeneratedPassword: PasswordGeneratorActions["copyGeneratedPassword"];
</script>

<div class="generator-result">
  <div class="generator-result-copy">
    <span>随机密码</span>
    <code>{!generatedPassword ? "未选择可用字符" : passwordVisible ? generatedPassword : "••••••••"}</code>
  </div>
  <div class="result-actions">
    <button type="button" class="icon-button inline" aria-label={passwordVisible ? "隐藏生成密码" : "显示生成密码"} data-tooltip={passwordVisible ? "隐藏生成密码" : "显示生成密码"} disabled={!generatedPassword} on:click={() => { passwordVisible = !passwordVisible; }}>
      {#if passwordVisible}<EyeOff size={18} />{:else}<Eye size={18} />{/if}
    </button>
    <button class="icon-button inline" aria-label="重新生成" data-tooltip="重新生成" on:click={() => generatePassword()}>
      <RefreshCcw size={18} />
    </button>
    <button class="icon-button inline" aria-label="复制生成密码" data-tooltip="复制生成密码" disabled={!generatedPassword} on:click={() => copyGeneratedPassword()}>
      <Copy size={18} />
    </button>
  </div>
</div>
