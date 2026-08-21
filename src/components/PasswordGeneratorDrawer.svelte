<script lang="ts">
  import { X } from "@lucide/svelte";
  import BasicRulesSection from "./password-generator/BasicRulesSection.svelte";
  import CharacterRulesSection from "./password-generator/CharacterRulesSection.svelte";
  import ExclusionRulesSection from "./password-generator/ExclusionRulesSection.svelte";
  import GeneratorFooterActions from "./password-generator/GeneratorFooterActions.svelte";
  import GeneratorResult from "./password-generator/GeneratorResult.svelte";
  import type { DeviceAccount, VaultItem } from "../lib/types";
  import type { PasswordGeneratorActions, PasswordGeneratorView } from "../lib/view-models";

  export let generatedPassword = "";
  export let generatorLength = 8;
  export let generatorLengthInput = "8";
  export let useUpper = true;
  export let useLower = true;
  export let useNumbers = true;
  export let useSymbols = true;
  export let excludeSimilar = true;
  export let preventRepeats = false;
  export let minimumNumbers = 2;
  export let minimumSymbols = 2;
  export let allowedSymbols = "";
  export let excludedCharacters = "";
  export let view: PasswordGeneratorView;
  export let actions: PasswordGeneratorActions;

  let canUseGeneratorForCurrentAccount: boolean;
  let canUseGeneratorForBulkUpdate: boolean;
  let selectedItem: VaultItem;
  let selectedAccount: DeviceAccount;
  let itemCount: number;
  let closeGeneratorPanel: PasswordGeneratorActions["closeGeneratorPanel"];
  let startGeneratorResize: PasswordGeneratorActions["startGeneratorResize"];
  let generatePassword: PasswordGeneratorActions["generatePassword"];
  let copyGeneratedPassword: PasswordGeneratorActions["copyGeneratedPassword"];
  let setGeneratorLength: PasswordGeneratorActions["setGeneratorLength"];
  let setGeneratorMinimumNumbers: PasswordGeneratorActions["setGeneratorMinimumNumbers"];
  let setGeneratorMinimumSymbols: PasswordGeneratorActions["setGeneratorMinimumSymbols"];
  let setAllowedSymbols: PasswordGeneratorActions["setAllowedSymbols"];
  let setExcludedCharacters: PasswordGeneratorActions["setExcludedCharacters"];
  let updateGeneratorLengthFromSlider: PasswordGeneratorActions["updateGeneratorLengthFromSlider"];
  let handleGeneratorLengthInput: PasswordGeneratorActions["handleGeneratorLengthInput"];
  let commitGeneratorLengthInput: PasswordGeneratorActions["commitGeneratorLengthInput"];
  let handleGeneratorLengthKeydown: PasswordGeneratorActions["handleGeneratorLengthKeydown"];
  let useGeneratedPasswordForCurrentDevice: PasswordGeneratorActions["useGeneratedPasswordForCurrentDevice"];
  let useGeneratedPasswordForBulkUpdate: PasswordGeneratorActions["useGeneratedPasswordForBulkUpdate"];

  $: ({ canUseGeneratorForCurrentAccount, canUseGeneratorForBulkUpdate, selectedItem, selectedAccount, itemCount } = view);
  $: ({ closeGeneratorPanel, startGeneratorResize, generatePassword, copyGeneratedPassword,
    setGeneratorLength, setGeneratorMinimumNumbers, setGeneratorMinimumSymbols, setAllowedSymbols,
    setExcludedCharacters, updateGeneratorLengthFromSlider, handleGeneratorLengthInput,
    commitGeneratorLengthInput, handleGeneratorLengthKeydown, useGeneratedPasswordForCurrentDevice,
    useGeneratedPasswordForBulkUpdate } = actions);
</script>

<button class="drawer-scrim" aria-label="关闭密码生成器" on:click={() => closeGeneratorPanel(true)}></button>
<aside class="generator-drawer" aria-label="密码生成器">
  <button
    type="button"
    class="drawer-resizer"
    aria-label="调整密码生成器宽度"
    on:pointerdown={startGeneratorResize}
  ></button>
  <header class="drawer-header">
    <div>
      <span class="drawer-kicker">密码工具</span>
      <h2>密码生成器</h2>
    </div>
    <button class="icon-button" aria-label="关闭密码生成器" data-tooltip="关闭密码生成器" on:click={() => closeGeneratorPanel(true)}>
      <X size={21} />
    </button>
  </header>

  <GeneratorResult {generatedPassword} {generatePassword} {copyGeneratedPassword} />

  <div class="drawer-body">
    <BasicRulesSection
      {generatorLength}
      {generatorLengthInput}
      {useNumbers}
      {useSymbols}
      {minimumNumbers}
      {minimumSymbols}
      {setGeneratorLength}
      {setGeneratorMinimumNumbers}
      {setGeneratorMinimumSymbols}
      {updateGeneratorLengthFromSlider}
      {handleGeneratorLengthInput}
      {commitGeneratorLengthInput}
      {handleGeneratorLengthKeydown}
    />
    <CharacterRulesSection
      bind:useUpper
      bind:useLower
      bind:useNumbers
      bind:useSymbols
      {allowedSymbols}
      {generatePassword}
      {setAllowedSymbols}
    />
    <ExclusionRulesSection
      bind:excludeSimilar
      bind:preventRepeats
      {excludedCharacters}
      {generatePassword}
      {setExcludedCharacters}
    />
  </div>

  <GeneratorFooterActions
    {generatedPassword}
    {canUseGeneratorForCurrentAccount}
    {canUseGeneratorForBulkUpdate}
    {selectedItem}
    {selectedAccount}
    {itemCount}
    {useGeneratedPasswordForCurrentDevice}
    {useGeneratedPasswordForBulkUpdate}
  />
</aside>
