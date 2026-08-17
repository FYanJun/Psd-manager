<script lang="ts">
  import { ArchiveRestore } from "@lucide/svelte";
  import ModalFrame from "./ModalFrame.svelte";
  import type { VaultSnapshot } from "../lib/types";
  import { getAccounts } from "../lib/vault";

  export let open = false;
  export let snapshots: VaultSnapshot[] = [];
  export let close: () => void;
  export let requestRestore: (snapshot: VaultSnapshot) => void;

  function accountCount(snapshot: VaultSnapshot) {
    return snapshot.items.reduce((count, item) => count + getAccounts(item).length, 0);
  }

  function formatSnapshotTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
  }
</script>

{#if open}
  <ModalFrame title="数据快照" titleId="snapshots-title" modalClass="snapshots-modal" dialogWidth="760px" {close}>
      <div class="snapshot-list">
        {#if snapshots.length === 0}
          <div class="snapshot-empty"><ArchiveRestore size={26} /><strong>暂无安全快照</strong><span>删除或配置导入前会自动保存。</span></div>
        {:else}
          {#each snapshots as snapshot}
            <div class="snapshot-row">
              <div>
                <strong>{snapshot.reason}</strong>
                <span>{formatSnapshotTime(snapshot.createdAt)} · {snapshot.items.length} 台设备 · {accountCount(snapshot)} 个账号</span>
              </div>
              <button class="secondary-button" on:click={() => requestRestore(snapshot)}><ArchiveRestore size={16} /><span>恢复</span></button>
            </div>
          {/each}
        {/if}
      </div>
      <footer class="modal-actions"><button class="primary-button" on:click={() => close()}>完成</button></footer>
  </ModalFrame>
{/if}

<style>
  .snapshot-list {
    display: grid;
    gap: 0;
    min-height: 0;
    max-height: min(52vh, 520px);
    overflow: auto;
    padding: 4px 22px 18px;
  }

  .snapshot-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 14px 0;
    border-bottom: 1px solid var(--border);
  }

  .snapshot-row > div {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .snapshot-row span,
  .snapshot-empty span {
    color: var(--text-secondary);
    font-size: var(--font-size-13);
  }

  .snapshot-empty {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 44px 20px;
    color: var(--text-secondary);
    text-align: center;
  }
</style>
