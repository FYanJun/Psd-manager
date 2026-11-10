<script lang="ts">
  import { tick } from "svelte";
  import { Check, ChevronRight, ChevronsUpDown, Minus, WandSparkles, X } from "@lucide/svelte";
  import { Checkbox, Popover } from "bits-ui";
  import ClearableInput from "../ClearableInput.svelte";
  import TypePicker from "../TypePicker.svelte";
  import { getBulkPasswordMatchKey } from "../../lib/device-commands";
  import { fuzzyContains, normalizeSearchValue } from "../../lib/utils";
  import { INPUT_LIMITS, sanitizeSingleLineTextInput } from "../../lib/input-validation";
  import type { BulkPasswordForm, BulkPasswordMatch, TypePickerScope } from "../../lib/types";
  import type { BulkPasswordDialogActions, BulkPasswordDialogView } from "../../lib/view-models";

  export let bulkPasswordForm: BulkPasswordForm;
  export let openTypePicker: TypePickerScope | null = null;
  export let bulkTypeSearch = "";
  export let bulkUsernameSearch = "";
  export let view: BulkPasswordDialogView;
  export let actions: BulkPasswordDialogActions;

  let cascadeOpen = false;
  let overflowDetailsOpen = false;
  $: if (!cascadeOpen) overflowDetailsOpen = false;
  let cascadeElement: HTMLDivElement | null = null;
  let cascadeMode: "device" | "username" = "device";
  let expandedGroupKey = "";
  type CascadeGroup = { key: string; label: string; matches: BulkPasswordMatch[] };

  function makeCascadeGroups(matches: BulkPasswordMatch[], mode: "device" | "username", search: string) {
    const groups = new Map<string, CascadeGroup>();
    const query = normalizeSearchValue(search);
    for (const match of matches) {
      const label = mode === "device" ? match.deviceName : match.username.trim() || "未填写用户名";
      const key = mode === "device" ? `device:${match.itemUuid}` : `username:${match.username.trim()}`;
      if (!fuzzyContains(normalizeSearchValue([match.deviceName, match.username, match.ipAddress, match.deviceType].join(" ")), query)) continue;
      const group = groups.get(key);
      if (group) group.matches.push(match);
      else groups.set(key, { key, label, matches: [match] });
    }
    return Array.from(groups.values());
  }

  function selectedCount(matches: BulkPasswordMatch[], selected: Set<string>) {
    return matches.filter(match => selected.has(getBulkPasswordMatchKey(match))).length;
  }

  $: cascadeMatches = view.bulkPasswordAllMatches.filter(match => bulkPasswordForm.deviceType === "全部设备" || match.deviceType === bulkPasswordForm.deviceType);
  $: cascadeGroups = makeCascadeGroups(cascadeMatches, cascadeMode, bulkUsernameSearch);
  $: visibleCascadeMatches = cascadeGroups.flatMap(group => group.matches);

  $: activeCascadeGroup = cascadeGroups.find(group => group.key === expandedGroupKey) ?? cascadeGroups[0];
  let selectionElement: HTMLElement;
  let selectionControlWidth = 0;
  let chipMeasurementElement: HTMLDivElement;
  let chipMeasurementWidth = 0;
  let visibleChipCount = 1;
  let overflowLabelWidth = 32;

  function updateChipLayout() {
    if (!chipMeasurementElement || !selectionControlWidth) return;
    const widths = Array.from(chipMeasurementElement.querySelectorAll<HTMLElement>(".bulk-selection-measure-tag"), element => element.getBoundingClientRect().width);
    const summaryWidth = chipMeasurementElement.querySelector<HTMLElement>(".bulk-selection-measure-overflow")?.getBoundingClientRect().width ?? 32;
    const gap = 6;
    // Match the control's inline padding and reserve its arrow target.
    const availableWidth = Math.max(0, selectionControlWidth - 12 - 38);
    const totalWidth = widths.reduce((total, width, index) => total + width + (index ? gap : 0), 0);
    let nextCount = widths.length;
    if (totalWidth > availableWidth) {
      const chipWidth = Math.max(0, availableWidth - summaryWidth - gap);
      let usedWidth = 0;
      nextCount = 0;
      for (const width of widths) {
        const nextWidth = usedWidth + width + (nextCount ? gap : 0);
        if (nextWidth > chipWidth) break;
        usedWidth = nextWidth;
        nextCount += 1;
      }
      // Keep one recognizable, ellipsized chip even when its name is long.
      nextCount = Math.max(1, nextCount);
    }
    visibleChipCount = nextCount;
    overflowLabelWidth = Math.ceil(summaryWidth);
  }
  let locateRevision = 0;
  // Snapshot the order on navigation, not on each checkbox change.
  $: leafOrderContext = JSON.stringify([cascadeOpen, cascadeMode, activeCascadeGroup?.key,
    activeCascadeGroup?.matches.map(getBulkPasswordMatchKey), locateRevision]);
  $: orderedCascadeMatches = orderCascadeMatches(leafOrderContext);

  function orderCascadeMatches(_context: string) {
    return [...(activeCascadeGroup?.matches ?? [])].sort((a, b) =>
      Number(actions.isBulkPasswordMatchSelected(a)) - Number(actions.isBulkPasswordMatchSelected(b)));
  }

  async function removeSelectionFrom(event: MouseEvent, keys: string[], list: HTMLElement, fallback: () => HTMLElement | null) {
    const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>(".bulk-selection-remove"));
    const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    const restoreFocus = event.currentTarget === document.activeElement;
    actions.removeBulkPasswordSelection(keys);
    await tick();
    updateChipLayout();
    await tick();
    if (restoreFocus) {
      const remaining = list.querySelectorAll<HTMLButtonElement>(".bulk-selection-remove");
      (remaining[Math.min(index, remaining.length - 1)] ?? fallback())?.focus({ preventScroll: true });
    }
  }

  function removeSelection(event: MouseEvent, keys: string[]) {
    return removeSelectionFrom(event, keys, selectionElement,
      () => selectionElement.querySelector<HTMLElement>("[aria-label='选择设备或账号']"));
  }

  function removeOverflowSelection(event: MouseEvent, keys: string[]) {
    const list = (event.currentTarget as HTMLElement).closest<HTMLElement>(".bulk-overflow-details");
    if (list) return removeSelectionFrom(event, keys, list, () => list);
  }

  function resetFilters() {
    bulkUsernameSearch = "";
    expandedGroupKey = "";
    actions.clearBulkPasswordFilters();
  }

  async function locateSelection(keys: string[]) {
    const match = view.bulkPasswordSelectedMatches.find(candidate => keys.includes(getBulkPasswordMatchKey(candidate)));
    if (!match) return;
    resetFilters();
    cascadeMode = "device";
    expandedGroupKey = `device:${match.itemUuid}`;
    overflowDetailsOpen = false;
    locateRevision += 1;
    cascadeOpen = true;
    await tick();
    const groupButton = cascadeElement?.querySelector<HTMLButtonElement>(".bulk-cascade-group.active .bulk-cascade-expand");
    groupButton?.scrollIntoView({ block: "nearest" });
    groupButton?.focus({ preventScroll: true });
    cascadeElement?.querySelector(".bulk-cascade-account-list")?.scrollTo({ top: 0 });
  }

  $: selectedMatchKeys = new Set(view.bulkPasswordSelectedMatches.map(getBulkPasswordMatchKey));
  $: selectedDevices = new Set(view.bulkPasswordSelectedMatches.map(match => match.itemUuid));
  $: selectionChips = makeSelectionChips(view.bulkPasswordSelectedMatches, view.bulkPasswordAllMatches);
  $: visibleSelectionChips = selectionChips.slice(0, visibleChipCount);
  $: hiddenSelectionChips = selectionChips.slice(visibleChipCount);
  $: hiddenChipCount = hiddenSelectionChips.length;
  // Svelte owns both ResizeObservers: control resizing and text metric changes.
  $: if (selectionChips && selectionControlWidth && chipMeasurementWidth >= 0) void tick().then(updateChipLayout);

  function makeSelectionChips(matches: BulkPasswordMatch[], allMatches: BulkPasswordMatch[]) {
    const groups = new Map<string, BulkPasswordMatch[]>();
    for (const match of matches) groups.set(match.itemUuid, [...(groups.get(match.itemUuid) ?? []), match]);
    return Array.from(groups, ([itemUuid, group]) => {
      // Device totals are supplied separately from the currently filtered result.
      const total = allMatches.filter(match => match.itemUuid === itemUuid).length;
      return { label: `${group[0].deviceName} ｜ ${total === group.length ? "全部" : `${group.length}/${total}`}`, keys: group.map(getBulkPasswordMatchKey) };
    });
  }
