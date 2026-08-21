<script lang="ts">
  import { ArchiveRestore, BadgeInfo, Columns3Cog, Cpu, DatabaseBackup, Download, FolderOpen, Palette, RotateCcw, Upload, Vault, WandSparkles } from "@lucide/svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import AppSelect from "../AppSelect.svelte";
  import type { SettingsActions, SettingsView } from "../../lib/view-models";
  import type { DensityPreference, DeviceTypeSortMode, FontSizePreference, SortMode, ThemePreference } from "../../lib/types";

  export let view: SettingsView;
  export let actions: SettingsActions;
  export let close: () => void;

  const sections = [
    { key: "interface", label: "界面", icon: Palette },
    { key: "workspace", label: "工作区", icon: Columns3Cog },
    { key: "generator", label: "密码生成器", icon: WandSparkles },
    { key: "data", label: "数据", icon: DatabaseBackup },
    { key: "about", label: "关于", icon: BadgeInfo },
  ] as const;

  const sortOptions: Array<{ value: SortMode; label: string }> = [
    { value: "updatedDesc", label: "最近更新" },
    { value: "nameAsc", label: "名称" },
    { value: "typeAsc", label: "类型" },
  ];
  const typeSortOptions: Array<{ value: DeviceTypeSortMode; label: string }> = [
    { value: "default", label: "默认顺序" },
    { value: "nameAsc", label: "名称" },
    { value: "countDesc", label: "设备数量" },
  ];
  const themeOptions: Array<{ value: ThemePreference; label: string }> = [
    { value: "system", label: "跟随系统" },
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
  ];
  const densityOptions: Array<{ value: DensityPreference; label: string }> = [
    { value: "standard", label: "标准" },
    { value: "compact", label: "紧凑" },
  ];
  const fontSizeOptions: Array<{ value: FontSizePreference; label: string }> = [
    { value: "small", label: "小" },
    { value: "standard", label: "标准" },
    { value: "large", label: "大" },
  ];

  function setGeneratorNumber(key: "length" | "minimumNumbers" | "minimumSymbols", event: Event) {
    actions.setGeneratorValue(key, Number((event.currentTarget as HTMLInputElement).value));
  }

  function resolvePlatformLabel() {
    const userAgent = navigator.userAgent;
    if (userAgent.includes("Windows")) return "Windows";
    if (userAgent.includes("Macintosh") || userAgent.includes("Mac OS")) return "macOS";
    if (userAgent.includes("Linux")) return "Linux";
    return "当前设备";
  }

  const platformLabel = resolvePlatformLabel();
  const runtimeLabel = isTauri() ? "Tauri 桌面应用" : "浏览器预览模式";
</script>

