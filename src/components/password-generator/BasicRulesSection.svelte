<script lang="ts">
  import { SlidersHorizontal } from "@lucide/svelte";
  import ClearableInput from "../ClearableInput.svelte";
  import type { PasswordGeneratorActions } from "../../lib/view-models";

  export let generatorLength = 8;
  export let generatorLengthInput = "8";
  export let useNumbers = true;
  export let useSymbols = true;
  export let minimumNumbers = 2;
  export let minimumSymbols = 2;
  export let setGeneratorLength: PasswordGeneratorActions["setGeneratorLength"];
  export let setGeneratorMinimumNumbers: PasswordGeneratorActions["setGeneratorMinimumNumbers"];
  export let setGeneratorMinimumSymbols: PasswordGeneratorActions["setGeneratorMinimumSymbols"];
  export let updateGeneratorLengthFromSlider: PasswordGeneratorActions["updateGeneratorLengthFromSlider"];
  export let handleGeneratorLengthInput: PasswordGeneratorActions["handleGeneratorLengthInput"];
  export let commitGeneratorLengthInput: PasswordGeneratorActions["commitGeneratorLengthInput"];
  export let handleGeneratorLengthKeydown: PasswordGeneratorActions["handleGeneratorLengthKeydown"];
  export let persistGeneratorDefaults: PasswordGeneratorActions["persistGeneratorDefaults"];
</script>

<section class="drawer-section">
  <div class="drawer-section-title">
    <SlidersHorizontal size={18} />
    <h3>基础规则</h3>
  </div>

  <div class="quick-lengths" role="group" aria-label="常用密码长度">
    {#each [3, 8, 16, 24] as length}
      <button class:selected={generatorLength === length} on:click={() => setGeneratorLength(length)}>{length}</button>
    {/each}
  </div>

  <label class="range-control drawer-range">
    <span>长度</span>
    <input
      type="range"
      min="3"
      max="24"
      value={generatorLength}
      aria-label="拖动调整密码长度"
      on:input={(event) => { updateGeneratorLengthFromSlider(event); persistGeneratorDefaults(); }}
    />
    <ClearableInput
      className="length-input-shell"
      inputClass="length-input"
      type="number"
      min="3"
      max="24"
      clearable={false}
      fallbackValue={generatorLength}
      value={generatorLengthInput}
      ariaLabel="密码长度"
      onValueChange={(value) => { handleGeneratorLengthInput(value); persistGeneratorDefaults(); }}
      onBlur={() => { commitGeneratorLengthInput(); persistGeneratorDefaults(); }}
      onKeydown={handleGeneratorLengthKeydown}
    />
  </label>

  <div class="stepper-grid">
    <label class="number-control">
      <span>最少数字</span>
      <ClearableInput
        type="number"
        min="0"
        max={generatorLength}
        clearable={false}
        fallbackValue={minimumNumbers}
        value={minimumNumbers}
        disabled={!useNumbers}
        onValueChange={(value) => { setGeneratorMinimumNumbers(value); persistGeneratorDefaults(); }}
      />
    </label>
    <label class="number-control">
      <span>最少符号</span>
      <ClearableInput
        type="number"
        min="0"
        max={generatorLength}
        clearable={false}
        fallbackValue={minimumSymbols}
        value={minimumSymbols}
        disabled={!useSymbols}
        onValueChange={(value) => { setGeneratorMinimumSymbols(value); persistGeneratorDefaults(); }}
      />
    </label>
  </div>
</section>
