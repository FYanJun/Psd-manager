import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { compile } from "svelte/compiler";
import { importSourceModule } from "./test-utils/source-modules.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const read = (relativePath) => readFileSync(join(rootDir, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

const IDS = {
  typeServer: "11111111-1111-4111-8111-111111111111",
  typeNetwork: "22222222-2222-4222-8222-222222222222",
  deviceA: "33333333-3333-4333-8333-333333333333",
  deviceB: "44444444-4444-4444-8444-444444444444",
  accountA: "55555555-5555-4555-8555-555555555555",
  accountB: "66666666-6666-4666-8666-666666666666",
  historyA: "77777777-7777-4777-8777-777777777777",
  historyB: "88888888-8888-4888-8888-888888888888",
};

function clone(value) {
  return structuredClone(value);
}

function makeHistory({ id = 1, uuid = IDS.historyA, password = "Old#1", newPassword = "New#1" } = {}) {
  return {
    uuid,
    id,
    password,
    newPassword,
    changedAt: "2026年8月1日 星期六 10:00:00",
    reason: "测试改密",
  };
}

function makeAccount({
  id = 1,
  uuid = IDS.accountA,
  username = "admin",
  password = "Old#1",
  history = [makeHistory()],
} = {}) {
  return {
    uuid,
    id,
    title: username,
    username,
    password,
    tag: "管理员",
    notes: "账号备注",
    updatedAt: "2026年8月2日 星期日 10:00:00",
    passwordChangedAt: password ? "2026年8月2日 星期日 10:00:00" : "",
    history,
  };
}

function makeItem({
  id = 1,
  uuid = IDS.deviceA,
  name = "核心服务器",
  type = "服务器",
  typeUuid = IDS.typeServer,
  account = makeAccount(),
  accounts = [account],
  ipAddress = "https://server.example.com:8443/admin?view=main",
} = {}) {
  const primary = accounts[0];
  return {
    uuid,
    id,
    title: primary?.title ?? name,
    deviceName: name,
    deviceType: type,
    deviceTypeUuid: typeUuid,
    assetCode: `ASSET-${id}`,
    location: `机柜-${id}`,
    username: primary?.username ?? "",
    password: primary?.password ?? "",
    ipAddress,
    tag: type,
    iconText: type.slice(0, 1),
    iconClass: "icon-blue",
    updatedAt: "2026年8月3日 星期一 10:00:00",
    notes: "设备备注",
    history: primary?.history ?? [],
    accounts,
  };
}

function makeTypes() {
  return [
    { uuid: IDS.typeServer, label: "服务器", iconText: "服", color: "blue" },
    { uuid: IDS.typeNetwork, label: "网络设备", iconText: "网", color: "cyan" },
  ];
}

function makeConfig(items = [makeItem()], customDeviceTypes = makeTypes()) {
  return {
    items: clone(items),
    customDeviceTypes: clone(customDeviceTypes),
    meta: {
      appName: "密码管理器",
      formatVersion: 3,
      exportedAt: "2026-08-08T00:00:00.000Z",
    },
  };
}

function collectFiles(directory, extension, prefix = "") {
  return readdirSync(join(rootDir, directory), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(prefix, entry.name);
    const fullPath = join(rootDir, directory, entry.name);
    if (entry.isDirectory()) return collectFiles(join(directory, entry.name), extension, relativePath);
    return entry.isFile() && entry.name.endsWith(extension) ? [fullPath] : [];
  });
}

function allSvelteSources() {
  return collectFiles("src", ".svelte");
}

test("all Svelte components compile without syntax errors", () => {
  const files = allSvelteSources();
  assert.ok(files.length >= 40, `expected the split component tree, found ${files.length} files`);
  for (const file of files) {
    assert.doesNotThrow(
      () => compile(readFileSync(file, "utf8"), { filename: file, generate: false }),
      file,
    );
  }
});

