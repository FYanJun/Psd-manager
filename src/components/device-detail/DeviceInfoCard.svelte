<script lang="ts">
  import { Copy } from "@lucide/svelte";
  import type { VaultItem } from "../../lib/types";
  import type { DeviceDetailActions } from "../../lib/view-models";

  export let selectedItem: VaultItem;
  export let copyText: DeviceDetailActions["copyText"];
</script>

{#if selectedItem.ipAddress || selectedItem.assetCode || selectedItem.location || selectedItem.notes.trim()}
  <div class="device-info-card" aria-label="设备信息">
    {#if selectedItem.ipAddress || selectedItem.assetCode || selectedItem.location}
      <div class="device-info-grid">
        {#if selectedItem.ipAddress}
          <div class="device-info-item">
            <div>
              <span class="field-label">连接地址</span>
              <div class="device-info-value" data-value-tooltip={selectedItem.ipAddress}>
                <p>{selectedItem.ipAddress}</p>
              </div>
            </div>
            <button class="icon-button inline" aria-label="复制连接地址" data-tooltip="复制连接地址" on:click={() => copyText(selectedItem.ipAddress, "连接地址")}>
              <Copy size={18} />
            </button>
          </div>
        {/if}

        {#if selectedItem.assetCode}
          <div class="device-info-item">
            <div>
              <span class="field-label">资产编号</span>
              <div class="device-info-value" data-value-tooltip={selectedItem.assetCode}>
                <p>{selectedItem.assetCode}</p>
              </div>
            </div>
            <button class="icon-button inline" aria-label="复制资产编号" data-tooltip="复制资产编号" on:click={() => copyText(selectedItem.assetCode, "资产编号")}>
              <Copy size={18} />
            </button>
          </div>
        {/if}

        {#if selectedItem.location}
          <div class="device-info-item">
            <div>
              <span class="field-label">设备位置</span>
              <div class="device-info-value" data-value-tooltip={selectedItem.location}>
                <p>{selectedItem.location}</p>
              </div>
            </div>
            <button class="icon-button inline" aria-label="复制设备位置" data-tooltip="复制设备位置" on:click={() => copyText(selectedItem.location, "设备位置")}>
              <Copy size={18} />
            </button>
          </div>
        {/if}
      </div>
    {/if}

    {#if selectedItem.notes.trim()}
      <div class="device-info-item device-info-notes" aria-label="备注">
        <div>
          <span class="field-label">备注</span>
          <div class="device-info-value">
            <p>{selectedItem.notes}</p>
          </div>
        </div>
        <button class="icon-button inline" aria-label="复制备注" data-tooltip="复制备注" on:click={() => copyText(selectedItem.notes, "备注")}>
          <Copy size={18} />
        </button>
      </div>
    {/if}
  </div>
{/if}
