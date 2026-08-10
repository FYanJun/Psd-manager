<script lang="ts">
  import { ArchiveRestore, Download, Upload } from "@lucide/svelte";

  export let chooseConfigFile: () => void;
  export let openExportConfigDialog: () => void;
  export let openSnapshotsDialog: () => void;
</script>

<div class="context-menu-title">
  <strong>资产库工具</strong>
  <span>数据恢复和配置管理</span>
</div>
<button class="menu-item" role="menuitem" on:click={() => openSnapshotsDialog()}>
  <ArchiveRestore size={16} />
  <span>数据快照</span>
</button>
<div class="menu-separator"></div>
<button class="menu-item" role="menuitem" on:click={() => openExportConfigDialog()}>
  <Upload size={16} />
  <span>导出配置</span>
</button>
<button class="menu-item" role="menuitem" on:click={() => chooseConfigFile()}>
  <Download size={16} />
  <span>导入配置</span>
</button>
