<script lang="ts">
  import { ArchiveRestore, BadgeInfo, Columns3Cog, Cpu, DatabaseBackup, Download, FolderOpen, Palette, RotateCcw, ShieldCheck, Upload, WandSparkles } from "@lucide/svelte";
  import appIconUrl from "../../../src-tauri/icons/app-icon.svg";
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
    { key: "security", label: "安全", icon: ShieldCheck },
    { key: "environment", label: "运行环境", icon: Cpu },
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

  function setAutoLockNumber(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value.trim();
    actions.setAutoLockMinutes(value ? Number(value) : 1);
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
      <label class="settings-switch-row" class:settings-switch-row-disabled={!view.autostartAvailable}>
        <span><strong>开机自启</strong><small>{view.autostartAvailable ? "登录系统后在系统托盘中运行，不主动打开主页面。" : "仅桌面应用支持，浏览器预览模式不可用。"}</small></span>
        <span class="settings-switch">
          <input type="checkbox" checked={view.startOnBoot} aria-label="开机自启" disabled={!view.autostartAvailable || view.autostartUpdating} on:change={(event) => actions.setStartOnBoot((event.currentTarget as HTMLInputElement).checked)} />
          <span class="settings-switch-track" aria-hidden="true"><span></span></span>
        </span>
      </label>
      <label class="settings-switch-row">
        <span><strong>低内存后台运行</strong><small>{view.lowMemoryBackground ? "关闭窗口后释放主窗口和 WebView，保留托盘；再次打开时重新加载资产库。" : "关闭窗口后保留主窗口，托盘恢复更快但占用内存较多。"}</small></span>
        <span class="settings-switch"><input type="checkbox" checked={view.lowMemoryBackground} aria-label="低内存后台运行" on:change={(event) => actions.setLowMemoryBackground((event.currentTarget as HTMLInputElement).checked)} /><span class="settings-switch-track" aria-hidden="true"><span></span></span></span>
      </label>
    {:else if view.activeSection === "security"}
      <div class="settings-heading"><h3>安全</h3><p>保护应用启动和托盘恢复时的资产库访问。</p></div>
      <label class="settings-switch-row">
        <span><strong>启动时要求密码</strong><small>{view.startupLock ? "应用启动或从托盘恢复时需要输入主密码。" : "开启后，资产库会在应用启动前保持锁定。"}</small></span>
        <span class="settings-switch">
          <input type="checkbox" checked={view.startupLock} aria-label="启动时要求密码" on:click|preventDefault={() => actions.setStartupLock(!view.startupLock)} />
          <span class="settings-switch-track" aria-hidden="true"><span></span></span>
        </span>
      </label>
      <label class="settings-switch-row" class:settings-switch-row-disabled={!view.startupLock}>
        <span><strong>闲置自动锁定</strong><small>{view.startupLock ? "超过设定时间没有操作后自动锁定资产库。" : "请先开启启动密码后使用闲置自动锁定。"}</small></span>
        <span class="settings-switch">
          <input type="checkbox" checked={view.autoLockMinutes > 0} aria-label="闲置自动锁定" disabled={!view.startupLock} on:change={(event) => actions.setAutoLockEnabled((event.currentTarget as HTMLInputElement).checked)} />
          <span class="settings-switch-track" aria-hidden="true"><span></span></span>
        </span>
      </label>
      {#if view.startupLock && view.autoLockMinutes > 0}
        <div class="settings-auto-lock-config">
          <div class="settings-auto-lock-copy">
            <strong>锁定时间（分钟）</strong>
            <small>可输入 1 到 10080 分钟，保存后立即生效。</small>
          </div>
          <input type="number" min="1" max="10080" step="1" value={view.autoLockMinutes} aria-label="锁定时间（分钟）" on:change={setAutoLockNumber} />
        </div>
      {/if}
      {#if view.startupLock}
        <div class="settings-action-list settings-security-actions">
          <button class="settings-action-row" type="button" on:click={() => actions.openVaultPasswordDialog("change")}>
            <span class="settings-action-icon"><ShieldCheck size={17} /></span>
            <span class="settings-action-copy"><strong>修改启动密码</strong><small>需要验证当前主密码，资产库数据不会重新加密。</small></span>
          </button>
          <button class="settings-action-row" type="button" on:click={() => actions.lockNow()}>
            <span class="settings-action-icon"><ShieldCheck size={17} /></span>
            <span class="settings-action-copy"><strong>立即锁定</strong><small>清除当前界面的资产数据并回到解锁页面。</small></span>
          </button>
          <button class="settings-action-row" type="button" on:click={() => actions.openVaultPasswordDialog("disable")}>
            <span class="settings-action-icon"><ShieldCheck size={17} /></span>
            <span class="settings-action-copy"><strong>关闭启动密码</strong><small>需要验证当前主密码，关闭后启动时不再要求输入。</small></span>
          </button>
        </div>
        <p class="settings-security-warning">主密码不会保存到应用设置中。忘记主密码后无法直接找回，请提前保留安全备份。托盘菜单中的“立即锁定”会直接进入锁屏页面。</p>
      {/if}
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
    {:else if view.activeSection === "about"}
      <div class="settings-heading"><h3>关于</h3><p>应用信息和功能介绍。</p></div>
      <div class="settings-about-hero">
        <span class="settings-about-logo" aria-hidden="true"><img src={appIconUrl} alt="" /></span>
        <span class="settings-about-title">
          <strong>Psd Manager</strong>
          <small>密码管理器</small>
        </span>
        <span class="settings-about-version">v{view.version}</span>
      </div>
      <p class="settings-about-description">本地优先的设备、账号与密码管理工具。</p>
    {:else if view.activeSection === "environment"}
      <div class="settings-heading"><h3>运行环境</h3><p>查看应用运行信息和本地存储路径。</p></div>
      <section class="settings-about-section" aria-labelledby="settings-runtime-heading">
        <div class="settings-about-section-heading" id="settings-runtime-heading"><span class="settings-about-heading-icon"><Cpu size={16} /></span><strong>应用与运行环境</strong></div>
        <dl class="settings-about-list">
          <div><dt>应用名称</dt><dd>Psd Manager / 密码管理器</dd></div>
          <div><dt>应用版本</dt><dd>{view.version}</dd></div>
          <div><dt>应用标识</dt><dd>com.fan.psd-manager</dd></div>
          <div><dt>运行模式</dt><dd>{runtimeLabel}</dd></div>
          <div><dt>当前平台</dt><dd>{platformLabel}</dd></div>
        </dl>
      </section>
      <section class="settings-about-section settings-environment-paths" aria-labelledby="settings-paths-heading">
        <div class="settings-about-section-heading" id="settings-paths-heading"><span class="settings-about-heading-icon"><FolderOpen size={16} /></span><strong>路径信息</strong></div>
        <dl class="settings-about-list">
          <div>
            <dt>应用安装路径</dt>
            <dd class="settings-path-value">
              <span>{view.installationPath}</span>
              <button class="settings-path-button" type="button" aria-label="打开应用安装路径" data-tooltip="打开应用安装路径" disabled={!isTauri() || view.installationPath === "当前环境不可用"} on:click={() => actions.openStoragePath("installation")}>
                <FolderOpen size={15} />
              </button>
            </dd>
          </div>
          <div>
            <dt>应用数据路径</dt>
            <dd class="settings-path-value">
              <span>{view.appDataPath}</span>
              <button class="settings-path-button" type="button" aria-label="打开应用数据路径" data-tooltip="打开应用数据路径" disabled={!isTauri() || view.appDataPath === "当前环境不可用"} on:click={() => actions.openStoragePath("app-data")}>
                <FolderOpen size={15} />
              </button>
            </dd>
          </div>
        </dl>
      </section>
    {/if}
  </section>
</div>

<footer class="settings-footer">
  <button class="settings-reset" type="button" on:click={actions.reset}><RotateCcw size={16} />恢复默认设置</button>
  <span class="settings-footer-note">设置会自动保存</span>
  <button class="primary-button" type="button" on:click={close}>完成</button>
</footer>

<style>
  .settings-layout { display: grid; grid-template-columns: 162px minmax(0, 1fr); min-height: 0; height: 100%; overflow: hidden; }
  .settings-nav { display: grid; align-content: start; gap: 2px; padding: 18px 10px; border-right: 1px solid var(--border); background: var(--surface-muted); }
  .settings-nav button { display: flex; align-items: center; gap: 9px; min-height: 36px; border-radius: 7px; padding: 0 11px; color: var(--text-secondary); font-size: var(--font-size-13); font-weight: 750; text-align: left; transition: background 120ms ease, color 120ms ease; }
  .settings-nav button:hover { color: var(--text-strong); background: var(--control-hover); }
  .settings-nav button.active { color: var(--text-strong); background: var(--selected); }
  .settings-content { display: grid; align-content: start; gap: 0; min-width: 0; overflow: auto; padding: 30px 34px 32px; }
  .settings-content > * { width: min(100%, 680px); }
  .settings-heading { display: grid; gap: 5px; padding: 0 0 12px; }
  .settings-heading h3 { margin: 0; color: var(--text-strong); font-size: var(--font-size-21); letter-spacing: 0; }
  .settings-heading p { margin: 0; color: var(--muted); font-size: var(--font-size-13); line-height: 1.4; }
  .settings-content > .settings-field,
  .settings-content > .settings-switch-row { border-bottom: 1px solid var(--border); }
  .settings-content > .settings-field { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 66px; padding: 13px 0; }
  .settings-content > .settings-field > span:first-child { display: inline-flex; align-items: baseline; gap: 6px; flex: 1 1 auto; min-width: 0; color: var(--text-strong); font-size: var(--font-size-14); font-weight: 700; line-height: 1.35; }
  .settings-content > .settings-field > span:first-child strong { font-variant-numeric: tabular-nums; }
  .settings-content > .settings-field > input,
  .settings-content > .settings-field > .settings-segmented,
  .settings-content > .settings-field > :global(.app-select) { flex: 0 1 360px; width: min(100%, 360px); min-width: 0; }
  .settings-content > .settings-field > :global(.app-select) { flex-basis: 200px; width: min(100%, 200px); }
  .settings-content > .settings-field > input[type="range"] { flex-basis: 320px; height: 22px; }
  .settings-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 66px; padding: 13px 0; }
  .settings-switch-row-disabled { opacity: .62; }
  .settings-switch-row span { display: grid; gap: 4px; }
  .settings-switch-row > span:first-child { min-width: 0; }
  .settings-switch-row strong { color: var(--text-strong); font-size: var(--font-size-14); }
  .settings-switch-row small { color: var(--muted); font-size: var(--font-size-12); }
  .settings-auto-lock-config { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 260px); align-items: center; gap: 28px; padding: 12px 0 14px 20px; border-bottom: 1px solid var(--border); }
  .settings-auto-lock-copy { display: grid; gap: 4px; min-width: 0; }
  .settings-auto-lock-copy strong { color: var(--text-strong); font-size: var(--font-size-13); }
  .settings-auto-lock-copy small { color: var(--muted); font-size: var(--font-size-12); line-height: 1.5; }
  .settings-auto-lock-config > input { width: 100%; min-height: 40px; border: 1px solid var(--field-border); border-radius: 8px; padding: 0 11px; color: var(--app-text); background: var(--field); outline: 0; transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease; }
  .settings-auto-lock-config > input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 15%, transparent); }
  .settings-field { display: grid; gap: 8px; color: var(--text-strong); font-size: var(--font-size-13); font-weight: 800; }
  .settings-field > span:first-child { color: var(--text-secondary); font-size: var(--font-size-12); letter-spacing: .01em; }
  .settings-field input { min-height: 40px; border: 1px solid var(--field-border); border-radius: 8px; padding: 0 11px; color: var(--app-text); background: var(--field); outline: 0; transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease; }
  .settings-field input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 15%, transparent); }
  .settings-field input[type="range"] { padding: 0; accent-color: var(--blue); }
  .settings-segmented { display: flex; flex-wrap: wrap; width: 100%; min-height: 38px; padding: 2px; border: 1px solid var(--field-border); border-radius: 8px; background: var(--surface-subtle); }
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
  .settings-check-grid, .settings-number-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 0 20px; }
  .settings-check-grid { margin-top: 12px; padding: 0 0 4px; border-bottom: 1px solid var(--border); }
  .settings-check-option { display: flex; align-items: center; gap: 9px; min-height: 42px; border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent); padding: 7px 0; color: var(--app-text); background: transparent; font-size: var(--font-size-13); font-weight: 700; cursor: pointer; transition: color 120ms ease, background 120ms ease; }
  .settings-check-option:hover { color: var(--blue); background: var(--control-hover); }
  .settings-check-option input { width: 16px; height: 16px; margin: 0; accent-color: var(--blue); }
  .settings-number-grid { padding: 12px 0 14px; border-bottom: 1px solid var(--border); }
  .settings-number-grid .settings-field { gap: 6px; }
  .settings-number-grid .settings-field input { height: 40px; }
  .settings-reset { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 34px; width: fit-content !important; border: 1px solid var(--field-border); border-radius: 7px; padding: 0 10px; color: var(--app-text); background: transparent; font-size: var(--font-size-12); font-weight: 800; }
  .settings-reset:hover { background: var(--control-hover); }
  .settings-action-list { display: grid; }
  .settings-action-row { display: flex; align-items: center; gap: 12px; min-height: 68px; width: 100% !important; border-bottom: 1px solid var(--border); padding: 13px 0; color: var(--app-text); background: transparent; text-align: left; transition: color 120ms ease, background 120ms ease; }
  .settings-action-row:hover { color: var(--blue); background: var(--control-hover); }
  .settings-action-row:active { transform: translateY(1px); }
  .settings-action-row:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .settings-action-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 28px; height: 28px; color: var(--blue); }
  .settings-action-copy { display: grid; gap: 3px; min-width: 0; }
  .settings-action-copy strong { color: var(--text-strong); font-size: var(--font-size-14); }
  .settings-action-copy small { color: var(--muted); font-size: var(--font-size-12); font-weight: 600; }
  .settings-security-actions { margin-top: 8px; }
  .settings-security-warning { margin: 14px 0 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, #d45b4f 35%, var(--border)); border-radius: 7px; color: #d45b4f; background: color-mix(in srgb, #d45b4f 8%, transparent); font-size: var(--font-size-12); line-height: 1.5; }
  .settings-about-hero { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 10px 0 18px; border-bottom: 1px solid var(--border); }
  .settings-about-logo { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; overflow: hidden; border: 0; border-radius: 12px; background: transparent; }
  .settings-about-logo img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .settings-about-title { display: grid; gap: 2px; min-width: 0; }
  .settings-about-title strong { color: var(--text-strong); font-size: var(--font-size-18); }
  .settings-about-title small { color: var(--muted); font-size: var(--font-size-13); font-weight: 700; }
  .settings-about-version { align-self: start; border: 1px solid var(--field-border); border-radius: 999px; padding: 4px 8px; color: var(--text-secondary); background: var(--surface-subtle); font-size: var(--font-size-12); font-weight: 800; white-space: nowrap; }
  .settings-about-description { margin: 18px 0 0; color: var(--text-secondary); font-size: var(--font-size-13); line-height: 1.5; }
  .settings-about-section { display: grid; gap: 9px; }
  .settings-about-section-heading { display: flex; align-items: center; gap: 7px; color: var(--text-strong); font-size: var(--font-size-14); }
  .settings-about-heading-icon { display: inline-flex; align-items: center; color: var(--blue); }
  .settings-environment-paths { margin-top: 14px; }
  .settings-about-list { display: grid; margin: 0; border-top: 1px solid var(--border); }
  .settings-about-list div { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; min-width: 0; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .settings-about-list dt { color: var(--muted); font-size: var(--font-size-13); font-weight: 600; }
  .settings-about-list dd { min-width: 0; max-width: 72%; margin: 0; color: var(--text-strong); font-size: var(--font-size-13); font-weight: 700; text-align: right; overflow-wrap: anywhere; }
  .settings-path-value { display: flex; align-items: center; justify-content: flex-start; flex: 0 1 72%; gap: 8px; text-align: left !important; line-height: 1.45; }
  .settings-path-value > span { min-width: 0; flex: 1 1 auto; overflow-wrap: anywhere; text-align: left; }
  .settings-path-button { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 28px; height: 28px; border: 1px solid var(--field-border); border-radius: 7px; color: var(--blue); background: var(--field); }
  .settings-path-button:hover:not(:disabled) { background: var(--control-hover); border-color: color-mix(in srgb, var(--blue) 40%, var(--field-border)); }
  .settings-path-button:disabled { cursor: not-allowed; opacity: .45; }
  .settings-path-button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .settings-footer { display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 12px 18px; border-top: 1px solid var(--border); color: var(--muted); font-size: var(--font-size-12); }
  .settings-footer .settings-reset { margin-right: auto; }
  .settings-footer-note { white-space: nowrap; }
  @media (max-width: 680px) { .settings-layout { grid-template-columns: 1fr; } .settings-nav { grid-template-columns: repeat(7, minmax(0, 1fr)); border-right: 0; border-bottom: 1px solid var(--border); } .settings-nav button { justify-content: center; padding: 0 4px; } .settings-nav button span { display: none; } .settings-content { padding: 18px; } .settings-content > * { width: 100%; } .settings-segmented { width: 100%; } }
  @media (max-width: 560px) { .settings-auto-lock-config { grid-template-columns: 1fr; gap: 8px; padding-left: 0; } }
  @media (max-width: 430px) { .settings-check-grid, .settings-number-grid { grid-template-columns: 1fr; } .settings-content > .settings-field { align-items: stretch; flex-direction: column; gap: 8px; } .settings-content > .settings-field > input, .settings-content > .settings-field > .settings-segmented, .settings-content > .settings-field > :global(.app-select) { width: 100%; flex-basis: auto; } .settings-segmented button { padding: 0 7px; font-size: var(--font-size-12); } .settings-switch-row { gap: 10px; } .settings-about-hero { grid-template-columns: 48px minmax(0, 1fr); } .settings-about-logo { width: 48px; height: 48px; } .settings-about-version { grid-column: 2; justify-self: start; } .settings-about-list div { display: grid; gap: 4px; } .settings-about-list dd { max-width: none; text-align: left; } .settings-path-value { width: 100%; flex-basis: auto; justify-content: flex-start; } }
</style>
