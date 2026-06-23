import { APP_TITLE, CONFIG_FORMAT_VERSION, DEFAULT_ACCOUNT_TAG } from "./constants";
import type { ConfigData, ConfigSummary, ConfigFormat, DeviceAccount, DeviceTypeMeta, PasswordHistory, VaultItem } from "./types";
import { getAccounts, normalizeVaultItems } from "./vault";
import { formatDateTime, padDatePart, readNumber, readString } from "./utils";

const CSV_SECTION_PREFIX = "# ";
const CSV_META_HEADERS = ["项目", "内容"];
const CSV_DEVICE_TYPE_HEADERS = ["设备类型", "图标文字", "颜色"];
const CSV_HIDDEN_DEVICE_TYPE_HEADERS = ["设备类型"];
const CSV_DEVICE_HEADERS = ["设备ID", "设备名称", "设备类型", "IP地址", "设备备注", "图标文字", "更新时间"];
const CSV_ACCOUNT_HEADERS = ["设备ID", "账号ID", "用户名", "密码", "账号标签", "账号备注", "更新时间"];
const CSV_HISTORY_HEADERS = ["设备ID", "账号ID", "历史ID", "旧密码", "新密码", "修改时间", "修改原因"];

const CSV_SECTION_NAMES = {
  format: "格式说明",
  meta: "元信息",
  deviceTypes: "设备类型",
  hiddenDeviceTypes: "隐藏设备类型",
} as const;

const SECTION_ALIASES: Record<string, string> = {
  格式说明: "format",
  元信息: "meta",
  设备类型: "deviceTypes",
  隐藏设备类型: "hiddenDeviceTypes",
};

const configFormats: ConfigFormat[] = ["json", "csv", "ini"];

export function createConfigMeta() {
  return {
    appName: APP_TITLE,
    formatVersion: CONFIG_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
  };
}

export function createConfigPayload(items: VaultItem[], customDeviceTypes: DeviceTypeMeta[], hiddenDeviceTypes: string[], format: ConfigFormat) {
  const config = createConfigData(items, customDeviceTypes, hiddenDeviceTypes);
  if (format === "csv") return createCsvConfigPayload(config);
  if (format === "ini") return createIniConfigPayload(config);
  return JSON.stringify(createJsonConfigPayload(config), null, 2);
}

export function createConfigFilename(format: ConfigFormat) {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate()),
    padDatePart(now.getHours()),
    padDatePart(now.getMinutes()),
  ].join("-");
  return `密码管理器配置-${timestamp}.${format}`;
}

export function parseConfigContent(content: string, format: ConfigFormat): ConfigData {
  if (format === "csv") return parseCsvConfigContent(content);
  if (format === "ini") return parseIniConfigContent(content);
  return parseJsonConfigContent(content);
}

export function parseConfigContentWithFallback(content: string, preferredFormat: ConfigFormat): { config: ConfigData; format: ConfigFormat } {
  const formats = [preferredFormat, ...configFormats.filter((format) => format !== preferredFormat)];
  let firstError: unknown = null;

  for (const format of formats) {
    try {
      return { config: parseConfigContent(content, format), format };
    } catch (error) {
      firstError ??= error;
    }
  }

  throw firstError ?? new Error("invalid config");
}

export function inferConfigFormat(pathOrName: string): ConfigFormat {
  const normalized = pathOrName.toLowerCase();
  if (normalized.endsWith(".csv")) return "csv";
  if (normalized.endsWith(".ini")) return "ini";
  return "json";
}

export function getConfigMimeType(format: ConfigFormat) {
  if (format === "csv") return "text/csv;charset=utf-8";
  if (format === "ini") return "text/plain;charset=utf-8";
  return "application/json";
}

export function formatConfigExportedAt(value: string) {
  if (!value) return "";
  const exportedAt = new Date(value);
  if (Number.isNaN(exportedAt.getTime())) return "";
  return formatDateTime(exportedAt);
}

