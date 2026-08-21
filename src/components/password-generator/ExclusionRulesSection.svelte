<script lang="ts">
  import { ListX } from "@lucide/svelte";
  import ClearableInput from "../ClearableInput.svelte";
  import { INPUT_LIMITS, sanitizePasswordInput } from "../../lib/input-validation";
  import type { PasswordGeneratorActions } from "../../lib/view-models";

  export let excludeSimilar = true;
  export let preventRepeats = false;
  export let excludedCharacters = "";
  export let generatePassword: PasswordGeneratorActions["generatePassword"];
  export let setExcludedCharacters: PasswordGeneratorActions["setExcludedCharacters"];
</script>

<section class="drawer-section">
  <div class="drawer-section-title">
    <ListX size={20} />
    <h3>排除哪些字符</h3>
  </div>

  <div class="switch-list">
    <label><input type="checkbox" bind:checked={excludeSimilar} on:change={generatePassword} /> 排除易混字符 0 O 1 I l</label>
    <label><input type="checkbox" bind:checked={preventRepeats} on:change={generatePassword} /> 避免相邻重复字符</label>
  </div>

  <label class="text-control">
    <span>额外排除字符</span>
    <ClearableInput value={excludedCharacters} placeholder="例如：@ / \\ &quot;" maxlength={INPUT_LIMITS.generatorCharacters} transformValue={sanitizePasswordInput} onValueChange={setExcludedCharacters} />
  </label>
</section>
