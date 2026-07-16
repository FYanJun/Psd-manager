<script lang="ts">
  import { ArchiveRestore, X } from "@lucide/svelte";
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
  <div class="modal-backdrop">
    <div class="modal snapshots-modal" role="dialog" aria-modal="true" aria-labelledby="snapshots-title">
      <header class="modal-header">
        <h2 id="snapshots-title">数据快照</h2>
        <button class="icon-button" aria-label="关闭弹窗" data-tooltip="关闭弹窗" on:click={() => close()}><X size={20} /></button>
      </header>
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
    </div>
  </div>
{/if}