export function normalizeDeviceTypeMetaList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const usedLabels = new Set<string>();
  return value.reduce<DeviceTypeMeta[]>((types, type) => {
    if (type && typeof type === "object") {
      const record = type as Partial<DeviceTypeMeta> & Record<string, unknown>;
      const label = readString(record.label, readString(record["设备类型"])).trim();
      if (!label || usedLabels.has(label)) return types;
      usedLabels.add(label);
      types.push({
        label,
        iconText: readString(record.iconText, readString(record["图标文字"], label.slice(0, 1))).trim() || label.slice(0, 1),
        color: readString(record.color, readString(record["颜色"], "blue")),
      });
    }
    return types;
  }, []);
}

export function normalizeHiddenDeviceTypes(value: unknown, protectedItems: VaultItem[] = []) {
  if (!Array.isArray(value)) return [];
  const protectedLabels = new Set(protectedItems.map((item) => item.deviceType.trim()).filter(Boolean));
  return Array.from(new Set(value.map((type) => readString(type).trim())))
    .filter((type) => Boolean(type) && type !== "全部设备" && !protectedLabels.has(type));
}

export function getConfigSummary(config: ConfigData): ConfigSummary {
  const accountCount = config.items.reduce((count, item) => count + getAccounts(item).length, 0);
  const historyCount = config.items.reduce(
    (count, item) => count + getAccounts(item).reduce((total, account) => total + account.history.length, 0),
    0
  );
  const itemTypeLabels = config.items.map((item) => item.deviceType.trim()).filter(Boolean);
  const customTypeLabels = config.customDeviceTypes.map((type) => type.label.trim()).filter(Boolean);
  return {
    itemCount: config.items.length,
    accountCount,
    historyCount,
    typeCount: new Set([...itemTypeLabels, ...customTypeLabels]).size,
    exportedAtText: formatConfigExportedAt(config.meta.exportedAt),
    formatVersion: config.meta.formatVersion,
  };
}

export function formatConfigSummary(summary: ConfigSummary) {
  return [
    { label: "设备", value: `${summary.itemCount} 台` },
    { label: "账号", value: `${summary.accountCount} 个` },
    { label: "历史", value: `${summary.historyCount} 条` },
    { label: "类型", value: `${summary.typeCount} 个` },
    { label: "格式", value: `v${summary.formatVersion}` },
    { label: "导出时间", value: summary.exportedAtText || "未记录" },
  ];
}

