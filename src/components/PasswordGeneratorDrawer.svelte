<script context="module" lang="ts">
  let nextGeneratorId = 0;
</script>

<script lang="ts">
  import { X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { GENERATOR_MIN_RATIO, GENERATOR_MAX_RATIO } from "../lib/constants";
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

  let drawerElement: HTMLElement | null = null;
  const modalId = `generator-${nextGeneratorId++}`;
  const returnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const widthStep = 0.02;

  function handleOpenAutoFocus(event: Event) {
    event.preventDefault();
    drawerElement?.querySelector<HTMLElement>("[data-generator-close]")?.focus({ preventScroll: true });
  }

  function handleCloseAutoFocus(event: Event) {
    event.preventDefault();
    // A restored password form owns its own initial focus.
    if (document.querySelector('[role="dialog"][data-state="open"]')) return;
    if (returnFocusTarget?.isConnected) returnFocusTarget.focus({ preventScroll: true });
  }

  function handleEscapeKeydown(event: KeyboardEvent) {
    event.preventDefault();
    if (document.querySelector(`[data-modal-owner="${modalId}"][role="menu"]`)) return;
    if (!actions.cancelGeneratorResize()) closeGeneratorPanel(true);
  }

  function allowOwnedEditingMenuFocus(event: FocusEvent) {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(`[data-modal-owner="${modalId}"]`)) return;
    const modals = document.querySelectorAll("[data-modal-id][data-state='open']");
    if (modals[modals.length - 1] !== drawerElement) return;
    event.stopImmediatePropagation();
  }

  function handleWidthKeydown(event: KeyboardEvent) {
    const next = event.key === "ArrowLeft" ? view.generatorRatio + widthStep
      : event.key === "ArrowRight" ? view.generatorRatio - widthStep
      : event.key === "Home" ? GENERATOR_MIN_RATIO
      : event.key === "End" ? GENERATOR_MAX_RATIO : null;
    if (next === null) return;
    event.preventDefault();
    actions.setGeneratorWidthRatio(next);
  }

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

<svelte:document on:focusin|capture={allowOwnedEditingMenuFocus} />

<Dialog.Root open={true}>
<Dialog.Overlay class="drawer-scrim" onpointerdown={() => closeGeneratorPanel(true)} />
<Dialog.Content bind:ref={drawerElement} onOpenAutoFocus={handleOpenAutoFocus}
  onCloseAutoFocus={handleCloseAutoFocus} onEscapeKeydown={handleEscapeKeydown}
  interactOutsideBehavior="ignore">
{#snippet child({ props })}
<aside {...props} class="generator-drawer" data-modal-id={modalId} tabindex="-1">
  <!-- A movable ARIA separator is keyboard-focusable, unlike a static divider. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
  <div
    role="separator"
    tabindex="0"
    class="drawer-resizer"
    aria-label="调整密码生成器宽度"
    aria-orientation="vertical"
    aria-controls={drawerElement?.id}
    aria-valuemin={GENERATOR_MIN_RATIO * 100}
    aria-valuemax={GENERATOR_MAX_RATIO * 100}
    aria-valuenow={Math.round(view.generatorRatio * 100)}
    aria-valuetext={`窗口宽度的 ${Math.round(view.generatorRatio * 100)}%`}
    on:pointerdown={startGeneratorResize}
    on:keydown={handleWidthKeydown}
  ></div>
  <header class="drawer-header">
    <div>
      <span class="drawer-kicker">密码工具</span>
      <Dialog.Title>{#snippet child({ props })}<h2 {...props}>密码生成器</h2>{/snippet}</Dialog.Title>
    </div>
    <div class="drawer-header-actions">
    <button class="icon-button" data-generator-close aria-label="关闭密码生成器" data-tooltip="关闭密码生成器" on:click={() => closeGeneratorPanel(true)}>
      <X size={21} />
    </button>
    </div>
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
{/snippet}
</Dialog.Content>
</Dialog.Root>