</script>

<div class="form-grid bulk-password-form">
  <section class="bulk-filter-panel wide-field" aria-label="筛选改密目标">
    <div class="bulk-filter-head">
      <div class="form-control type-combo-field">
        <span>设备类型</span>
        <TypePicker selectedMeta={view.selectedBulkTypeMeta} selectedValue={bulkPasswordForm.deviceType}
          options={view.filteredBulkTypeRows} bind:search={bulkTypeSearch} open={openTypePicker === "bulk"}
          scope="bulk" optionsId="bulk-type-options" ariaLabel="批量改密设备类型"
          searchAriaLabel="搜索批量改密设备类型" showCount={true}
          toggle={actions.toggleTypePicker} select={actions.setBulkPasswordDeviceType} />
      </div>
      <div class="form-control bulk-cascade-field">
        <span>选择设备或账号</span>
        <Popover.Root bind:open={cascadeOpen}>
          <div class="bulk-cascade-control" bind:this={selectionElement} bind:clientWidth={selectionControlWidth}>
            <Popover.Trigger class={`bulk-cascade-trigger${selectionChips.length ? " has-selection" : ""}`} aria-label="选择设备或账号">
              {#if selectionChips.length === 0}<span>选择需要改密的设备或账号</span>{/if}
              <ChevronsUpDown size={18} aria-hidden="true" />
            </Popover.Trigger>
            {#if hiddenChipCount > 0}
              <button type="button" class="bulk-tags-overflow" aria-label={`显示其余 ${hiddenChipCount} 个已选标签`}
                aria-expanded={cascadeOpen && overflowDetailsOpen} aria-haspopup="dialog"
                on:click={() => { overflowDetailsOpen = true; cascadeOpen = true; }}>+{hiddenChipCount}</button>
            {/if}
            {#if selectionChips.length > 0}
              <div class="bulk-selection-tags" aria-label="已选目标标签" style:right={`${38 + (hiddenChipCount ? overflowLabelWidth + 6 : 0)}px`}>
                {#each visibleSelectionChips as chip (chip.keys.join(","))}
                  <span class="bulk-selection-tag">
                    <button type="button" class="bulk-selection-locate" aria-label={`定位 ${chip.label}`} data-tooltip={chip.label} on:click={() => locateSelection(chip.keys)}>{chip.label}</button>
                    <button type="button" class="bulk-selection-remove" aria-label={`移除 ${chip.label}`} data-tooltip={`移除 ${chip.label}`} on:click={(event) => removeSelection(event, chip.keys)}><X size={14} aria-hidden="true" /></button>
                  </span>
                {/each}
              </div>
            {/if}
            <div class="bulk-selection-measure" aria-hidden="true" inert>
              <div class="bulk-selection-measure-content" bind:this={chipMeasurementElement} bind:clientWidth={chipMeasurementWidth}>
                {#each selectionChips as chip (chip.keys.join(","))}
                  <span class="bulk-selection-measure-tag"><span class="bulk-selection-measure-label">{chip.label}</span><span class="bulk-selection-measure-remove"></span></span>
                {/each}
                <span class="bulk-selection-measure-overflow">+{selectionChips.length}</span>
              </div>
            </div>
          </div>
          <Popover.Portal><Popover.Content bind:ref={cascadeElement} role="dialog" class={`bulk-cascade-popover${overflowDetailsOpen ? " has-overflow-details" : ""}`} style={`--bulk-cascade-width: ${selectionControlWidth + 2}px`} aria-label="级联选择改密目标" sideOffset={8} align="start" collisionPadding={12} strategy="fixed" customAnchor={selectionElement}>
            {#if overflowDetailsOpen}
              <section class="bulk-overflow-details" aria-label="其余已选标签" tabindex="-1">
                <strong>其余已选标签 · {hiddenChipCount}</strong>
                <div class="bulk-overflow-list">
                  {#each hiddenSelectionChips as chip (chip.keys.join(","))}
                    <span class="bulk-selection-tag">
                      <button type="button" class="bulk-selection-locate" aria-label={`定位 ${chip.label}`} on:click={() => locateSelection(chip.keys)}>{chip.label}</button>
                      <button type="button" class="bulk-selection-remove" aria-label={`移除 ${chip.label}`} data-tooltip={`移除 ${chip.label}`} on:click={(event) => removeOverflowSelection(event, chip.keys)}><X size={14} aria-hidden="true" /></button>
                    </span>
                  {:else}<p class="quiet-text">其余标签已全部移除或显示在选择框中。</p>{/each}
                </div>
              </section>
            {:else}
            <div class="bulk-cascade-modes" aria-label="级联选择方式">
              <button type="button" aria-pressed={cascadeMode === "device"} on:click={() => { cascadeMode = "device"; expandedGroupKey = ""; }}>按设备选</button>
              <button type="button" aria-pressed={cascadeMode === "username"} on:click={() => { cascadeMode = "username"; expandedGroupKey = ""; }}>按账号选</button>
            </div>
            <ClearableInput bind:value={bulkUsernameSearch} ariaLabel="搜索设备或账号" placeholder="搜索设备、账号或连接地址" maxlength={INPUT_LIMITS.connectionAddress} />
            {@const visibleCount = selectedCount(visibleCascadeMatches, selectedMatchKeys)}
            <div class="bulk-cascade-columns">
              <div class="bulk-cascade-groups" aria-label={cascadeMode === "device" ? "设备分组" : "账号分组"}>
                <Checkbox.Root class="bulk-cascade-leaf bulk-cascade-select-all" aria-label="全选当前结果"
                  disabled={visibleCascadeMatches.length === 0}
                  checked={visibleCascadeMatches.length > 0 && visibleCount === visibleCascadeMatches.length}
                  indeterminate={visibleCount > 0 && visibleCount < visibleCascadeMatches.length}
                  onCheckedChange={(checked) => actions.setBulkPasswordMatchesSelected(visibleCascadeMatches, checked)}>
                  <span class="bulk-account-checkbox" data-state={visibleCount > 0 ? "checked" : "unchecked"} aria-hidden="true">{#if visibleCount === visibleCascadeMatches.length && visibleCount > 0}<Check size={14} aria-hidden="true" />{:else if visibleCount > 0}<Minus size={14} aria-hidden="true" />{/if}</span>
                  <span>全选</span>
                </Checkbox.Root>
                <div class="bulk-cascade-group-list">
                {#each cascadeGroups as group (group.key)}
                  {@const count = selectedCount(group.matches, selectedMatchKeys)}
                  <div class="bulk-cascade-group" class:active={activeCascadeGroup?.key === group.key}>
                    <Checkbox.Root class="bulk-cascade-checkbox" aria-label={`选择分组 ${group.label}`}
                      checked={count === group.matches.length} indeterminate={count > 0 && count < group.matches.length}
                      onCheckedChange={(checked) => actions.setBulkPasswordMatchesSelected(group.matches, checked)}>
                      {#if count === group.matches.length}<Check size={14} aria-hidden="true" />{:else if count > 0}<Minus size={14} aria-hidden="true" />{/if}
                    </Checkbox.Root>
                    <button type="button" class="bulk-cascade-expand" aria-label={`展开分组 ${group.label}`}
                      aria-expanded={activeCascadeGroup?.key === group.key} aria-controls="bulk-cascade-leaves"
                      on:click={() => expandedGroupKey = group.key}>
                      <span>{group.label}<small>{count} / {group.matches.length} 个账号</small></span><ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                {:else}<p class="quiet-text">没有符合条件的设备或账号</p>{/each}
                </div>
              </div>
              <div class="bulk-cascade-leaves" id="bulk-cascade-leaves" aria-label="分组账号">
                {#if activeCascadeGroup}
                  {@const groupCount = selectedCount(activeCascadeGroup.matches, selectedMatchKeys)}
                  <div class="bulk-cascade-column-head">
                  <strong class="bulk-cascade-title">{activeCascadeGroup.label}</strong>
                  <Checkbox.Root class="bulk-cascade-leaf bulk-cascade-select-all" aria-label="全选本组"
                    checked={groupCount === activeCascadeGroup.matches.length}
                    indeterminate={groupCount > 0 && groupCount < activeCascadeGroup.matches.length}
                    onCheckedChange={(checked) => actions.setBulkPasswordMatchesSelected(activeCascadeGroup.matches, checked)}>
                    <span class="bulk-account-checkbox" data-state={groupCount > 0 ? "checked" : "unchecked"} aria-hidden="true">{#if groupCount === activeCascadeGroup.matches.length}<Check size={14} aria-hidden="true" />{:else if groupCount > 0}<Minus size={14} aria-hidden="true" />{/if}</span>
                    <span>全选</span>
                  </Checkbox.Root>
                  </div>
                  <div class="bulk-cascade-account-list">
                  {#each orderedCascadeMatches as match (getBulkPasswordMatchKey(match))}
                    <Checkbox.Root class="bulk-cascade-leaf" aria-label={`级联选择 ${match.deviceName} 的 ${match.username || "未填写用户名"}`}
                      checked={selectedMatchKeys.has(getBulkPasswordMatchKey(match))}
                      onCheckedChange={(checked) => actions.setBulkPasswordMatchesSelected([match], checked)}>
                      <span class="bulk-account-checkbox" data-state={selectedMatchKeys.has(getBulkPasswordMatchKey(match)) ? "checked" : "unchecked"} aria-hidden="true">{#if selectedMatchKeys.has(getBulkPasswordMatchKey(match))}<Check size={14} aria-hidden="true" />{/if}</span>
                      <span>{cascadeMode === "device" ? match.username || "未填写用户名" : match.deviceName}<small>{match.ipAddress || match.deviceType}</small></span>
                    </Checkbox.Root>
                  {/each}
                  </div>
                {:else}<p class="quiet-text">调整搜索条件后再选择</p>{/if}
              </div>
            </div>
            <div class="bulk-cascade-footer"><span>已选 {view.bulkPasswordSelectedMatches.length} 个账号</span><div class="bulk-selection-actions"><button type="button" class="compact-button" on:click={resetFilters}>重置筛选</button><Popover.Close class="compact-button">完成选择</Popover.Close></div></div>
            {/if}
          </Popover.Content></Popover.Portal>
        </Popover.Root>
      </div>
    </div>
    <p class="quiet-text bulk-filter-help">标签按设备汇总已选数量；点击标签继续选择，未选账号优先显示。全选仅包含当前搜索结果。</p>
  </section>

  <section class="bulk-selected wide-field" aria-label="已选改密目标">
    <div class="bulk-selected-head">
      <strong role="status" aria-live="polite" aria-atomic="true" tabindex="-1">已选 {view.bulkPasswordSelectedMatches.length} 个账号 · {selectedDevices.size} 台设备</strong>
      <div class="bulk-selection-actions">
        <button type="button" class="compact-button" disabled={view.bulkPasswordSelectedMatches.length === 0} on:click={actions.clearBulkPasswordMatches}>清空已选</button>
      </div>
    </div>
  </section>

  <div class="bulk-password-controls wide-field">
    <label><span>新密码</span><ClearableInput bind:value={bulkPasswordForm.password} type="password" ariaLabel="批量改密新密码" validateAccountPassword={true} revealResetToken={view.revealResetToken} /></label>
    <label><span>更新原因</span><ClearableInput bind:value={bulkPasswordForm.reason} ariaLabel="批量改密更新原因" maxlength={INPUT_LIMITS.passwordReason} transformValue={sanitizeSingleLineTextInput} /></label>
    <button type="button" class="secondary-button bulk-random-password" on:click={() => { actions.openGeneratorPanel("bulk-password"); actions.setActiveDialog(null); }}><WandSparkles size={18} aria-hidden="true" /><span>使用随机密码</span></button>
  </div>
</div>
<footer class="modal-actions">
  <button type="button" class="secondary-button" on:click={actions.closeOverlays}>取消</button>
  <button type="button" class="primary-button" disabled={!bulkPasswordForm.password || view.bulkPasswordSelectedMatches.length === 0} on:click={actions.saveBulkPasswordUpdate}>确认更新</button>
</footer>
