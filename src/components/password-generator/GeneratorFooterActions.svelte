<script lang="ts">
  import { KeyRound, RotateCcwKey } from "@lucide/svelte";
  import type { DeviceAccount, VaultItem } from "../../lib/types";
  import type { PasswordGeneratorActions } from "../../lib/view-models";

  export let generatedPassword = "";
  export let canUseGeneratorForCurrentAccount: boolean;
  export let canUseGeneratorForBulkUpdate: boolean;
  export let selectedItem: VaultItem;
  export let selectedAccount: DeviceAccount;
  export let itemCount: number;
  export let useGeneratedPasswordForCurrentDevice: PasswordGeneratorActions["useGeneratedPasswordForCurrentDevice"];
  export let useGeneratedPasswordForBulkUpdate: PasswordGeneratorActions["useGeneratedPasswordForBulkUpdate"];
</script>

<footer class="drawer-footer">
  {#if canUseGeneratorForCurrentAccount}
    <button class="drawer-action primary-action" aria-label="填入当前账号" data-tooltip="填入当前账号" disabled={!generatedPassword || !selectedItem.id || !selectedAccount.id} on:click={() => useGeneratedPasswordForCurrentDevice()}>
      <KeyRound size={18} />
      <span>填入当前账号</span>
    </button>
  {/if}
  {#if canUseGeneratorForBulkUpdate}
    <button class="drawer-action" class:primary-action={!canUseGeneratorForCurrentAccount} aria-label="批量改密" data-tooltip="批量改密" disabled={!generatedPassword || itemCount === 0} on:click={() => useGeneratedPasswordForBulkUpdate()}>
      <RotateCcwKey size={20} />
      <span>批量改密</span>
    </button>
  {/if}
</footer>