function createConfigData(items: VaultItem[], customDeviceTypes: DeviceTypeMeta[], hiddenDeviceTypes: string[]): ConfigData {
  return {
    meta: createConfigMeta(),
    items: normalizeVaultItems(items),
    customDeviceTypes: normalizeDeviceTypeMetaList(customDeviceTypes),
    hiddenDeviceTypes,
  };
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

function compareVaultItemsForExport(left: VaultItem, right: VaultItem) {
  return compareText(left.deviceType, right.deviceType) ||
    compareText(left.deviceName, right.deviceName) ||
    compareText(left.ipAddress, right.ipAddress) ||
    left.id - right.id;
}

function buildDeviceTypeGroups(config: ConfigData) {
  const typeMap = new Map<string, DeviceTypeMeta>();
  config.customDeviceTypes.forEach((type) => {
    const label = type.label.trim();
    if (label && label !== "全部设备") typeMap.set(label, type);
  });
  config.items.forEach((item) => {
    const label = item.deviceType.trim();
    if (!label || typeMap.has(label)) return;
    typeMap.set(label, {
      label,
      iconText: item.iconText?.trim() || label.slice(0, 1),
      color: "cyan",
    });
  });

  return Array.from(typeMap.values())
    .sort((left, right) => compareText(left.label, right.label))
    .map((type) => ({
      type,
      items: [...config.items]
        .filter((item) => item.deviceType.trim() === type.label)
        .sort(compareVaultItemsForExport),
    }));
}

function createJsonDeviceRecord(item: VaultItem) {
  return {
    设备ID: item.id,
    设备名称: item.deviceName,
    设备类型: item.deviceType,
    IP地址: item.ipAddress,
    设备备注: item.notes,
    图标文字: item.iconText,
    更新时间: item.updatedAt,
    账号: getAccounts(item).map((account) => ({
      账号ID: account.id,
      用户名: account.username,
      密码: account.password,
      账号标签: account.tag,
      账号备注: account.notes,
      更新时间: account.updatedAt || item.updatedAt,
      密码历史: [...account.history]
        .sort((left, right) => left.id - right.id)
        .map((history) => ({
          历史ID: history.id,
          旧密码: history.password,
          新密码: history.newPassword,
          修改时间: history.changedAt,
          修改原因: history.reason,
        })),
    })),
  };
}

function createJsonConfigPayload(config: ConfigData) {
  return {
    元信息: {
      应用名称: config.meta.appName,
      格式版本: config.meta.formatVersion,
      导出时间: config.meta.exportedAt,
    },
    设备类型: buildDeviceTypeGroups(config).map(({ type, items }) => ({
      设备类型: type.label,
      图标文字: type.iconText,
      颜色: type.color,
      设备: items.map(createJsonDeviceRecord),
    })),
    隐藏设备类型: [...config.hiddenDeviceTypes].sort(compareText),
  };
}

function parseJsonConfigContent(content: string): ConfigData {
  const parsed = JSON.parse(stripUtf8Bom(content));
  const isChineseConfig = Boolean(parsed && typeof parsed === "object" &&
    (Array.isArray(parsed["设备类型"]) ||
      Array.isArray(parsed["隐藏设备类型"]) ||
      ["应用名称", "格式版本", "导出时间"].some((key) => key in (parsed["元信息"] ?? {}))));
  if (isChineseConfig) return parseChineseJsonConfig(parsed);
  throw new Error("invalid config");
}

function parseChineseJsonConfig(parsed: Record<string, unknown>): ConfigData {
  const rawTypes = Array.isArray(parsed["设备类型"]) ? parsed["设备类型"] : [];
  const configItems = normalizeVaultItems(rawTypes.flatMap((type, typeIndex) => {
    if (!type || typeof type !== "object") return [];
    const typeRecord = type as Record<string, unknown>;
    const typeLabel = readString(typeRecord["设备类型"]).trim();
    const rawItems = Array.isArray(typeRecord["设备"]) ? typeRecord["设备"] : [];
    return rawItems.map((item, itemIndex) => createImportedDeviceFromChineseRecord(
      item && typeof item === "object" ? item as Record<string, unknown> : {},
      itemIndex + typeIndex + 1,
      typeLabel,
    ));
  }));
  const meta = parsed["元信息"] && typeof parsed["元信息"] === "object" ? parsed["元信息"] as Record<string, unknown> : {};
  return {
    meta: {
      appName: readString(meta["应用名称"], APP_TITLE),
      formatVersion: readNumber(meta["格式版本"], CONFIG_FORMAT_VERSION),
      exportedAt: readString(meta["导出时间"]),
    },
    items: configItems,
    customDeviceTypes: normalizeDeviceTypeMetaList(rawTypes),
    hiddenDeviceTypes: normalizeHiddenDeviceTypes(parsed["隐藏设备类型"], configItems),
  };
}

function createImportedDeviceFromChineseRecord(record: Record<string, unknown>, index: number, fallbackDeviceType = "") {
  const accounts = Array.isArray(record["账号"]) ? record["账号"].map((account, accountIndex) => {
    const accountRecord = account && typeof account === "object" ? account as Record<string, unknown> : {};
    const username = readString(accountRecord["用户名"]).trim();
    return {
      id: readNumber(accountRecord["账号ID"], accountIndex + 1),
      title: username || "未填写用户名",
      username,
      password: readString(accountRecord["密码"]),
      tag: readString(accountRecord["账号标签"], DEFAULT_ACCOUNT_TAG).trim() || DEFAULT_ACCOUNT_TAG,
      notes: readString(accountRecord["账号备注"]),
      updatedAt: readString(accountRecord["更新时间"]),
      history: Array.isArray(accountRecord["密码历史"]) ? accountRecord["密码历史"].map((history, historyIndex) => {
        const historyRecord = history && typeof history === "object" ? history as Record<string, unknown> : {};
        return {
          id: readNumber(historyRecord["历史ID"], historyIndex + 1),
          password: readString(historyRecord["旧密码"]),
          newPassword: readString(historyRecord["新密码"]),
          changedAt: readString(historyRecord["修改时间"]),
          reason: readString(historyRecord["修改原因"]),
        };
      }) : [],
    };
  }) : [];
  const primaryAccount = accounts[0];
  const deviceType = readString(record["设备类型"], fallbackDeviceType).trim();
  return {
    id: readNumber(record["设备ID"], index + 1),
    title: primaryAccount?.title ?? readString(record["设备名称"], `设备 ${index + 1}`),
    deviceName: readString(record["设备名称"]),
    deviceType,
    username: primaryAccount?.username ?? "",
    password: primaryAccount?.password ?? "",
    ipAddress: readString(record["IP地址"]),
    tag: deviceType || DEFAULT_ACCOUNT_TAG,
    iconText: readString(record["图标文字"]),
    iconClass: "",
    updatedAt: readString(record["更新时间"]),
    notes: readString(record["设备备注"]),
    history: primaryAccount?.history ?? [],
    accounts,
  };
}

function createCsvConfigPayload(config: ConfigData) {
  // CSV 按设备类型分组，每个类型下面依次放设备、账号和密码历史，便于人工查看和编辑。
  const sections: string[] = [
    createCsvSection(CSV_SECTION_NAMES.format, CSV_META_HEADERS, [
      ["说明", "密码管理器 CSV 配置文件"],
      ["结构", "先列设备类型，再按设备类型分组列设备、账号和密码历史"],
      ["提示", "每个设备类型下的设备ID和账号ID用来关联账号和密码历史"],
    ]),
    createCsvSection(CSV_SECTION_NAMES.meta, CSV_META_HEADERS, [
      ["应用名称", config.meta.appName],
      ["格式版本", config.meta.formatVersion],
      ["导出时间", config.meta.exportedAt],
    ]),
    createCsvSection(CSV_SECTION_NAMES.deviceTypes, CSV_DEVICE_TYPE_HEADERS, buildDeviceTypeGroups(config).map(({ type }) => [type.label, type.iconText, type.color])),
    createCsvSection(CSV_SECTION_NAMES.hiddenDeviceTypes, CSV_HIDDEN_DEVICE_TYPE_HEADERS, [...config.hiddenDeviceTypes].sort(compareText).map((type) => [type])),
  ];

  buildDeviceTypeGroups(config).forEach(({ type, items }) => {
    sections.push(
      createCsvSection(`设备类型.${type.label}.设备`, CSV_DEVICE_HEADERS, items.map((item) => [
        item.id,
        item.deviceName,
        item.deviceType,
        item.ipAddress,
        item.notes,
        item.iconText,
        item.updatedAt,
      ])),
      createCsvSection(`设备类型.${type.label}.账号`, CSV_ACCOUNT_HEADERS, items.flatMap((item) =>
        getAccounts(item).map((account) => [
          item.id,
          account.id,
          account.username,
          account.password,
          account.tag,
          account.notes,
          account.updatedAt || item.updatedAt,
        ])
      )),
      createCsvSection(`设备类型.${type.label}.密码历史`, CSV_HISTORY_HEADERS, items.flatMap((item) =>
        getAccounts(item).flatMap((account) => [...account.history]
          .sort((left, right) => left.id - right.id)
          .map((history) => [
            item.id,
            account.id,
            history.id,
            history.password,
            history.newPassword,
            history.changedAt,
            history.reason,
          ]))
      )),
    );
  });
  return `\uFEFF${sections.join("\n\n")}\n`;
}

function createCsvSection(name: string, headers: string[], rows: unknown[][]) {
  return [
    `${CSV_SECTION_PREFIX}${name}`,
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
  ].join("\n");
}

function parseCsvConfigContent(content: string): ConfigData {
  const rows = parseCsvRows(stripUtf8Bom(content)).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length === 0) throw new Error("invalid config");
  if (!rows.some((row) => row[0]?.trim().startsWith(CSV_SECTION_PREFIX))) throw new Error("invalid config");
  return parseSectionedCsvConfigRows(rows);
}