<div class="settings-layout">
  <nav class="settings-nav" aria-label="设置分类">
    {#each sections as section}
      <button class:active={view.activeSection === section.key} type="button" on:click={() => actions.setSection(section.key)}>
        <svelte:component this={section.icon} size={17} />
        <span>{section.label}</span>
      </button>
    {/each}
  </nav>

  <section class="settings-content">
    {#if view.activeSection === "interface"}
      <div class="settings-heading"><h3>界面</h3><p>调整主题、界面密度和提示信息。</p></div>
      <div class="settings-field"><span>主题</span><div class="settings-segmented" role="group" aria-label="主题">
        {#each themeOptions as option}
          <button class:active={view.theme === option.value} type="button" aria-pressed={view.theme === option.value} on:click={() => actions.setTheme(option.value)}>{option.label}</button>
        {/each}
      </div></div>
      <div class="settings-field"><span>界面密度</span><div class="settings-segmented" role="group" aria-label="界面密度">
        {#each densityOptions as option}
          <button class:active={view.density === option.value} type="button" aria-pressed={view.density === option.value} on:click={() => actions.setDensity(option.value)}>{option.label}</button>
        {/each}
      </div></div>
      <div class="settings-field"><span>字体大小</span><div class="settings-segmented" role="group" aria-label="字体大小">
        {#each fontSizeOptions as option}
          <button class:active={view.fontSize === option.value} type="button" aria-pressed={view.fontSize === option.value} on:click={() => actions.setFontSize(option.value)}>{option.label}</button>
        {/each}
      </div></div>
      <label class="settings-switch-row">
        <span><strong>显示 Tooltip</strong><small>鼠标悬停在按钮上时显示操作说明。</small></span>
        <span class="settings-switch"><input type="checkbox" checked={view.tooltipEnabled} aria-label="显示 Tooltip" on:change={(event) => actions.setTooltipEnabled((event.currentTarget as HTMLInputElement).checked)} /><span class="settings-switch-track" aria-hidden="true"><span></span></span></span>
      </label>
    {:else if view.activeSection === "workspace"}
      <div class="settings-heading"><h3>工作区</h3><p>保存设备列表和三栏布局偏好。</p></div>
      <label class="settings-switch-row">
        <span><strong>记住三栏宽度</strong><small>重新打开应用时恢复上次调整的布局。</small></span>
        <span class="settings-switch"><input type="checkbox" checked={view.rememberLayout} aria-label="记住三栏宽度" on:change={(event) => actions.setRememberLayout((event.currentTarget as HTMLInputElement).checked)} /><span class="settings-switch-track" aria-hidden="true"><span></span></span></span>
      </label>
      <label class="settings-switch-row">
        <span><strong>记住上次视图</strong><small>恢复上次设备类型、搜索内容和排序方式。</small></span>
        <span class="settings-switch"><input type="checkbox" checked={view.rememberLastView} aria-label="记住上次视图" on:change={(event) => actions.setRememberLastView((event.currentTarget as HTMLInputElement).checked)} /><span class="settings-switch-track" aria-hidden="true"><span></span></span></span>
      </label>
      <label class="settings-switch-row">
        <span><strong>记住窗口大小和位置</strong><small>重新打开应用时恢复上次窗口边界。</small></span>
        <span class="settings-switch"><input type="checkbox" checked={view.rememberWindowBounds} aria-label="记住窗口大小和位置" on:change={(event) => actions.setRememberWindowBounds((event.currentTarget as HTMLInputElement).checked)} /><span class="settings-switch-track" aria-hidden="true"><span></span></span></span>
      </label>
      <div class="settings-field"><span>设备排序</span><AppSelect value={view.deviceSortMode} options={sortOptions} ariaLabel="设备排序" onChange={(value) => actions.setDeviceSortMode(value as SortMode)} /></div>
      <div class="settings-field"><span>设备类型排序</span><AppSelect value={view.deviceTypeSortMode} options={typeSortOptions} ariaLabel="设备类型排序" onChange={(value) => actions.setDeviceTypeSortMode(value as DeviceTypeSortMode)} /></div>
      <button class="settings-reset" type="button" on:click={actions.reset}><RotateCcw size={16} />恢复应用设置默认值</button>
    {:else if view.activeSection === "generator"}
      <div class="settings-heading"><h3>密码生成器</h3><p>设置打开生成器时使用的默认规则。</p></div>
      <label class="settings-field"><span>默认长度 <strong>{view.generator.length}</strong></span><input type="range" min="3" max="24" value={view.generator.length} on:input={(event) => setGeneratorNumber("length", event)} /></label>
      <div class="settings-check-grid">
        <label class="settings-check-option"><input type="checkbox" checked={view.generator.useUpper} on:change={(event) => actions.setGeneratorValue("useUpper", (event.currentTarget as HTMLInputElement).checked)} /><span>大写字母</span></label>
        <label class="settings-check-option"><input type="checkbox" checked={view.generator.useLower} on:change={(event) => actions.setGeneratorValue("useLower", (event.currentTarget as HTMLInputElement).checked)} /><span>小写字母</span></label>
        <label class="settings-check-option"><input type="checkbox" checked={view.generator.useNumbers} on:change={(event) => actions.setGeneratorValue("useNumbers", (event.currentTarget as HTMLInputElement).checked)} /><span>数字</span></label>
        <label class="settings-check-option"><input type="checkbox" checked={view.generator.useSymbols} on:change={(event) => actions.setGeneratorValue("useSymbols", (event.currentTarget as HTMLInputElement).checked)} /><span>符号</span></label>
        <label class="settings-check-option"><input type="checkbox" checked={view.generator.excludeSimilar} on:change={(event) => actions.setGeneratorValue("excludeSimilar", (event.currentTarget as HTMLInputElement).checked)} /><span>排除相似字符</span></label>
        <label class="settings-check-option"><input type="checkbox" checked={view.generator.preventRepeats} on:change={(event) => actions.setGeneratorValue("preventRepeats", (event.currentTarget as HTMLInputElement).checked)} /><span>避免重复字符</span></label>
      </div>
      <div class="settings-number-grid">
        <label class="settings-field"><span>最少数字</span><input type="number" min="0" max="24" value={view.generator.minimumNumbers} on:input={(event) => setGeneratorNumber("minimumNumbers", event)} /></label>
        <label class="settings-field"><span>最少符号</span><input type="number" min="0" max="24" value={view.generator.minimumSymbols} on:input={(event) => setGeneratorNumber("minimumSymbols", event)} /></label>
      </div>
      <label class="settings-field"><span>允许的符号</span><input value={view.generator.allowedSymbols} on:input={(event) => actions.setGeneratorValue("allowedSymbols", (event.currentTarget as HTMLInputElement).value)} /></label>
      <label class="settings-field"><span>排除字符</span><input value={view.generator.excludedCharacters} on:input={(event) => actions.setGeneratorValue("excludedCharacters", (event.currentTarget as HTMLInputElement).value)} /></label>
    {:else if view.activeSection === "data"}
      <div class="settings-heading"><h3>数据</h3><p>管理资产库快照和配置文件。</p></div>
      <div class="settings-action-list">
        <button class="settings-action-row" type="button" on:click={actions.openSnapshotsDialog}>
          <span class="settings-action-icon"><ArchiveRestore size={17} /></span>
          <span class="settings-action-copy"><strong>数据快照</strong><small>查看、恢复或管理本地数据快照。</small></span>
        </button>
        <button class="settings-action-row" type="button" on:click={actions.openExportConfigDialog}>
          <span class="settings-action-icon"><Download size={17} /></span>
          <span class="settings-action-copy"><strong>导出配置</strong><small>选择格式，将当前资产库导出到文件。</small></span>
        </button>
        <button class="settings-action-row" type="button" on:click={actions.chooseConfigFile}>
          <span class="settings-action-icon"><Upload size={17} /></span>
          <span class="settings-action-copy"><strong>导入配置</strong><small>从 JSON、CSV 或 YAML 文件导入资产库。</small></span>
        </button>
      </div>
    {:else}
      <div class="settings-heading"><h3>关于</h3><p>应用版本和当前运行环境。</p></div>
      <div class="settings-about-hero">
        <span class="settings-about-logo" aria-hidden="true"><Vault size={27} /></span>
        <span class="settings-about-title">
          <strong>Psd Manager</strong>
          <small>密码管理器</small>
        </span>
        <span class="settings-about-version">v{view.version}</span>
      </div>
      <p class="settings-about-description">用于集中管理设备、账号、密码历史和本地数据快照。数据修改后自动保存，不需要手动执行保存操作。</p>
      <section class="settings-about-section" aria-labelledby="settings-runtime-heading">
        <div class="settings-about-section-heading" id="settings-runtime-heading"><span class="settings-about-heading-icon"><Cpu size={16} /></span><strong>应用与运行环境</strong></div>
        <dl class="settings-about-list">
          <div><dt>应用名称</dt><dd>Psd Manager / 密码管理器</dd></div>
          <div><dt>应用版本</dt><dd>{view.version}</dd></div>
          <div><dt>应用标识</dt><dd>com.fan.psd-manager</dd></div>
          <div><dt>运行模式</dt><dd>{runtimeLabel}</dd></div>
          <div><dt>当前平台</dt><dd>{platformLabel}</dd></div>
          <div>
            <dt>安装路径</dt>
            <dd class="settings-path-value">
              <span>{view.installationPath}</span>
              <button class="settings-path-button" type="button" aria-label="打开安装路径" data-tooltip="打开安装路径" disabled={!isTauri() || view.installationPath === "当前环境不可用"} on:click={() => actions.openStoragePath("installation")}>
                <FolderOpen size={15} />
              </button>
            </dd>
          </div>
          <div>
            <dt>数据存储路径</dt>
            <dd class="settings-path-value">
              <span>{view.dataPath}</span>
              <button class="settings-path-button" type="button" aria-label="打开数据存储路径" data-tooltip="打开数据存储路径" disabled={!isTauri() || view.dataPath === "当前环境不可用"} on:click={() => actions.openStoragePath("data")}>
                <FolderOpen size={15} />
              </button>
            </dd>
          </div>
        </dl>
      </section>
    {/if}
  </section>
</div>

<footer class="settings-footer"><span>设置会自动保存</span><button class="primary-button" type="button" on:click={close}>完成</button></footer>

<style>
  .settings-layout { display: grid; grid-template-columns: 178px minmax(0, 1fr); min-height: 480px; overflow: hidden; }
  .settings-nav { display: grid; align-content: start; gap: 4px; padding: 16px 10px; border-right: 1px solid var(--border); background: var(--surface-muted); }
  .settings-nav button { display: flex; align-items: center; gap: 9px; min-height: 38px; border-radius: 8px; padding: 0 11px; color: var(--text-secondary); font-weight: 750; text-align: left; transition: background 120ms ease, color 120ms ease; }
  .settings-nav button:hover, .settings-nav button.active { color: var(--blue); background: var(--accent-subtle); }
  .settings-content { display: grid; align-content: start; gap: 16px; min-width: 0; overflow: auto; padding: 26px 30px 30px; }
  .settings-content > * { width: min(100%, 620px); }
  .settings-heading { display: grid; gap: 5px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .settings-heading h3 { margin: 0; color: var(--text-strong); font-size: var(--font-size-21); letter-spacing: 0; }
  .settings-heading p { margin: 0; color: var(--muted); font-size: var(--font-size-13); }
  .settings-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 62px; padding: 4px 0; }
  .settings-switch-row span { display: grid; gap: 4px; }
  .settings-switch-row > span:first-child { min-width: 0; }
  .settings-switch-row strong { color: var(--text-strong); font-size: var(--font-size-14); }
  .settings-switch-row small { color: var(--muted); font-size: var(--font-size-12); }
  .settings-field { display: grid; gap: 8px; color: var(--text-strong); font-size: var(--font-size-13); font-weight: 800; }
  .settings-field > span:first-child { color: var(--text-secondary); font-size: var(--font-size-12); letter-spacing: .01em; }
  .settings-field input { min-height: 40px; border: 1px solid var(--field-border); border-radius: 8px; padding: 0 11px; color: var(--app-text); background: var(--field); outline: 0; transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease; }
  .settings-field input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 15%, transparent); }
  .settings-field input[type="range"] { padding: 0; accent-color: var(--blue); }
  .settings-segmented { display: flex; flex-wrap: wrap; width: 100%; min-height: 40px; padding: 3px; border: 1px solid var(--field-border); border-radius: 9px; background: var(--surface-subtle); }
  .settings-segmented button { flex: 1 1 0; min-width: 0; min-height: 34px; border: 1px solid transparent; border-radius: 6px; padding: 0 12px; color: var(--text-secondary); font-size: var(--font-size-13); font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; }
  .settings-segmented button:hover { color: var(--text-strong); background: var(--control-hover); }
  .settings-segmented button.active { color: var(--selection-text); background: var(--selection-fill); border: 1px solid var(--selection-border); box-shadow: var(--selection-shadow); }
  .settings-segmented button:focus-visible, .settings-reset:focus-visible, .settings-check-option:has(input:focus-visible), .settings-switch:has(input:focus-visible) { outline: 2px solid var(--blue); outline-offset: 2px; }
  .settings-switch { position: relative; display: inline-flex !important; flex: 0 0 auto; width: 42px; height: 24px; }
  .settings-switch input { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
  .settings-switch-track { display: block !important; width: 42px; height: 24px; padding: 3px; border: 1px solid var(--field-border); border-radius: 999px; background: var(--surface-subtle); transition: background 120ms ease, border-color 120ms ease; }
  .settings-switch-track > span { display: block !important; width: 16px; height: 16px; border-radius: 50%; background: var(--muted); box-shadow: 0 1px 2px rgba(0, 0, 0, .18); transition: transform 120ms ease, background 120ms ease; }
  .settings-switch input:checked + .settings-switch-track { border-color: var(--primary-fill); background: var(--primary-fill); }
  .settings-switch input:checked + .settings-switch-track > span { background: #fff; transform: translateX(18px); }
  .settings-check-grid, .settings-number-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 10px 12px; }
  .settings-check-option { display: flex; align-items: center; gap: 9px; min-height: 40px; border: 1px solid var(--field-border); border-radius: 8px; padding: 0 11px; color: var(--app-text); background: var(--field); font-size: var(--font-size-13); font-weight: 700; cursor: pointer; transition: border-color 120ms ease, background 120ms ease; }
  .settings-check-option:hover { border-color: color-mix(in srgb, var(--blue) 40%, var(--field-border)); background: var(--control-hover); }
  .settings-check-option input { width: 16px; height: 16px; margin: 0; accent-color: var(--blue); }
  .settings-reset { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 38px; width: fit-content !important; border: 1px solid var(--field-border); border-radius: 8px; color: var(--app-text); background: var(--field); font-weight: 800; }
  .settings-reset:hover { background: var(--control-hover); }
  .settings-action-list { display: grid; gap: 10px; }
  .settings-action-row { display: flex; align-items: center; gap: 12px; min-height: 64px; width: 100% !important; border: 1px solid var(--field-border); border-radius: 8px; padding: 10px 12px; color: var(--app-text); background: var(--field); text-align: left; transition: border-color 120ms ease, background 120ms ease, transform 120ms ease; }
  .settings-action-row:hover { border-color: color-mix(in srgb, var(--blue) 40%, var(--field-border)); background: var(--control-hover); }
  .settings-action-row:active { transform: translateY(1px); }
  .settings-action-row:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .settings-action-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 32px; height: 32px; border-radius: 8px; color: var(--blue); background: var(--accent-subtle); }
  .settings-action-copy { display: grid; gap: 3px; min-width: 0; }
  .settings-action-copy strong { color: var(--text-strong); font-size: var(--font-size-14); }
  .settings-action-copy small { color: var(--muted); font-size: var(--font-size-12); font-weight: 600; }
  .settings-about-hero { display: grid; grid-template-columns: 46px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 2px 0 4px; }
  .settings-about-logo { display: inline-flex; align-items: center; justify-content: center; width: 46px; height: 46px; border: 1px solid color-mix(in srgb, var(--blue) 24%, var(--field-border)); border-radius: 8px; color: var(--blue); background: var(--accent-subtle); }
  .settings-about-title { display: grid; gap: 2px; min-width: 0; }
  .settings-about-title strong { color: var(--text-strong); font-size: var(--font-size-18); }
  .settings-about-title small { color: var(--muted); font-size: var(--font-size-13); font-weight: 700; }
  .settings-about-version { align-self: start; border: 1px solid var(--field-border); border-radius: 999px; padding: 4px 8px; color: var(--text-secondary); background: var(--surface-subtle); font-size: var(--font-size-12); font-weight: 800; white-space: nowrap; }
  .settings-about-description { margin: -4px 0 0; color: var(--text-secondary); font-size: var(--font-size-13); line-height: 1.65; }
  .settings-about-section { display: grid; gap: 9px; }
  .settings-about-section-heading { display: flex; align-items: center; gap: 7px; color: var(--text-strong); font-size: var(--font-size-14); }
  .settings-about-heading-icon { display: inline-flex; align-items: center; color: var(--blue); }
  .settings-about-list { display: grid; margin: 0; border-top: 1px solid var(--border); }
  .settings-about-list div { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; min-width: 0; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .settings-about-list dt { color: var(--muted); font-size: var(--font-size-13); }
  .settings-about-list dd { min-width: 0; margin: 0; color: var(--text-strong); font-size: var(--font-size-13); font-weight: 800; text-align: right; overflow-wrap: anywhere; }
  .settings-path-value { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .settings-path-value > span { min-width: 0; overflow-wrap: anywhere; }
  .settings-path-button { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 28px; height: 28px; border: 1px solid var(--field-border); border-radius: 7px; color: var(--blue); background: var(--field); }
  .settings-path-button:hover:not(:disabled) { background: var(--control-hover); border-color: color-mix(in srgb, var(--blue) 40%, var(--field-border)); }
  .settings-path-button:disabled { cursor: not-allowed; opacity: .45; }
  .settings-path-button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .settings-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 18px; border-top: 1px solid var(--border); color: var(--muted); font-size: var(--font-size-12); }
  @media (max-width: 680px) { .settings-layout { grid-template-columns: 1fr; } .settings-nav { grid-template-columns: repeat(5, minmax(0, 1fr)); border-right: 0; border-bottom: 1px solid var(--border); } .settings-nav button { justify-content: center; padding: 0 4px; } .settings-nav button span { display: none; } .settings-content { padding: 18px; } .settings-content > * { width: 100%; } .settings-segmented { width: 100%; } }
  @media (max-width: 430px) { .settings-check-grid, .settings-number-grid { grid-template-columns: 1fr; } .settings-segmented button { padding: 0 7px; font-size: var(--font-size-12); } .settings-switch-row { gap: 10px; } .settings-about-hero { grid-template-columns: 42px minmax(0, 1fr); } .settings-about-logo { width: 42px; height: 42px; } .settings-about-version { grid-column: 2; justify-self: start; } .settings-about-list div { display: grid; gap: 4px; } .settings-about-list dd { text-align: left; } .settings-path-value { justify-content: flex-start; } }
</style>