test("application wiring keeps the security and module boundaries", () => {
  const app = read("src/App.svelte");
  const styles = read("src/styles.css");
  const overlay = read("src/lib/controllers/overlay-controller.ts");
  const tooltip = read("src/components/GlobalTooltip.svelte");
  const components = allSvelteSources().map((file) => readFileSync(file, "utf8")).join("\n");
  const tauriConfig = readJson("src-tauri/tauri.conf.json");
  const capability = readJson("src-tauri/capabilities/default.json");

  assert.match(app, /<WorkspaceContent/);
  assert.match(app, /<OverlayLayer/);
  assert.match(styles, /@import "\.\/styles\/workspace\.css"/);
  assert.match(styles, /@import "\.\/styles\/responsive\.css"/);
  assert.equal(tauriConfig.app.windows[0].devtools, false);
  assert.ok(capability.permissions.includes("core:webview:deny-internal-toggle-devtools"));
  assert.match(overlay, /isEditableControl/);
  assert.match(overlay, /event\.preventDefault\(\)/);
  assert.match(overlay, /input\[type='password'\]/);
  assert.match(tooltip, /document\.addEventListener\("click", hideTooltip, true\)/);
  assert.match(tooltip, /new MutationObserver/);
  assert.ok((components.match(/data-tooltip=/g) ?? []).length >= 20);
  assert.doesNotMatch(components, /<(?:button|input|textarea|select)\b[^>]*\btitle\s*=/);
  assert.doesNotMatch(app, /generatorPool/);
});

test("vault normalization repairs numeric ids while preserving independent UUID identity", async () => {
  const { normalizeVaultItems, getAccounts } = await importSourceModule("lib/vault.ts");
  const rawItems = [
    {
      id: 1,
      uuid: "not-a-uuid",
      title: "旧设备",
      deviceName: "旧设备",
      deviceType: "服务器",
      deviceTypeUuid: IDS.typeServer,
      username: "admin",
      password: "Old#1",
      history: [{ id: 1, password: "Older#1", newPassword: "Old#1", changedAt: "", reason: "" }],
    },
    {
      id: 1,
      uuid: "not-a-uuid",
      title: "新设备",
      deviceName: "新设备",
      deviceType: "服务器",
      deviceTypeUuid: IDS.typeServer,
      accounts: [
        {
          id: 1,
          uuid: IDS.accountA,
          title: "admin",
          username: "admin",
          password: "New#1",
          tag: "管理员",
          notes: "",
          updatedAt: "",
          passwordChangedAt: "",
          history: [],
        },
      ],
    },
  ];
  const items = normalizeVaultItems(rawItems);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.equal(new Set(items.map((item) => item.uuid)).size, items.length);
  const accountUuids = items.flatMap((item) => getAccounts(item).map((account) => account.uuid));
  assert.equal(new Set(accountUuids).size, accountUuids.length);
  assert.ok(items.every((item) => item.deviceTypeUuid));
  assert.ok(items.every((item) => getAccounts(item).every((account) => account.username)));
});

test("search and device-type filtering stay scoped to the selected type", async () => {
  const { matchesVaultItemSearch } = await importSourceModule("lib/vault.ts");
  const { getFilteredVaultItems } = await importSourceModule("lib/selectors/device-selectors.ts");
  const items = [
    makeItem(),
    makeItem({
      id: 2,
      uuid: IDS.deviceB,
      name: "边界路由器",
      type: "网络设备",
      typeUuid: IDS.typeNetwork,
      ipAddress: "10.10.0.1",
    }),
  ];

  assert.equal(matchesVaultItemSearch(items[0], "serverexamplecom"), true);
  assert.equal(matchesVaultItemSearch(items[1], "10.10.0.1"), true);
  assert.equal(getFilteredVaultItems(items, "", "服务器", "updatedDesc").length, 1);
  assert.equal(getFilteredVaultItems(items, "路由", "服务器", "updatedDesc").length, 0);
  assert.equal(getFilteredVaultItems(items, "路由", "网络设备", "updatedDesc")[0].deviceName, "边界路由器");
});

