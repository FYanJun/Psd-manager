<script lang="ts">
  import { CaseSensitive } from "@lucide/svelte";
  import ClearableInput from "../ClearableInput.svelte";
  import { INPUT_LIMITS, sanitizeAsciiSymbols } from "../../lib/input-validation";
  import type { PasswordGeneratorActions } from "../../lib/view-models";

  export let useUpper = true;
  export let useLower = true;
  export let useNumbers = true;
  export let useSymbols = true;
  export let allowedSymbols = "";
  export let generatePassword: PasswordGeneratorActions["generatePassword"];
  export let setAllowedSymbols: PasswordGeneratorActions["setAllowedSymbols"];
</script>

<section class="drawer-section">
  <div class="drawer-section-title">
    <CaseSensitive size={22} />
    <h3>使用哪些字符</h3>
  </div>

  <div class="switch-list">
    <label><input type="checkbox" bind:checked={useUpper} on:change={generatePassword} /> 大写字母 A-Z</label>
    <label><input type="checkbox" bind:checked={useLower} on:change={generatePassword} /> 小写字母 a-z</label>
    <label><input type="checkbox" bind:checked={useNumbers} on:change={generatePassword} /> 数字 0-9</label>
    <label><input type="checkbox" bind:checked={useSymbols} on:change={generatePassword} /> 符号</label>
  </div>

  <label class="text-control">
    <span>允许使用的符号</span>
    <ClearableInput value={allowedSymbols} clearable={false} fallbackValue="!@#$%^&*+-_=?." maxlength={INPUT_LIMITS.generatorCharacters} disabled={!useSymbols} transformValue={sanitizeAsciiSymbols} onValueChange={setAllowedSymbols} />
  </label>
</section>