function parseSectionedCsvConfigRows(rows: string[][]): ConfigData {
  const sections = parseCsvSections(rows);
  const hasKnownSection = ["meta", "deviceTypes", "hiddenDeviceTypes"].some((section) => sections.has(section)) ||
    Array.from(sections.keys()).some((section) => /^type::.+::devices$/.test(section));
  if (!hasKnownSection) throw new Error("invalid config");

  const metaRecord = Object.fromEntries(recordsFromCsvSection(sections.get("meta") ?? [])
    .map((record) => [readRecordValue(record, "项目", "key"), readRecordValue(record, "内容", "value")]));
  const customDeviceTypes = normalizeDeviceTypeMetaList(recordsFromCsvSection(sections.get("deviceTypes") ?? []));
  const hiddenDeviceTypes = recordsFromCsvSection(sections.get("hiddenDeviceTypes") ?? [])
    .map((record) => readRecordValue(record, "设备类型", "label").trim())
    .filter(Boolean);
  const historyByAccountKey = new Map<string, PasswordHistory[]>();

  Array.from(sections)
    .filter(([section]) => /^type::.+::history$/.test(section))
    .flatMap(([, sectionRows]) => recordsFromCsvSection(sectionRows))
    .forEach((record, index) => {
      const deviceId = readRecordValue(record, "设备ID").trim();
      const accountId = readRecordValue(record, "账号ID").trim();
      const key = `${deviceId}\u0000${accountId}`;
      const history = {
        id: readNumber(readRecordValue(record, "历史ID"), index + 1),
        password: readRecordValue(record, "旧密码"),
        newPassword: readRecordValue(record, "新密码"),
        changedAt: readRecordValue(record, "修改时间"),
        reason: readRecordValue(record, "修改原因"),
      };
      historyByAccountKey.set(key, [...(historyByAccountKey.get(key) ?? []), history]);
    });

  const accountsByDeviceId = new Map<string, DeviceAccount[]>();
  Array.from(sections)
    .filter(([section]) => /^type::.+::accounts$/.test(section))
    .flatMap(([, sectionRows]) => recordsFromCsvSection(sectionRows))
    .forEach((record, index) => {
      const deviceId = readRecordValue(record, "设备ID").trim();
      if (!deviceId) return;
      const accountIdText = readRecordValue(record, "账号ID").trim();
      const accountId = readNumber(accountIdText, index + 1);
      const username = readRecordValue(record, "用户名").trim();
      const account: DeviceAccount = {
        id: accountId,
        title: username || "未填写用户名",
        username,
        password: readRecordValue(record, "密码"),
        tag: readRecordValue(record, "账号标签").trim() || DEFAULT_ACCOUNT_TAG,
        notes: readRecordValue(record, "账号备注"),
        updatedAt: readRecordValue(record, "更新时间").trim() || formatDateTime(new Date()),
        history: historyByAccountKey.get(`${deviceId}\u0000${accountIdText || accountId}`) ?? [],
      };
      accountsByDeviceId.set(deviceId, [...(accountsByDeviceId.get(deviceId) ?? []), account]);
    });

  const items = Array.from(sections)
    .filter(([section]) => /^type::.+::devices$/.test(section))
    .flatMap(([, sectionRows]) => recordsFromCsvSection(sectionRows))
    .reduce<VaultItem[]>((devices, record, index) => {
      const deviceId = readRecordValue(record, "设备ID").trim() || String(index + 1);
      const deviceName = readRecordValue(record, "设备名称").trim();
      if (!deviceName) return devices;
      const accounts = accountsByDeviceId.get(deviceId) ?? [];
      const primaryAccount = accounts[0];
      const deviceType = readRecordValue(record, "设备类型").trim();
      devices.push({
        id: readNumber(deviceId, devices.length + 1),
        title: primaryAccount?.title ?? deviceName,
        deviceName,
        deviceType,
        username: primaryAccount?.username ?? "",
        password: primaryAccount?.password ?? "",
        ipAddress: readRecordValue(record, "IP地址").trim(),
        tag: deviceType || DEFAULT_ACCOUNT_TAG,
        iconText: readRecordValue(record, "图标文字").trim() || deviceType.slice(0, 1) || "设",
        iconClass: "",
        updatedAt: readRecordValue(record, "更新时间").trim() || primaryAccount?.updatedAt || formatDateTime(new Date()),
        notes: readRecordValue(record, "设备备注"),
        history: primaryAccount?.history ?? [],
        accounts,
      });
      return devices;
    }, []);

  const normalizedItems = normalizeVaultItems(items);
  return {
    meta: {
      appName: readString(readRecordValue(metaRecord, "应用名称", "appName"), APP_TITLE),
      formatVersion: readNumber(readRecordValue(metaRecord, "格式版本", "formatVersion"), CONFIG_FORMAT_VERSION),
      exportedAt: readString(readRecordValue(metaRecord, "导出时间", "exportedAt")),
    },
    items: normalizedItems,
    customDeviceTypes,
    hiddenDeviceTypes: normalizeHiddenDeviceTypes(hiddenDeviceTypes, normalizedItems),
  };
}

