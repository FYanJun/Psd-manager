<script lang="ts">
  import {
    ArrowDownAZ,
    ArrowDownUp,
    ArchiveRestore,
    ChartNoAxesColumnDecreasing,
    ClockArrowDown,
    Copy,
    Download,
    KeyRound,
    Pencil,
    Plus,
    Rows3,
    Search,
    Tags,
    Trash2,
    Upload,
  } from "@lucide/svelte";
  import type { ActivePopover, DeviceType, DeviceTypeSortMode, PopoverPosition, SortMode } from "../lib/types";

  export let activePopover: ActivePopover = null;
  export let popoverPosition: PopoverPosition;
  export let deviceTypeSortMode: DeviceTypeSortMode;
  export let sortMode: SortMode;
  export let contextDeviceType: "全部设备" | DeviceType;
  export let selectedDeviceType: "全部设备" | DeviceType;
  export let searchQuery = "";
  export let listContextLabel = "";
  export let selectedDeviceName = "";
  export let selectedAccountLabel = "";
  export let selectedAccountHasPassword = false;
  export let deviceTypeOptionsLength = 0;
  export let hasSelectedDevice = false;

  export let setDeviceTypeSortMode: (mode: DeviceTypeSortMode) => void;
  export let setSortMode: (mode: SortMode) => void;
  export let selectDeviceType: (deviceType: "全部设备" | DeviceType) => void;
  export let openEditTypeDialog: (deviceType?: "全部设备" | DeviceType) => void;
  export let requestDeleteDeviceType: (deviceType?: "全部设备" | DeviceType) => void;
  export let canDeleteDeviceType: (deviceType: "全部设备" | DeviceType) => boolean;
  export let getDeviceTypeCount: (deviceType: "全部设备" | DeviceType) => number;
  export let openAddTypeDialog: () => void;
  export let clearSearch: () => void;
  export let openAddDeviceDialog: (deviceType?: "全部设备" | DeviceType) => void;
  export let openEditDeviceDialog: () => void;
  export let requestDeleteSelectedDevice: () => void;
  export let copySelectedDeviceInfo: () => void;
  export let openPasswordDialog: () => void;
  export let copySelectedAccountInfo: () => void;
  export let openEditAccountDialog: () => void;
  export let requestDeleteSelectedAccount: () => void;
  export let chooseConfigFile: () => void;
  export let openExportConfigDialog: () => void;
  export let openSnapshotsDialog: () => void;
  export let setActivePopover: (popover: ActivePopover) => void;
</script>

