import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const app = readFileSync(new URL("../src/App.svelte", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const tauriLib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

test("workspace keeps the requested three-pane information architecture", () => {
  assert.match(app, /<aside class="sidebar" aria-label="设备类型"/);
  assert.match(app, /<section class="item-list" aria-label="设备名称">/);
  assert.match(app, /<section class="detail-pane" aria-label="项目详情"/);
  assert.match(styles, /grid-template-columns:\s*252px minmax\(0, 1fr\)/);
  assert.match(styles, /grid-template-columns:\s*368px minmax\(0, 1fr\)/);
});

test("top-level actions avoid fake window chrome and keep generator after add device", () => {
  assert.doesNotMatch(app, /window-controls|control red|control yellow|control green|mini-avatar|Fan/);
  assert.match(app, /<span>新增设备<\/span>[\s\S]*?<span>生成密码<\/span>/);
});

test("status toast stays above the interface and can be dismissed", () => {
  assert.match(app, /function dismissStatus\(\)/);
  assert.match(app, /<div class="toast" role="status">/);
  assert.match(app, /<button class="toast-close" aria-label="关闭提示" on:click=\{dismissStatus\}>/);
  assert.match(styles, /\.toast \{[\s\S]*top: 54px;[\s\S]*left: 50%;[\s\S]*z-index: 90;[\s\S]*transform: translateX\(-50%\);/);
  assert.match(styles, /\.toast-close/);
  assert.doesNotMatch(styles, /\.toast \{[\s\S]*bottom: 24px/);
});

test("empty vault renders onboarding instead of blank device details", () => {
  assert.match(app, /const initialItems: VaultItem\[\] = \[\];/);
  assert.match(app, /let customDeviceTypes: DeviceTypeMeta\[\] = \[\]/);
  assert.match(app, /let hiddenDeviceTypes: string\[\] = \[\]/);
  assert.match(app, /const defaultDeviceTypeMeta[\s\S]*?\{ label: "全部设备", iconText: "全", color: "blue" \},[\s\S]*?\];/);
  assert.doesNotMatch(app, /\{ label: "路由器"|label: "NAS"|label: "服务器"|label: "业务系统"|label: "SSH 密钥"/);
  assert.match(app, /\$: hasDevices = items\.length > 0/);
  assert.match(app, /\$: hasSelectedDevice = selectedItem\.id > 0/);
  assert.match(app, /\{#if hasSelectedDevice\}[\s\S]*class="detail-empty-state"/);
  assert.match(app, /function clearSearch\(\)/);
  assert.match(app, /还没有设备/);
  assert.match(app, /当前搜索会匹配设备名和 IP/);
  assert.match(app, /<div class="type-combo-empty-state">请先新增设备类型<\/div>/);
  assert.match(app, /if \(deviceTypeOptions\.length === 0\) \{[\s\S]*openAddTypeDialog\(\);[\s\S]*copyStatus = "请先新增设备类型";[\s\S]*return;/);
  assert.match(app, /disabled=\{!deviceForm\.deviceName\.trim\(\) \|\| !deviceForm\.deviceType\.trim\(\)\}/);
  assert.match(styles, /\.empty-list\.onboarding-empty/);
  assert.match(styles, /\.detail-empty-state/);
});

test("list and detail headers show static context without redundant filters", () => {
  assert.match(app, /class="list-context" aria-label="当前设备范围"/);
  assert.match(app, /class="breadcrumb" aria-label="当前详情设备类型"/);
  assert.doesNotMatch(app, /device-type-picker|切换设备类型|切换详情设备类型/);
  assert.doesNotMatch(app, /type-filter|device-filter|筛选设备类型|筛选设备|filterTag|showOnlyWithHistory/);
  assert.doesNotMatch(styles, /\.device-filter-button/);
  assert.doesNotMatch(styles, /\.popover-field|\.popover-check/);
});

test("search changes are useful in back and forward history", () => {
  assert.match(app, /if \(!searchQuery\.trim\(\) \|\| !value\.trim\(\)\) pushNavigationState\(\)/);
  assert.match(app, /function goBack\(\)/);
  assert.match(app, /function goForward\(\)/);
});

test("search fuzzily matches device names and IP addresses", () => {
  assert.match(app, /function compactSearchValue\(value: string\)/);
  assert.match(app, /replace\(\/\[\\s\._:\/\\\\-\]\+\/g, ""\)/);
  assert.match(app, /function fuzzyContains\(source: string, query: string\)/);
  assert.match(app, /if \(compactSource\.includes\(compactQuery\)\) return true/);
  assert.match(app, /for \(const char of compactSource\)/);
  assert.match(app, /function matchesSearch\(item: VaultItem, query: string\)/);
  assert.match(app, /const deviceName = normalizeSearchValue\(item\.deviceName\)/);
  assert.match(app, /const ipAddress = normalizeSearchValue\(item\.ipAddress\)/);
  assert.match(app, /return fuzzyContains\(deviceName, query\) \|\| fuzzyContains\(ipAddress, query\)/);
  assert.match(app, /在全部设备中搜索设备名或 IP/);
  assert.doesNotMatch(app, /item\.website\.toLowerCase\(\)\.includes\(query\)/);
  assert.doesNotMatch(app, /item\.username\.toLowerCase\(\)\.includes\(query\)/);
});

test("password history is masked by default and individually revealable", () => {
  assert.match(app, /let visibleHistoryIds: number\[\] = \[\]/);
  assert.match(app, /function maskPassword\(password: string\)/);
  assert.match(app, /function toggleHistoryPassword\(id: number\)/);
  assert.match(app, /visibleHistoryIds\.includes\(history\.id\) \? history\.password : maskPassword\(history\.password\)/);
  assert.match(app, /visibleHistoryIds\.includes\(history\.id\) \? history\.newPassword : maskPassword\(history\.newPassword\)/);
  assert.match(app, /class="history-password-pair"/);
  assert.match(app, /<span>旧密码<\/span>/);
  assert.match(app, /<span>新密码<\/span>/);
  assert.match(app, /aria-label="复制旧密码"/);
  assert.match(styles, /\.history-password-pair/);
});

test("password update dialog shows the target account", () => {
  assert.match(app, /newPassword: string;/);
  assert.match(app, /newPassword: readString\(entry\?\.newPassword\)/);
  assert.match(app, /newPassword: password/);
  assert.match(app, /let passwordForm = \{ password: "", reason: "" \}/);
  assert.match(app, /passwordForm = \{ password: generatedPassword \|\| selectedAccount\.password, reason: "" \}/);
  assert.match(app, /const reason = passwordForm\.reason\.trim\(\)/);
  assert.doesNotMatch(app, /reason: "随机密码生成器"/);
  assert.doesNotMatch(app, /passwordForm\.reason\.trim\(\) \|\| "手动更新"/);
  assert.match(app, /class="password-target-card wide-field" aria-label="当前更新账号"/);
  assert.match(app, /selectedAccount\.username \|\| selectedAccount\.title \|\| "未填写用户名"/);
  assert.match(app, /selectedItem\.deviceName/);
  assert.match(app, /selectedAccount\.tag \|\| selectedItem\.deviceType/);
  assert.match(app, /class="password-change-card wide-field" aria-label="密码变更预览"/);
  assert.match(app, /selectedAccount\.password \|\| "未填写密码"/);
  assert.match(app, /passwordForm\.password \|\| "待输入"/);
  assert.match(styles, /\.password-target-card/);
  assert.match(styles, /\.password-change-card/);
});

test("bulk password updates target usernames and reuse generated passwords", () => {
  assert.match(app, /"bulk-password"/);
  assert.match(app, /type BulkPasswordForm = \{[\s\S]*deviceType: "全部设备" \| DeviceType;[\s\S]*username: string;/);
  assert.match(app, /let bulkPasswordForm: BulkPasswordForm = \{ deviceType: "全部设备", username: "", password: "", reason: "" \}/);
  assert.match(app, /function openBulkPasswordDialog\(useGenerated = false\)/);
  assert.match(app, /deviceType: selectedDeviceType/);
  assert.match(app, /reason: "",/);
  assert.match(app, /function matchesBulkDeviceType\(item: VaultItem, deviceType: "全部设备" \| DeviceType\)/);
  assert.match(app, /function getBulkPasswordMatches\(form: BulkPasswordForm\)/);
  assert.match(app, /items\.filter\(\(item\) => matchesBulkDeviceType\(item, form\.deviceType\)\)\.flatMap/);
  assert.match(app, /function updateAccountPassword\(account: DeviceAccount, password: string, changedAt: string, reason: string\)/);
  assert.match(app, /function saveBulkPasswordUpdate\(\)/);
  assert.match(app, /const matches = getBulkPasswordMatches\(bulkPasswordForm\)/);
  assert.match(app, /const reason = bulkPasswordForm\.reason\.trim\(\)/);
  assert.doesNotMatch(app, /bulkPasswordForm\.reason\.trim\(\) \|\| "批量更新"/);
  assert.match(app, /function useGeneratedPasswordForBulkUpdate\(\)/);
  assert.match(app, /type GeneratorTarget = "current-account" \| "bulk-password" \| null/);
  assert.match(app, /function openGeneratorPanel\(target: GeneratorTarget = null\)/);
  assert.match(app, /generatePassword\(\);/);
  assert.match(app, /openGeneratorPanel\("bulk-password"\); activeDialog = null;/);
  assert.match(app, /activeDialog = "bulk-password"/);
  assert.match(app, /批量改密/);
  assert.match(app, /<span>设备类型<\/span>/);
  assert.match(app, /role="listbox" aria-label="批量改密设备类型"/);
  assert.match(app, /on:click=\{\(\) => setBulkPasswordDeviceType\(type\.label\)\}/);
  assert.match(app, /指定用户名/);
  assert.match(app, /命中 \{bulkPasswordMatches\.length\} 个账号/);
  assert.match(app, /类型：\$\{bulkPasswordForm\.deviceType\}/);
  assert.match(app, /已批量更新 \$\{matches\.length\} 个账号/);
  assert.match(app, /用于批量改密/);
  assert.match(styles, /\.bulk-preview/);
  assert.match(styles, /\.bulk-match-list/);
});

test("a device can hold multiple account credentials", () => {
  assert.match(app, /type DeviceAccount = \{/);
  assert.match(app, /accounts\?: DeviceAccount\[\]/);
  assert.match(app, /function getAccounts\(item: VaultItem\)/);
  assert.match(app, /function syncItemWithAccounts\(item: VaultItem, accounts: DeviceAccount\[\]\)/);
  assert.match(app, /\$: selectedAccounts = getAccounts\(selectedItem\)/);
  assert.match(app, /\$: selectedAccount = selectedAccounts\.find/);
  assert.match(app, /function openAddAccountDialog\(\)/);
  assert.match(app, /function saveAccount\(\)/);
  assert.match(app, /function deleteSelectedAccount\(\)/);
  assert.match(app, /function requestDeleteSelectedAccount\(\)/);
  assert.match(app, /class="account-section"/);
  assert.match(app, /class="account-list"/);
  assert.match(app, /新增账号/);
  assert.match(app, /selectedAccount\.history/);
  assert.match(app, /copyDeviceAccountInfo/);
  assert.match(styles, /\.account-list/);
});

test("account display uses username without a separate account name field", () => {
  assert.doesNotMatch(app, /账号名称/);
  assert.doesNotMatch(app, /项目名称/);
  assert.doesNotMatch(app, /<span class="field-label">项目<\/span>/);
  assert.match(app, /title: username \|\| "未填写用户名"/);
  assert.match(app, /title: accountUsername \|\| "未填写用户名"/);
  assert.match(app, /<strong>\{account\.username \|\| account\.title \|\| "未填写用户名"\}<\/strong>/);
  assert.match(app, /function copyDeviceAccountInfo\(account = selectedAccount\)/);
  assert.match(app, /function copyDeviceInfo\(item = selectedItem\)/);
  assert.match(app, /function copySelectedDeviceInfo\(\)/);
  assert.match(app, /function copySelectedAccountInfo\(\)/);
  assert.match(app, /copyText\(copyDeviceInfo\(\), "设备信息"\)/);
  assert.match(app, /account\.username \? `用户名: \$\{account\.username\}` : ""/);
  assert.match(app, /account\.password \? `密码: \$\{account\.password\}` : ""/);
  assert.match(app, /copyText\(copyDeviceAccountInfo\(\), "账号密码"\)/);
  assert.match(app, /on:click=\{copySelectedAccountInfo\}/);
  assert.match(app, /<span>复制账号信息<\/span>/);
  assert.doesNotMatch(app, /<span>复制信息<\/span>/);
  assert.match(app, /item\.ipAddress \? `IP: \$\{item\.ipAddress\}` : ""/);
  assert.doesNotMatch(app, /selectedItem\.deviceName,[\s\S]*account\.username \? `用户名: \$\{account\.username\}` : "",[\s\S]*account\.password \? `密码: \$\{account\.password\}` : ""/);
  assert.doesNotMatch(app, /return `\$\{selectedItem\.deviceName\}\\n/);
});

test("destructive delete actions require an in-app confirmation", () => {
  assert.match(app, /type ConfirmationAction = "delete-device" \| "delete-account" \| "delete-device-type"/);
  assert.match(app, /let pendingConfirmation: PendingConfirmation \| null = null/);
  assert.match(app, /function requestDeleteDeviceType\(deviceType: "全部设备" \| DeviceType = selectedDeviceType\)/);
  assert.match(app, /function requestDeleteSelectedAccount\(\)/);
  assert.match(app, /function requestDeleteSelectedDevice\(\)/);
  assert.match(app, /function confirmPendingAction\(\)/);
  assert.match(app, /if \(deviceForm\.id\) \{[\s\S]*?deviceName: name,[\s\S]*?ipAddress: deviceForm\.ipAddress\.trim\(\),[\s\S]*?return;/);
  assert.match(app, /\{#if pendingConfirmation\}/);
  assert.match(app, /class="modal confirm-modal"/);
  assert.match(app, /pendingConfirmation\.confirmLabel/);
  assert.match(app, /on:click=\{\(\) => requestDeleteDeviceType\(selectedDeviceType\)\}/);
  assert.match(app, /on:click=\{\(\) => requestDeleteDeviceType\(contextDeviceType\)\}/);
  assert.match(app, /on:click=\{requestDeleteSelectedAccount\}/);
  assert.match(app, /on:click=\{requestDeleteSelectedDevice\}/);
  assert.doesNotMatch(app, /on:click=\{\(\) => deleteDeviceType\(selectedDeviceType\)\}/);
  assert.match(styles, /\.confirm-modal/);
  assert.match(styles, /\.danger-button/);
  assert.match(styles, /\.confirmation-body/);
});

test("ip address is device information and website fields stay out of the UI", () => {
  assert.match(app, /ipAddress: string/);
  assert.match(app, /ipAddress: readString\(item\.ipAddress/);
  assert.match(app, /bind:value=\{deviceForm\.ipAddress\}/);
  assert.match(app, /selectedItem\.ipAddress/);
  assert.match(app, /aria-label="复制 IP 地址"/);
  assert.doesNotMatch(app, /网站 \/ IP|<span>网站<\/span>|网站账号|未填写地址/);
  assert.match(styles, /\.device-info-row/);
});

test("generator length is directly editable and clamped on commit", () => {
  assert.match(app, /let generatorLength = 8/);
  assert.match(app, /let generatorLengthInput = "8"/);
  assert.match(app, /return Math\.min\(24, Math\.max\(3, Number\.isFinite\(length\) \? Math\.round\(length\) : 8\)\)/);
  assert.match(app, /parsedLength >= 3 && parsedLength <= 24/);
  assert.match(app, /min="3" max="24"/);
  assert.match(app, /<span>8 位，字母数字符号<\/span>/);
  assert.match(app, /<span>24 位，更多数字符号<\/span>/);
  assert.doesNotMatch(app, /<span>28 位，更多数字符号<\/span>/);
  assert.match(app, /\{#each \[3, 8, 16, 24\] as length\}/);
  assert.match(app, /function handleGeneratorLengthInput\(value: string\)/);
  assert.match(app, /function commitGeneratorLengthInput\(\)/);
  assert.match(app, /aria-label="密码长度"/);
  assert.match(app, /on:keydown=\{handleGeneratorLengthKeydown\}/);
});

test("global keyboard shortcuts cover search, overlays, navigation, and common actions", () => {
  assert.match(app, /window\.addEventListener\("keydown", handleGlobalKeydown\)/);
  assert.match(app, /window\.removeEventListener\("keydown", handleGlobalKeydown\)/);
  assert.match(app, /function handleGlobalKeydown\(event: KeyboardEvent\)/);
  assert.match(app, /if \(event\.key === "Escape"\)/);
  assert.match(app, /closeKeyboardSurface\(\)/);
  assert.match(app, /if \(shortcutModifier && event\.key === "Enter" && \(activeDialog \|\| pendingConfirmation\)\)/);
  assert.match(app, /if \(pendingConfirmation\) confirmPendingAction\(\)/);
  assert.match(app, /saveActiveDialog\(\)/);
  assert.match(app, /key === "f" \|\| key === "k"/);
  assert.match(app, /focusSearchInput\(\)/);
  assert.match(app, /event\.key === "ArrowLeft" && backStack\.length > 0/);
  assert.match(app, /event\.key === "ArrowRight" && forwardStack\.length > 0/);
  assert.match(app, /selectRelativeDevice\(1\)/);
  assert.match(app, /selectRelativeDevice\(-1\)/);
  assert.match(app, /if \(key === "n"\)/);
  assert.match(app, /event\.shiftKey && hasSelectedDevice/);
  assert.match(app, /if \(key === "g"\)/);
  assert.match(app, /if \(key === "b"\)/);
  assert.match(app, /if \(key === "u" && hasSelectedDevice && selectedAccount\.id\)/);
  assert.match(app, /if \(key === "e" && hasSelectedDevice\)/);
  assert.match(app, /bind:this=\{searchInput\}/);
  assert.match(app, /aria-keyshortcuts="Meta\+F Control\+F Meta\+K Control\+K"/);
  assert.match(app, /aria-keyshortcuts="Meta\+N Control\+N"/);
  assert.match(app, /aria-keyshortcuts="Meta\+B Control\+B"/);
  assert.match(app, /aria-keyshortcuts="Meta\+G Control\+G"/);
});

test("backup import and export preserve custom and hidden type state", () => {
  assert.match(app, /import \{ isTauri \} from "@tauri-apps\/api\/core"/);
  assert.match(app, /import \{ open as openFileDialog, save as saveFileDialog \} from "@tauri-apps\/plugin-dialog"/);
  assert.match(app, /import \{ readTextFile, writeTextFile \} from "@tauri-apps\/plugin-fs"/);
  assert.match(app, /function createBackupPayload\(\)/);
  assert.match(app, /function normalizeVaultItems\(value: unknown\)/);
  assert.match(app, /items: normalizeVaultItems\(items\)/);
  assert.match(app, /saveFileDialog\(\{[\s\S]*title: "导出 JSON 备份"[\s\S]*filters: \[\{ name: "JSON", extensions: \["json"\] \}\]/);
  assert.match(app, /writeTextFile\(path, payload\)/);
  assert.match(app, /openFileDialog\(\{[\s\S]*title: "导入 JSON 备份"[\s\S]*multiple: false[\s\S]*filters: \[\{ name: "JSON", extensions: \["json"\] \}\]/);
  assert.match(app, /readTextFile\(path\)/);
  assert.match(app, /function applyImportedBackup\(content: string\)/);
  assert.match(app, /items = normalizeVaultItems\(parsed\.items\)/);
  assert.match(app, /hiddenDeviceTypes = Array\.isArray\(parsed\.hiddenDeviceTypes\) \? parsed\.hiddenDeviceTypes : \[\]/);
  assert.match(app, /backStack = \[\]/);
  assert.match(app, /forwardStack = \[\]/);
  assert.match(tauriLib, /tauri_plugin_fs::init\(\)/);
  assert.match(tauriLib, /tauri_plugin_dialog::init\(\)/);
  assert.doesNotMatch(tauriLib, /osascript|export_backup|import_backup|generate_handler/);
});

test("type editing exposes swatches instead of a text-only color select", () => {
  assert.match(app, /const typeColorOptions = \[/);
  assert.match(app, /class="color-swatch-grid"/);
  assert.match(app, /class="type-preview-card"/);
  assert.match(styles, /\.color-swatch-button/);
});

test("device type selection uses searchable custom comboboxes instead of native selects", () => {
  assert.match(app, /type TypePickerScope = "device" \| "bulk"/);
  assert.match(app, /let openTypePicker: TypePickerScope \| null = null/);
  assert.match(app, /let deviceTypeSearch = ""/);
  assert.match(app, /let bulkTypeSearch = ""/);
  assert.match(app, /\$: filteredDeviceTypeOptions = filterDeviceTypeChoices\(deviceTypeOptions, deviceTypeSearch\)/);
  assert.match(app, /\$: filteredBulkTypeRows = filterDeviceTypeChoices\(deviceTypeRows, bulkTypeSearch\)/);
  assert.match(app, /\$: selectedDeviceFormTypeMeta = getTypeMeta\(deviceForm\.deviceType\)/);
  assert.match(app, /\$: selectedBulkTypeMeta = deviceTypeRows\.find\(\(type\) => type\.label === bulkPasswordForm\.deviceType\) \?\? deviceTypeRows\[0\]/);
  assert.match(app, /function filterDeviceTypeChoices<T extends \{ label: string \}>/);
  assert.match(app, /function setBulkPasswordDeviceType\(deviceType: "全部设备" \| DeviceType\)/);
  assert.match(app, /function setDeviceFormType\(deviceType: DeviceType\)/);
  assert.match(app, /class="type-combo-trigger"/);
  assert.match(app, /class="type-combo-popover"/);
  assert.match(app, /class="type-combo-search"/);
  assert.match(app, /placeholder="搜索设备类型"/);
  assert.match(app, /role="listbox" aria-label="批量改密设备类型"/);
  assert.match(app, /role="listbox" aria-label="设备类型"/);
  assert.match(app, /on:click=\{\(\) => setBulkPasswordDeviceType\(type\.label\)\}/);
  assert.match(app, /on:click=\{\(\) => setDeviceFormType\(type\.label\)\}/);
  assert.match(app, /if \(openTypePicker\) \{/);
  assert.doesNotMatch(app, /<select|select-shell|deviceFormTypeMeta|bulkPasswordTypeMeta|type-choice-list/);
  assert.match(styles, /\.type-combo-popover/);
  assert.match(styles, /\.type-combo-search/);
  assert.match(styles, /\.type-combo-list/);
  assert.match(styles, /max-height: 202px/);
  assert.doesNotMatch(styles, /\.select-shell|\.form-grid select|\.type-choice-list/);
});

test("right-click context menus are available for types, devices, and details", () => {
  const deviceContextMenuBody = app.match(/function openDeviceContextMenu[\s\S]*?\n  }\n\n  function isContextMenuControlTarget/)?.[0] ?? "";
  const deviceContextMenuMarkup = app.match(/\{:else if activePopover === "device-context"\}[\s\S]*?\{:else if activePopover === "more"\}/)?.[0] ?? "";

  assert.match(app, /type ActivePopover =[\s\S]*"type-context"[\s\S]*"device-context"[\s\S]*"type-blank-context"[\s\S]*"list-blank-context"[\s\S]*"detail-blank-context"/);
  assert.match(app, /function openTypeContextMenu/);
  assert.match(app, /function openDeviceContextMenu/);
  assert.match(app, /function openTypeBlankContextMenu/);
  assert.match(app, /function openDeviceListBlankContextMenu/);
  assert.match(app, /function openDetailBlankContextMenu/);
  assert.match(app, /aria-label="编辑设备类型"[\s\S]*on:click=\{\(\) => openEditTypeDialog\(\)\}/);
  assert.match(app, /function handleMenuScrimContextMenu\(event: MouseEvent\)/);
  assert.match(app, /document\.elementFromPoint\(clientX, clientY\)/);
  assert.match(app, /new MouseEvent\("contextmenu"/);
  assert.match(app, /on:contextmenu=\{\(event\) => openTypeContextMenu\(type\.label, event\)\}/);
  assert.match(app, /on:contextmenu=\{\(event\) => openDeviceContextMenu\(item, event\)\}/);
  assert.match(app, /<aside class="sidebar" aria-label="设备类型" on:contextmenu=\{openTypeBlankContextMenu\}>/);
  assert.match(app, /<div class="list-scroll" role="group" aria-label="设备列表右键菜单区域" on:contextmenu=\{openDeviceListBlankContextMenu\}>/);
  assert.match(app, /<section class="detail-pane" aria-label="项目详情" on:contextmenu=\{openDetailBlankContextMenu\}>/);
  assert.match(app, /on:contextmenu=\{openSelectedDeviceContextMenu\}/);
  assert.doesNotMatch(deviceContextMenuBody, /closest\("button, a, input, textarea, select/);
  assert.match(app, /function openSelectedDeviceContextMenu[\s\S]*?closest\("button, a, input, textarea, select, \[role='button'\]"\)/);
  assert.match(app, /class="context-menu-title"/);
  assert.match(app, /class="menu-separator"/);
  assert.match(app, /role="menu" tabindex="-1"/);
  assert.match(app, /on:contextmenu=\{handleMenuScrimContextMenu\}/);
  assert.match(deviceContextMenuMarkup, /<span>编辑设备信息<\/span>/);
  assert.match(deviceContextMenuMarkup, /<span>复制设备信息<\/span>/);
  assert.match(deviceContextMenuMarkup, /<span>删除设备<\/span>/);
  assert.doesNotMatch(deviceContextMenuMarkup, /复制用户名|复制密码|新增账号|更新密码|编辑当前账号|删除账号/);
  assert.match(app, /编辑当前账号/);
  assert.doesNotMatch(app, /编辑当前设备和账号/);
  assert.match(app, /{:else if deviceForm\.id}[\s\S]*编辑设备信息/);
  assert.match(app, /\{#if !deviceForm\.id\}[\s\S]*<span>用户名<\/span>[\s\S]*<span>密码<\/span>/);
  assert.match(app, /deviceForm\.id \? "保存设备" : "新增设备"/);
  assert.match(app, /复制用户名/);
  assert.doesNotMatch(app, /新增此类型设备|新增此类设备/);
  assert.doesNotMatch(app, />空白区域<|>空白详情区域<|>设备列表空白区域</);
  assert.match(app, />管理分类</);
  assert.match(app, /"当前范围"/);
  assert.match(app, /"未选择设备"/);
  assert.match(app, /disabled=\{deviceTypeOptions\.length === 0\}/);
  assert.match(app, /title=\{deviceTypeOptions\.length === 0 \? "请先新增设备类型" : "新增设备"\}/);
  assert.match(app, /删除设备类型/);
  assert.match(styles, /\.context-menu-title/);
  assert.match(styles, /\.menu-separator/);
  assert.match(styles, /\.action-popover button\.menu-item svg/);
});

test("device types can be deleted only when they are empty", () => {
  assert.match(app, /function getDeviceTypeCount\(deviceType: "全部设备" \| DeviceType\)/);
  assert.match(app, /function canDeleteDeviceType\(deviceType: "全部设备" \| DeviceType\)/);
  assert.match(app, /function deleteDeviceType\(deviceType: "全部设备" \| DeviceType = selectedDeviceType\)/);
  assert.match(app, /disabled=\{!canDeleteDeviceType\(selectedDeviceType\)\}/);
  assert.match(app, /on:click=\{\(\) => requestDeleteDeviceType\(selectedDeviceType\)\}/);
  assert.match(app, /disabled=\{!canDeleteDeviceType\(contextDeviceType\)\}/);
  assert.match(app, /该类型下还有 \$/);
  assert.match(app, /hiddenDeviceTypes = \[\.\.\.hiddenDeviceTypes, deviceType\]/);
  assert.match(app, /customDeviceTypes = customDeviceTypes\.filter\(\(type\) => type\.label !== deviceType\)/);
});