function parseCsvSections(rows: string[][]) {
  const sections = new Map<string, string[][]>();
  let currentSection = "";

  rows.forEach((row) => {
    const firstCell = row[0]?.trim() ?? "";
    if (firstCell.startsWith(CSV_SECTION_PREFIX)) {
      const sectionName = firstCell.slice(CSV_SECTION_PREFIX.length).trim();
      currentSection = normalizeCsvSectionName(sectionName);
      sections.set(currentSection, []);
      return;
    }
    if (currentSection) sections.get(currentSection)!.push(row);
  });

  return sections;
}

function normalizeCsvSectionName(sectionName: string) {
  const typedSection = sectionName.match(/^设备类型\.(.+)\.(设备|账号|密码历史)$/);
  if (typedSection) {
    const sectionType = typedSection[2] === "设备" ? "devices" : typedSection[2] === "账号" ? "accounts" : "history";
    return `type::${typedSection[1]}::${sectionType}`;
  }
  return SECTION_ALIASES[sectionName] ?? sectionName;
}

function recordsFromCsvSection(rows: string[][]) {
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function stripUtf8Bom(content: string) {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function createIniConfigPayload(config: ConfigData) {
  // INI 使用中文 section 表示设备类型、设备、账号、密码历史的层级关系。
  const lines = [
    "; 密码管理器 INI 配置文件",
    "; 设备类型.N 表示设备类型；设备类型.N.设备.M 表示该类型下的设备。",
    "; 设备类型.N.设备.M.账号.K 表示该设备下的账号；密码历史.H 表示该账号下的历史记录。",
    "; JSON、CSV、INI 都按设备类型分组，便于人工核对。",
    "",
    "[元信息]",
    `应用名称=${escapeIniValue(config.meta.appName)}`,
    `格式版本=${config.meta.formatVersion}`,
    `导出时间=${escapeIniValue(config.meta.exportedAt)}`,
    "",
  ];

  buildDeviceTypeGroups(config).forEach(({ type, items }, typeIndex) => {
    const typeNumber = typeIndex + 1;
    lines.push(`[设备类型.${typeNumber}]`);
    lines.push(`设备类型=${escapeIniValue(type.label)}`);
    lines.push(`图标文字=${escapeIniValue(type.iconText)}`);
    lines.push(`颜色=${escapeIniValue(type.color)}`);
    lines.push("");

    items.forEach((item, itemIndex) => {
      const deviceNumber = itemIndex + 1;
      lines.push(`[设备类型.${typeNumber}.设备.${deviceNumber}]`);
      lines.push(`设备ID=${item.id}`);
      lines.push(`设备名称=${escapeIniValue(item.deviceName)}`);
      lines.push(`设备类型=${escapeIniValue(item.deviceType)}`);
      lines.push(`IP地址=${escapeIniValue(item.ipAddress)}`);
      lines.push(`设备备注=${escapeIniValue(item.notes)}`);
      lines.push(`图标文字=${escapeIniValue(item.iconText)}`);
      lines.push(`更新时间=${escapeIniValue(item.updatedAt)}`);
      lines.push("");

      getAccounts(item).forEach((account, accountIndex) => {
        const accountNumber = accountIndex + 1;
        lines.push(`[设备类型.${typeNumber}.设备.${deviceNumber}.账号.${accountNumber}]`);
        lines.push(`账号ID=${account.id}`);
        lines.push(`用户名=${escapeIniValue(account.username)}`);
        lines.push(`密码=${escapeIniValue(account.password)}`);
        lines.push(`账号标签=${escapeIniValue(account.tag)}`);
        lines.push(`账号备注=${escapeIniValue(account.notes)}`);
        lines.push(`更新时间=${escapeIniValue(account.updatedAt || item.updatedAt)}`);
        lines.push("");

        [...account.history].sort((left, right) => left.id - right.id).forEach((history, historyIndex) => {
          lines.push(`[设备类型.${typeNumber}.设备.${deviceNumber}.账号.${accountNumber}.密码历史.${historyIndex + 1}]`);
          lines.push(`历史ID=${history.id}`);
          lines.push(`旧密码=${escapeIniValue(history.password)}`);
          lines.push(`新密码=${escapeIniValue(history.newPassword)}`);
          lines.push(`修改时间=${escapeIniValue(history.changedAt)}`);
          lines.push(`修改原因=${escapeIniValue(history.reason)}`);
          lines.push("");
        });
      });
    });
  });

  [...config.hiddenDeviceTypes].sort(compareText).forEach((type, index) => {
    lines.push(`[隐藏设备类型.${index + 1}]`);
    lines.push(`设备类型=${escapeIniValue(type)}`);
    lines.push("");
  });

  return lines.join("\n").trimEnd() + "\n";
}

function parseIniConfigContent(content: string): ConfigData {
  const sections = normalizeIniSectionNames(parseIniSections(stripUtf8Bom(content)));
  const meta = sections.get("meta") ?? {};
  const hasStructuredSections = Array.from(sections.keys()).some((section) =>
    /^deviceType\.\d+$/.test(section) ||
    /^deviceType\.\d+\.device\.\d+$/.test(section) ||
    /^deviceType\.\d+\.device\.\d+\.account\.\d+$/.test(section) ||
    /^deviceType\.\d+\.device\.\d+\.account\.\d+\.history\.\d+$/.test(section) ||
    /^hiddenDeviceType\.\d+$/.test(section)
  );
  if (hasStructuredSections) return parseStructuredIniSections(sections, meta);
  throw new Error("invalid config");
}

function parseStructuredIniSections(sections: Map<string, Record<string, string>>, meta: Record<string, string>): ConfigData {
  const deviceTypeSections = Array.from(sections)
    .filter(([section]) => /^deviceType\.\d+$/.test(section))
    .map(([section, record]) => ({ section, record }));
  const hiddenDeviceTypes = Array.from(sections)
    .filter(([section]) => section.startsWith("hiddenDeviceType."))
    .map(([, record]) => readRecordValue(record, "设备类型").trim())
    .filter(Boolean);
  const historyByAccountKey = new Map<string, PasswordHistory[]>();

  Array.from(sections)
    .filter(([section]) => /^deviceType\.\d+\.device\.\d+\.account\.\d+\.history\.\d+$/.test(section))
    .forEach(([section, record], index) => {
      const parts = section.split(".");
      const key = `${parts[1]}\u0000${parts[3]}\u0000${parts[5]}`;
      const history = {
        id: readNumber(readRecordValue(record, "历史ID"), index + 1),
        password: readRecordValue(record, "旧密码"),
        newPassword: readRecordValue(record, "新密码"),
        changedAt: readRecordValue(record, "修改时间"),
        reason: readRecordValue(record, "修改原因"),
      };
      historyByAccountKey.set(key, [...(historyByAccountKey.get(key) ?? []), history]);
    });

  const accountsByDeviceKey = new Map<string, DeviceAccount[]>();
  Array.from(sections)
    .filter(([section]) => /^deviceType\.\d+\.device\.\d+\.account\.\d+$/.test(section))
    .forEach(([section, record], index) => {
      const parts = section.split(".");
      const typeIndex = parts[1];
      const deviceIndex = parts[3];
      const accountIndex = parts[5];
      const key = `${typeIndex}\u0000${deviceIndex}`;
      const accountKey = `${typeIndex}\u0000${deviceIndex}\u0000${accountIndex}`;
      const accountId = readNumber(readRecordValue(record, "账号ID"), index + 1);
      const username = readRecordValue(record, "用户名").trim();
      const account: DeviceAccount = {
        id: accountId,
        title: username || "未填写用户名",
        username,
        password: readRecordValue(record, "密码"),
        tag: readRecordValue(record, "账号标签").trim() || DEFAULT_ACCOUNT_TAG,
        notes: readRecordValue(record, "账号备注"),
        updatedAt: readRecordValue(record, "更新时间").trim() || formatDateTime(new Date()),
        history: historyByAccountKey.get(accountKey) ?? [],
      };
      accountsByDeviceKey.set(key, [...(accountsByDeviceKey.get(key) ?? []), account]);
    });

  const items = Array.from(sections)
    .filter(([section]) => /^deviceType\.\d+\.device\.\d+$/.test(section))
    .reduce<VaultItem[]>((devices, [section, record], index) => {
      const parts = section.split(".");
      const typeIndex = parts[1];
      const deviceIndex = parts[3];
      const deviceName = readRecordValue(record, "设备名称").trim();
      if (!deviceName) return devices;
      const accounts = accountsByDeviceKey.get(`${typeIndex}\u0000${deviceIndex}`) ?? [];
      const primaryAccount = accounts[0];
      const deviceType = readRecordValue(record, "设备类型").trim();
      devices.push({
        id: readNumber(readRecordValue(record, "设备ID"), devices.length + 1),
        title: primaryAccount?.title ?? deviceName,
        deviceName,
        deviceType,
        username: primaryAccount?.username ?? "",
        password: primaryAccount?.password ?? "",
        ipAddress: readRecordValue(record, "IP地址").trim(),
        tag: deviceType || DEFAULT_ACCOUNT_TAG,
        iconText: readRecordValue(record, "图标文字").trim() || deviceType.slice(0, 1) || "设",
        iconClass: "",
        updatedAt: readRecordValue(record, "更新时间").trim() || primaryAccount?.updatedAt || formatDateTime(new Date()),
        notes: readRecordValue(record, "设备备注"),
        history: primaryAccount?.history ?? [],
        accounts,
      });
      return devices;
    }, []);

  const normalizedItems = normalizeVaultItems(items);
  const hasKnownMeta = ["应用名称", "格式版本", "导出时间", "appName", "formatVersion", "exportedAt"].some((key) => key in meta);
  if (!hasKnownMeta && normalizedItems.length === 0 && deviceTypeSections.length === 0 && hiddenDeviceTypes.length === 0) throw new Error("invalid config");

  return {
    meta: {
      appName: readString(readRecordValue(meta, "应用名称"), APP_TITLE),
      formatVersion: readNumber(readRecordValue(meta, "格式版本"), CONFIG_FORMAT_VERSION),
      exportedAt: readString(readRecordValue(meta, "导出时间")),
    },
    items: normalizedItems,
    customDeviceTypes: normalizeDeviceTypeMetaList(deviceTypeSections.map(({ record }) => record)),
    hiddenDeviceTypes: normalizeHiddenDeviceTypes(hiddenDeviceTypes, normalizedItems),
  };
}

function readRecordValue(record: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key] ?? "";
  }
  return "";
}