{#if activePopover}
  <div class="action-popover" role="menu" tabindex="-1" style={`top: ${popoverPosition.top}px; left: ${popoverPosition.left}px;`} on:contextmenu={(event) => event.preventDefault()}>
    {#if activePopover === "type-sort"}
      <div class="context-menu-title">
        <strong>类型排序</strong>
        <span>调整左栏设备类型顺序</span>
      </div>
      <button class="menu-item" class:selected={deviceTypeSortMode === "default"} on:click={() => { setDeviceTypeSortMode("default"); setActivePopover(null); }}>
        <Rows3 size={16} />
        <span>按创建顺序</span>
      </button>
      <button class="menu-item" class:selected={deviceTypeSortMode === "nameAsc"} on:click={() => { setDeviceTypeSortMode("nameAsc"); setActivePopover(null); }}>
        <ArrowDownAZ size={16} />
        <span>按类型名称</span>
      </button>
      <button class="menu-item" class:selected={deviceTypeSortMode === "countDesc"} on:click={() => { setDeviceTypeSortMode("countDesc"); setActivePopover(null); }}>
        <ChartNoAxesColumnDecreasing size={16} />
        <span>按设备数量</span>
      </button>
    {:else if activePopover === "device-sort"}
      <div class="context-menu-title">
        <strong>设备排序</strong>
        <span>调整中栏设备列表顺序</span>
      </div>
      <button class="menu-item" class:selected={sortMode === "updatedDesc"} on:click={() => { setSortMode("updatedDesc"); setActivePopover(null); }}>
        <ClockArrowDown size={16} />
        <span>按最近更新</span>
      </button>
      <button class="menu-item" class:selected={sortMode === "nameAsc"} on:click={() => { setSortMode("nameAsc"); setActivePopover(null); }}>
        <ArrowDownAZ size={16} />
        <span>按设备名称</span>
      </button>
      <button class="menu-item" class:selected={sortMode === "typeAsc"} on:click={() => { setSortMode("typeAsc"); setActivePopover(null); }}>
        <Tags size={16} />
        <span>按设备类型</span>
      </button>
    {:else if activePopover === "type-context"}
      <div class="context-menu-title">
        <strong>{contextDeviceType}</strong>
        <span>设备类型</span>
      </div>
      {#if contextDeviceType !== selectedDeviceType || searchQuery.trim()}
        <button class="menu-item" on:click={() => { selectDeviceType(contextDeviceType); setActivePopover(null); }}>
          <Search size={16} />
          <span>显示此类型</span>
        </button>
      {/if}
      {#if contextDeviceType !== "全部设备"}
        <div class="menu-separator"></div>
        <button class="menu-item" on:click={() => openEditTypeDialog(contextDeviceType)}>
          <Pencil size={16} />
          <span>编辑设备类型</span>
        </button>
        <button
          class="menu-item danger-menu-item"
          disabled={!canDeleteDeviceType(contextDeviceType)}
          title={getDeviceTypeCount(contextDeviceType) > 0 ? "该类型下还有设备，不能直接删除" : "删除设备类型"}
          on:click={() => requestDeleteDeviceType(contextDeviceType)}
        >
          <Trash2 size={16} />
          <span>删除设备类型</span>
        </button>
      {/if}
      <button class="menu-item" on:click={() => openAddTypeDialog()}>
        <Plus size={16} />
        <span>新增设备类型</span>
      </button>
      <div class="menu-separator"></div>
      <button class="menu-item" class:selected={deviceTypeSortMode === "default"} on:click={() => { setDeviceTypeSortMode("default"); setActivePopover(null); }}>
        <Rows3 size={16} />
        <span>按创建顺序</span>
      </button>
      <button class="menu-item" class:selected={deviceTypeSortMode === "nameAsc"} on:click={() => { setDeviceTypeSortMode("nameAsc"); setActivePopover(null); }}>
        <ArrowDownAZ size={16} />
        <span>按类型名称</span>
      </button>
      <button class="menu-item" class:selected={deviceTypeSortMode === "countDesc"} on:click={() => { setDeviceTypeSortMode("countDesc"); setActivePopover(null); }}>
        <ChartNoAxesColumnDecreasing size={16} />
        <span>按设备数量</span>
      </button>
    {:else if activePopover === "type-blank-context"}
      <div class="context-menu-title">
        <strong>设备类型</strong>
        <span>管理设备分类</span>
      </div>
      <button class="menu-item" on:click={() => openAddTypeDialog()}>
        <Plus size={16} />
        <span>新增设备类型</span>
      </button>
      <div class="menu-separator"></div>
      <button class="menu-item" class:selected={deviceTypeSortMode === "default"} on:click={() => { setDeviceTypeSortMode("default"); setActivePopover(null); }}>
        <Rows3 size={16} />
        <span>按创建顺序</span>
      </button>
      <button class="menu-item" class:selected={deviceTypeSortMode === "nameAsc"} on:click={() => { setDeviceTypeSortMode("nameAsc"); setActivePopover(null); }}>
        <ArrowDownAZ size={16} />
        <span>按类型名称</span>
      </button>
      <button class="menu-item" class:selected={deviceTypeSortMode === "countDesc"} on:click={() => { setDeviceTypeSortMode("countDesc"); setActivePopover(null); }}>
        <ChartNoAxesColumnDecreasing size={16} />
        <span>按设备数量</span>
      </button>
    {:else if activePopover === "list-blank-context" || activePopover === "detail-blank-context"}
      <div class="context-menu-title">
        <strong>{activePopover === "detail-blank-context" ? "设备账号" : listContextLabel}</strong>
        <span>{activePopover === "detail-blank-context" ? "未选择设备" : "当前资产库范围"}</span>
      </div>
      {#if searchQuery.trim()}
        <button class="menu-item" on:click={() => { clearSearch(); setActivePopover(null); }}>
          <Search size={16} />
          <span>清空搜索</span>
        </button>
      {/if}
      <button
        class="menu-item"
        disabled={deviceTypeOptionsLength === 0}
        title={deviceTypeOptionsLength === 0 ? "请先在左栏创建设备类型" : "新增设备"}
        on:click={() => openAddDeviceDialog(contextDeviceType)}
      >
        <Plus size={16} />
        <span>新增设备</span>
      </button>
      <div class="menu-separator"></div>
      <button class="menu-item" class:selected={sortMode === "updatedDesc"} on:click={() => { setSortMode("updatedDesc"); setActivePopover(null); }}>
        <ClockArrowDown size={16} />
        <span>按最近更新</span>
      </button>
      <button class="menu-item" class:selected={sortMode === "nameAsc"} on:click={() => { setSortMode("nameAsc"); setActivePopover(null); }}>
        <ArrowDownAZ size={16} />
        <span>按设备名称</span>
      </button>
      <button class="menu-item" class:selected={sortMode === "typeAsc"} on:click={() => { setSortMode("typeAsc"); setActivePopover(null); }}>
        <Tags size={16} />
        <span>按设备类型</span>
      </button>
    {:else if activePopover === "device-actions"}
      <div class="context-menu-title">
        <strong>{selectedDeviceName || "设备操作"}</strong>
        <span>设备操作</span>
      </div>
      <button class="menu-item" disabled={!hasSelectedDevice} title={hasSelectedDevice ? "编辑设备信息" : "请先选择设备"} on:click={() => openEditDeviceDialog()}>
        <Pencil size={16} />
        <span>编辑设备信息</span>
      </button>
      <button class="menu-item" disabled={!hasSelectedDevice} title={hasSelectedDevice ? "复制设备信息" : "请先选择设备"} on:click={() => copySelectedDeviceInfo()}>
        <Copy size={16} />
        <span>复制设备信息</span>
      </button>
      <button class="menu-item danger-menu-item" disabled={!hasSelectedDevice} title={hasSelectedDevice ? "删除设备" : "请先选择设备"} on:click={() => requestDeleteSelectedDevice()}>
        <Trash2 size={16} />
        <span>删除设备</span>
      </button>
      <div class="menu-separator"></div>
      <button class="menu-item" on:click={() => setActivePopover("device-sort")}>
        <ArrowDownUp size={16} />
        <span>设备排序</span>
      </button>
    {:else if activePopover === "account-context"}
      <div class="context-menu-title">
        <strong>{selectedAccountLabel}</strong>
        <span>账号操作</span>
      </div>
      <button class="menu-item" on:click={() => openPasswordDialog()}>
        <KeyRound size={16} />
        <span>更新密码</span>
      </button>
      <button class="menu-item" disabled={!selectedAccountHasPassword} title={selectedAccountHasPassword ? "复制账号密码" : "该账号未设置密码"} on:click={() => copySelectedAccountInfo()}>
        <Copy size={16} />
        <span>复制账号密码</span>
      </button>
      <button class="menu-item" on:click={() => openEditAccountDialog()}>
        <Pencil size={16} />
        <span>编辑账号</span>
      </button>
      <div class="menu-separator"></div>
      <button class="menu-item danger-menu-item" on:click={() => requestDeleteSelectedAccount()}>
        <Trash2 size={16} />
        <span>删除账号</span>
      </button>
    {:else if activePopover === "config"}
      <div class="context-menu-title">
        <strong>资产库工具</strong>
        <span>数据恢复和配置管理</span>
      </div>
      <button class="menu-item" on:click={() => openSnapshotsDialog()}>
        <ArchiveRestore size={16} />
        <span>数据快照</span>
      </button>
      <div class="menu-separator"></div>
      <button class="menu-item" on:click={() => openExportConfigDialog()}>
        <Upload size={16} />
        <span>导出配置</span>
      </button>
      <button class="menu-item" on:click={() => chooseConfigFile()}>
        <Download size={16} />
        <span>导入配置</span>
      </button>
    {/if}
  </div>
{/if}
