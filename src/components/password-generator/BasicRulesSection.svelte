<script lang="ts">
  import { SlidersHorizontal } from "@lucide/svelte";
  import NumberStepper from "./NumberStepper.svelte";
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
</script>

<section class="drawer-section">
  <div class="drawer-section-title">
    <SlidersHorizontal size={18} />
    <h3>基础规则</h3>
  </div>

  <div class="quick-lengths" role="group" aria-label="常用密码长度">
    {#each [8, 12, 16, 24] as length}
      <button class:selected={generatorLength === length} on:click={() => setGeneratorLength(length)}>{length}</button>
    {/each}
  </div>

  <div class="range-control drawer-range">
    <span>长度</span>
    <input
      type="range"
      min="3"
      max="24"
      value={generatorLength}
      aria-label="拖动调整密码长度"
      on:input={updateGeneratorLengthFromSlider}
    />
    <NumberStepper label="密码长度" value={generatorLengthInput} current={generatorLength} min={3} max={24}
      onInput={handleGeneratorLengthInput} onStep={setGeneratorLength}
      onBlur={commitGeneratorLengthInput} onKeydown={handleGeneratorLengthKeydown} />
  </div>

  <div class="stepper-grid">
    <div class="number-control">
      <span>最少数字</span>
      <NumberStepper label="最少数字" value={minimumNumbers} current={minimumNumbers} min={0} max={generatorLength}
        disabled={!useNumbers} onInput={setGeneratorMinimumNumbers} onStep={setGeneratorMinimumNumbers} />
    </div>
    <div class="number-control">
      <span>最少符号</span>
      <NumberStepper label="最少符号" value={minimumSymbols} current={minimumSymbols} min={0} max={generatorLength}
        disabled={!useSymbols} onInput={setGeneratorMinimumSymbols} onStep={setGeneratorMinimumSymbols} />
    </div>
  </div>
</section>