function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function escapeIniValue(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function unescapeIniValue(value: string) {
  return value
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function normalizeIniSectionNames(sections: Map<string, Record<string, string>>) {
  const normalized = new Map<string, Record<string, string>>();
  sections.forEach((record, section) => {
    normalized.set(normalizeIniSectionName(section), record);
  });
  return normalized;
}

function normalizeIniSectionName(section: string) {
  return section
    .replace(/^元信息$/, "meta")
    .replace(/^设备类型\.(\d+)$/, "deviceType.$1")
    .replace(/^设备类型\.(\d+)\.设备\.(\d+)$/, "deviceType.$1.device.$2")
    .replace(/^设备类型\.(\d+)\.设备\.(\d+)\.账号\.(\d+)$/, "deviceType.$1.device.$2.account.$3")
    .replace(/^设备类型\.(\d+)\.设备\.(\d+)\.账号\.(\d+)\.密码历史\.(\d+)$/, "deviceType.$1.device.$2.account.$3.history.$4")
    .replace(/^隐藏设备类型\.(\d+)$/, "hiddenDeviceType.$1")
}

function parseIniSections(content: string) {
  const sections = new Map<string, Record<string, string>>();
  let currentSection = "";

  content.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) return;
    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      sections.set(currentSection, sections.get(currentSection) ?? {});
      return;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0 || !currentSection) return;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    sections.get(currentSection)![key] = unescapeIniValue(value);
  });

  return sections;
}
