<script lang="ts">
  import { Copy, RefreshCcw } from "@lucide/svelte";
  import type { PasswordGeneratorActions } from "../../lib/view-models";

  export let generatedPassword = "";
  export let generatePassword: PasswordGeneratorActions["generatePassword"];
  export let copyGeneratedPassword: PasswordGeneratorActions["copyGeneratedPassword"];
</script>

<div class="generator-result">
  <div>
    <span>随机密码</span>
    <code>{generatedPassword || "未选择可用字符"}</code>
  </div>
  <div class="result-actions">
    <button class="icon-button inline" aria-label="重新生成" data-tooltip="重新生成" on:click={() => generatePassword()}>
      <RefreshCcw size={18} />
    </button>
    <button class="icon-button inline" aria-label="复制生成密码" data-tooltip="复制生成密码" disabled={!generatedPassword} on:click={() => copyGeneratedPassword()}>
      <Copy size={18} />
    </button>
  </div>
</div>
