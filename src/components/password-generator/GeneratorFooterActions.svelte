<script lang="ts">
  import { KeyRound, UsersRound } from "@lucide/svelte";
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

{#if canUseGeneratorForCurrentAccount || canUseGeneratorForBulkUpdate}
  <footer class="drawer-footer">
    {#if canUseGeneratorForCurrentAccount}
      <button class="drawer-action primary-action" aria-label="填入随机密码" data-tooltip="填入随机密码" disabled={!generatedPassword || !selectedItem.id || !selectedAccount.id} on:click={() => useGeneratedPasswordForCurrentDevice()}>
        <KeyRound size={18} />
        <span>填入随机密码</span>
      </button>
    {/if}
    {#if canUseGeneratorForBulkUpdate}
      <button class="drawer-action primary-action" aria-label="填入批量改密" data-tooltip="填入批量改密" disabled={!generatedPassword || itemCount === 0} on:click={() => useGeneratedPasswordForBulkUpdate()}>
        <UsersRound size={18} />
        <span>填入批量改密</span>
      </button>
    {/if}
  </footer>
{/if}