test("connection addresses accept host URLs and reject unsafe or credential-bearing URLs", async () => {
  const { isValidConnectionAddress } = await importSourceModule("lib/input-validation.ts");
  assert.equal(isValidConnectionAddress("192.168.1.10"), true);
  assert.equal(isValidConnectionAddress("[2001:db8::10]"), true);
  assert.equal(isValidConnectionAddress("https://host.example.com:8443/path?tab=1"), true);
  assert.equal(isValidConnectionAddress("ssh://host.example.com:22"), true);
  assert.equal(isValidConnectionAddress("https://admin:secret@host.example.com"), false);
  assert.equal(isValidConnectionAddress("javascript://alert(1)"), false);
  assert.equal(isValidConnectionAddress("host name"), false);
});

test("password generation honors length, minimum groups, exclusions, and adjacent-repeat prevention", async () => {
  const { generatePasswordValue } = await importSourceModule("lib/password-generator.ts");
  const options = {
    length: 18,
    useUpper: true,
    useLower: true,
    useNumbers: true,
    useSymbols: true,
    excludeSimilar: true,
    preventRepeats: true,
    minimumNumbers: 3,
    minimumSymbols: 3,
    allowedSymbols: "!@#",
    excludedCharacters: "aA",
  };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const password = generatePasswordValue(options);
    assert.equal(password.length, options.length);
    assert.equal(/\d/.test(password), true);
    assert.equal((password.match(/[!@#]/g) ?? []).length >= 3, true);
    assert.equal(/[aAaO0Il|`']/.test(password), false);
    for (let index = 1; index < password.length; index += 1) {
      assert.notEqual(password[index], password[index - 1]);
    }
  }
  const impossiblePool = generatePasswordValue({
    ...options,
    length: 24,
    useUpper: false,
    useLower: false,
    useNumbers: false,
    allowedSymbols: "!",
    minimumNumbers: 0,
    minimumSymbols: 0,
  });
  assert.equal(impossiblePool.length, 24);
});

test("password strength returns the bounded user-facing labels", async () => {
  const { getPasswordStrengthLabel } = await importSourceModule("lib/password-strength.ts");
  assert.equal(getPasswordStrengthLabel(""), "较弱");
  assert.ok(["较弱", "一般", "较强"].includes(getPasswordStrengthLabel("a-long-random-password-9!Q")));
});

test("JSON, CSV, and YAML configuration payloads round-trip UUID and account history data", async () => {
  const {
    createConfigPayload,
    parseConfigContent,
    inferConfigFormat,
    getConfigMimeType,
  } = await importSourceModule("lib/config.ts");
  const config = makeConfig();

  for (const format of ["json", "csv", "yaml"]) {
    const payload = createConfigPayload(config.items, config.customDeviceTypes, format);
    const parsed = parseConfigContent(payload, format);
    assert.equal(parsed.meta.formatVersion, 3);
    assert.equal(parsed.items[0].uuid, IDS.deviceA);
    assert.equal(parsed.items[0].deviceTypeUuid, IDS.typeServer);
    assert.equal(parsed.items[0].accounts[0].uuid, IDS.accountA);
    assert.equal(parsed.items[0].accounts[0].history[0].uuid, IDS.historyA);
    assert.equal(inferConfigFormat(`backup.${format}`), format);
    assert.match(getConfigMimeType(format), /text|application/);
  }
});

test("configuration parsing reports syntax, shape, and identity errors", async () => {
  const { parseConfigContent, ConfigImportError } = await importSourceModule("lib/config.ts");
  assert.throws(
    () => parseConfigContent("{broken", "json"),
    (error) => error instanceof ConfigImportError && /JSON 配置语法错误/.test(error.message),
  );
  assert.throws(
    () => parseConfigContent("a,b\n\"unterminated", "csv"),
    (error) => error instanceof ConfigImportError && /未闭合的引号/.test(error.message),
  );
  assert.throws(
    () => parseConfigContent("[]", "json"),
    (error) => error instanceof ConfigImportError && /结构错误/.test(error.message),
  );
  const invalidIdentity = {
    元信息: { 应用名称: "密码管理器", 格式版本: 3, 导出时间: "" },
    设备类型: [{ 设备类型UUID: "bad", 设备类型: "服务器", 设备: [] }],
  };
  assert.throws(
    () => parseConfigContent(JSON.stringify(invalidIdentity), "json"),
    (error) => error instanceof ConfigImportError && /UUID/.test(error.message),
  );
});

test("only-add import merges missing accounts and history, then rejects ownership conflicts", async () => {
  const { mergeMissingImportedConfig } = await importSourceModule("lib/vault-recovery.ts");
  const currentItem = makeItem();
  const extraHistory = makeHistory({ id: 2, uuid: IDS.historyB, password: "Old#2", newPassword: "New#2" });
  const extraAccount = makeAccount({ id: 2, uuid: IDS.accountB, username: "operator", password: "Op#1", history: [] });
  const incomingItem = makeItem({
    accounts: [
      makeAccount({ history: [makeHistory(), extraHistory] }),
      extraAccount,
    ],
  });
  const merged = mergeMissingImportedConfig(
    [currentItem],
    makeTypes(),
    makeConfig([incomingItem]),
  );
  assert.equal(merged.items[0].accounts.length, 2);
  assert.equal(merged.items[0].accounts[0].history.length, 2);
  assert.equal(merged.items[0].accounts[0].history[1].uuid, IDS.historyB);

  const movedAccount = makeItem({
    id: 2,
    uuid: IDS.deviceB,
    name: "另一台服务器",
    accounts: [makeAccount()],
  });
  assert.throws(
    () => mergeMissingImportedConfig([currentItem], makeTypes(), makeConfig([movedAccount])),
    /账号 UUID .*已属于设备/,
  );

  const changedHistory = makeItem({
    accounts: [makeAccount({ history: [makeHistory({ password: "tampered" })] })],
  });
  assert.throws(
    () => mergeMissingImportedConfig([currentItem], makeTypes(), makeConfig([changedHistory])),
    /密码历史 UUID .*内容不一致/,
  );
});

test("persisted vault validation accepts schema v2 and rejects duplicate identities", async () => {
  const { parsePersistedVaultContent, VaultSchemaError } = await importSourceModule("lib/persisted-vault.ts");
  const item = makeItem();
  const state = {
    schemaVersion: 2,
    revision: 7,
    items: [item],
    customDeviceTypes: makeTypes(),
    paneLayout: { sidebarRatio: 0.14, listRatio: 0.21, generatorRatio: 0.32 },
    snapshots: [],
  };
  const parsed = parsePersistedVaultContent(JSON.stringify(state));
  assert.equal(parsed.migrated, false);
  assert.equal(parsed.state.revision, 7);

  const duplicateAccount = clone(state);
  duplicateAccount.items[0].accounts.push({
    ...clone(duplicateAccount.items[0].accounts[0]),
    id: 2,
    username: "operator",
  });
  assert.throws(
    () => parsePersistedVaultContent(JSON.stringify(duplicateAccount)),
    (error) => error instanceof VaultSchemaError && /账号 UUID|重复/.test(error.message),
  );
});

test("account selectors and pane layout keep bounded, deterministic state", async () => {
  const { getSelectedAccountTargets, sortPasswordHistory } = await importSourceModule("lib/selectors/account-selectors.ts");
  const { clampPaneRatio, getPaneRatioBounds } = await importSourceModule("lib/layout.ts");
  const accounts = [makeAccount(), makeAccount({ id: 2, uuid: IDS.accountB, username: "operator", history: [] })];
  assert.equal(getSelectedAccountTargets(accounts, accounts[0], [2])[0].username, "operator");
  assert.equal(getSelectedAccountTargets(accounts, accounts[0], [])[0].username, "admin");
  assert.deepEqual(sortPasswordHistory({ ...accounts[0], history: [makeHistory({ id: 2, uuid: IDS.historyB }), makeHistory()] }, true).map((entry) => entry.id), [2, 1]);
  assert.equal(clampPaneRatio(-1, "sidebar"), getPaneRatioBounds("sidebar").min);
  assert.equal(clampPaneRatio(2, "list"), getPaneRatioBounds("list").max);
  assert.equal(clampPaneRatio(Number.NaN, "generator"), 0.32);
});

test("navigation history resets invalid views and clears sensitive selections", async () => {
  const { createNavigationController } = await importSourceModule("lib/controllers/navigation-controller.ts");
  let state = {
    items: [makeItem(), makeItem({ id: 2, uuid: IDS.deviceB, name: "网络设备", type: "网络设备", typeUuid: IDS.typeNetwork })],
    selectedDeviceType: "服务器",
    selectedId: 1,
    selectedAccountId: 1,
    selectedAccountIds: [1],
    searchQuery: "admin",
    sortMode: "updatedDesc",
    backStack: [],
    forwardStack: [],
    restoringView: false,
    activePopover: "account-context",
    passwordVisible: true,
    visibleHistoryIds: [1],
  };
  const port = {
    read: () => state,
    write: (patch) => { state = { ...state, ...patch }; },
    focusSearch: () => {},
    isDeviceTypeAvailable: (type) => type === "全部设备" || state.items.some((item) => item.deviceType === type),
  };
  const navigation = createNavigationController(port);
  navigation.selectDeviceType("网络设备");
  assert.equal(state.selectedId, 2);
  assert.equal(state.searchQuery, "");
  navigation.back();
  await Promise.resolve();
  assert.equal(state.selectedDeviceType, "服务器");
  assert.equal(state.selectedAccountId, 0);
  assert.deepEqual(state.visibleHistoryIds, []);

  state.backStack = [{ selectedDeviceType: "已删除类型", selectedId: 999, searchQuery: "x", sortMode: "nameAsc" }];
  state.selectedDeviceType = "网络设备";
  navigation.back();
  await Promise.resolve();
  assert.equal(state.selectedDeviceType, "全部设备");
  assert.equal(state.selectedId, 1);
  assert.equal(state.passwordVisible, false);
  assert.deepEqual(state.selectedAccountIds, []);
});

test("password confirmation freezes UUID targets and payload across selection changes", async () => {
  const { createPasswordController } = await importSourceModule("lib/controllers/password-controller.ts");
  const itemA = makeItem();
  const itemB = makeItem({ id: 2, uuid: IDS.deviceB, name: "另一台设备", account: makeAccount({ uuid: IDS.accountB, username: "operator" }) });
  let state = {
    items: [itemA, itemB],
    selectedItem: itemA,
    hasSelectedDevice: true,
    selectedDeviceType: "服务器",
    selectedId: 1,
    selectedAccountId: 1,
    selectedAccountIds: [],
    accountForm: { id: null, username: "", password: "", tag: "", notes: "" },
    passwordForm: { password: "Frozen#2", reason: "确认测试" },
    bulkPasswordForm: { deviceType: "全部设备", username: "", password: "", reason: "" },
    bulkUsernameSearch: "",
    bulkUsernameSuggestionsOpen: false,
    bulkPasswordDeselectedKeys: [],
    bulkTypeSearch: "",
    passwordVisible: true,
    visibleHistoryIds: [1],
  };
  let pending = null;
  const port = {
    read: () => state,
    write: (patch) => {
      state = { ...state, ...patch };
      if (patch.items) state.selectedItem = state.items.find((item) => item.id === state.selectedId) ?? state.items[0];
    },
    showStatus: () => {},
    copyText: () => {},
    createSafetySnapshot: async () => ({ id: "snapshot-1" }),
    offerSnapshotUndo: () => {},
    setActiveDialog: () => {},
    getActiveDialog: () => null,
    setActivePopover: () => {},
    setPendingConfirmation: (confirmation) => { pending = confirmation; },
    setOpenTypePicker: () => {},
    getGeneratorState: () => ({ target: null, generatedPassword: "" }),
    generatePassword: () => {},
    closeGeneratorPanel: () => {},
  };
  const controller = createPasswordController(port);
  controller.savePasswordUpdate();
  assert.equal(pending.itemUuid, IDS.deviceA);
  assert.deepEqual(pending.accountUuids, [IDS.accountA]);
  assert.equal(pending.passwordValue, "Frozen#2");

  state.selectedId = 2;
  state.selectedItem = itemB;
  controller.executePasswordConfirmation(pending);
  assert.equal(state.items.find((item) => item.uuid === IDS.deviceA).accounts[0].password, "Frozen#2");
  assert.equal(state.items.find((item) => item.uuid === IDS.deviceB).accounts[0].password, "Old#1");
  assert.equal(state.passwordVisible, false);
  assert.deepEqual(state.visibleHistoryIds, []);
});

test("device deletion also uses the confirmation UUID after the current selection changes", async () => {
  const { createDeviceController } = await importSourceModule("lib/controllers/device-controller.ts");
  const itemA = makeItem();
  const itemB = makeItem({ id: 2, uuid: IDS.deviceB, name: "另一台设备", type: "网络设备", typeUuid: IDS.typeNetwork });
  let state = {
    items: [itemA, itemB],
    selectedItem: itemA,
    selectedAccounts: itemA.accounts,
    selectedDeviceType: "全部设备",
    selectedId: 1,
    selectedAccountId: 1,
    selectedAccountIds: [],
    searchQuery: "",
    hasSelectedDevice: true,
    deviceTypeOptions: makeTypes(),
    deviceForm: { id: null, deviceName: "", deviceType: "", assetCode: "", location: "", ipAddress: "", notes: "" },
    activeDialog: null,
    activePopover: "device-actions",
    openTypePicker: null,
    deviceTypeSearch: "",
  };
  let pending = null;
  const port = {
    read: () => state,
    write: (patch) => {
      state = { ...state, ...patch };
      if (patch.items) state.selectedItem = state.items.find((item) => item.id === state.selectedId) ?? state.items[0];
    },
    getTypeMeta: (label) => makeTypes().find((type) => type.label === label) ?? makeTypes()[0],
    iconClassForType: () => "icon-blue",
    openAddTypeDialog: () => {},
    showStatus: () => {},
    pushNavigationState: () => {},
    createSafetySnapshot: async () => ({ id: "snapshot-2" }),
    offerSnapshotUndo: () => {},
    setPendingConfirmation: (confirmation) => { pending = confirmation; },
  };
  const controller = createDeviceController(port);
  controller.requestDeleteSelected();
  assert.equal(pending.itemUuid, IDS.deviceA);
  state.selectedId = 2;
  state.selectedItem = itemB;
  await controller.deleteSelected(pending);
  assert.deepEqual(state.items.map((item) => item.uuid), [IDS.deviceB]);
});

test("password generator controller clamps numeric rules and sanitizes custom characters", async () => {
  const { createPasswordGeneratorController } = await importSourceModule("lib/controllers/password-generator-controller.ts");
  let state = {
    length: 8,
    useUpper: true,
    useLower: true,
    useNumbers: true,
    useSymbols: true,
    excludeSimilar: true,
    preventRepeats: false,
    minimumNumbers: 2,
    minimumSymbols: 2,
    allowedSymbols: "!@#",
    excludedCharacters: "",
    panelOpen: false,
    target: null,
    generatedPassword: "",
    lengthInput: "8",
  };
  const port = {
    read: () => state,
    write: (next) => { state = next; },
    openDialog: () => {},
  };
  const controller = createPasswordGeneratorController(port);
  controller.setLength(3);
  assert.equal(state.length, 3);
  assert.equal(state.minimumNumbers + state.minimumSymbols <= state.length, true);
  controller.setMinimumNumbers(99);
  assert.equal(state.minimumNumbers <= state.length, true);
  controller.setAllowedSymbols("!@#中文");
  controller.setExcludedCharacters("a中文");
  assert.equal(state.allowedSymbols, "!@#");
  assert.equal(state.excludedCharacters, "a");
});

test("Rust persistence keeps private permissions, atomic replacement, and a rotating backup", () => {
  const rust = read("src-tauri/src/lib.rs");
  assert.match(rust, /const VAULT_BACKUP_FILE_NAME/);
  assert.match(rust, /fn restrict_private_file/);
  assert.match(rust, /sync_parent_directory/);
  assert.match(rust, /fs::rename\(&vault_path, &backup_path\)/);
  assert.match(rust, /fs::rename\(&temporary_path, &vault_path\)/);
  assert.match(rust, /Keep the previous successfully written version/);
});
